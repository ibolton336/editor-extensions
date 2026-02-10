---
name: vscode-extension-state
description: Update and consume extension state correctly with Immer. Use when changing extension state, ExtensionData, mutateChatMessages, produce, onDidChangeData, or adding a view that consumes state.
---

# VSCode Extension State (this repo)

Use this skill when adding or changing code that **reads or updates** the extension’s shared state so the secondary sidebar (and all webviews/commands) stay in sync and Immer rules are not broken.

## Single source of truth

- **State type**: [ExtensionData](shared/src/types/types.ts) (and related types from `@editor-extensions/shared`). Holds ruleSets, enhancedIncidents, chatMessages, profiles, server state, solution workflow, config errors, decorators, settings, etc.
- **State holder**: [ExtensionState](vscode/core/src/extensionState.ts) in the core extension. `state.data` is the current immutable snapshot. All webview providers and commands receive the same `ExtensionState` (or access it via the extension instance).

## Updating state: Immer only

- **Never mutate `state.data` directly.** All updates go through **mutate** functions that use Immer’s `produce`.
- **Mutate helpers** on `ExtensionState`: `mutateChatMessages`, `mutateAnalysisState`, `mutateSolutionWorkflow`, `mutateServerState`, `mutateProfiles`, `mutateConfigErrors`, `mutateDecorators`, `mutateSettings`. Each accepts a **recipe**: `(draft: ExtensionData) => void`. Inside the recipe, mutate `draft`; Immer produces a new immutable result and assigns it to `state.data`.
- **Notify listeners**: After a mutate, the extension fires `_onDidChange.fire(this.data)` (or equivalent) so subscribers (e.g. webview providers) can push the new state to the webview. Ensure the code path that updates state also triggers this notification (typically the mutate helper does it, or the caller does it once per logical update).

## Who consumes state

- **Webview providers**: Each [KonveyorGUIWebviewViewProvider](vscode/core/src/KonveyorGUIWebviewViewProvider.ts) receives `ExtensionState` and sends state to the webview (full state on visibility, or granular messages). A new provider for the secondary sidebar should subscribe to the same state and send the same (or a subset of) updates so the right sidebar stays in sync.
- **Commands**: [commands.ts](vscode/core/src/commands.ts) and other command handlers read `state.data` or call state-dependent services. They do not call mutate directly for most flows; they call into orchestrators or services that perform the mutate.
- **Orchestrators**: [solutionWorkflowOrchestrator](vscode/core/src/solutionWorkflowOrchestrator.ts) and similar components call `state.mutateChatMessages`, `state.mutateSolutionWorkflow`, etc., and may trigger `onDidChangeData` or rely on the extension to do so.

## Adding a view that consumes state

1. **Give the view the same ExtensionState**: The new provider (e.g. for the secondary sidebar) is constructed with `this.state` in [extension.ts](vscode/core/src/extension.ts), same as the others.
2. **Subscribe to changes**: When `state.data` changes, the new provider must send the relevant part to its webview. Follow the same pattern as the existing providers: on `onDidChangeData` (or the equivalent event), build a message (e.g. `FULL_STATE_UPDATE` or granular updates) and call `sendMessageToWebview`. If the extension already broadcasts to all providers in `state.webviewProviders`, add the new provider to that map so it receives the same broadcasts.
3. **Do not duplicate state**: The webview UI (React) keeps a copy in the Zustand store, updated via messages. The **single source of truth** remains in the extension; the webview is a view over that state.

## Checklist for state changes

1. Identify the right mutate helper (e.g. `mutateChatMessages` for chat, `mutateAnalysisState` for analysis).
2. Call it with a recipe that only mutates the `draft`.
3. Ensure listeners are notified (either inside the mutate or by the caller) so webviews update.
4. For a new webview view, ensure its provider is in `state.webviewProviders` and receives the same (or appropriate) state updates via the existing broadcast or event subscription.
