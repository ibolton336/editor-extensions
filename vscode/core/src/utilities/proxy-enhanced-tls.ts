/**
 * Enhanced version of tls.ts with proxy support for AWS SDK
 * This demonstrates how to add proxy support for AWS Bedrock
 */

import tls from "node:tls";
import fs from "fs/promises";
import { Agent as HttpsAgent } from "node:https";
import { Agent as UndiciAgent } from "undici";
import type { Dispatcher as UndiciTypesDispatcher } from "undici-types";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { HttpsProxyAgent } from "https-proxy-agent";
import type { Logger } from "winston";

/**
 * Get proxy URL from environment variables
 * Checks standard proxy environment variables in order of precedence
 */
function getProxyUrl(): string | undefined {
  // Check for proxy environment variables
  const proxyVars = [
    process.env.HTTPS_PROXY,
    process.env.https_proxy,
    process.env.HTTP_PROXY,
    process.env.http_proxy,
  ];

  for (const proxyVar of proxyVars) {
    if (proxyVar) {
      return proxyVar;
    }
  }

  return undefined;
}

/**
 * Check if a URL should bypass the proxy
 */
function shouldBypassProxy(url: string): boolean {
  const noProxy = process.env.NO_PROXY || process.env.no_proxy || "";
  if (!noProxy) {
    return false;
  }

  const noProxyList = noProxy.split(",").map((s) => s.trim().toLowerCase());
  const hostname = new URL(url).hostname.toLowerCase();

  return noProxyList.some((pattern) => {
    if (pattern === "*") {
      return true;
    }
    if (pattern.startsWith(".")) {
      return hostname.endsWith(pattern) || hostname === pattern.slice(1);
    }
    return hostname === pattern || hostname.endsWith("." + pattern);
  });
}

/**
 * Enhanced version with proxy support for AWS SDK
 */
export async function getNodeHttpHandlerWithProxy(
  env: Record<string, string>,
  logger: Logger,
  httpVersion: "1.1" | "2.0" = "1.1",
): Promise<NodeHttpHandler> {
  const caBundle = env["CA_BUNDLE"];
  const insecureRaw = env["ALLOW_INSECURE"];
  let insecure = false;
  if (insecureRaw && insecureRaw.match(/^(true|1)$/i)) {
    insecure = true;
  }

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

  // Check for proxy configuration
  const proxyUrl = getProxyUrl();

  if (proxyUrl) {
    logger.info(`Using proxy: ${proxyUrl} for AWS Bedrock requests`);

    try {
      // Create proxy agent with custom CA certs if provided
      const proxyAgent = new HttpsProxyAgent(proxyUrl, {
        ca: allCerts,
        rejectUnauthorized: !insecure,
        // Force HTTP/1.1 if requested
        ...(httpVersion === "1.1" && {
          ALPNProtocols: ["http/1.1"],
          // Some proxies don't support HTTP/2
          secureProtocol: "TLSv1_2_method",
        }),
      });

      return new NodeHttpHandler({
        httpAgent: proxyAgent,
        httpsAgent: proxyAgent,
        requestTimeout: 30000,
      });
    } catch (error) {
      logger.error(`Failed to create proxy agent: ${error}`);
      throw error;
    }
  }

  // No proxy - use standard agents
  const httpsAgentOptions = {
    ca: allCerts,
    rejectUnauthorized: !insecure,
    // Control HTTP version via ALPN
    ...(httpVersion === "1.1"
      ? {
          ALPNProtocols: ["http/1.1"],
        }
      : {
          ALPNProtocols: ["h2", "http/1.1"], // Prefer HTTP/2 but allow fallback
        }),
  };

  return new NodeHttpHandler({
    httpAgent: new HttpsAgent(httpsAgentOptions),
    httpsAgent: new HttpsAgent(httpsAgentOptions),
    requestTimeout: 30000,
  });
}

/**
 * Enhanced undici dispatcher with better proxy support
 */
export async function getDispatcherWithProxySupport(
  bundlePath: string | undefined,
  insecure: boolean = false,
  allowH2: boolean = true,
): Promise<UndiciTypesDispatcher> {
  let allCerts: string | undefined;
  if (bundlePath) {
    const defaultCerts = tls.rootCertificates.join("\n");
    const certs = await fs.readFile(bundlePath, "utf8");
    allCerts = [defaultCerts, certs].join("\n");
  }

  const proxyUrl = getProxyUrl();

  // Create agent with proxy support
  const agentOptions: any = {
    connect: {
      ca: allCerts,
      rejectUnauthorized: !insecure,
    },
    allowH2,
  };

  // Add proxy configuration if available
  if (proxyUrl) {
    const proxyUrlParsed = new URL(proxyUrl);
    agentOptions.proxy = {
      uri: proxyUrl,
      // Include auth if present in proxy URL
      ...(proxyUrlParsed.username && {
        auth: `${proxyUrlParsed.username}:${proxyUrlParsed.password}`,
      }),
    };
  }

  return new UndiciAgent(agentOptions) as unknown as UndiciTypesDispatcher;
}

/**
 * Test function to verify proxy configuration
 */
export async function testProxyConfiguration(logger: Logger): Promise<void> {
  const proxyUrl = getProxyUrl();

  logger.info("=== Proxy Configuration Test ===");
  logger.info(`HTTP_PROXY: ${process.env.HTTP_PROXY || "not set"}`);
  logger.info(`HTTPS_PROXY: ${process.env.HTTPS_PROXY || "not set"}`);
  logger.info(`NO_PROXY: ${process.env.NO_PROXY || "not set"}`);
  logger.info(`Detected proxy URL: ${proxyUrl || "none"}`);

  // Test bypass logic
  const testUrls = [
    "https://bedrock-runtime.us-east-1.amazonaws.com",
    "https://api.openai.com",
    "http://localhost:3000",
    "https://127.0.0.1:8080",
  ];

  logger.info("\nProxy bypass test:");
  for (const url of testUrls) {
    const bypass = shouldBypassProxy(url);
    logger.info(`  ${url}: ${bypass ? "bypass" : "use proxy"}`);
  }
}
