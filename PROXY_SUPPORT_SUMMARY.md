# Proxy Support for AI Model Providers

This branch adds proxy support for AI model providers to work in corporate environments.

## What's Changed

### Core Proxy Support

1. **AWS Bedrock** - Full proxy support
   - Custom `NodeHttpHandler` with `HttpsProxyAgent` when proxy is detected
   - Environment variable configuration to disable EC2 metadata service calls
   - Prevents AWS SDK from bypassing proxy

2. **Other Providers** (OpenAI, Azure OpenAI, Ollama, DeepSeek)
   - Proxy support via undici's `ProxyAgent`
   - Custom fetch function when proxy is detected

### Implementation Details

#### Files Modified

- `vscode/core/src/modelProvider/modelCreator.ts`
  - Added `hasProxyConfiguration()` to detect proxy settings
  - AWS Bedrock: Creates custom client with proxy-aware handler
  - Other providers: Use custom fetch with proxy support

- `vscode/core/src/utilities/tls.ts`
  - `getDispatcherWithCertBundle()`: Uses `ProxyAgent` when proxy detected
  - `getNodeHttpHandler()`: Uses `HttpsProxyAgent` for AWS SDK

#### Proxy Detection

Checks these environment variables in order:

- `HTTPS_PROXY` / `https_proxy`
- `HTTP_PROXY` / `http_proxy`

#### AWS-Specific Fixes

Sets these environment variables to prevent metadata service bypass:

- `AWS_EC2_METADATA_DISABLED=true`
- `AWS_NODEJS_CONNECTION_REUSE_ENABLED=1`
- `AWS_EC2_METADATA_SERVICE_ENDPOINT=""`
- `AWS_SDK_LOAD_CONFIG=0`

## Testing Proxy Support

1. Set proxy environment variable:

   ```bash
   export HTTPS_PROXY=http://your-proxy:8080
   ```

2. Test with mitmproxy:

   ```bash
   mitmproxy --listen-port 8888
   export HTTPS_PROXY=http://localhost:8888
   ```

3. Verify all AI model requests go through the proxy

## What's NOT in This Branch

- HTTP protocol version control (http1/http2) - moved to separate branch
- The `proxy-enhanced-tls.ts` file is included but not actively used

## Known Limitations

- ProxyAgent (undici) may not support all proxy authentication methods
- AWS SDK proxy support requires the custom handler approach
