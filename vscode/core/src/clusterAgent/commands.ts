/**
 * VSCode commands for cluster-hosted agents (konveyor.io AgentRuns).
 *
 * Sessions render in a chat webview panel (chatPanel.ts); runs are
 * ambiently visible in the sidebar tree (runsView.ts). Connections
 * auto-reconnect with session/load resume when the WebSocket or
 * port-forward drops (pod restarts, laptop sleep), and the run's phase
 * is watched so completion is announced instead of going quiet.
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
import { ClusterChatPanel, type SetupAgent, type SetupData } from "./chatPanel";
import { refreshRunsView, type RunItem } from "./runsView";
import type { AgentRunSpec } from "./types";

const PHASE_WATCH_MS = 5_000;
/** Reconnect backoff (seconds). Pod restarts take ~10-30s. */
const RECONNECT_BACKOFF_S = [1, 2, 4, 8, 15, 15, 15, 30];

interface ActiveClusterSession {
  runName: string;
  session: ClusterAcpSession;
  tunnel: Tunnel;
  statusBar: vscode.StatusBarItem;
  panel: ClusterChatPanel;
  runClient: AgentRunClient;
  logger: Logger;
  savedSessionId: string | null;
  reconnecting: boolean;
  /** Run reached Succeeded/Failed — stop reconnecting, session is over. */
  terminal: boolean;
  phaseTimer: ReturnType<typeof setInterval> | null;
  lastPhase: string;
}

let active: ActiveClusterSession | null = null;
let disconnecting = false;

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function disconnectActive(): Promise<void> {
  if (!active || disconnecting) {
    return;
  }
  disconnecting = true;
  const current = active;
  active = null;
  try {
    if (current.phaseTimer) {
      clearInterval(current.phaseTimer);
    }
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

function standardHandlers() {
  return {
    onPrompt: (text: string) => {
      void runPromptTurn(text);
    },
    onCancel: () => {
      void active?.session.cancel();
    },
    onDisconnect: () => {
      void disconnectActive();
    },
  };
}

function makeCallbacks(panel: ClusterChatPanel, statusBar: vscode.StatusBarItem, runName: string) {
  return {
    onChunk: (text: string, kind: "text" | "thinking") => panel.chunk(text, kind),
    onToolCall: (title: string, id: string, status: string) =>
      panel.toolCall(id || title, title, status),
    onToolCallUpdate: (id: string, status: string, result?: string) =>
      panel.toolUpdate(id, status, result),
    onUsage: (used: number, size: number) => {
      panel.usage(used, size);
      statusBar.text = `$(hubot) ${runName} ${formatTokens(used)}/${formatTokens(size)}`;
    },
    onPermission: (ask: PermissionAsk) =>
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
  };
}

/**
 * Dial the run's ACP endpoint: resolve endpoint (pod may have moved),
 * tunnel, connect, and start or resume a session. Used for both the
 * initial connection and reconnects.
 */
async function connectSession(options: {
  logger: Logger;
  runClient: AgentRunClient;
  runName: string;
  panel: ClusterChatPanel;
  statusBar: vscode.StatusBarItem;
  resumeSessionId?: string | null;
  /** "attach" resumes the run's most recent session if any. */
  attachLatest?: boolean;
}): Promise<{ session: ClusterAcpSession; tunnel: Tunnel }> {
  const { logger, runClient, runName, panel, statusBar } = options;

  const endpoint = await runClient.waitForAcpEndpoint(runName, {
    // After a short grace period, surface what we're actually waiting on so a
    // stalled run (e.g. no controller/simulator reconciling it) isn't a silent
    // spinner. The full timeout in waitForAcpEndpoint throws an actionable error.
    onProgress: ({ phase, elapsedMs }) => {
      if (elapsedMs < 15_000) {
        return;
      }
      const secs = Math.round(elapsedMs / 1000);
      const stalled = phase === "unset" || phase === "Pending";
      panel.status(
        runName,
        stalled
          ? `provisioning sandbox… (${phase}, ${secs}s — is the controller/simulator running?)`
          : `provisioning sandbox… (${phase}, ${secs}s)`,
      );
    },
  });
  const tunnel = await openTunnel(
    runClient.kc,
    runClient.namespace,
    endpoint.podName,
    endpoint.port,
  );

  let session: ClusterAcpSession;
  try {
    session = await ClusterAcpSession.connect({
      logger: logger as never,
      endpoint: { host: "127.0.0.1", port: tunnel.localPort, secretKey: endpoint.secretKey },
      callbacks: makeCallbacks(panel, statusBar, runName),
    });
  } catch (err) {
    tunnel.close();
    throw err;
  }

  try {
    if (options.resumeSessionId && session.loadSessionSupported) {
      panel.clearChat();
      panel.status(runName, "replaying history…");
      await session.loadSession(options.resumeSessionId);
    } else if (options.attachLatest && session.loadSessionSupported) {
      try {
        const sessions = await session.listSessions();
        if (sessions.length > 0) {
          panel.clearChat();
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
  } catch (err) {
    await session.close().catch(() => {});
    tunnel.close();
    throw err;
  }

  return { session, tunnel };
}

/** Wire loss detection for the current active session. */
function armReconnect(): void {
  const current = active;
  if (!current) {
    return;
  }
  current.session.onClosed(() => {
    // Stale closure guard: only react if this session is still current.
    if (active === current && !disconnecting) {
      void handleConnectionLoss();
    }
  });
}

async function handleConnectionLoss(): Promise<void> {
  const current = active;
  if (!current || current.reconnecting || current.terminal) {
    return;
  }
  current.reconnecting = true;
  current.tunnel.close();
  current.panel.status(current.runName, "connection lost — reconnecting…");
  current.statusBar.text = `$(sync~spin) ${current.runName} reconnecting`;
  current.logger.warn(`ClusterAgent: connection to ${current.runName} lost, reconnecting`);

  for (const backoff of RECONNECT_BACKOFF_S) {
    if (active !== current || current.panel.isDisposed) {
      return;
    }

    // The most common cause of a drop is the run finishing and its pod
    // exiting — check before dialing.
    try {
      const run = await current.runClient.getAgentRun(current.runName);
      const phase = run.status?.phase;
      if (phase === "Succeeded" || phase === "Failed") {
        announceTerminal(current, phase, run.status?.duration);
        return;
      }
    } catch {
      // apiserver unreachable too — keep backing off
    }

    await sleep(backoff * 1000);
    // The phase watcher may have declared the run terminal during the
    // backoff sleep — don't dial a pod that's gone.
    if (active !== current || current.panel.isDisposed || current.terminal) {
      return;
    }

    try {
      const { session, tunnel } = await connectSession({
        logger: current.logger,
        runClient: current.runClient,
        runName: current.runName,
        panel: current.panel,
        statusBar: current.statusBar,
        resumeSessionId: current.savedSessionId,
      });
      current.session = session;
      current.tunnel = tunnel;
      current.savedSessionId = session.getSessionId();
      current.reconnecting = false;
      current.statusBar.text = `$(hubot) ${current.runName}`;
      current.panel.status(current.runName, "reconnected", session.getSessionId() ?? undefined);
      armReconnect();
      current.logger.info(`ClusterAgent: reconnected to ${current.runName}`);
      return;
    } catch (err) {
      current.logger.warn(
        `ClusterAgent: reconnect attempt failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (active === current) {
    current.reconnecting = false;
    current.panel.error("Could not reconnect. Use 'Attach to Running Cluster Agent' to retry.");
    current.panel.status(current.runName, "disconnected");
    current.statusBar.text = `$(debug-disconnect) ${current.runName}`;
  }
}

function announceTerminal(
  current: ActiveClusterSession,
  phase: "Succeeded" | "Failed",
  duration?: number,
): void {
  if (current.terminal) {
    return; // reconnect loop and phase watcher can both get here
  }
  current.terminal = true;
  current.reconnecting = false;
  if (current.phaseTimer) {
    clearInterval(current.phaseTimer);
    current.phaseTimer = null;
  }
  const summary = `run ${phase.toLowerCase()}${duration !== undefined ? ` in ${duration}s` : ""}`;
  if (phase === "Failed") {
    current.panel.error(`Agent ${summary}.`);
  } else {
    // Rendered as a neutral system line in the transcript.
    current.panel.turnDone(summary);
  }
  current.panel.status(current.runName, phase.toLowerCase());
  current.statusBar.text = `$(${phase === "Succeeded" ? "check" : "error"}) ${current.runName}`;
  refreshRunsView();
}

function startPhaseWatch(): void {
  const current = active;
  if (!current) {
    return;
  }
  current.phaseTimer = setInterval(async () => {
    if (active !== current || current.terminal) {
      clearInterval(current.phaseTimer!);
      return;
    }
    try {
      const run = await current.runClient.getAgentRun(current.runName);
      const phase = run.status?.phase ?? "Pending";
      if (phase !== current.lastPhase) {
        current.lastPhase = phase;
        refreshRunsView();
        if (phase === "Succeeded" || phase === "Failed") {
          announceTerminal(current, phase, run.status?.duration);
        }
      }
    } catch {
      // transient list errors are fine; reconnect logic owns hard failures
    }
  }, PHASE_WATCH_MS);
}

async function connectAndChat(
  logger: Logger,
  runClient: AgentRunClient,
  runName: string,
  options: { attachExisting: boolean; panel?: ClusterChatPanel; firstPrompt?: string },
): Promise<void> {
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.name = "Konveyor Cluster Agent";
  statusBar.text = `$(hubot) ${runName}`;
  statusBar.command = "konveyor-core.clusterAgentPrompt";
  statusBar.show();

  const panel = options.panel ?? new ClusterChatPanel(`Agent: ${runName}`, standardHandlers());
  panel.startChat();
  panel.status(runName, "provisioning sandbox…");

  let session: ClusterAcpSession;
  let tunnel: Tunnel;
  try {
    ({ session, tunnel } = await connectSession({
      logger,
      runClient,
      runName,
      panel,
      statusBar,
      attachLatest: options.attachExisting,
    }));
  } catch (err) {
    statusBar.dispose();
    panel.error(err instanceof Error ? err.message : String(err));
    panel.status(runName, "failed");
    throw err;
  }

  active = {
    runName,
    session,
    tunnel,
    statusBar,
    panel,
    runClient,
    logger,
    savedSessionId: session.getSessionId(),
    reconnecting: false,
    terminal: false,
    phaseTimer: null,
    lastPhase: "Running",
  };
  armReconnect();
  startPhaseWatch();
  refreshRunsView();

  panel.status(runName, "connected", session.getSessionId() ?? undefined);

  if (options.firstPrompt) {
    void runPromptTurn(options.firstPrompt);
  }
}

async function runPromptTurn(text: string): Promise<void> {
  if (!active) {
    return;
  }
  const current = active;
  const { panel, session, runName } = current;
  if (current.reconnecting) {
    panel.error("Reconnecting — try again in a moment.");
    return;
  }
  if (current.terminal) {
    panel.error("This run has finished. Start a new run to continue.");
    return;
  }
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
    // A drop mid-turn surfaces here; the reconnect path (armReconnect)
    // owns recovery, so keep this to a transcript note.
    panel.error(err instanceof Error ? err.message : String(err));
    if (!current.reconnecting && !current.terminal) {
      panel.status(runName, "turn failed");
    }
  }
}

async function attachToRun(logger: Logger, runName: string): Promise<void> {
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
    await connectAndChat(logger, runClient, runName, { attachExisting: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`attachToRun(${runName}) failed: ${msg}`);
    vscode.window.showErrorMessage(`Cluster agent attach failed: ${msg}`);
    await disconnectActive();
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

      let setupData: SetupData;
      const panel = new ClusterChatPanel("New Cluster Agent Run", {
        ...standardHandlers(),
        onCreate: async (payload) => {
          const spec: AgentRunSpec = {
            agentRef: payload.agentRef,
            instructions: payload.instructions || undefined,
            params: Object.entries(payload.params).map(([name, value]) => ({ name, value })),
            models:
              payload.provider && payload.model
                ? [{ role: "primary", provider: payload.provider, model: payload.model }]
                : undefined,
            // smart_approve makes goose route write/execute tool calls
            // through session/request_permission -> inline approval cards.
            env: payload.smartApprove
              ? [{ name: "GOOSE_MODE", value: "smart_approve" }]
              : undefined,
          };
          try {
            const run = await runClient.createAgentRun(spec, "ide-");
            refreshRunsView();
            await connectAndChat(logger, runClient, run.metadata.name!, {
              attachExisting: false,
              panel,
              firstPrompt: payload.instructions || undefined,
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error(`startClusterAgent create failed: ${msg}`);
            vscode.window.showErrorMessage(`Cluster agent failed: ${msg}`);
            if (!panel.isDisposed) {
              panel.showSetup(setupData);
            } else {
              await disconnectActive();
            }
          }
        },
      });

      try {
        // Build the setup form from the cluster's Agent + LLMProvider CRs.
        const [agents, providers, repoInfo] = await Promise.all([
          runClient.listAgents(),
          runClient.listLLMProviders(),
          getRepositoryInfo(workspaceRoot, logger as never).catch(() => null),
        ]);
        if (agents.length === 0) {
          panel.dispose();
          vscode.window.showWarningMessage(`No Agents found in namespace ${runClient.namespace}.`);
          return;
        }
        const providerModels = new Map(
          providers.map((p) => [p.metadata.name!, p.spec.models ?? []]),
        );
        const setupAgents: SetupAgent[] = agents.map((a) => ({
          name: a.metadata.name!,
          promptPreview: a.spec.prompt?.trim().split("\n").slice(0, 2).join(" "),
          params: a.spec.params ?? [],
          models: (a.spec.providers ?? []).flatMap(({ ref }) =>
            (providerModels.get(ref) ?? []).map((m) => ({
              provider: ref,
              model: m.name,
              tier: m.tier,
            })),
          ),
        }));

        const prefill: Record<string, string> = {};
        if (repoInfo) {
          prefill.repository = `https://${repoInfo.remoteUrl}.git`;
          prefill.branch = repoInfo.currentBranch;
        }

        setupData = {
          agents: setupAgents,
          prefill,
          defaults: {
            agentRef: getConfigClusterAgentRef(),
            provider: getConfigClusterAgentProvider(),
            model: getConfigClusterAgentModel(),
            smartApprove: getConfigClusterAgentApprovalMode() === "smart_approve",
          },
        };
        panel.showSetup(setupData);
      } catch (err) {
        panel.dispose();
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`startClusterAgent setup failed: ${msg}`);
        vscode.window.showErrorMessage(`Cluster agent setup failed: ${msg}`);
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
        await attachToRun(logger, picked.label);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`attachClusterAgent failed: ${msg}`);
        vscode.window.showErrorMessage(`Cluster agent attach failed: ${msg}`);
      }
    },

    "konveyor-core.clusterAgentRuns.attach": async (item?: unknown) => {
      const runName = (item as RunItem | undefined)?.run?.metadata?.name;
      if (!runName) {
        return;
      }
      if (active?.runName === runName) {
        active.panel.reveal();
        return;
      }
      await attachToRun(logger, runName);
    },

    "konveyor-core.clusterAgentRuns.stop": async (item?: unknown) => {
      const runName = (item as RunItem | undefined)?.run?.metadata?.name;
      if (!runName) {
        return;
      }
      const confirmed = await vscode.window.showWarningMessage(
        `Stop and delete AgentRun ${runName}? The sandbox and its workspace are removed.`,
        { modal: true },
        "Delete",
      );
      if (confirmed !== "Delete") {
        return;
      }
      if (active?.runName === runName) {
        await disconnectActive();
      }
      const runClient = new AgentRunClient({
        logger: logger as never,
        namespace: getConfigClusterAgentNamespace(),
        kubeconfigPath: getConfigClusterAgentKubeconfig(),
      });
      try {
        await runClient.deleteAgentRun(runName);
      } catch (err) {
        vscode.window.showErrorMessage(
          `Failed to delete ${runName}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      refreshRunsView();
    },

    "konveyor-core.clusterAgentRuns.refresh": () => {
      refreshRunsView();
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
