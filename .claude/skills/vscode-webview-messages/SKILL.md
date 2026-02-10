---
name: vscode-webview-messages
description: Define and handle extension-to-webview messages. Use when adding or changing webview message types, postMessage, MessageTypes, useVSCodeMessageHandler, or shared message contracts.
---

# VSCode Webview Messages (this repo)

Use this skill when adding or changing **extension ↔ webview** messaging so the secondary sidebar (or any webview) stays consistent with the rest of the extension.

## Where messages are defined

- **Types and type guards**: [shared/src/types/messages.ts](shared/src/types/messages.ts).
- **Message type constants**: `MessageTypes` (e.g. `FULL_STATE_UPDATE`, `ANALYSIS_STATE_UPDATE`, `CHAT_MESSAGES_UPDATE`). Use these for the `type` field on messages.
- **Union**: `WebviewMessage` is the union of all extension→webview message types. Every new message type must be added to this union.
- **Type guards**: Export a function `isXxx(msg): msg is XxxMessage` for each message type so the webview can narrow safely (e.g. `isFullStateUpdate`, `isChatMessagesUpdate`).

## Adding a new message type

1. **Define the interface** in `shared/src/types/messages.ts` with a `type` literal (use `MessageTypes.NEW_TYPE` or a string).
2. **Add to `WebviewMessage`** union.
3. **Add a type guard** (e.g. `isNewType(msg): msg is NewTypeMessage`) and export it.
4. **Build @shared**: Run `npm run build -w shared` (or `npm run dev -w shared` in watch mode). Other workspaces depend on the built output.
5. **Post from extension**: In the provider or code that holds the webview reference, send via `webview.postMessage({ type: "NEW_TYPE", ... })`. Prefer the provider’s existing `sendMessage` / `sendMessageToWebview` helpers so serialization and readiness are handled.
6. **Handle in webview**: In [useVSCodeMessageHandler](webview-ui/src/hooks/useVSCodeMessageHandler.ts), add a branch using the new type guard and update the Zustand store (or relevant state). If the new view (e.g. secondary sidebar) uses the same store, it will receive the same messages; if it needs a subset, handle only the types that view cares about.

## Extension side: posting messages

- **Provider**: [KonveyorGUIWebviewViewProvider](vscode/core/src/KonveyorGUIWebviewViewProvider.ts) queues messages until the webview is ready, then sends them. Use the provider’s public API (e.g. `sendMessageToWebview(message)`) so the correct webview instance (view or panel) receives the message.
- **State updates**: When extension state changes, the extension fires `onDidChangeData` and/or calls code that builds a message (e.g. `ANALYSIS_STATE_UPDATE`, `FULL_STATE_UPDATE`) and passes it to each provider that needs it. Do not post from arbitrary modules; go through the provider or a central broadcast that uses the provider map in `state.webviewProviders`.

## Webview side: receiving messages

- **Single handler**: [useVSCodeMessageHandler](webview-ui/src/hooks/useVSCodeMessageHandler.ts) subscribes to `window.addEventListener("message", ...)` and dispatches by message type using the type guards. It updates the Zustand store in [store.ts](webview-ui/src/store/store.ts). Any component that reads from the store will reflect the new state.
- **New view**: If you add a new webview view (e.g. secondary sidebar) that uses the same React app and store, it will receive the same messages. If the new view uses a different route or component, ensure the message handler hook is active for that view (it usually is if the view mounts the same app root). For a subset of messages, the handler can ignore types the view does not need; no change required unless you want to optimize.

## Checklist for a new message type

1. Add interface and `type` in `shared/src/types/messages.ts`.
2. Add to `WebviewMessage` and add `isXxx` type guard.
3. Run `npm run build -w shared`.
4. Post from extension (via provider or central broadcast).
5. In `useVSCodeMessageHandler`, add a branch that uses the type guard and updates store (or state) as needed.
