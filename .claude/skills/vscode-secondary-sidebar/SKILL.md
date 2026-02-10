---
name: vscode-secondary-sidebar
description: Contribute a view container and views to the VS Code secondary (right) sidebar. Use when adding the right sidebar, secondarySideBar, contribSecondarySideBar, or moving a view to the secondary sidebar.
---

# VSCode Secondary Sidebar

Use this skill when contributing a Konveyor (or other) experience to the **secondary sidebar** (right side) in VS Code. The secondary sidebar is the panel opposite the primary (left) activity bar.

## Proposed API requirement

The secondary sidebar uses the **proposed API** `contribSecondarySideBar`. You must:

1. **Enable the proposal** in `package.json`:
   - Add `enabledApiProposals` (or the equivalent field used by your VS Code extension host) and include the proposal name for the secondary sidebar (e.g. as documented in [VS Code issue #264346](https://github.com/microsoft/vscode/issues/264346)).
2. **Set `engines.vscode`** to a version that supports this proposal (check the VS Code release notes or the proposal DTS file).

If the extension runs on older VS Code versions, consider gating the secondary sidebar contribution behind a feature flag and only enabling the proposed API when the flag is on, to avoid startup errors.

## Contributing the view container

In `package.json` under `contributes.viewsContainers`, add a `secondarySideBar` entry:

```json
"viewsContainers": {
  "activitybar": [
    { "id": "konveyor", "title": "Konveyor", "icon": "resources/icon.png" }
  ],
  "secondarySideBar": [
    {
      "id": "konveyor-secondary",
      "title": "Konveyor",
      "icon": "resources/icon.png"
    }
  ]
}
```

- **id**: Unique identifier for the container (e.g. `konveyor-secondary`).
- **title**: Label shown in the secondary sidebar.
- **icon**: Path to the container icon (same as primary sidebar if desired).

Reference: [VS Code secondary sidebar](https://aka.ms/vscode-secondary-sidebar), [Test: Extensions can register views in secondary sidebar](https://github.com/microsoft/vscode/issues/264346).

## Adding a view to the container

Under `contributes.views`, add a view that belongs to the new container. Use the container **id** as the key:

```json
"views": {
  "konveyor": [
    { "id": "konveyor-core.issueView", "name": "Konveyor" }
  ],
  "konveyor-secondary": [
    {
      "id": "konveyor-core.secondarySidebarView",
      "name": "Konveyor"
    }
  ]
}
```

The view `id` must match the view type you pass to `vscode.window.registerWebviewViewProvider(viewId, provider, options)` in the extension activation code.

## Provider and lifecycle

- **Reuse the existing pattern**: This repo uses [KonveyorGUIWebviewViewProvider](vscode/core/src/KonveyorGUIWebviewViewProvider.ts). For a webview in the secondary sidebar, add a new view type constant (e.g. `SECONDARY_SIDEBAR_VIEW_TYPE = 'konveyor-core.secondarySidebarView'`), instantiate a provider with the same `ExtensionState` and a distinct view key (e.g. `"secondarySidebar"`), and call `registerWebviewViewProvider(SECONDARY_SIDEBAR_VIEW_TYPE, provider, { webviewOptions: { retainContextWhenHidden: true } })`.
- **resolveWebviewView**: The provider’s `resolveWebviewView()` is called when the view is first shown in the secondary sidebar. Use the same extension ↔ webview message channel and state as the primary sidebar/panels so the secondary sidebar stays in sync (see **vscode-webview-view-provider** and **vscode-extension-state** skills).
- **Feature flag**: To gate the secondary sidebar behind a setting, use `when` clauses (e.g. `config:konveyor-core.experimentalSecondarySidebar`) on the container or views so they only appear when the flag is enabled (see **vscode-feature-flags** skill).

## Summary

| Step | Action                                                                                                         |
| ---- | -------------------------------------------------------------------------------------------------------------- |
| 1    | Enable proposed API `contribSecondarySideBar` and set `engines.vscode` if needed.                              |
| 2    | Add `viewsContainers.secondarySideBar` with `id`, `title`, `icon`.                                             |
| 3    | Add `views.<containerId>` with the view `id` and `name`.                                                       |
| 4    | Register a `WebviewViewProvider` for that view id in activation; reuse KonveyorGUIWebviewViewProvider pattern. |
| 5    | Optionally gate with a feature flag and `when` clauses.                                                        |
