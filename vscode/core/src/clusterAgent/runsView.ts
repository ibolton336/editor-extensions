/**
 * Sidebar tree of konveyor.io AgentRuns in the configured namespace:
 * ambient visibility of run phases plus attach/stop actions, so runs
 * aren't invisible between chat sessions.
 *
 * Refresh is poll-based (only while the view is visible) — a k8s Watch
 * would be tidier but polling keeps failure modes simple for the POC.
 */
import * as vscode from "vscode";
import type { Logger } from "winston";
import {
  getConfigClusterAgentNamespace,
  getConfigClusterAgentKubeconfig,
} from "../utilities/configuration";
import { AgentRunClient } from "./agentRunClient";
import type { AgentRun, AgentRunPhase } from "./types";

const POLL_MS = 5_000;

const PHASE_ICONS: Record<AgentRunPhase, vscode.ThemeIcon> = {
  Pending: new vscode.ThemeIcon("loading~spin"),
  Running: new vscode.ThemeIcon("play-circle", new vscode.ThemeColor("charts.green")),
  Succeeded: new vscode.ThemeIcon("check", new vscode.ThemeColor("charts.green")),
  Failed: new vscode.ThemeIcon("error", new vscode.ThemeColor("charts.red")),
};

export class RunItem extends vscode.TreeItem {
  constructor(readonly run: AgentRun) {
    super(run.metadata.name ?? "(unnamed)", vscode.TreeItemCollapsibleState.None);
    const phase = run.status?.phase ?? "Pending";
    const duration = run.status?.duration !== undefined ? ` · ${run.status.duration}s` : "";
    this.description = `${run.spec.agentRef} · ${phase}${duration}`;
    this.iconPath = PHASE_ICONS[phase] ?? new vscode.ThemeIcon("question");
    this.tooltip = [
      `AgentRun ${run.metadata.name}`,
      `agent: ${run.spec.agentRef}`,
      `phase: ${phase}`,
      run.spec.instructions ? `instructions: ${run.spec.instructions.slice(0, 120)}` : undefined,
      run.status?.startTime ? `started: ${run.status.startTime}` : undefined,
    ]
      .filter(Boolean)
      .join("\n");
    // Menus gate on this: attach only makes sense for Running runs.
    this.contextValue = phase === "Running" ? "agentRunRunning" : "agentRun";
    if (phase === "Running") {
      this.command = {
        command: "konveyor-core.clusterAgentRuns.attach",
        title: "Attach",
        arguments: [this],
      };
    }
  }
}

export class AgentRunsProvider implements vscode.TreeDataProvider<RunItem> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastError: string | null = null;
  /** Called after each list attempt with the current error (null = ok). */
  onErrorChanged: ((message: string | null) => void) | null = null;

  constructor(private readonly logger: Logger) {}

  refresh(): void {
    this.emitter.fire();
  }

  startPolling(): void {
    if (!this.timer) {
      this.timer = setInterval(() => this.refresh(), POLL_MS);
    }
  }

  stopPolling(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getErrorMessage(): string | null {
    return this.lastError;
  }

  getTreeItem(element: RunItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: RunItem): Promise<RunItem[]> {
    if (element) {
      return [];
    }
    try {
      // Fresh client per refresh so namespace/kubeconfig setting changes
      // take effect without a reload; cheap at this poll interval.
      const client = new AgentRunClient({
        logger: this.logger as never,
        namespace: getConfigClusterAgentNamespace(),
        kubeconfigPath: getConfigClusterAgentKubeconfig(),
      });
      const runs = await client.listAgentRuns();
      if (this.lastError !== null) {
        this.lastError = null;
        this.onErrorChanged?.(null);
      }
      runs.sort(
        (a, b) =>
          (b.metadata as { creationTimestamp?: string }).creationTimestamp?.localeCompare(
            (a.metadata as { creationTimestamp?: string }).creationTimestamp ?? "",
          ) ?? 0,
      );
      return runs.map((r) => new RunItem(r));
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.logger.debug(`AgentRunsProvider: list failed: ${this.lastError}`);
      this.onErrorChanged?.(this.lastError);
      return [];
    }
  }
}

let providerInstance: AgentRunsProvider | null = null;

/** Nudge the tree after actions that change runs (create/stop). */
export function refreshRunsView(): void {
  providerInstance?.refresh();
}

export function registerClusterAgentRunsView(
  context: vscode.ExtensionContext,
  logger: Logger,
): void {
  const provider = new AgentRunsProvider(logger);
  providerInstance = provider;
  const view = vscode.window.createTreeView("konveyor-core.clusterAgentRuns", {
    treeDataProvider: provider,
  });
  provider.onErrorChanged = (message) => {
    view.message = message ? `Cluster unreachable: ${message}` : undefined;
  };
  view.onDidChangeVisibility((e) => {
    if (e.visible) {
      provider.refresh();
      provider.startPolling();
    } else {
      provider.stopPolling();
    }
  });
  if (view.visible) {
    provider.startPolling();
  }
  context.subscriptions.push(view, { dispose: () => provider.stopPolling() });
}
