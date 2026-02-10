---
name: vscode-webview-lifecycle
description: Manage webview HTML, CSP, scripts, lifecycle, and persistence using the VS Code Webview API. Use when editing webview HTML templates, Content-Security-Policy, nonce, retainContextWhenHidden, onDidDispose, asWebviewUri, localResourceRoots, or acquireVsCodeApi.
---

# VSCode Webview Lifecycle (this repo)

Use this skill when working on the **webview shell** (HTML, CSP, asset loading, lifecycle) in the Konveyor extension. Reference: [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview).

## HTML template

[KonveyorGUIWebviewViewProvider.getHtmlForWebview()](vscode/core/src/KonveyorGUIWebviewViewProvider.ts) builds the full HTML document:

```html
<html lang="en" class="pf-v6-theme-dark">
  <head>
    <meta http-equiv="Content-Security-Policy" content="..." />
    <link rel="stylesheet" href="${stylesUri}" />
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      window.vscode = vscode;
      window.viewType = "${this._viewType}";
      window.konveyorInitialData = ${jsesc(data, { json: true, isScriptContext: true })};
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}">
      window.addEventListener("DOMContentLoaded", function () {
        window.vscode.postMessage({ type: "WEBVIEW_READY" });
      });
    </script>
    <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>
```

Key points:

- **`acquireVsCodeApi()`** is called once and stored on `window.vscode`. All subsequent `postMessage` calls use this instance.
- **`window.viewType`** tells the React app which view it's rendering (sidebar, resolution, profiles, hub, or a new secondary sidebar).
- **`window.konveyorInitialData`** bootstraps the webview with the current extension state (serialized with `jsesc`).
- **`WEBVIEW_READY`** message signals the provider that the webview is ready to receive messages; the provider then flushes queued messages.

## Content Security Policy (CSP)

The CSP is built in `_getContentSecurityPolicy(nonce, webview)`. Two modes:

**Production**:

```
default-src 'none';
script-src 'nonce-${nonce}' 'unsafe-eval';
style-src ${webview.cspSource} 'unsafe-inline';
font-src ${webview.cspSource} data:;
img-src ${webview.cspSource} data: https:;
connect-src ${webview.cspSource};
```

**Development** (adds local dev server):

```
script-src 'nonce-${nonce}' 'unsafe-eval' ${webview.cspSource} http://localhost:*;
style-src ${webview.cspSource} 'unsafe-inline' http://localhost:*;
...
connect-src ${webview.cspSource} http://localhost:* ws://localhost:*;
```

When adding a new external resource (e.g. a CDN font), update the CSP to allow it. Always use a nonce for scripts. Prefer `${webview.cspSource}` over hardcoded origins.

## Asset URIs

- **Production**: `webview.asWebviewUri(Uri.joinPath(extensionUri, "out", "webview", ...pathList))` converts local paths to `vscode-resource:` URIs.
- **Development**: Assets are served by Vite at `http://localhost:5173/out/webview/...`.
- **localResourceRoots**: Set to `[assetsUri]` (production) or `[extensionUri]` (development) to restrict what the webview can load.

## Lifecycle

| Event                     | Where                     | What happens                                                                                 |
| ------------------------- | ------------------------- | -------------------------------------------------------------------------------------------- |
| **resolveWebviewView**    | Provider (sidebar view)   | Called once when the view first becomes visible. Sets `this._view`, initializes the webview. |
| **createWebviewPanel**    | Provider (editor panel)   | Creates a `WebviewPanel`, stores in `activePanels`.                                          |
| **WEBVIEW_READY**         | Provider message listener | Sets `_isWebviewReady = true`, flushes `_messageQueue`.                                      |
| **onDidChangeVisibility** | WebviewView               | Sends `FULL_STATE_UPDATE` when the sidebar view becomes visible again.                       |
| **onDidChangeViewState**  | WebviewPanel              | Sends `FULL_STATE_UPDATE` when the panel becomes visible and active.                         |
| **onDidDispose**          | WebviewPanel              | Removes from `activePanels`, clears references.                                              |
| **dispose()**             | Provider                  | Cleans up message listeners, clears panel/view references.                                   |

## retainContextWhenHidden

All webview views and panels are registered with `retainContextWhenHidden: true`. This keeps the React app alive (including Zustand state) when the view/panel is hidden, avoiding the cost of re-mounting. It uses more memory; only use it for views that maintain significant in-memory state (like this extension's chat messages and analysis results).

## Adding a new webview view

1. Add a view type constant and the `case` in `panelOptions` if it can also be a panel.
2. Build the same HTML template (the existing `getHtmlForWebview` handles all view types via `window.viewType`).
3. Register with `retainContextWhenHidden: true`.
4. Wire `WEBVIEW_READY` and state refresh on visibility change.
5. Update the CSP only if the new view loads resources from a new origin.

For the secondary sidebar specifically, see the **vscode-secondary-sidebar** and **vscode-webview-view-provider** skills.
