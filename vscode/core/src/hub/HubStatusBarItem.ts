import * as vscode from "vscode";

export type HubConnectionStatus = "disconnected" | "connecting" | "authenticated" | "error";

/**
 * Status bar item showing Hub connection state.
 * Click to login/logout.
 */
export class HubStatusBarItem implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private status: HubConnectionStatus = "disconnected";

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      50,
    );
    this.statusBarItem.name = "Konveyor Hub";
    this.update("disconnected");
    this.statusBarItem.show();
  }

  public update(status: HubConnectionStatus, username?: string): void {
    this.status = status;
    switch (status) {
      case "disconnected":
        this.statusBarItem.text = "$(circle-slash) Hub: Disconnected";
        this.statusBarItem.tooltip = "Click to sign in to Konveyor Hub";
        this.statusBarItem.command = "konveyor-core.hubOidcLogin";
        this.statusBarItem.backgroundColor = undefined;
        break;
      case "connecting":
        this.statusBarItem.text = "$(sync~spin) Hub: Connecting...";
        this.statusBarItem.tooltip = "Connecting to Konveyor Hub...";
        this.statusBarItem.command = undefined;
        this.statusBarItem.backgroundColor = undefined;
        break;
      case "authenticated":
        this.statusBarItem.text = `$(pass-filled) Hub: Connected${username ? ` (${username})` : ""}`;
        this.statusBarItem.tooltip = "Connected to Konveyor Hub. Click to sign out.";
        this.statusBarItem.command = "konveyor-core.hubOidcLogout";
        this.statusBarItem.backgroundColor = undefined;
        break;
      case "error":
        this.statusBarItem.text = "$(error) Hub: Error";
        this.statusBarItem.tooltip = "Hub connection failed. Click to retry.";
        this.statusBarItem.command = "konveyor-core.hubOidcLogin";
        this.statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
        break;
    }
  }

  public getStatus(): HubConnectionStatus {
    return this.status;
  }

  public dispose(): void {
    this.statusBarItem.dispose();
  }
}
