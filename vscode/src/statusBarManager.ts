import * as vscode from "vscode";
import { ExtensionState } from "./extensionState";
import { ExtensionData } from "@editor-extensions/shared";
import { Immutable } from "immer";

export class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem;
  private disposables: vscode.Disposable[] = [];
  private settingsPanel: vscode.WebviewPanel | undefined;

  constructor(private state: ExtensionState) {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBarItem.command = "konveyor.statusBar.showMenu";

    this.setupCommands();
    this.updateStatusBarItem(this.state.data);
  }

  private setupCommands(): void {
    // Single command to show the settings modal
    const showMenuCommand = vscode.commands.registerCommand("konveyor.statusBar.showMenu", () => {
      this.showSettingsModal();
    });

    this.disposables.push(showMenuCommand);
  }

  private async showSettingsModal(): Promise<void> {
    const {
      serverState,
      isStartingServer,
      isInitializingServer,
      isAgentMode,
      profiles,
      activeProfileId,
      configErrors,
    } = this.state.data;

    const activeProfile = profiles.find((p) => p.id === activeProfileId);
    const hasConfigErrors = configErrors.length > 0;
    const serverRunning = serverState === "running";
    const serverStarting = isStartingServer || isInitializingServer;

    // Check if panel is already open
    if (this.settingsPanel) {
      // If panel exists, reveal it and update content
      this.settingsPanel.reveal(vscode.ViewColumn.One);
      this.settingsPanel.webview.html = this.getSettingsHtml({
        serverRunning,
        serverStarting,
        isAgentMode,
        activeProfile,
        profiles,
        hasConfigErrors,
        configErrors,
      });
      return;
    }

    // Create and show the settings panel
    this.settingsPanel = vscode.window.createWebviewPanel(
      "konveyorSettings",
      "Konveyor Settings",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    // Set the HTML content for the settings form
    this.settingsPanel.webview.html = this.getSettingsHtml({
      serverRunning,
      serverStarting,
      isAgentMode,
      activeProfile,
      profiles,
      hasConfigErrors,
      configErrors,
    });

    // Handle messages from the webview
    this.settingsPanel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case "toggleServer":
          if (serverRunning) {
            await vscode.commands.executeCommand("konveyor.stopServer");
          } else {
            await vscode.commands.executeCommand("konveyor.startServer");
          }
          break;
        case "toggleAgentMode":
          await vscode.commands.executeCommand("konveyor.toggleAgentMode");
          break;
        case "openProfilesPanel":
          await vscode.commands.executeCommand("konveyor.openProfilesPanel");
          break;
        case "openAnalysisView":
          await vscode.commands.executeCommand("konveyor.showAnalysisPanel");
          break;
        case "openResolutionView":
          await vscode.commands.executeCommand("konveyor.showResolutionPanel");
          break;
        case "selectProfile":
          // Handle profile selection
          if (message.profileId) {
            // Update active profile
            this.state.mutateData((draft) => {
              draft.activeProfileId = message.profileId;
            });
          }
          break;
      }
    });

    // Update the panel when data changes
    this.settingsPanel.onDidDispose(() => {
      this.settingsPanel = undefined;
    });

    // Handle panel visibility changes
    this.settingsPanel.onDidChangeViewState((e) => {
      if (!e.webviewPanel.visible) {
        // Panel is hidden but not disposed
        // Keep the reference so we can reveal it later
      }
    });
  }

  private getSettingsHtml(data: {
    serverRunning: boolean;
    serverStarting: boolean;
    isAgentMode: boolean;
    activeProfile: any;
    profiles: readonly any[];
    hasConfigErrors: boolean;
    configErrors: readonly any[];
  }): string {
    const {
      serverRunning,
      serverStarting,
      isAgentMode,
      activeProfile,
      profiles,
      hasConfigErrors,
      configErrors,
    } = data;

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Konveyor Settings</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            margin: 0;
            padding: 20px;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
          }
          .section {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 20px;
            margin-bottom: 20px;
          }
          .section h2 {
            margin-top: 0;
            color: var(--vscode-editor-foreground);
            font-size: 18px;
            font-weight: 600;
          }
          .form-group {
            margin-bottom: 20px;
          }
          .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: var(--vscode-foreground);
          }
          .status-indicator {
            display: inline-flex;
            align-items: center;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 500;
          }
          .status-running {
            background: var(--vscode-button-prominentBackground);
            color: var(--vscode-button-prominentForeground);
          }
          .status-stopped {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
          }
          .status-starting {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
          }
          .status-error {
            background: var(--vscode-errorForeground);
            color: var(--vscode-editor-background);
          }
          .button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: 1px solid var(--vscode-button-border);
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
          }
          .button:hover {
            background: var(--vscode-button-hoverBackground);
          }
          .button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
          .button-primary {
            background: var(--vscode-button-prominentBackground);
            color: var(--vscode-button-prominentForeground);
          }
          .button-primary:hover {
            background: var(--vscode-button-prominentHoverBackground);
          }
          .button-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
          }
          .button-secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
          }
          .switch {
            position: relative;
            display: inline-block;
            width: 50px;
            height: 24px;
          }
          .switch input {
            opacity: 0;
            width: 0;
            height: 0;
          }
          .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: var(--vscode-button-secondaryBackground);
            transition: .4s;
            border-radius: 24px;
          }
          .slider:before {
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
          }
          input:checked + .slider {
            background-color: var(--vscode-button-prominentBackground);
          }
          input:checked + .slider:before {
            transform: translateX(26px);
          }
          .select {
            background: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border);
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 14px;
            width: 100%;
          }
          .error-list {
            background: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            border-radius: 4px;
            padding: 12px;
            margin-bottom: 20px;
          }
          .error-item {
            color: var(--vscode-inputValidation-errorForeground);
            margin-bottom: 8px;
          }
          .flex {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .flex-between {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .description {
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
            margin-top: 4px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Konveyor Settings</h1>
          
          ${
            hasConfigErrors
              ? `
            <div class="section">
              <h2>Configuration Errors</h2>
              <div class="error-list">
                ${configErrors
                  .map(
                    (error) => `
                  <div class="error-item">• ${error.message}</div>
                `,
                  )
                  .join("")}
              </div>
            </div>
          `
              : ""
          }

          <div class="section">
            <h2>Server Status</h2>
            <div class="form-group">
              <div class="flex-between">
                <div>
                  <div class="status-indicator ${serverStarting ? "status-starting" : serverRunning ? "status-running" : "status-stopped"}">
                    ${serverStarting ? "🔄 Starting..." : serverRunning ? "🟢 Running" : "🔴 Stopped"}
                  </div>
                  <div class="description">
                    ${serverStarting ? "Server is starting up..." : serverRunning ? "Konveyor server is running and ready" : "Server is stopped"}
                  </div>
                </div>
                <button class="button ${serverStarting ? "button-secondary" : "button-primary"}" 
                        onclick="toggleServer()" 
                        ${serverStarting ? "disabled" : ""}>
                  ${serverRunning ? "Stop Server" : "Start Server"}
                </button>
              </div>
            </div>
          </div>

          <div class="section">
            <h2>Agent Mode</h2>
            <div class="form-group">
              <div class="flex-between">
                <div>
                  <label>Enable Agent Mode</label>
                  <div class="description">
                    ${isAgentMode ? "Agent mode is active - AI will assist with resolutions" : "Manual mode is active - user controls all actions"}
                  </div>
                </div>
                <label class="switch">
                  <input type="checkbox" ${isAgentMode ? "checked" : ""} onchange="toggleAgentMode()">
                  <span class="slider"></span>
                </label>
              </div>
            </div>
          </div>

          <div class="section">
            <h2>Profile Management</h2>
            <div class="form-group">
              <label>Active Profile</label>
              <select class="select" onchange="selectProfile(this.value)">
                <option value="">Select a profile...</option>
                ${profiles
                  .map(
                    (profile) => `
                  <option value="${profile.id}" ${profile.id === activeProfile?.id ? "selected" : ""}>
                    ${profile.name}
                  </option>
                `,
                  )
                  .join("")}
              </select>
              <div class="description">
                ${activeProfile ? `Active profile: ${activeProfile.name}` : "No active profile selected"}
              </div>
            </div>
            <button class="button button-secondary" onclick="openProfilesPanel()">
              Manage Profiles
            </button>
          </div>

          <div class="section">
            <h2>Navigation</h2>
            <div class="form-group">
              <button class="button button-secondary" onclick="openAnalysisView()">
                Open Analysis View
              </button>
            </div>
            <div class="form-group">
              <button class="button button-secondary" onclick="openResolutionView()">
                Open Resolution View
              </button>
            </div>
          </div>
        </div>

        <script>
          const vscode = acquireVsCodeApi();

          function toggleServer() {
            vscode.postMessage({ command: 'toggleServer' });
          }

          function toggleAgentMode() {
            vscode.postMessage({ command: 'toggleAgentMode' });
          }

          function openProfilesPanel() {
            vscode.postMessage({ command: 'openProfilesPanel' });
          }

          function openAnalysisView() {
            vscode.postMessage({ command: 'openAnalysisView' });
          }

          function openResolutionView() {
            vscode.postMessage({ command: 'openResolutionView' });
          }

          function selectProfile(profileId) {
            vscode.postMessage({ command: 'selectProfile', profileId });
          }
        </script>
      </body>
      </html>
    `;
  }

  public updateStatusBarItem(data: Immutable<ExtensionData>): void {
    const {
      serverState,
      isStartingServer,
      isInitializingServer,
      isAgentMode,
      profiles,
      activeProfileId,
      configErrors,
    } = data;

    const activeProfile = profiles.find((p) => p.id === activeProfileId);
    const hasConfigErrors = configErrors.length > 0;
    const serverRunning = serverState === "running";
    const serverStarting = isStartingServer || isInitializingServer;

    // Conservative profile detection - only show warning if no profiles exist at all
    const hasNoProfile = profiles.length === 0;

    // Debug logging to help identify the issue
    if (!activeProfile && profiles.length > 0) {
      console.log("Profile detection issue:", {
        activeProfileId,
        profilesCount: profiles.length,
        profileIds: profiles.map((p) => p.id),
        activeProfile: activeProfile,
      });
    }

    // Determine icon and text based on state with enhanced visual design
    let icon = "$(robot)"; // Default to robot icon for AI
    let tooltip = "Konveyor AI (KAI) - Click to open settings and manage server";
    let backgroundColor: vscode.ThemeColor | undefined;

    // Priority: errors > warnings > normal state with enhanced visual feedback
    if (hasConfigErrors) {
      icon = "$(error)";
      backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
      tooltip =
        "Konveyor AI (KAI) - Configuration errors detected. Click to open settings and fix issues.";

      // Show contextual prompt for configuration errors (but not during startup)
      this.showContextualPrompt(
        "Configuration errors detected. Click the KAI icon in the status bar to fix them.",
        "Open Settings",
      );
    } else if (hasNoProfile) {
      icon = "$(warning)";
      backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      tooltip =
        "Konveyor AI (KAI) - No active profile. Click to open settings and configure a profile.";

      // Show contextual prompt for missing profile (but not during startup)
      this.showContextualPrompt(
        "No active profile configured. Click the KAI icon in the status bar to set up a profile.",
        "Open Settings",
      );
    } else if (serverStarting) {
      icon = "$(loading~spin)";
      tooltip = "Konveyor AI (KAI) - Server is starting. Click to open settings.";
    } else if (serverRunning) {
      icon = "$(check)";
      backgroundColor = new vscode.ThemeColor("statusBarItem.prominentBackground");
      tooltip = "Konveyor AI (KAI) - Server is running. Click to open settings.";
    } else {
      icon = "$(server)";
      tooltip =
        "Konveyor AI (KAI) - Server is stopped. Click to open settings and start the server.";

      // Don't show contextual prompt for stopped server during startup
      // this.checkForAnalysisAttempt();
    }

    // Enhanced status indicators in tooltip
    const statusParts = [];
    if (serverRunning) {
      statusParts.push("✅ Server: Running");
    } else if (serverStarting) {
      statusParts.push("🔄 Server: Starting");
    } else {
      statusParts.push("⏹️ Server: Stopped");
    }

    if (isAgentMode) {
      statusParts.push("🤖 Mode: Agent");
    } else {
      statusParts.push("👤 Mode: Manual");
    }

    if (activeProfile) {
      statusParts.push(`📋 Profile: ${activeProfile.name}`);
    } else {
      statusParts.push("⚠️ Profile: None");
    }

    if (hasConfigErrors) {
      statusParts.push(`❌ Errors: ${configErrors.length}`);
    }

    tooltip += `\n\nStatus:\n${statusParts.join("\n")}\n\nQuick Access:\n• Click KAI icon for settings\n• Ctrl+Shift+K for quick access\n• Command Palette: "Konveyor AI: Open Settings"`;

    this.statusBarItem.text = `${icon} KAI`;
    this.statusBarItem.tooltip = tooltip;
    this.statusBarItem.backgroundColor = backgroundColor;
    this.statusBarItem.show();

    // Update the settings panel if it's open
    if (this.settingsPanel) {
      this.settingsPanel.webview.html = this.getSettingsHtml({
        serverRunning,
        serverStarting,
        isAgentMode,
        activeProfile,
        profiles,
        hasConfigErrors,
        configErrors,
      });
    }
  }

  private showContextualPrompt(message: string, actionText: string): void {
    // Only show contextual prompts occasionally to avoid spam
    const lastPromptTime = this.state.extensionContext.globalState.get(
      "konveyor.lastPromptTime",
      0,
    );
    const now = Date.now();
    const timeSinceLastPrompt = now - lastPromptTime;

    // Show prompt only if it's been more than 30 seconds since last prompt
    if (timeSinceLastPrompt > 30000) {
      this.state.extensionContext.globalState.update("konveyor.lastPromptTime", now);

      // Check if we're in startup phase (first 10 seconds after activation)
      const extensionStartTime = this.state.extensionContext.globalState.get(
        "konveyor.extensionStartTime",
        0,
      );
      const startupPhase = 10000; // 10 seconds

      if (extensionStartTime === 0) {
        // First time extension is running, set start time and don't show prompt
        this.state.extensionContext.globalState.update("konveyor.extensionStartTime", now);
        return;
      }

      // Only show contextual prompts after startup phase
      if (now - extensionStartTime > startupPhase) {
        vscode.window.showInformationMessage(message, actionText, "Got it").then((selection) => {
          if (selection === actionText) {
            vscode.commands.executeCommand("konveyor.statusBar.showMenu");
          }
        });
      }
    }
  }

  private checkForAnalysisAttempt(): void {
    // This method could be enhanced to detect when user tries to run analysis
    // For now, we'll rely on the contextual prompts above
    // In the future, we could listen for analysis commands and show prompts
  }

  public dispose(): void {
    this.statusBarItem.dispose();
    this.settingsPanel?.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
