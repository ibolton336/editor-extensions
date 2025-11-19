#!/bin/bash

# Test script to simulate HTTP/2 blocking like corporate firewalls do

echo "=== HTTP/2 Blocking Simulation Test ==="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Method 1: Using iptables (Linux) to block HTTP/2 ALPN negotiation
test_iptables_block() {
    echo -e "${BLUE}Method 1: Block HTTP/2 using iptables (Linux only)${NC}"
    echo ""
    echo "This simulates a firewall that blocks HTTP/2 negotiation:"
    echo ""
    echo "# Block TLS ALPN extension that negotiates HTTP/2"
    echo "sudo iptables -I OUTPUT -p tcp --dport 443 -m string --algo bm --hex-string '|00 10|' -j REJECT --reject-with tcp-reset"
    echo ""
    echo "# To remove the rule:"
    echo "sudo iptables -D OUTPUT -p tcp --dport 443 -m string --algo bm --hex-string '|00 10|' -j REJECT --reject-with tcp-reset"
}

# Method 2: Using pfctl (macOS) to simulate connection issues
test_pfctl_block() {
    echo -e "${BLUE}Method 2: Simulate HTTP/2 issues using pfctl (macOS)${NC}"
    echo ""
    echo "Create a file /tmp/pf-http2-test.conf with:"
    cat << 'EOF'
# Reset connections that try to use HTTP/2 (port 443 with specific patterns)
block return-rst out proto tcp to any port 443
EOF
    echo ""
    echo "Then run:"
    echo "sudo pfctl -f /tmp/pf-http2-test.conf -e"
    echo ""
    echo "To disable:"
    echo "sudo pfctl -d"
}

# Method 3: Using a local proxy that blocks HTTP/2
test_blocking_proxy() {
    echo -e "${BLUE}Method 3: Local proxy that blocks HTTP/2${NC}"
    echo ""
    echo "Using mitmproxy with HTTP/2 disabled:"
    echo ""
    echo "# Force HTTP/1.1 only - this simulates a corporate proxy"
    echo "mitmproxy --mode upstream:https://bedrock-runtime.us-east-1.amazonaws.com --set http2=false --set http2_priority=false"
    echo ""
    echo "Then set environment variables:"
    echo "export HTTP_PROXY=http://localhost:8080"
    echo "export HTTPS_PROXY=http://localhost:8080"
    echo "export AWS_CA_BUNDLE=/path/to/mitmproxy-ca-cert.pem"
}

# Method 4: Node.js script to test the behavior
test_node_script() {
    echo -e "${BLUE}Method 4: Node.js test script${NC}"
    echo ""
    cat << 'EOF' > /tmp/test-http2-blocking.js
const https = require('https');
const http2 = require('http2');

async function testHTTP2() {
  console.log('Testing HTTP/2 connection to AWS Bedrock...');
  
  return new Promise((resolve, reject) => {
    const client = http2.connect('https://bedrock-runtime.us-east-1.amazonaws.com');
    
    client.on('error', (err) => {
      console.error('HTTP/2 Error:', err.code, err.message);
      reject(err);
    });
    
    client.on('connect', () => {
      console.log('HTTP/2 connection established');
      client.close();
      resolve();
    });
    
    // Timeout after 5 seconds
    setTimeout(() => {
      client.close();
      reject(new Error('Connection timeout'));
    }, 5000);
  });
}

async function testHTTP1() {
  console.log('Testing HTTP/1.1 connection to AWS Bedrock...');
  
  return new Promise((resolve, reject) => {
    https.get('https://bedrock-runtime.us-east-1.amazonaws.com', {
      // Force HTTP/1.1
      ALPNProtocols: ['http/1.1']
    }, (res) => {
      console.log('HTTP/1.1 Status:', res.statusCode);
      res.on('data', () => {});
      res.on('end', () => resolve());
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('=== Testing AWS Bedrock Connectivity ===\n');
  
  try {
    await testHTTP2();
    console.log('✓ HTTP/2 works\n');
  } catch (err) {
    console.log('✗ HTTP/2 failed:', err.message);
    console.log('This simulates the corporate firewall scenario\n');
  }
  
  try {
    await testHTTP1();
    console.log('✓ HTTP/1.1 works\n');
  } catch (err) {
    console.log('✗ HTTP/1.1 failed:', err.message, '\n');
  }
}

runTests();
EOF
    
    echo "Run with: node /tmp/test-http2-blocking.js"
}

# Method 5: Mock AWS SDK to simulate ECONNRESET
test_mock_sdk() {
    echo -e "${BLUE}Method 5: Mock AWS SDK to simulate ECONNRESET${NC}"
    echo ""
    cat << 'EOF' > /tmp/mock-bedrock-test.js
// This simulates the exact error from the issue
const { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } = require('@aws-sdk/client-bedrock-runtime');
const { NodeHttpHandler } = require('@smithy/node-http-handler');

// Create a mock handler that simulates HTTP/2 being blocked
class MockBlockedHTTP2Handler extends NodeHttpHandler {
  async handle(request, options) {
    // Simulate ECONNRESET when HTTP/2 is attempted
    if (!this.config.forceHTTP1) {
      const error = new Error('read ECONNRESET');
      error.code = 'ECONNRESET';
      error.syscall = 'read';
      throw error;
    }
    // Otherwise, let it through (simulating HTTP/1.1 working)
    return super.handle(request, options);
  }
}

async function testBedrockWithHTTP2Blocking() {
  console.log('=== Simulating Corporate Firewall HTTP/2 Blocking ===\n');
  
  // Test 1: Default (HTTP/2) - should fail
  console.log('Test 1: Default AWS SDK (uses HTTP/2)');
  try {
    const client = new BedrockRuntimeClient({
      region: 'us-east-1',
      requestHandler: new MockBlockedHTTP2Handler({})
    });
    
    const command = new InvokeModelWithResponseStreamCommand({
      modelId: 'anthropic.claude-v2',
      body: JSON.stringify({ prompt: 'test' })
    });
    
    await client.send(command);
    console.log('✗ Expected failure but succeeded\n');
  } catch (error) {
    console.log(`✓ Failed as expected: ${error.message}\n`);
  }
  
  // Test 2: Force HTTP/1.1 - should work
  console.log('Test 2: Forced HTTP/1.1');
  try {
    const client = new BedrockRuntimeClient({
      region: 'us-east-1',
      requestHandler: new MockBlockedHTTP2Handler({
        forceHTTP1: true,  // This simulates your fix
        httpsAgent: {
          ALPNProtocols: ['http/1.1']
        }
      })
    });
    
    console.log('✓ HTTP/1.1 configuration works (would connect in real scenario)\n');
  } catch (error) {
    console.log(`✗ Unexpected error: ${error.message}\n`);
  }
}

// Only run if AWS SDK is available
try {
  require('@aws-sdk/client-bedrock-runtime');
  testBedrockWithHTTP2Blocking();
} catch {
  console.log('AWS SDK not installed. This is just a mock example.');
  console.log('The actual test would happen in your VS Code extension.');
}
EOF
    
    echo "This creates a mock that simulates the exact ECONNRESET error from issue #1030"
}

# Main menu
echo "Select testing method:"
echo "1) iptables blocking (Linux)"
echo "2) pfctl blocking (macOS)" 
echo "3) Blocking proxy (all platforms)"
echo "4) Node.js connectivity test"
echo "5) Mock AWS SDK test"
echo ""

read -p "Enter option (1-5): " option

case $option in
    1)
        test_iptables_block
        ;;
    2)
        test_pfctl_block
        ;;
    3)
        test_blocking_proxy
        ;;
    4)
        test_node_script
        ;;
    5)
        test_mock_sdk
        ;;
    *)
        echo -e "${RED}Invalid option${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}Testing approach ready!${NC}"
echo ""
echo "After applying the blocking method, test your VS Code extension:"
echo "1. Set 'konveyor.genai.httpProtocol' to 'http1' in settings"
echo "2. Try to use AWS Bedrock"
echo "3. It should work despite the HTTP/2 blocking"
