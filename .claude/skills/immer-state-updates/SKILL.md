---
name: immer-state-updates
description: Update state with Immer in both the extension (produce) and webview (Zustand Immer middleware). Use when mutating ExtensionData, writing Zustand actions, using produce or set with a draft, or debugging stale state.
---

# Immer State Updates (extension + webview)

Use this skill when writing code that **mutates state** on either side of the extension. Immer is used in two places with slightly different APIs.

## Extension side: `produce` and mutate helpers

[ExtensionState](vscode/core/src/extensionState.ts) exposes mutate helpers (`mutateChatMessages`, `mutateAnalysisState`, etc.) that wrap Immer's `produce`:

```typescript
this.state.mutateChatMessages((draft) => {
  draft.chatMessages.push({ kind: ChatMessageType.String, value: "hello" });
});
```

Rules:

- **Only mutate `draft`** inside the recipe. Never read or write `this.state.data` directly inside a recipe.
- **One recipe per logical update**. Multiple field changes in the same recipe are fine (they produce a single new snapshot).
- **Notification**: After the mutate, call `this._onDidChange.fire(this.data)` (or the equivalent) so webview providers and other listeners see the new state. Most mutate helpers do this automatically.
- **Return nothing** from the recipe (void). Returning a value replaces the entire state, which is almost never what you want.

See the extension-side **vscode-extension-state** skill for more on who consumes state and how to add a new view.

## Webview side: Zustand + Immer middleware

[store.ts](webview-ui/src/store/store.ts) uses `zustand/middleware/immer`:

```typescript
export const useExtensionStore = create<ExtensionStore>()(
  devtools(
    immer((set) => ({
      count: 0,
      increment: () =>
        set((state) => {
          state.count += 1;
        }),
    })),
  ),
);
```

Rules:

- **`set((state) => { ... })`** — mutate `state` directly; Immer handles immutability.
- **Do not return** from the `set` callback. Returning `{ count: 1 }` replaces the entire store (bypasses Immer).
- **Selectors**: Use `useExtensionStore((s) => s.field)` so components re-render only when that field changes. Never spread the whole store.
- **Non-reactive reads**: `useExtensionStore.getState()` gives the current snapshot without subscribing. Use in event handlers, `useVSCodeMessageHandler`, or outside React.

Reference: [Zustand Immer middleware](https://zustand.docs.pmnd.rs/integrations/immer-middleware).

## Common gotchas

| Problem                                       | Cause                                                  | Fix                                                                   |
| --------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| Subscriptions not firing (Zustand)            | Returning a value from `set` instead of mutating draft | Remove the return; mutate `state.field` directly                      |
| Stale state in async code                     | Captured closure over old snapshot                     | Re-read with `useExtensionStore.getState()` inside the async callback |
| Unexpected full-state replacement (extension) | Returning a value from the Immer recipe                | Ensure recipe is `void`; only mutate `draft`                          |
| Class objects not tracked                     | Missing `[immerable] = true` on class instances        | Add the Immer symbol or use plain objects                             |

## When to use which

| Context                           | Tool                         | Pattern                                                 |
| --------------------------------- | ---------------------------- | ------------------------------------------------------- |
| Extension state (`ExtensionData`) | `produce` via mutate helpers | `state.mutateXxx((draft) => { draft.field = value; })`  |
| Webview store (`ExtensionStore`)  | Zustand Immer middleware     | `set((state) => { state.field = value; })`              |
| Shared types                      | `@editor-extensions/shared`  | Same types on both sides; build `@shared` after changes |
