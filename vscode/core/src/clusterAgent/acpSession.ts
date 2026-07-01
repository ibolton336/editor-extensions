/**
 * ACP session against a cluster-hosted agent (`goose serve` in an
 * agentic-controller sandbox), over WebSocket with X-Secret-Key auth,
 * using the official @agentclientprotocol/sdk.
 *
 * This is deliberately independent of the analyzer's RPC stack and of
 * any chat webview: consumers get typed callbacks and drive whatever UI
 * they want. When the unified AgentClient (editor-extensions#1368)
 * lands, this becomes the cluster transport behind it.
 */
import { WebSocket } from "ws";
import * as acp from "@agentclientprotocol/sdk";
import { createWebSocketStream } from "@agentclientprotocol/sdk/experimental/ws-client";
import winston from "winston";

export const ACP_PATH = "/acp";
export const SECRET_KEY_HEADER = "X-Secret-Key";

export interface PermissionChoice {
  optionId: string;
  name: string;
  kind: string;
}

export interface PermissionAsk {
  title: string;
  toolName?: string;
  rawInput?: unknown;
  options: PermissionChoice[];
}

export interface ClusterSessionCallbacks {
  /** Streamed agent text ("text" | "thinking"). */
  onChunk?: (text: string, kind: "text" | "thinking") => void;
  onToolCall?: (title: string, toolCallId: string, status: string) => void;
  onToolCallUpdate?: (toolCallId: string, status: string, resultText?: string) => void;
  /** Context window usage (tokens used / size), from goose usage_update. */
  onUsage?: (used: number, size: number) => void;
  /**
   * Human-in-the-loop approval (goose GOOSE_MODE=smart_approve or manual).
   * Resolve with the chosen optionId, or null to cancel the tool call.
   */
  onPermission?: (ask: PermissionAsk) => Promise<string | null>;
  /** Any other session update, for logging/UX experiments. */
  onOther?: (sessionUpdate: string, update: unknown) => void;
}

export interface ClusterAcpSessionOptions {
  logger: winston.Logger;
  endpoint: { host: string; port: number; secretKey: string };
  callbacks: ClusterSessionCallbacks;
  clientName?: string;
}

/**
 * A live, connected ACP session. Create with ClusterAcpSession.connect().
 */
export class ClusterAcpSession {
  private constructor(
    private readonly logger: winston.Logger,
    private readonly stream: acp.Stream,
    private readonly ctx: acp.ClientContext,
    private readonly connection: acp.ClientConnection,
    readonly loadSessionSupported: boolean,
  ) {}

  private sessionId: string | null = null;
  private promptActive = false;

  static async connect(options: ClusterAcpSessionOptions): Promise<ClusterAcpSession> {
    const { logger, endpoint, callbacks } = options;
    const url = `ws://${endpoint.host}:${endpoint.port}${ACP_PATH}`;
    logger.info(`ClusterAcpSession: connecting ${url}`);

    const stream = createWebSocketStream(url, {
      WebSocket,
      headers: { [SECRET_KEY_HEADER]: endpoint.secretKey },
    });

    const app = acp
      .client({ name: options.clientName ?? "konveyor-cluster-agent" })
      .onNotification(acp.methods.client.session.update, (c) => {
        dispatchUpdate(c.params.update, callbacks, logger);
      })
      .onRequest(acp.methods.client.session.requestPermission, async (c) => {
        const params = c.params;
        const ask: PermissionAsk = {
          title: params.toolCall?.title ?? "Tool call",
          rawInput: params.toolCall?.rawInput,
          options: (params.options ?? []).map((o) => ({
            optionId: o.optionId,
            name: o.name,
            kind: o.kind,
          })),
        };
        const chosen = callbacks.onPermission
          ? await callbacks.onPermission(ask)
          : (ask.options[0]?.optionId ?? null);
        return {
          outcome: chosen
            ? { outcome: "selected" as const, optionId: chosen }
            : { outcome: "cancelled" as const },
        };
      });

    const connection = app.connect(stream);
    const initialized = await connection.agent.request(acp.methods.agent.initialize, {
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {},
    });
    logger.info(
      `ClusterAcpSession: initialized protocol v${initialized.protocolVersion}, loadSession=${initialized.agentCapabilities?.loadSession === true}`,
    );

    return new ClusterAcpSession(
      logger,
      stream,
      connection.agent,
      connection,
      initialized.agentCapabilities?.loadSession === true,
    );
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  isPromptActive(): boolean {
    return this.promptActive;
  }

  /** Start a fresh session in the sandbox workspace. */
  async newSession(cwd = "/workspace"): Promise<string> {
    const res = await this.ctx.request(acp.methods.agent.session.new, {
      cwd,
      mcpServers: [],
    });
    this.sessionId = res.sessionId;
    return res.sessionId;
  }

  /**
   * List existing session ids, most recent first. Throws if the agent
   * doesn't implement session/list (optional ACP capability).
   */
  async listSessions(): Promise<string[]> {
    const res = await this.ctx.request<{ sessions?: Array<{ sessionId: string }> }>(
      acp.methods.agent.session.list,
      {},
    );
    return (res.sessions ?? []).map((s) => s.sessionId);
  }

  /** Attach to an existing session; the agent replays full history. */
  async loadSession(sessionId: string, cwd = "/workspace"): Promise<void> {
    await this.ctx.request(acp.methods.agent.session.load, {
      sessionId,
      cwd,
      mcpServers: [],
    });
    this.sessionId = sessionId;
  }

  /** Send a prompt turn; resolves with the stop reason. */
  async prompt(text: string): Promise<string> {
    if (!this.sessionId) {
      throw new Error("ClusterAcpSession: no active session");
    }
    this.promptActive = true;
    try {
      // No client-side timeout: agent turns can be long and the SDK
      // settles the promise on the peer's response or connection close.
      const res = await this.ctx.request(acp.methods.agent.session.prompt, {
        sessionId: this.sessionId,
        prompt: [{ type: "text", text }],
      });
      return res.stopReason;
    } finally {
      this.promptActive = false;
    }
  }

  async cancel(): Promise<void> {
    if (this.sessionId) {
      await this.ctx.notify(acp.methods.agent.session.cancel, { sessionId: this.sessionId });
    }
  }

  async close(): Promise<void> {
    try {
      this.connection.close();
    } catch {
      // already closed
    }
    try {
      await this.stream.writable.close();
    } catch {
      // stream may already be gone
    }
  }
}

function dispatchUpdate(
  update: acp.SessionUpdate,
  callbacks: ClusterSessionCallbacks,
  logger: winston.Logger,
): void {
  const u = update as Record<string, unknown> & { sessionUpdate: string };
  switch (u.sessionUpdate) {
    case "agent_message_chunk": {
      const content = u.content as { type?: string; text?: string; thinking?: string } | undefined;
      if (content?.type === "text" && content.text) {
        callbacks.onChunk?.(content.text, "text");
      } else if (content?.type === "thinking" && (content.thinking || content.text)) {
        callbacks.onChunk?.(content.thinking || content.text || "", "thinking");
      }
      break;
    }
    case "tool_call":
      callbacks.onToolCall?.(
        (u.title as string) ?? "Tool call",
        (u.toolCallId as string) ?? "",
        (u.status as string) ?? "pending",
      );
      break;
    case "tool_call_update": {
      const contentArr = u.content as
        | Array<{ type?: string; content?: { type?: string; text?: string } }>
        | undefined;
      const resultText = contentArr
        ?.map((c) => (c.type === "content" && c.content?.type === "text" ? c.content.text : ""))
        .filter(Boolean)
        .join("\n");
      callbacks.onToolCallUpdate?.(
        (u.toolCallId as string) ?? "",
        (u.status as string) ?? "",
        resultText || undefined,
      );
      break;
    }
    case "usage_update": {
      const used = u.used as number | undefined;
      const size = u.size as number | undefined;
      if (typeof used === "number" && typeof size === "number") {
        callbacks.onUsage?.(used, size);
      }
      break;
    }
    default:
      logger.debug(`ClusterAcpSession: unhandled update ${u.sessionUpdate}`);
      callbacks.onOther?.(u.sessionUpdate, update);
  }
}
