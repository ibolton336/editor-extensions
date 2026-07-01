/**
 * VSCode commands for cluster-hosted agents (konveyor.io AgentRuns).
 *
 * UX is deliberately native (output channel, input box, quick pick,
 * modal permission dialogs, status bar usage meter) so this feature is
 * independent of any chat webview work. When a unified chat AgentClient
 * lands (editor-extensions#1368), ClusterAcpSession becomes its cluster
 * transport and these commands keep working as the power-user path.
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
import type { AgentRunParam, AgentRunSpec } from "./types";

interface ActiveClusterSession {
  runName: string;
  session: ClusterAcpSession;
  tunnel: Tunnel;
  statusBar: vscode.StatusBarItem;
  output: vscode.OutputChannel;
}

let active: ActiveClusterSession | null = null;

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

async function disconnectActive(): Promise<void> {
  if (!active) {
    return;
  }
  const current = active;
  active = null;
  current.statusBar.dispose();
  await current.session.close().catch(() => {});
  current.tunnel.close();
  current.output.appendLine(`\n[disconnected from ${current.runName} — the run keeps going]`);
}

async function askPermission(ask: PermissionAsk): Promise<string | null> {
  const detailParts: string[] = [];
  if (ask.toolName) {
    detailParts.push(`Tool: ${ask.toolName}`);
  }
  if (ask.rawInput !== undefined) {
    detailParts.push(JSON.stringify(ask.rawInput, null, 2).slice(0, 800));
  }
  const picked = await vscode.window.showWarningMessage(
    `Cluster agent requests permission: ${ask.title}`,
    { modal: true, detail: detailParts.join("\n\n") || undefined },
    ...ask.options.map((o) => o.name),
  );
  const chosen = ask.options.find((o) => o.name === picked);
  return chosen?.optionId ?? null;
}

function wireSession(
  runName: string,
  session: ClusterAcpSession,
  tunnel: Tunnel,
  output: vscode.OutputChannel,
): ActiveClusterSession {
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.name = "Konveyor Cluster Agent";
  statusBar.text = `$(hubot) ${runName}`;
  statusBar.tooltip = "Konveyor cluster agent session (click to send a message)";
  statusBar.command = "konveyor-core.clusterAgentPrompt";
  statusBar.show();
  return { runName, session, tunnel, statusBar, output };
}

/** Callbacks shared by run/attach paths; render into the output channel. */
function sessionCallbacks(
  output: vscode.OutputChannel,
  getStatusBar: () => vscode.StatusBarItem | undefined,
) {
  let lastChunkKind: string | null = null;
  return {
    onChunk: (text: string, kind: "text" | "thinking") => {
      if (kind !== lastChunkKind) {
        output.append(kind === "thinking" ? "\n[thinking] " : "\n");
        lastChunkKind = kind;
      }
      output.append(text);
    },
    onToolCall: (title: string, _id: string, status: string) => {
      lastChunkKind = null;
      output.appendLine(`\n[tool] ${title} (${status})`);
    },
    onToolCallUpdate: (_id: string, status: string, resultText?: string) => {
      lastChunkKind = null;
      output.appendLine(`[tool] -> ${status}${resultText ? `: ${resultText.slice(0, 300)}` : ""}`);
    },
    onUsage: (used: number, size: number) => {
      const bar = getStatusBar();
      if (bar) {
        bar.text = `$(hubot) ${active?.runName ?? ""} ${formatTokens(used)}/${formatTokens(size)}`;
      }
    },
    onPermission: askPermission,
  };
}

async function promptLoop(output: vscode.OutputChannel, firstPrompt?: string): Promise<void> {
  let next: string | undefined = firstPrompt;
  for (;;) {
    if (!next) {
      next = await vscode.window.showInputBox({
        prompt: "Message the cluster agent (Esc to disconnect; the run keeps going)",
        ignoreFocusOut: true,
      });
    }
    if (!next || !active) {
      break;
    }
    output.appendLine(`\n\n>>> ${next}`);
    try {
      const stopReason = await active.session.prompt(next);
      output.appendLine(`\n[turn complete: ${stopReason}]`);
    } catch (err) {
      output.appendLine(`\n[error: ${err instanceof Error ? err.message : String(err)}]`);
      break;
    }
    next = undefined;
  }
}

async function connectAndChat(
  logger: Logger,
  runClient: AgentRunClient,
  runName: string,
  output: vscode.OutputChannel,
  options: { attachExisting: boolean; firstPrompt?: string },
): Promise<void> {
  const endpoint = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Cluster agent ${runName}`,
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: "waiting for sandbox..." });
      return runClient.waitForAcpEndpoint(runName);
    },
  );

  const tunnel = await openTunnel(
    runClient.kc,
    runClient.namespace,
    endpoint.podName,
    endpoint.port,
  );

  const session = await ClusterAcpSession.connect({
    logger: logger as never,
    endpoint: { host: "127.0.0.1", port: tunnel.localPort, secretKey: endpoint.secretKey },
    callbacks: sessionCallbacks(output, () => active?.statusBar),
  });

  active = wireSession(runName, session, tunnel, output);
  output.show(true);

  if (options.attachExisting && session.loadSessionSupported) {
    // Try to resume the most recent session so history replays into the
    // output channel; fall back to a fresh session.
    try {
      const sessions = await session.listSessions();
      if (sessions.length > 0) {
        output.appendLine(`[replaying session ${sessions[0]} of ${runName}]\n`);
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

  output.appendLine(`[connected to ${runName}; session ${session.getSessionId()}]`);
  await promptLoop(output, options.firstPrompt);
  await disconnectActive();
}

export function clusterAgentCommandsMap(
  state: ExtensionState,
  logger: Logger,
): { [command: string]: (...args: unknown[]) => unknown } {
  const output = vscode.window.createOutputChannel("Konveyor Cluster Agent");

  return {
    "konveyor-core.startClusterAgent": async () => {
      if (active) {
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

      const instructions = await vscode.window.showInputBox({
        prompt: "Instructions for the agent run (composed with the Agent's standing prompt)",
        value: "Analyze this application for migration blockers.",
        ignoreFocusOut: true,
      });
      if (instructions === undefined) {
        return;
      }

      const provider = getConfigClusterAgentProvider();
      const model = getConfigClusterAgentModel();
      const approvalMode = getConfigClusterAgentApprovalMode();
      const spec: AgentRunSpec = {
        agentRef: getConfigClusterAgentRef(),
        params,
        instructions,
        models: provider && model ? [{ role: "primary", provider, model }] : undefined,
        // smart_approve makes goose route write/execute tool calls through
        // session/request_permission -> modal dialog in the IDE.
        env:
          approvalMode === "smart_approve"
            ? [{ name: "GOOSE_MODE", value: "smart_approve" }]
            : undefined,
      };

      try {
        const run = await runClient.createAgentRun(spec, "ide-");
        output.clear();
        output.appendLine(`[created AgentRun ${run.metadata.name}]`);
        await connectAndChat(logger, runClient, run.metadata.name!, output, {
          attachExisting: false,
          firstPrompt: instructions || undefined,
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
        output.clear();
        await connectAndChat(logger, runClient, picked.label, output, { attachExisting: true });
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
      // The prompt loop already owns input; this just refocuses output.
      active.output.show(true);
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
