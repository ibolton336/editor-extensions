---
name: vscode-webview-view-provider
description: Implement webview views and panels in this extension using KonveyorGUIWebviewViewProvider. Use when adding a new webview view (e.g. secondary sidebar), refactoring Analysis/Resolution/Profiles, or debugging extension-to-webview messaging for a view.
---

# VSCode Webview View Provider (this repo)

Use this skill when adding or changing **webview-based views** in the Konveyor extension. This repo uses one provider class for both sidebar-style views and editor-area panels.

## Two modes in this repo

1. **WebviewView (sidebar)**  
   When a view is contributed in a view container (e.g. in `package.json` under `views.<containerId>`), VS Code calls the provider’s **`resolveWebviewView(webviewView, context, token)`**. The webview is embedded in the sidebar. Implemented in [KonveyorGUIWebviewViewProvider](vscode/core/src/KonveyorGUIWebviewViewProvider.ts): `this._view = webviewView`, then `initializeWebview(webviewView.webview, this._extensionState.data)`.

2. **WebviewPanel (editor area)**  
   When the user runs a command (e.g. “Open Analysis Panel”), the code calls **`createWebviewPanel()`** on the same provider. That creates a `WebviewPanel` in the editor area and stores it in `KonveyorGUIWebviewViewProvider.activePanels`. See [commands.ts](vscode/core/src/commands.ts) (e.g. `showAnalysisPanel`): it gets the provider from `state.webviewProviders.get("sidebar")` and calls `showWebviewPanel()`.

For a **new view** (e.g. in the secondary sidebar): add a new view type and a new provider instance; use **WebviewView** only (resolveWebviewView) if the view lives only in a sidebar. No need to implement `createWebviewPanel` for that view unless you also want an editor-area panel for it.

## View type constants and registration

In [KonveyorGUIWebviewViewProvider.ts](vscode/core/src/KonveyorGUIWebviewViewProvider.ts):

- View types are static: `SIDEBAR_VIEW_TYPE`, `RESOLUTION_VIEW_TYPE`, `PROFILES_VIEW_TYPE`, `HUB_VIEW_TYPE` (each is `konveyor-core.<viewName>`).
- For a new view (e.g. secondary sidebar), add a new constant and a `case` in the `panelOptions` switch if the view can also be opened as a panel.

In [extension.ts](vscode/core/src/extension.ts) `registerWebviewProvider()`:

- One provider instance per view key: `"sidebar"`, `"resolution"`, `"profiles"`, `"hub"`.
- Each is registered with `vscode.window.registerWebviewViewProvider(viewType, provider, { webviewOptions: { retainContextWhenHidden: true } })`.
- Providers are stored in `this.state.webviewProviders.set(key, provider)`.

To add a **secondary sidebar view**: add a key (e.g. `"secondarySidebar"`), a new view type constant, instantiate `new KonveyorGUIWebviewViewProvider(this.state, "secondarySidebar")`, register it with the new view type, and add a matching view in `package.json` under the secondary sidebar container (see **vscode-secondary-sidebar** skill).

## State and messages

- **Single state**: All providers receive the same [ExtensionState](vscode/core/src/extensionState.ts) and thus the same `ExtensionData`. Do not duplicate or branch state per view.
- **Messages**: Use the same message types from [shared/src/types/messages.ts](shared/src/types/messages.ts) (e.g. `FULL_STATE_UPDATE`, `ANALYSIS_STATE_UPDATE`). Post from the extension via the provider’s `sendMessage` / `sendMessageToWebview`. The webview (React) handles them in [useVSCodeMessageHandler](webview-ui/src/hooks/useVSCodeMessageHandler.ts). A new view can consume the same or a subset of message types; no new message _format_ is required if reusing existing types (see **vscode-webview-messages** skill).
- **Visibility**: When the view becomes visible again, the provider refreshes state (e.g. in `onDidChangeVisibility` for WebviewView, or `onDidChangeViewState` for WebviewPanel) by sending a full state update so the webview is in sync.

## Routing and commands

- Commands that open a specific “panel” resolve the provider by key from `state.webviewProviders.get("sidebar")` (or `"resolution"`, etc.) and call `showWebviewPanel()` or `sendMessageToWebview(...)`. For a secondary-sidebar-only view, you may only need to ensure the view is visible (user opens the secondary sidebar); no command is required unless you add one (e.g. “Focus Konveyor secondary sidebar”).

## Checklist for adding a new webview view

1. Add a view type constant in KonveyorGUIWebviewViewProvider (e.g. `SECONDARY_SIDEBAR_VIEW_TYPE`).
2. In `package.json`: add the view under the correct `views.<containerId>` (e.g. under the secondary sidebar container).
3. In extension activation: create a new provider instance with a distinct view key, register it with `registerWebviewViewProvider(viewType, provider, { webviewOptions: { retainContextWhenHidden: true } })`, and store it in `state.webviewProviders`.
4. If the webview UI is different (e.g. a different route or component), extend the webview app to handle a new view type or route; keep using the same message types and state shape where possible.
