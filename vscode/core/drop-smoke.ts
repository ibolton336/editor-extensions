/**
 * Headless check of connection-loss detection + resume:
 * TEST_DROP makes the mock harness kill all TCP connections mid-turn;
 * assert onClosed fires and the in-flight prompt rejects, then verify a
 * fresh connection can session/load the same session (the resume path
 * the extension's reconnect loop uses).
 */
import winston from "winston";
import { AgentRunClient } from "./src/clusterAgent/agentRunClient";
import { openTunnel } from "./src/clusterAgent/portForward";
import { ClusterAcpSession } from "./src/clusterAgent/acpSession";

const logger = winston.createLogger({
  level: "warn",
  transports: [new winston.transports.Console({ format: winston.format.simple() })],
});

async function main() {
  const client = new AgentRunClient({ logger, namespace: "konveyor-agents" });
  const run = await client.createAgentRun(
    {
      agentRef: "migration-analyzer",
      params: [
        { name: "repository", value: "https://github.com/konveyor-ecosystem/coolstore.git" },
      ],
    },
    "dropsmoke-",
  );
  const runName = run.metadata.name!;
  const endpoint = await client.waitForAcpEndpoint(runName, { timeoutMs: 90_000 });

  const tunnel1 = await openTunnel(client.kc, client.namespace, endpoint.podName, endpoint.port);
  let closedFired = false;
  const s1 = await ClusterAcpSession.connect({
    logger,
    endpoint: { host: "127.0.0.1", port: tunnel1.localPort, secretKey: endpoint.secretKey },
    callbacks: { onChunk: () => {} },
  });
  s1.onClosed(() => {
    closedFired = true;
    console.log("[onClosed fired]");
  });
  const sessionId = await s1.newSession();
  console.log(`[session ${sessionId}]`);

  let promptRejected = false;
  try {
    await s1.prompt("please TEST_DROP now");
  } catch (err) {
    promptRejected = true;
    console.log(`[prompt rejected: ${(err as Error).message.slice(0, 60)}]`);
  }
  await new Promise((r) => setTimeout(r, 500));
  tunnel1.close();

  if (!promptRejected) {
    throw new Error("expected in-flight prompt to reject on drop");
  }
  if (!closedFired) {
    throw new Error("expected onClosed to fire on drop");
  }

  // Resume path: fresh tunnel + connection, session/load same session.
  const tunnel2 = await openTunnel(client.kc, client.namespace, endpoint.podName, endpoint.port);
  let replayed = 0;
  const s2 = await ClusterAcpSession.connect({
    logger,
    endpoint: { host: "127.0.0.1", port: tunnel2.localPort, secretKey: endpoint.secretKey },
    callbacks: { onChunk: () => void replayed++ },
  });
  await s2.loadSession(sessionId);
  console.log(`[resumed ${sessionId}, replayed ${replayed} chunks]`);
  if (replayed === 0) {
    throw new Error("expected history replay on resume");
  }

  // Explicit close must NOT fire onClosed (deliberate-disconnect guard).
  let s2ClosedFired = false;
  s2.onClosed(() => {
    s2ClosedFired = true;
  });
  await s2.close();
  await new Promise((r) => setTimeout(r, 300));
  tunnel2.close();
  if (s2ClosedFired) {
    throw new Error("onClosed fired on explicit close — deliberate-disconnect guard broken");
  }

  await client.deleteAgentRun(runName);
  console.log("DROP SMOKE OK");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
