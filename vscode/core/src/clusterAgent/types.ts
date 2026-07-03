/**
 * Minimal TypeScript mirrors of the konveyor.io/v1alpha1 CRD types used
 * by the cluster agent transport.
 *
 * Source of truth: github.com/konveyor/agentic-controller api/v1alpha1.
 */

export const GROUP = "konveyor.io";
export const VERSION = "v1alpha1";
export const API_VERSION = `${GROUP}/${VERSION}`;
export const AGENTRUN_PLURAL = "agentruns";

export type AgentRunPhase = "Pending" | "Running" | "Succeeded" | "Failed";

export interface AgentRunParam {
  name: string;
  value: string;
}

export interface AgentRunModelSelection {
  role: string;
  provider: string;
  model: string;
}

export interface AgentRunSpec {
  /** Name of the Agent CR to execute. */
  agentRef: string;
  models?: AgentRunModelSelection[];
  /** Injected as KONVEYOR_PARAM_{NAME} env vars into the sandbox. */
  params?: AgentRunParam[];
  /** Task-specific instructions, composed with the Agent's prompt. */
  instructions?: string;
  env?: Array<{ name: string; value: string }>;
  envFrom?: Array<{ secretRef?: { name: string }; configMapRef?: { name: string } }>;
}

export interface AgentRunStatus {
  phase?: AgentRunPhase;
  sandboxName?: string;
  startTime?: string;
  completionTime?: string;
  /** Wall-clock duration of the run in seconds. */
  duration?: number;
  /** Secret holding the ACP auth key (X-Secret-Key) for this run. */
  secretKeyRef?: { name: string };
  conditions?: Array<{ type: string; status: string; reason?: string; message?: string }>;
}

export interface AgentRun {
  apiVersion: string;
  kind: "AgentRun";
  metadata: {
    name?: string;
    generateName?: string;
    namespace?: string;
    labels?: Record<string, string>;
  };
  spec: AgentRunSpec;
  status?: AgentRunStatus;
}

// ─── Agent / LLMProvider (read-only, for the run setup form) ─────────

export const AGENT_PLURAL = "agents";
export const LLMPROVIDER_PLURAL = "llmproviders";

export interface AgentParamDecl {
  name: string;
  type?: "string" | "number" | "boolean";
  description?: string;
  default?: string;
  required?: boolean;
}

export interface Agent {
  apiVersion: string;
  kind: "Agent";
  metadata: { name?: string; namespace?: string };
  spec: {
    image: string;
    prompt?: string;
    providers: Array<{ ref: string }>;
    params?: AgentParamDecl[];
  };
}

export interface LLMProvider {
  apiVersion: string;
  kind: "LLMProvider";
  metadata: { name?: string; namespace?: string };
  spec: {
    endpoint: string;
    models: Array<{ name: string; contextWindow: number; tier?: string }>;
  };
}
