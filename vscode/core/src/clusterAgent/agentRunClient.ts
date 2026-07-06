/**
 * Direct-to-apiserver client for AgentRun CRs (kubeconfig auth) — the
 * no-UI path blessed by agentic-controller ADR 0002. The IDE already
 * knows the workspace's git remote and branch, so it builds the CR
 * itself rather than going through Hub's smart-create (ADR 0003).
 * Swapping this for Hub REST later changes only this file.
 */
import * as k8s from "@kubernetes/client-node";
import winston from "winston";
import {
  API_VERSION,
  GROUP,
  VERSION,
  AGENTRUN_PLURAL,
  AGENT_PLURAL,
  LLMPROVIDER_PLURAL,
  type Agent,
  type AgentRun,
  type AgentRunSpec,
  type LLMProvider,
} from "./types";

/** Everything needed to open an authenticated ACP connection to a run. */
export interface AcpEndpoint {
  /** Pod backing the sandbox (port-forward target). */
  podName: string;
  /** In-cluster DNS name: <sandboxName>.<namespace>.svc */
  serviceHost: string;
  port: number;
  /** Value for the X-Secret-Key header. */
  secretKey: string;
}

// The ACP key Secret is keyed differently by the two reconcilers we support:
// the dev-mode simulator writes "ACP_SECRET_KEY"; the real agentic-controller
// (Agent Sandbox) writes "secret-key". Accept either, newest-first.
const SECRET_DATA_KEYS = ["secret-key", "ACP_SECRET_KEY"];
const ACP_PORT = 4000;

export interface AgentRunClientOptions {
  logger: winston.Logger;
  namespace: string;
  /** Path to kubeconfig; empty/undefined = default loading rules. */
  kubeconfigPath?: string;
}

export class AgentRunClient {
  readonly kc: k8s.KubeConfig;
  readonly namespace: string;
  private readonly custom: k8s.CustomObjectsApi;
  private readonly core: k8s.CoreV1Api;
  private readonly logger: winston.Logger;

  constructor(options: AgentRunClientOptions) {
    this.kc = new k8s.KubeConfig();
    if (options.kubeconfigPath) {
      this.kc.loadFromFile(options.kubeconfigPath);
    } else {
      this.kc.loadFromDefault();
    }
    this.namespace = options.namespace;
    this.logger = options.logger;
    this.custom = this.kc.makeApiClient(k8s.CustomObjectsApi);
    this.core = this.kc.makeApiClient(k8s.CoreV1Api);
  }

  async createAgentRun(spec: AgentRunSpec, generateName: string): Promise<AgentRun> {
    const body: AgentRun = {
      apiVersion: API_VERSION,
      kind: "AgentRun",
      metadata: {
        generateName,
        namespace: this.namespace,
        labels: { "konveyor.io/created-by": "editor-extensions" },
      },
      spec,
    };
    const created = (await this.custom.createNamespacedCustomObject({
      group: GROUP,
      version: VERSION,
      namespace: this.namespace,
      plural: AGENTRUN_PLURAL,
      body,
    })) as AgentRun;
    this.logger.info(`AgentRunClient: created AgentRun ${created.metadata.name}`);
    return created;
  }

  async listAgents(): Promise<Agent[]> {
    const list = (await this.custom.listNamespacedCustomObject({
      group: GROUP,
      version: VERSION,
      namespace: this.namespace,
      plural: AGENT_PLURAL,
    })) as { items: Agent[] };
    return list.items;
  }

  async listLLMProviders(): Promise<LLMProvider[]> {
    const list = (await this.custom.listNamespacedCustomObject({
      group: GROUP,
      version: VERSION,
      namespace: this.namespace,
      plural: LLMPROVIDER_PLURAL,
    })) as { items: LLMProvider[] };
    return list.items;
  }

  async listAgentRuns(): Promise<AgentRun[]> {
    const list = (await this.custom.listNamespacedCustomObject({
      group: GROUP,
      version: VERSION,
      namespace: this.namespace,
      plural: AGENTRUN_PLURAL,
    })) as { items: AgentRun[] };
    return list.items;
  }

  async getAgentRun(name: string): Promise<AgentRun> {
    return (await this.custom.getNamespacedCustomObject({
      group: GROUP,
      version: VERSION,
      namespace: this.namespace,
      plural: AGENTRUN_PLURAL,
      name,
    })) as AgentRun;
  }

  async deleteAgentRun(name: string): Promise<void> {
    await this.custom.deleteNamespacedCustomObject({
      group: GROUP,
      version: VERSION,
      namespace: this.namespace,
      plural: AGENTRUN_PLURAL,
      name,
    });
    this.logger.info(`AgentRunClient: deleted AgentRun ${name}`);
  }

  /**
   * Polls until the run is Running with a published ACP key, then
   * resolves the connection pieces.
   */
  async waitForAcpEndpoint(
    name: string,
    options?: {
      timeoutMs?: number;
      pollIntervalMs?: number;
      /** Called each poll while still waiting, so callers can surface progress. */
      onProgress?: (info: { phase: string; elapsedMs: number }) => void;
    },
  ): Promise<AcpEndpoint> {
    const timeoutMs = options?.timeoutMs ?? 120_000;
    const interval = options?.pollIntervalMs ?? 1_000;
    const start = Date.now();
    const deadline = start + timeoutMs;

    let sandboxName: string | undefined;
    let secretName: string | undefined;
    for (;;) {
      const run = await this.getAgentRun(name);
      const phase = run.status?.phase ?? "unset";
      if (
        run.status?.phase === "Running" &&
        run.status.sandboxName &&
        run.status.secretKeyRef?.name
      ) {
        sandboxName = run.status.sandboxName;
        secretName = run.status.secretKeyRef.name;
        break;
      }
      if (run.status?.phase === "Failed") {
        const msg = run.status.conditions
          ?.map((c) => c.message)
          .filter(Boolean)
          .join("; ");
        throw new Error(`AgentRun ${name} failed${msg ? `: ${msg}` : ""}`);
      }
      if (Date.now() > deadline) {
        // A run still "unset"/"Pending" at the deadline was never advanced by a
        // controller — in local dev that means the simulator isn't running.
        const stalled = phase === "unset" || phase === "Pending";
        throw new Error(
          `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for AgentRun ${name} ` +
            `to become Running (phase=${phase}).` +
            (stalled
              ? " Nothing is advancing the run — ensure the agentic-controller is reconciling it " +
                "(in local dev mode, start the simulator: `npm run simulator` in packages/agentrun-client)."
              : ""),
        );
      }
      options?.onProgress?.({ phase, elapsedMs: Date.now() - start });
      await new Promise((r) => setTimeout(r, interval));
    }

    const secret = await this.core.readNamespacedSecret({
      name: secretName,
      namespace: this.namespace,
    });
    const data = secret.data ?? {};
    const b64 =
      SECRET_DATA_KEYS.map((k) => data[k]).find((v) => v !== undefined) ??
      // Single-key Secret from some other reconciler: take whatever's there.
      (Object.keys(data).length === 1 ? Object.values(data)[0] : undefined);
    if (!b64) {
      throw new Error(
        `Secret ${secretName} has no ACP key (looked for ${SECRET_DATA_KEYS.join(", ")})`,
      );
    }

    // Both the real Agent Sandbox controller and the dev-mode simulator name the
    // backing pod after the Sandbox, so resolve it by name first. Fall back to
    // the run label for any reconciler that names its pod differently — the real
    // controller does NOT put konveyor.io/agentrun on the pod, so name-first is
    // what makes this work against agentic-controller.
    let podName = await this.core
      .readNamespacedPod({ name: sandboxName, namespace: this.namespace })
      .then((p) => p.metadata?.name)
      .catch(() => undefined);
    if (!podName) {
      const pods = await this.core.listNamespacedPod({
        namespace: this.namespace,
        labelSelector: `konveyor.io/agentrun=${name}`,
      });
      const pod = pods.items.find((p) => p.status?.phase === "Running") ?? pods.items[0];
      podName = pod?.metadata?.name;
    }
    if (!podName) {
      throw new Error(`No sandbox pod found for AgentRun ${name} (sandbox ${sandboxName})`);
    }

    return {
      podName,
      serviceHost: `${sandboxName}.${this.namespace}.svc`,
      port: ACP_PORT,
      secretKey: Buffer.from(b64, "base64").toString("utf8"),
    };
  }
}
