/**
 * VSCode commands for cluster-hosted agents (konveyor.io AgentRuns).
 *
 * Sessions render in a chat webview panel (chatPanel.ts): streaming
 * bubbles, collapsible tool calls, inline permission cards (backed by
 * goose GOOSE_MODE=smart_approve), a context-usage meter, and a status
 * bar item. Independent of the analysis webviews; when a unified chat
 * AgentClient lands (editor-extensions#1368), ClusterAcpSession becomes
 * its cluster transport and this panel can be retired.
 */
import * as vscode from "vscode";
import type { Logger } from "winston";
import type { ExtensionState } from "../extensionState";
import { getRepositoryInfo } from "../utilities/git";
import {
  getConfigClusterAgentNamespace,
  getConfigClusterAgentRef,
  getConfigClusterAgentKubeconfig,
  getConfigClusterAgentProvider,
  getConfigClusterAgentModel,
  getConfigClusterAgentApprovalMode,
} from "../utilities/configuration";
import { AgentRunClient } from "./agentRunClient";
import { openTunnel, type Tunnel } from "./portForward";
import { ClusterAcpSession, type PermissionAsk } from "./acpSession";
import { ClusterChatPanel } from "./chatPanel";
import type { AgentRunParam, AgentRunSpec } from "./types";

interface ActiveClusterSession {
  runName: string;
  session: ClusterAcpSession;
  tunnel: Tunnel;
  statusBar: vscode.StatusBarItem;
  panel: ClusterChatPanel;
}

let active: ActiveClusterSession | null = null;
let disconnecting = false;

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

async function disconnectActive(): Promise<void> {
  if (!active || disconnecting) {
    return;
  }
  disconnecting = true;
  const current = active;
  active = null;
  try {
    current.statusBar.dispose();
    await current.session.close().catch(() => {});
    current.tunnel.close();
    current.panel.dispose();
  } finally {
    disconnecting = false;
  }
}

/** Modal fallback when the chat panel is gone. */
async function askPermissionModal(ask: PermissionAsk): Promise<string | null> {
  const picked = await vscode.window.showWarningMessage(
    `Cluster agent requests permission: ${ask.title}`,
    { modal: true },
    ...ask.options.map((o) => o.name),
  );
  return ask.options.find((o) => o.name === picked)?.optionId ?? null;
}

async function connectAndChat(
  logger: Logger,
  runClient: AgentRunClient,
  runName: string,
  options: { attachExisting: boolean },
): Promise<void> {
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.name = "Konveyor Cluster Agent";
  statusBar.text = `$(hubot) ${runName}`;
  statusBar.command = "konveyor-core.clusterAgentPrompt";
  statusBar.show();

  const panel = new ClusterChatPanel(`Agent: ${runName}`, {
    onPrompt: (text) => {
      void runPromptTurn(text);
    },
    onCancel: () => {
      void active?.session.cancel();
    },
    onDisconnect: () => {
      void disconnectActive();
    },
  });
  panel.status(runName, "provisioning sandbox…");

  let session: ClusterAcpSession;
  let tunnel: Tunnel;
  try {
    const endpoint = await runClient.waitForAcpEndpoint(runName);
    panel.status(runName, "connecting…");
    tunnel = await openTunnel(runClient.kc, runClient.namespace, endpoint.podName, endpoint.port);

    session = await ClusterAcpSession.connect({
      logger: logger as never,
      endpoint: { host: "127.0.0.1", port: tunnel.localPort, secretKey: endpoint.secretKey },
      callbacks: {
        onChunk: (text, kind) => panel.chunk(text, kind),
        onToolCall: (title, id, status) => panel.toolCall(id || title, title, status),
        onToolCallUpdate: (id, status, result) => panel.toolUpdate(id, status, result),
        onUsage: (used, size) => {
          panel.usage(used, size);
          statusBar.text = `$(hubot) ${runName} ${formatTokens(used)}/${formatTokens(size)}`;
        },
        onPermission: (ask) =>
          panel.isDisposed
            ? askPermissionModal(ask)
            : panel.askPermission({
                title: ask.title,
                detail:
                  ask.rawInput !== undefined
                    ? JSON.stringify(ask.rawInput, null, 2).slice(0, 800)
                    : undefined,
                options: ask.options,
              }),
      },
    });
  } catch (err) {
    statusBar.dispose();
    panel.error(err instanceof Error ? err.message : String(err));
    panel.status(runName, "failed");
    throw err;
  }

  active = { runName, session, tunnel, statusBar, panel };

  if (options.attachExisting && session.loadSessionSupported) {
    // Resume the most recent session so history replays into the chat;
    // fall back to a fresh session.
    try {
      const sessions = await session.listSessions();
      if (sessions.length > 0) {
        panel.status(runName, "replaying history…");
        await session.loadSession(sessions[0]);
      } else {
        await session.newSession();
      }
    } catch {
      await session.newSession();
    }
  } else {
    await session.newSession();
  }

  panel.status(runName, "connected", session.getSessionId() ?? undefined);
}

async function runPromptTurn(text: string): Promise<void> {
  if (!active) {
    return;
  }
  const { panel, session, runName } = active;
  if (session.isPromptActive()) {
    panel.error("A turn is already in progress.");
    return;
  }
  panel.addUser(text);
  panel.turnStart();
  try {
    const stopReason = await session.prompt(text);
    panel.turnDone(stopReason);
  } catch (err) {
    panel.error(err instanceof Error ? err.message : String(err));
    panel.status(runName, "disconnected?");
  }
}

export function clusterAgentCommandsMap(
  state: ExtensionState,
  logger: Logger,
): { [command: string]: (...args: unknown[]) => unknown } {
  return {
    "konveyor-core.startClusterAgent": async () => {
      if (active) {
        active.panel.reveal();
        vscode.window.showInformationMessage(
          `Already connected to ${active.runName}. Disconnect first.`,
        );
        return;
      }
      const workspaceRootUri = state.data.workspaceRoot;
      const workspaceRoot = workspaceRootUri.startsWith("file://")
        ? vscode.Uri.parse(workspaceRootUri).fsPath
        : workspaceRootUri;
      const runClient = new AgentRunClient({
        logger: logger as never,
        namespace: getConfigClusterAgentNamespace(),
        kubeconfigPath: getConfigClusterAgentKubeconfig(),
      });

      const params: AgentRunParam[] = [];
      const repoInfo = await getRepositoryInfo(workspaceRoot, logger as never).catch(() => null);
      if (repoInfo) {
        params.push({ name: "repository", value: `https://${repoInfo.remoteUrl}.git` });
        params.push({ name: "branch", value: repoInfo.currentBranch });
      }

      const provider = getConfigClusterAgentProvider();
      const model = getConfigClusterAgentModel();
      const approvalMode = getConfigClusterAgentApprovalMode();
      const spec: AgentRunSpec = {
        agentRef: getConfigClusterAgentRef(),
        params,
        models: provider && model ? [{ role: "primary", provider, model }] : undefined,
        // smart_approve makes goose route write/execute tool calls through
        // session/request_permission -> inline approval cards in the chat.
        env:
          approvalMode === "smart_approve"
            ? [{ name: "GOOSE_MODE", value: "smart_approve" }]
            : undefined,
      };

      try {
        const run = await runClient.createAgentRun(spec, "ide-");
        await connectAndChat(logger, runClient, run.metadata.name!, {
          attachExisting: false,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`startClusterAgent failed: ${msg}`);
        vscode.window.showErrorMessage(`Cluster agent failed: ${msg}`);
        await disconnectActive();
      }
    },

    "konveyor-core.attachClusterAgent": async () => {
      if (active) {
        active.panel.reveal();
        vscode.window.showInformationMessage(
          `Already connected to ${active.runName}. Disconnect first.`,
        );
        return;
      }
      const runClient = new AgentRunClient({
        logger: logger as never,
        namespace: getConfigClusterAgentNamespace(),
        kubeconfigPath: getConfigClusterAgentKubeconfig(),
      });
      try {
        const runs = (await runClient.listAgentRuns()).filter((r) => r.status?.phase === "Running");
        if (runs.length === 0) {
          vscode.window.showInformationMessage("No running AgentRuns found.");
          return;
        }
        const picked = await vscode.window.showQuickPick(
          runs.map((r) => ({
            label: r.metadata.name!,
            description: `agent: ${r.spec.agentRef}`,
            detail: r.spec.instructions?.slice(0, 100),
          })),
          { placeHolder: "Attach to a running cluster agent" },
        );
        if (!picked) {
          return;
        }
        await connectAndChat(logger, runClient, picked.label, { attachExisting: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`attachClusterAgent failed: ${msg}`);
        vscode.window.showErrorMessage(`Cluster agent attach failed: ${msg}`);
        await disconnectActive();
      }
    },

    "konveyor-core.clusterAgentPrompt": async () => {
      if (!active) {
        vscode.window.showInformationMessage("No cluster agent session. Start or attach first.");
        return;
      }
      active.panel.reveal();
    },

    "konveyor-core.disconnectClusterAgent": async () => {
      if (!active) {
        vscode.window.showInformationMessage("No cluster agent session.");
        return;
      }
      await disconnectActive();
    },
  };
}
