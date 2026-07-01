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
  type AgentRun,
  type AgentRunSpec,
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

const SECRET_DATA_KEY = "ACP_SECRET_KEY";
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

  /**
   * Polls until the run is Running with a published ACP key, then
   * resolves the connection pieces.
   */
  async waitForAcpEndpoint(
    name: string,
    options?: { timeoutMs?: number; pollIntervalMs?: number },
  ): Promise<AcpEndpoint> {
    const timeoutMs = options?.timeoutMs ?? 120_000;
    const interval = options?.pollIntervalMs ?? 1_000;
    const deadline = Date.now() + timeoutMs;

    let sandboxName: string | undefined;
    let secretName: string | undefined;
    for (;;) {
      const run = await this.getAgentRun(name);
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
        throw new Error(
          `Timed out waiting for AgentRun ${name} (phase=${run.status?.phase ?? "unset"})`,
        );
      }
      await new Promise((r) => setTimeout(r, interval));
    }

    const secret = await this.core.readNamespacedSecret({
      name: secretName,
      namespace: this.namespace,
    });
    const data = secret.data ?? {};
    const b64 =
      data[SECRET_DATA_KEY] ??
      (Object.keys(data).length === 1 ? Object.values(data)[0] : undefined);
    if (!b64) {
      throw new Error(`Secret ${secretName} has no ${SECRET_DATA_KEY} entry`);
    }

    const pods = await this.core.listNamespacedPod({
      namespace: this.namespace,
      labelSelector: `konveyor.io/agentrun=${name}`,
    });
    const pod = pods.items.find((p) => p.status?.phase === "Running") ?? pods.items[0];
    if (!pod?.metadata?.name) {
      throw new Error(`No sandbox pod found for AgentRun ${name}`);
    }

    return {
      podName: pod.metadata.name,
      serviceHost: `${sandboxName}.${this.namespace}.svc`,
      port: ACP_PORT,
      secretKey: Buffer.from(b64, "base64").toString("utf8"),
    };
  }
}
