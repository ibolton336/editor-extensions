# HTTP Protocol Configuration for AI Model Providers

## Overview

This implementation adds HTTP protocol version configuration to Konveyor AI, addressing [Issue #1030](https://github.com/konveyor/editor-extensions/issues/1030) where enterprise environments block HTTP/2 traffic, causing AWS Bedrock connections to fail with `ECONNRESET` errors.

## Problem Statement

Corporate firewalls often block HTTP/2 traffic for security or compatibility reasons. When AI model providers (particularly AWS Bedrock) attempt to use HTTP/2, these connections are blocked, resulting in:

- `ECONNRESET` errors
- `HPE_INVALID_CONSTANT` parse errors
- Failed health checks and model invocations

## Solution

### 1. Configuration Setting

Added a new VS Code setting `konveyor.genai.httpProtocol` with two options:

- `"http1"` - Forces HTTP/1.1 connections (default, recommended for corporate environments)
- `"http2"` - Allows HTTP/2 connections (better performance if supported)

```json
// package.json
"konveyor.genai.httpProtocol": {
  "type": "string",
  "enum": ["http1", "http2"],
  "default": "http1",
  "enumDescriptions": [
    "HTTP/1.1 - Compatible with corporate firewalls (recommended)",
    "HTTP/2 - Better performance if your network supports it"
  ],
  "description": "HTTP protocol version for AI model provider connections"
}
```

### 2. Implementation Details

#### Core Components

1. **httpProtocol.ts** - Retrieves the configuration setting
2. **modelCreator.ts** - Applies HTTP protocol setting to each model provider
3. **tls.ts** - Configures ALPN protocols for HTTP version negotiation

#### Key Implementation Points

- **ALPN Configuration**: Uses Application-Layer Protocol Negotiation to specify allowed HTTP versions

  ```typescript
  const agentOptions = {
    ...(httpVersion === "1.1"
      ? { ALPNProtocols: ["http/1.1"] }
      : { ALPNProtocols: ["h2", "http/1.1"] }),
  };
  ```

- **Proxy Support**: Enhanced to work with both HTTP/1.1 and HTTP/2 configurations
- **AWS SDK Integration**: Custom `NodeHttpHandler` ensures AWS Bedrock respects the setting

## Testing

### Test Setup

1. **Install mitmproxy** to simulate HTTP/2 blocking:

   ```bash
   brew install mitmproxy  # macOS
   # or
   pip install mitmproxy   # Python
   ```

2. **Run proxy with HTTP/2 disabled** (simulates corporate firewall):

   ```bash
   mitmproxy --set http2=false --listen-port 8888
   ```

3. **Test Script** (`test-aws-http-version.js`):
   ```javascript
   // Test different HTTP configurations against AWS Bedrock
   // See full script in repository
   ```

### Test Results

#### With HTTP/2 Blocked by Proxy

```bash
HTTPS_PROXY=http://localhost:8888 node test-aws-http-version.js
```

**Results:**

- ✅ Test 1 (Default): Success - Uses HTTP/1.1 by default
- ✅ Test 2 (Force HTTP/1.1): Success - Explicitly uses HTTP/1.1
- ❌ Test 3 (Allow HTTP/2): **FAILS** - `Parse Error: Expected HTTP/`
- ✅ Test 4 (Proxy + HTTP/1.1): Success - Works through proxy

The failure in Test 3 proves that HTTP/2 is being blocked and our HTTP/1.1 forcing prevents this issue.

### VS Code Extension Testing

1. Set proxy environment:

   ```bash
   export HTTP_PROXY=http://localhost:8888
   export HTTPS_PROXY=http://localhost:8888
   ```

2. Configure setting in VS Code:
   - `konveyor.genai.httpProtocol: "http2"` → Connection fails
   - `konveyor.genai.httpProtocol: "http1"` → Connection succeeds

## Validation

### Success Criteria Met

1. ✅ **HTTP/1.1 Forcing Works**: ALPN protocols correctly force HTTP/1.1
2. ✅ **Prevents HTTP/2 Blocking**: Users can bypass corporate firewall restrictions
3. ✅ **Backward Compatible**: Default is HTTP/1.1 for maximum compatibility
4. ✅ **All Providers Supported**: Works with AWS Bedrock, OpenAI, Azure, etc.

### Known Limitations

- **VS Code Proxy Handling**: In development, VS Code's extension host may intercept proxy connections, making debugging more complex. This doesn't affect production usage.
- **Health Check Visibility**: Health checks may not appear in proxy logs due to VS Code's proxy layer, but the HTTP protocol setting still applies.
- **Automatic HTTP/1.1 Fallback**: The AWS SDK has built-in fallback from HTTP/2 to HTTP/1.1. However, forcing HTTP/1.1 still provides value by:
  - Avoiding negotiation delays (no failed HTTP/2 attempt)
  - Preventing issues with stricter firewalls that block even negotiation
  - Providing explicit control for enterprise environments

## Recommendation

Users in corporate environments should keep the default `"http1"` setting. Only switch to `"http2"` if you're certain your network supports it and you need the performance benefits.

## Files Modified

- `vscode/core/package.json` - Added configuration setting
- `vscode/core/src/utilities/httpProtocol.ts` - New utility to read setting
- `vscode/core/src/modelProvider/modelCreator.ts` - Apply setting to model providers
- `vscode/core/src/utilities/tls.ts` - Configure HTTP handlers with ALPN

## References

- [GitHub Issue #1030](https://github.com/konveyor/editor-extensions/issues/1030)
- [AWS SDK NodeHttpHandler](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-smithy-node-http-handler/)
- [ALPN Protocol Negotiation](https://www.rfc-editor.org/rfc/rfc7301)
