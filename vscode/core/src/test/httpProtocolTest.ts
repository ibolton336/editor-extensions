import * as vscode from "vscode";
import { getHttpProtocolSetting } from "../utilities/httpProtocol";

/**
 * Simple test to verify HTTP protocol configuration
 * Run this in the VS Code extension development host
 */
export async function testHttpProtocolConfiguration() {
  console.log("=== HTTP Protocol Configuration Test ===");

  // Test 1: Read current setting
  const currentSetting = getHttpProtocolSetting();
  console.log(`Current HTTP protocol setting: ${currentSetting}`);

  // Test 2: Verify setting values
  const config = vscode.workspace.getConfiguration("konveyor");
  const validValues = ["http1", "http2"];

  for (const value of validValues) {
    console.log(`\nTesting with value: ${value}`);

    // Update setting
    await config.update("genai.httpProtocol", value, vscode.ConfigurationTarget.Global);

    // Wait a bit for the setting to propagate
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify it was updated
    const newSetting = getHttpProtocolSetting();
    if (newSetting === value) {
      console.log(`✓ Successfully set to ${value}`);
    } else {
      console.error(`✗ Failed to set to ${value}, got ${newSetting}`);
    }
  }

  // Test 3: Invalid value handling (should default to http1)
  console.log("\n\nTesting invalid value handling...");
  await config.update("genai.httpProtocol", undefined, vscode.ConfigurationTarget.Global);
  const defaultValue = getHttpProtocolSetting();
  console.log(`With undefined setting, got: ${defaultValue} (should be 'http1')`);

  console.log("\n=== Test Complete ===");
}

/**
 * Test to verify the protocol is actually being used
 * This would need to be integrated with actual model provider calls
 */
export async function testProtocolInAction() {
  console.log("=== HTTP Protocol In Action Test ===");

  // This is a placeholder - in real testing, you would:
  // 1. Set up network monitoring (e.g., using a debugging proxy)
  // 2. Make actual calls to AI providers
  // 3. Verify the HTTP protocol version used in the requests

  const protocols = ["http1", "http2"];

  for (const protocol of protocols) {
    console.log(`\nTesting with ${protocol}...`);

    // Set the protocol
    const config = vscode.workspace.getConfiguration("konveyor");
    await config.update("genai.httpProtocol", protocol, vscode.ConfigurationTarget.Global);

    // In a real test, you would:
    // - Create a model provider instance
    // - Make a request
    // - Capture and verify the HTTP protocol used

    console.log(`Would test AI provider connection with ${protocol}`);
    console.log(`Expected: Requests should use HTTP/${protocol === "http1" ? "1.1" : "2"}`);
  }

  console.log("\n=== Test Complete ===");
}

// Export a command that can be registered in the extension
export function registerTestCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("konveyor.test.httpProtocol", async () => {
      await testHttpProtocolConfiguration();
      await testProtocolInAction();
    }),
  );
}
