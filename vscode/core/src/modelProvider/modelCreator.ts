import { Logger } from "winston";
import { ChatOllama } from "@langchain/ollama";
import { ChatDeepSeek } from "@langchain/deepseek";
import { AzureChatOpenAI, ChatOpenAI } from "@langchain/openai";
import { ChatBedrockConverse, type ChatBedrockConverseInput } from "@langchain/aws";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { ChatGoogleGenerativeAI, type GoogleGenerativeAIChatInput } from "@langchain/google-genai";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";

import {
  getDispatcherWithCertBundle,
  getFetchWithDispatcher,
  getNodeHttpHandler,
} from "../utilities/tls";
import { ModelCreator, PROVIDER_ENV_CA_BUNDLE, PROVIDER_ENV_INSECURE, type FetchFn } from "./types";
import { getHttpProtocolSetting } from "../utilities/httpProtocol";

// NOTE: Missing type definitions and utility functions are assumed to be imported correctly.

export const ModelCreators: Record<string, (logger: Logger) => ModelCreator> = {
  AzureChatOpenAI: (logger) => new AzureChatOpenAICreator(logger),
  ChatBedrock: (logger) => new ChatBedrockCreator(logger),
  ChatDeepSeek: (logger) => new ChatDeepSeekCreator(logger),
  ChatGoogleGenerativeAI: (logger) => new ChatGoogleGenerativeAICreator(logger),
  ChatOllama: (logger) => new ChatOllamaCreator(logger),
  ChatOpenAI: (logger) => new ChatOpenAICreator(logger),
};

class AzureChatOpenAICreator implements ModelCreator {
  constructor(private readonly logger: Logger) {}

  async create(args: Record<string, any>, env: Record<string, string>): Promise<BaseChatModel> {
    const httpProtocol = getHttpProtocolSetting();
    const allowH2 = httpProtocol === "http2";
    return new AzureChatOpenAI({
      openAIApiKey: env.AZURE_OPENAI_API_KEY,
      ...args,
      configuration: {
        ...args.configuration,
        fetch: await getFetchFn(env, this.logger, allowH2),
      },
    });
  }

  defaultArgs(): Record<string, any> {
    return {
      streaming: true,
      temperature: 0.1,
      maxRetries: 2,
    };
  }

  validate(args: Record<string, any>, env: Record<string, string>): void {
    [
      ["deploymentName", "azureOpenAIApiDeploymentName"],
      ["openAIApiVersion", "azureOpenAIApiVersion"],
    ].forEach((keys) => {
      const hasAtLeastOne = keys.some((key) => key in args);
      if (!hasAtLeastOne) {
        throw new Error(`Missing at least one of required keys: ${keys.join(" or ")}`);
      }
    });

    validateMissingConfigKeys(env, ["AZURE_OPENAI_API_KEY"], "environment variable(s)");
  }
}

class ChatBedrockCreator implements ModelCreator {
  constructor(private readonly logger: Logger) {}

  async create(args: Record<string, any>, env: Record<string, string>): Promise<BaseChatModel> {
    const httpProtocol = getHttpProtocolSetting();

    // Ensure AWS SDK doesn't make metadata calls that bypass proxy
    const enhancedEnv = {
      ...env,
      AWS_EC2_METADATA_DISABLED: "true",
      // Force AWS SDK to use Node.js connection reuse to ensure our handler is used
      AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1",
      // Disable IMDSv2 which might bypass proxy
      AWS_EC2_METADATA_SERVICE_ENDPOINT: "",
      // Set the SDK to not load config files that might override our settings
      AWS_SDK_LOAD_CONFIG: "0",
    };

    // --- START OF PROXY FIX ---
    // Set AWS-specific environment variables to prevent metadata service calls that bypass proxy
    if (hasProxyConfiguration(env)) {
      process.env.AWS_EC2_METADATA_DISABLED = "true";
      process.env.AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1";
      process.env.AWS_EC2_METADATA_SERVICE_ENDPOINT = ""; // Disable IMDSv2
      process.env.AWS_SDK_LOAD_CONFIG = "0";
    }
    // --- END OF PROXY FIX ---

    const config: ChatBedrockConverseInput = {
      ...args,
      region: env.AWS_DEFAULT_REGION,
    };
    // aws credentials can be specified globally using a credentials file
    if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
      config.credentials = {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      };
    }
    // Check if we need custom handler for proxy or HTTP/1.1
    const needsCustomHandler = httpProtocol === "http1" || hasProxyConfiguration(enhancedEnv);

    if (needsCustomHandler) {
      const httpVersion = httpProtocol === "http1" ? "1.1" : "2.0";
      const requestHandler = await getNodeHttpHandler(enhancedEnv, this.logger, httpVersion);

      // Create the runtime client with custom handler
      const runtimeClient = new BedrockRuntimeClient({
        region: env.AWS_DEFAULT_REGION,
        credentials: config.credentials,
        requestHandler,
        // Disable EC2 metadata service calls that bypass proxy
        customUserAgent: "konveyor",
        disableHostPrefix: true,
      });

      // ChatBedrockConverse expects 'client' property
      config.client = runtimeClient;
    }

    return new ChatBedrockConverse(config);
  }

  defaultArgs(): Record<string, any> {
    return {
      streaming: true,
      model: "meta.llama3-70b-instruct-v1:0",
    };
  }

  validate(args: Record<string, any>, _env: Record<string, string>): void {
    validateMissingConfigKeys(args, ["model"], "model arg(s)");
  }
}

class ChatDeepSeekCreator implements ModelCreator {
  constructor(private readonly logger: Logger) {}

  async create(args: Record<string, any>, env: Record<string, string>): Promise<BaseChatModel> {
    const httpProtocol = getHttpProtocolSetting();
    const allowH2 = httpProtocol === "http2";
    return new ChatDeepSeek({
      apiKey: env.DEEPSEEK_API_KEY,
      ...args,
      configuration: {
        ...args.configuration,
        fetch: await getFetchFn(env, this.logger, allowH2),
      },
    });
  }

  defaultArgs(): Record<string, any> {
    return {
      model: "deepseek-chat",
      streaming: true,
      temperature: 0,
      maxRetries: 2,
    };
  }

  validate(args: Record<string, any>, env: Record<string, string>): void {
    validateMissingConfigKeys(args, ["model"], "model arg(s)");
    validateMissingConfigKeys(env, ["DEEPSEEK_API_KEY"], "environment variable(s)");
  }
}

class ChatGoogleGenerativeAICreator implements ModelCreator {
  constructor(private readonly logger: Logger) {}

  async create(args: Record<string, any>, env: Record<string, string>): Promise<BaseChatModel> {
    return new ChatGoogleGenerativeAI({
      apiKey: env.GOOGLE_API_KEY,
      ...args,
    } as GoogleGenerativeAIChatInput);
  }

  defaultArgs(): Record<string, any> {
    return {
      model: "gemini-pro",
      temperature: 0.7,
      streaming: true,
    };
  }

  validate(args: Record<string, any>, env: Record<string, string>): void {
    validateMissingConfigKeys(args, ["model"], "model arg(s)");
    validateMissingConfigKeys(env, ["GOOGLE_API_KEY"], "environment variable(s)");
  }
}

class ChatOllamaCreator implements ModelCreator {
  constructor(private readonly logger: Logger) {}

  async create(args: Record<string, any>, env: Record<string, string>): Promise<BaseChatModel> {
    const httpProtocol = getHttpProtocolSetting();
    const allowH2 = httpProtocol === "http2";
    return new ChatOllama({
      ...args,
      fetch: await getFetchFn(env, this.logger, allowH2),
    });
  }

  defaultArgs(): Record<string, any> {
    return {
      temperature: 0.1,
      streaming: true,
    };
  }

  validate(args: Record<string, any>, _: Record<string, string>): void {
    validateMissingConfigKeys(args, ["model", "baseUrl"], "model arg(s)");
  }
}

class ChatOpenAICreator implements ModelCreator {
  constructor(private readonly logger: Logger) {}

  async create(args: Record<string, any>, env: Record<string, string>): Promise<BaseChatModel> {
    const httpProtocol = getHttpProtocolSetting();
    const allowH2 = httpProtocol === "http2";
    return new ChatOpenAI({
      openAIApiKey: env.OPENAI_API_KEY,
      ...args,
      configuration: {
        ...args.configuration,
        fetch: await getFetchFn(env, this.logger, allowH2),
      },
    });
  }

  defaultArgs(): Record<string, any> {
    return {
      model: "gpt-4o",
      temperature: 0.1,
      streaming: true,
    };
  }

  validate(args: Record<string, any>, env: Record<string, string>): void {
    validateMissingConfigKeys(args, ["model"], "model arg(s)");
    validateMissingConfigKeys(env, ["OPENAI_API_KEY"], "environment variable(s)");
  }
}

function validateMissingConfigKeys(
  record: Record<string, any>,
  keys: string[],
  name: "environment variable(s)" | "model arg(s)",
): void {
  let missingKeys = keys.filter((k) => !(k in record));
  if (name === "environment variable(s)") {
    missingKeys = missingKeys.filter((key) => !(key in process.env));
  }
  if (missingKeys && missingKeys.length) {
    throw Error(
      `Required ${name} missing in model config${name === "environment variable(s)" ? " or environment " : ""}- ${missingKeys.join(", ")}`,
    );
  }
}

function hasProxyConfiguration(env: Record<string, string>): boolean {
  // Check both env parameter and process.env for proxy settings
  return !!(
    env.HTTPS_PROXY ||
    env.https_proxy ||
    env.HTTP_PROXY ||
    env.http_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy
  );
}

function getCaBundleAndInsecure(env: Record<string, string>): {
  caBundle: string;
  insecure: boolean;
} {
  const caBundle = env[PROVIDER_ENV_CA_BUNDLE];
  const insecureRaw = env[PROVIDER_ENV_INSECURE];
  let insecure = false;
  if (insecureRaw && insecureRaw.match(/^(true|1)$/i)) {
    insecure = true;
  }
  return { caBundle, insecure };
}

async function getFetchFn(
  env: Record<string, string>,
  logger: Logger,
  allowH2: boolean = true,
): Promise<FetchFn | undefined> {
  const { caBundle, insecure } = getCaBundleAndInsecure(env);
  const hasProxy = hasProxyConfiguration(env);

  // Create custom dispatcher if we need special handling
  const needsCustomDispatcher = caBundle || insecure || !allowH2 || hasProxy;

  if (needsCustomDispatcher) {
    logger.debug(
      `Creating custom dispatcher: caBundle=${!!caBundle}, insecure=${insecure}, allowH2=${allowH2}, hasProxy=${hasProxy}`,
    );
    try {
      const dispatcher = await getDispatcherWithCertBundle(caBundle, insecure, allowH2);
      return getFetchWithDispatcher(dispatcher);
    } catch (error) {
      logger.error(error);
      throw new Error(`Failed to setup dispatcher: ${String(error)}`);
    }
  }

  logger.debug("Using default fetch (no custom dispatcher needed)");
  return undefined;
}
