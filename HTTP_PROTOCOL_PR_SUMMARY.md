# PR: Add HTTP Protocol Version Configuration

## Summary

Adds configuration to force HTTP/1.1 connections for AI model providers, resolving connection failures in corporate environments that block HTTP/2 traffic.

## Problem

- Enterprise firewalls block HTTP/2 → AWS Bedrock fails with `ECONNRESET`
- No way to force HTTP/1.1 → Users can't use AI features

## Solution

New setting: `konveyor.genai.httpProtocol`

- `"http1"` (default) - Forces HTTP/1.1, works everywhere
- `"http2"` - Allows HTTP/2, better performance if supported

## Testing Proof

### Setup

```bash
# Simulate corporate firewall blocking HTTP/2
mitmproxy --set http2=false --listen-port 8888
```

### Results

```
With HTTP/2 allowed:
❌ Error: Parse Error: Expected HTTP/

With HTTP/1.1 forced:
✅ Request succeeds (auth error expected)
```

## Changes

- Added `httpProtocol` configuration setting
- Force ALPN protocols based on setting
- Enhanced proxy support for both HTTP versions
- All AI providers respect the setting

## Impact

✅ Fixes #1030 - Users behind corporate firewalls can now use AWS Bedrock
✅ Backward compatible - Default is HTTP/1.1 for maximum compatibility
✅ Optional HTTP/2 - Users can opt-in for better performance

## Quick Test

1. Run: `mitmproxy --set http2=false`
2. Set `httpProtocol: "http2"` → Fails
3. Set `httpProtocol: "http1"` → Works

This proves the implementation successfully bypasses HTTP/2 blocking.
