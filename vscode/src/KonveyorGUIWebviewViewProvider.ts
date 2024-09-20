import * as vscode from 'vscode';
import * as path from 'path';

export class KonveyorGUIWebviewViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "konveyor.konveyorGUIView";

  private _webview?: vscode.Webview;
  private _webviewView?: vscode.WebviewView;
  private outputChannel: vscode.OutputChannel;

  constructor(
    private readonly windowId: string,
    private readonly extensionContext: vscode.ExtensionContext,
  ) {
    this.outputChannel = vscode.window.createOutputChannel("Konveyor");
  }

  get isVisible() {
    return this._webviewView?.visible;
  }

  get webview() {
    return this._webview;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void | Thenable<void> {
    this._webview = webviewView.webview;
    this._webviewView = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this.extensionContext.extensionUri
      ]
    };

    webviewView.webview.html = this.getWebviewContent();
  }

  private getWebviewContent(): string {
    const scriptPathOnDisk = vscode.Uri.file(
      path.join(this.extensionContext.extensionPath, 'react', 'dist', 'bundle.js')
    );
    const scriptUri = this._webview!.asWebviewUri(scriptPathOnDisk);

    return `<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Konveyor</title>
      </head>
      <body>
        <div id="root"></div>
        <script>
          const vscode = acquireVsCodeApi();
          window.vscodeApi = vscode;
        </script>
        <script src="${scriptUri}"></script>
        <script>
          konveyor.render("App", window.vscodeApi, "${this._webview!.asWebviewUri(vscode.Uri.file(this.extensionContext.extensionPath))}");
        </script>
      </body>
    </html>`;
  }
}
