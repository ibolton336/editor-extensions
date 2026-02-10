---
name: zustand-store
description: Read and update the webview Zustand store with Immer middleware. Use when adding store fields, selectors, actions, useExtensionStore, or connecting a new component to state.
---

# Zustand Store (webview-ui)

Use this skill when adding or changing state in the webview React app. The store is the webview's local mirror of extension state, kept in sync via messages.

## Store location and setup

[webview-ui/src/store/store.ts](webview-ui/src/store/store.ts) exports `useExtensionStore`, created with:

```typescript
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

export const useExtensionStore = create<ExtensionStore>()(
  devtools(
    immer((set) => ({
      // state + actions
    })),
  ),
);
```

- **Immer middleware**: Actions use `set((state) => { state.field = value; })` — direct mutation on the draft is safe because Immer produces a new immutable snapshot. See [Zustand Immer middleware](https://zustand.docs.pmnd.rs/integrations/immer-middleware).
- **devtools**: Enables Redux DevTools for debugging state changes.

## Reading state in components

Use **selectors** to pick only what the component needs. This avoids unnecessary re-renders:

```typescript
import { useExtensionStore } from "../../store/store";

const isAnalyzing = useExtensionStore((state) => state.isAnalyzing);
const profiles = useExtensionStore((state) => state.profiles);
```

Never destructure the whole store (`const store = useExtensionStore()`) — it subscribes to every field and causes renders on any change.

## Reading state outside React (in hooks/handlers)

Use `useExtensionStore.getState()` for non-reactive reads (e.g. inside `useVSCodeMessageHandler`):

```typescript
const store = useExtensionStore.getState();
store.setChatMessages(messages);
```

## Adding a new field

1. Add the field to `ExtensionStore` interface (both the data and the setter).
2. Set an initial value in the `immer((set) => ({ ... }))` block.
3. Implement the setter: `setMyField: (value) => set((state) => { state.myField = value; })`.
4. In [useVSCodeMessageHandler](webview-ui/src/hooks/useVSCodeMessageHandler.ts), call the setter when the corresponding message type arrives.

## Batch updates

For complex state changes that touch multiple fields at once, use the `batchUpdate` action:

```typescript
store.batchUpdate({ isAnalyzing: false, analysisProgress: 100 });
```

This sets multiple fields in a single Immer draft, producing one state snapshot and one render cycle.

## Who updates the store

- **useVSCodeMessageHandler**: The primary source. Listens for messages from the extension and maps them to store setters.
- **Components**: May call store actions for local UI state (e.g. `setFocusedViolationFilter`).
- **Commands sent to extension**: Components post messages to the extension (`window.vscode.postMessage(...)`); the extension processes them, updates its own state, and sends a message back, which the handler applies to the store.

## Key types

State types (`RuleSet`, `ChatMessage`, `AnalysisProfile`, etc.) come from `@editor-extensions/shared`. If you add a new type, add it in `shared/src/types/`, export it, and run `npm run build -w shared` before using it in the webview.
