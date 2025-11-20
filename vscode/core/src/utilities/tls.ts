import tls from "node:tls";
import fs from "fs/promises";
import { Agent as HttpsAgent } from "node:https";
import { Agent as UndiciAgent, ProxyAgent } from "undici";
import type { Dispatcher as UndiciTypesDispatcher } from "undici-types";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { HttpsProxyAgent } from "https-proxy-agent";
import type { Logger } from "winston";

export async function getDispatcherWithCertBundle(
  bundlePath: string | undefined,
  insecure: boolean = false,
): Promise<UndiciTypesDispatcher> {
  // Check for proxy settings
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;

  let allCerts: string | undefined;
  if (bundlePath) {
    const defaultCerts = tls.rootCertificates.join("\n");
    const certs = await fs.readFile(bundlePath, "utf8");
    allCerts = [defaultCerts, certs].join("\n");
  }

  const connectOptions = {
    ca: allCerts,
    rejectUnauthorized: !insecure,
  };

  // Use ProxyAgent when proxy is configured
  if (proxyUrl) {
    return new ProxyAgent({
      uri: proxyUrl,
      connect: connectOptions,
      // ProxyAgent supports both HTTP/1.1 and HTTP/2
    }) as unknown as UndiciTypesDispatcher;
  }

  // No proxy - use standard Agent with HTTP/2 support
  return new UndiciAgent({
    connect: connectOptions,
    allowH2: true,
  }) as unknown as UndiciTypesDispatcher;
}

export async function getHttpsAgentWithCertBundle(
  bundlePath: string | undefined,
  insecure: boolean = false,
): Promise<HttpsAgent> {
  let allCerts: string | undefined;
  if (bundlePath) {
    const defaultCerts = tls.rootCertificates.join("\n");
    const certs = await fs.readFile(bundlePath, "utf8");
    allCerts = [defaultCerts, certs].join("\n");
  }
  return new HttpsAgent({
    ca: allCerts,
    rejectUnauthorized: !insecure,
  });
}

export function getFetchWithDispatcher(
  dispatcher: UndiciTypesDispatcher,
): (input: Request | URL | string, init?: RequestInit) => Promise<Response> {
  return (input: Request | URL | string, init?: RequestInit) => {
    return fetch(
      input as any,
      {
        ...(init || {}),
        dispatcher,
      } as any,
    );
  };
}

export async function getNodeHttpHandler(
  env: Record<string, string>,
  logger: Logger,
): Promise<NodeHttpHandler> {
  const caBundle = env["CA_BUNDLE"] || env["AWS_CA_BUNDLE"];
  const insecureRaw =
    env["ALLOW_INSECURE"] || env["NODE_TLS_REJECT_UNAUTHORIZED"] === "0" ? "true" : undefined;
  let insecure = false;
  if (insecureRaw && insecureRaw.match(/^(true|1)$/i)) {
    insecure = true;
  }

  // Check for proxy settings
  const proxyUrl =
    env.HTTPS_PROXY ||
    env.https_proxy ||
    env.HTTP_PROXY ||
    env.http_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;

  let allCerts: string | undefined;
  if (caBundle) {
    try {
      const defaultCerts = tls.rootCertificates.join("\n");
      const certs = await fs.readFile(caBundle, "utf8");
      allCerts = [defaultCerts, certs].join("\n");
    } catch (error) {
      logger.error(error);
      throw new Error(`Failed to read CA bundle: ${String(error)}`);
    }
  }

  const agentOptions: any = {
    ca: allCerts,
    rejectUnauthorized: !insecure,
    // Allow both HTTP/2 and HTTP/1.1
    ALPNProtocols: ["h2", "http/1.1"],
  };

  // Use proxy-aware agents if proxy is configured
  if (proxyUrl) {
    logger.info(`Using proxy ${proxyUrl} for AWS Bedrock`);
    const proxyAgent = new HttpsProxyAgent(proxyUrl, agentOptions);

    return new NodeHttpHandler({
      httpAgent: proxyAgent,
      httpsAgent: proxyAgent,
      requestTimeout: 30000,
      connectionTimeout: 5000,
      socketTimeout: 30000,
    });
  }

  // No proxy - use standard agents
  return new NodeHttpHandler({
    httpAgent: new HttpsAgent(agentOptions),
    httpsAgent: new HttpsAgent(agentOptions),
    requestTimeout: 30000,
  });
}
