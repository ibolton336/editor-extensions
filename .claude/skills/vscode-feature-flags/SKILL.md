---
name: vscode-feature-flags
description: Gate extension features with configuration and when clauses. Use when adding a feature flag, experimental setting, when clause, config visibility, or enabling the secondary sidebar behind a flag.
---

# VSCode Feature Flags (this repo)

Use this skill when you need to **gate a feature** (e.g. secondary sidebar, experimental layout) so it can be turned on or off without shipping a separate extension package. The mechanism is: a configuration property plus optional `when` clauses and runtime checks.

## Configuration property

Add a **boolean** in `package.json` under `contributes.configuration.properties`:

```json
"konveyor-core.experimentalSecondarySidebar": {
  "type": "boolean",
  "default": false,
  "description": "Show Konveyor in the secondary (right) sidebar.",
  "scope": "window",
  "order": 30
}
```

- Use the extension’s config prefix (`konveyor-core.`). Keep names clear (e.g. `experimentalSecondarySidebar` or `secondarySideBarEnabled`).
- **scope**: `"window"` for per-window toggles; use `"resource"` only if the feature depends on the active file/folder.
- **default**: `false` for experimental or optional features.

## Reading the flag in code

Follow the pattern in [configuration.ts](vscode/core/src/utilities/configuration.ts): add an exported getter that reads the key (config keys are the suffix, e.g. `experimentalSecondarySidebar`; the extension prefix is applied via `getConfiguration(EXTENSION_NAME)`):

```typescript
export const getConfigSecondarySidebarEnabled = (): boolean =>
  getConfigValue<boolean>("experimentalSecondarySidebar") ?? false;
```

Or read inline with `vscode.workspace.getConfiguration(EXTENSION_NAME).get<boolean>("experimentalSecondarySidebar") ?? false`. Prefer a getter in configuration.ts for consistency with `getConfigGenAIEnabled`, `getConfigAgentMode`, etc.

## Reacting to changes

In [extension.ts](vscode/core/src/extension.ts), `onDidChangeConfiguration` already handles other flags (e.g. `genai.enabled`, `genai.agentMode`). Add a branch for the new flag if you need to run logic when the user toggles it:

```typescript
if (event.affectsConfiguration(`${EXTENSION_NAME}.experimentalSecondarySidebar`)) {
  // e.g. refresh view visibility, or do nothing if when clauses handle it
}
```

Often, **when clauses** alone are enough: the secondary sidebar container or view is only contributed when the config is true, so no extra runtime logic is needed.

## Visibility with `when` clauses

Use **when** clauses so that contributed UI appears only when the flag is on.

- **View container / view**: In the contribution point, you cannot put `when` on the container itself in package.json for the secondary sidebar; the contribution is static. To gate by config, you have two options: (1) contribute the secondary sidebar only when the extension runs with a minimum VS Code version and rely on a **separate build or build flag** that omits the secondary sidebar contribution for older versions, or (2) use **dynamic registration** of the view container if the API supports it (not common). In practice, many extensions **always contribute** the secondary sidebar and use a **when** clause on **views** or **commands** so that the view or “Open secondary sidebar” command only appears when the setting is true. Check current VS Code contribution schema for `when` on view containers.
- **Commands**: You can gate commands so they only show when the flag is on:

```json
"menus": {
  "view/title": [
    {
      "command": "konveyor-core.openSecondarySidebar",
      "when": "view == konveyor-core.issueView && config:konveyor-core.experimentalSecondarySidebar"
    }
  ]
}
```

- **Command palette**: To show a command only when the flag is on, add a `when` in `contributes.commandPalette` for that command: `"when": "config:konveyor-core.experimentalSecondarySidebar"`.

Syntax: `config:<section>.<key>` with the full config key (section is usually the extension id).

## Proposed API gating

If the feature depends on a **proposed API** (e.g. secondary sidebar’s `contribSecondarySideBar`), the extension can:

- Enable the proposed API only when the feature flag is true, or
- Enable it only when the VS Code version is known to support it,

to avoid startup errors on older or stricter hosts. Document the minimum `engines.vscode` in the skill or in the extension README.

## No separate package

The “feature-flagged extension version” is the **same** extension with a config toggle. You do not need a second extension (e.g. `konveyor-experimental`) unless you later decide to split for distribution or support reasons.
