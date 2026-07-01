/**
 * Headless E2E for the clusterAgent module (no VSCode runtime).
 * Exercises: AgentRun create -> endpoint -> tunnel -> SDK ACP session,
 * streaming, usage_update, and the HITL permission path (smart_approve).
 * Requires the controller simulator running against minikube.
 *
 *   npx tsx cluster-smoke.ts                # mock harness, auto mode
 *   AGENT_REF=migration-analyzer-goose GOOSE_MODEL_SELECTION=... \
 *   APPROVAL=smart_approve npx tsx cluster-smoke.ts   # real goose + HITL
 */
import winston from "winston";
import { AgentRunClient } from "./src/clusterAgent/agentRunClient";
import { openTunnel } from "./src/clusterAgent/portForward";
import { ClusterAcpSession } from "./src/clusterAgent/acpSession";

const logger = winston.createLogger({
  level: "info",
  transports: [new winston.transports.Console({ format: winston.format.simple() })],
});

const agentRef = process.env.AGENT_REF ?? "migration-analyzer";
const model = process.env.GOOSE_MODEL_SELECTION;
const approval = process.env.APPROVAL ?? "auto";

async function main() {
  const client = new AgentRunClient({ logger, namespace: "konveyor-agents" });

  const run = await client.createAgentRun(
    {
      agentRef,
      params: [
        { name: "repository", value: "https://github.com/konveyor-ecosystem/coolstore.git" },
        { name: "branch", value: "main" },
      ],
      models: model
        ? [{ role: "primary", provider: process.env.LLM_PROVIDER ?? "bedrock", model }]
        : undefined,
      instructions: "Analyze the application at /workspace.",
      env:
        approval === "smart_approve" ? [{ name: "GOOSE_MODE", value: "smart_approve" }] : undefined,
    },
    "smoke-",
  );
  const runName = run.metadata.name!;
  console.log(`[created ${runName}, approval=${approval}]`);

  const endpoint = await client.waitForAcpEndpoint(runName, { timeoutMs: 120_000 });
  const tunnel = await openTunnel(client.kc, client.namespace, endpoint.podName, endpoint.port);
  console.log(`[tunnel 127.0.0.1:${tunnel.localPort}]`);

  let chunks = 0;
  let usageSeen = "";
  let permissionsAsked = 0;

  const session = await ClusterAcpSession.connect({
    logger,
    endpoint: { host: "127.0.0.1", port: tunnel.localPort, secretKey: endpoint.secretKey },
    callbacks: {
      onChunk: (text) => {
        chunks++;
        process.stdout.write(text);
      },
      onToolCall: (title, _id, status) => console.log(`\n[tool] ${title} (${status})`),
      onToolCallUpdate: (_id, status) => console.log(`[tool] -> ${status}`),
      onUsage: (used, size) => {
        usageSeen = `${used}/${size}`;
      },
      onPermission: async (ask) => {
        permissionsAsked++;
        const allow = ask.options.find((o) => o.kind.startsWith("allow")) ?? ask.options[0];
        console.log(
          `\n[PERMISSION] "${ask.title}" options=[${ask.options.map((o) => o.name).join(", ")}] -> ${allow?.name}`,
        );
        return allow?.optionId ?? null;
      },
    },
  });

  try {
    const sessionId = await session.newSession();
    console.log(`[session ${sessionId}]`);
    const prompt =
      process.env.PROMPT ??
      "Create a file /workspace/.konveyor/notes.md containing one sentence about this project, then confirm.";
    const stopReason = await session.prompt(prompt);
    console.log(
      `\n[stop: ${stopReason}] chunks=${chunks} usage=${usageSeen || "n/a"} permissions=${permissionsAsked}`,
    );

    if (chunks === 0) {
      throw new Error("no streamed chunks");
    }
    if (approval === "smart_approve" && permissionsAsked === 0) {
      throw new Error("smart_approve set but no permission request arrived");
    }
    console.log("CLUSTER SMOKE OK");
  } finally {
    await session.close();
    tunnel.close();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
