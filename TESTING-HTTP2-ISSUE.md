# Testing HTTP/2 Blocking Issue (#1030)

## The Problem

AWS Bedrock fails with `ECONNRESET` in corporate environments where firewalls block HTTP/2. The issue isn't about proxies - it's about HTTP/2 being blocked entirely.

## Why Proxy Testing Isn't Ideal

1. **AWS SDK ignores VS Code proxy settings** - requires environment variables
2. **The issue is protocol blocking, not proxy routing** - firewalls drop HTTP/2 connections
3. **Proxy testing shows wrong problem** - tests proxy configuration instead of protocol fallback

## Better Testing Approaches

### 1. **Network-Level Blocking** (Most Realistic)

Simulates actual corporate firewall behavior:

```bash
# macOS - Block HTTP/2 connections
echo "block return-rst out proto tcp to any port 443" | sudo pfctl -f -

# Linux - Block HTTP/2 ALPN negotiation
sudo iptables -I OUTPUT -p tcp --dport 443 -m string --algo bm --hex-string '|00 10|' -j REJECT
```

### 2. **Mock Testing** (Easiest)

Simulate the ECONNRESET error in tests:

```typescript
// Run the test
cd vscode/core
npx ts-node src/test/http2BlockingTest.ts
```

### 3. **Manual Testing with Blocking Proxy**

If you do want to use a proxy approach:

```bash
# Use mitmproxy to force HTTP/1.1
mitmproxy --mode regular --set http2=false

# Set environment BEFORE starting VS Code
export HTTPS_PROXY=http://localhost:8080
export AWS_CA_BUNDLE=~/.mitmproxy/mitmproxy-ca-cert.pem
code .
```

### 4. **Real Environment Testing**

Best option if available:

- Test in actual corporate environment with HTTP/2 restrictions
- Work with customer who reported the issue
- Use corporate VPN that blocks HTTP/2

## Verification Steps

1. **Without the fix:**
   - AWS Bedrock should fail with `ECONNRESET`
   - Error happens during connection establishment

2. **With the fix (http1 setting):**
   - AWS Bedrock should connect successfully
   - Uses HTTP/1.1 with chunked transfer encoding
   - Streaming still works

## Quick Test Script

```bash
# Run the interactive test script
./test-http2-blocking.sh

# Choose option 4 or 5 for quick verification
```

## Key Points

- **Issue**: HTTP/2 protocol blocked, not proxy configuration
- **Solution**: Force HTTP/1.1 when configured
- **Testing**: Simulate protocol blocking, not proxy issues
- **Verification**: Connection succeeds with HTTP/1.1 forced
