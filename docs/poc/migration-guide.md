# Migration Guide: From Immer + Context to Redux/Zustand

> **✅ MIGRATION COMPLETED** (Nov 3, 2024)
>
> This guide was used to migrate from Context API + Immer to Zustand with granular message system.
>
> - **Context API**: ❌ Removed (ExtensionStateContext.tsx deleted)
> - **Zustand Store**: ✅ Implemented with selective subscriptions
> - **Granular Messages**: ✅ Implemented (Phase 5 complete)
> - **Performance**: ✅ Improved - only affected components re-render
>
> See [granular-message-system.md](../granular-message-system.md) for current implementation details.

---

## Step-by-Step Migration

### Phase 1: Setup (1-2 days)

#### Option A: Redux Toolkit

```bash
npm install @reduxjs/toolkit react-redux redux-logger redux-persist
npm install --save-dev @types/redux-logger
```

#### Option B: Zustand (Recommended for faster migration)

```bash
npm install zustand immer
```

---

### Phase 2: Create New Store (2-3 days)

1. **Copy POC files:**
   - For Redux: Copy `docs/poc/redux-toolkit/` → `webview-ui/src/store/`
   - For Zustand: Copy `docs/poc/zustand/store.ts` → `webview-ui/src/store/`

2. **Update imports** to use your actual types from `@editor-extensions/shared`

3. **Test the store** in isolation before integrating

---

### Phase 3: Migrate VSCode Extension Side (3-4 days)

#### Current Code (extension.ts):

```typescript
// ❌ REMOVE THIS:
const mutateData = (recipe: (draft: ExtensionData) => void) => {
  const data = produce(getData(), recipe);
  setData(data);
  return data;
};

const setData = (data: Immutable<ExtensionData>) => {
  this.data = data;
  this._onDidChange.fire(this.data); // Broadcasts ENTIRE state!
};
```

#### New Code (with Zustand - simpler):

```typescript
// ✅ NEW: Import store
import { useExtensionStore } from "../../webview-ui/src/store";

// ✅ NEW: Setup bridge
const bridge = new ZustandVSCodeBridge(this.state.webviewProviders);

// Replace all mutateData calls:
// OLD: mutateData((draft) => { draft.isAnalyzing = true });
// NEW: useExtensionStore.getState().setIsAnalyzing(true);
```

#### Migration Example:

```typescript
// Find: mutateData\((draft)\s*=>\s*\{([^}]*)\}\)
// Replace with appropriate store method call

// BEFORE:
mutateData((draft) => {
  draft.isAnalyzing = true;
  draft.enhancedIncidents = newIncidents;
});

// AFTER (Zustand):
const store = useExtensionStore.getState();
store.setIsAnalyzing(true);
store.setEnhancedIncidents(newIncidents);

// AFTER (Redux):
import { store } from "./store";
import { setIsAnalyzing, setEnhancedIncidents } from "./slices/analysisSlice";
store.dispatch(setIsAnalyzing(true));
store.dispatch(setEnhancedIncidents(newIncidents));
```

---

### Phase 4: Migrate React Webview (4-5 days)

#### 4.1: Remove Context Provider

**Current (ExtensionStateContext.tsx):**

```typescript
// ❌ DELETE THIS FILE (or keep for gradual migration)
export function ExtensionStateProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<ExtensionData>(windowState);
  // ... entire implementation
}
```

**New (App.tsx with Redux):**

```typescript
import { Provider } from 'react-redux';
import { store } from './store';

function App() {
  return (
    <Provider store={store}>
      <YourAppContent />
    </Provider>
  );
}
```

**New (App.tsx with Zustand):**

```typescript
// ✅ No provider needed! Zustand works without it
function App() {
  return <YourAppContent />;
}
```

#### 4.2: Migrate Components

**BEFORE (using Context):**

```typescript
import { useExtensionStateContext } from '../context/ExtensionStateContext';

function MyComponent() {
  const { state } = useExtensionStateContext();
  // ❌ Re-renders on ANY state change!

  return <div>{state.enhancedIncidents.length}</div>;
}
```

**AFTER (using Zustand):**

```typescript
import { useExtensionStore } from '../store';

function MyComponent() {
  // ✅ Only re-renders when incidents change!
  const incidentCount = useExtensionStore((state) => state.enhancedIncidents.length);

  return <div>{incidentCount}</div>;
}
```

**AFTER (using Redux):**

```typescript
import { useSelector } from 'react-redux';
import { selectIncidentCount } from '../slices/analysisSlice';

function MyComponent() {
  // ✅ Only re-renders when count changes!
  const incidentCount = useSelector(selectIncidentCount);

  return <div>{incidentCount}</div>;
}
```

---

### Phase 5: Update Message Handling (2-3 days)

#### Current Webview Message Handler:

```typescript
// In ExtensionStateContext.tsx
useEffect(() => {
  const handleMessage = (event: MessageEvent<WebviewMessage>) => {
    const message = event.data;

    if (isFullStateUpdate(message)) {
      setState((prevState) => {
        // ❌ Receives and processes ENTIRE state
        const safeData: ExtensionData = { ...message };
        // ... complex equality checks
        return safeData;
      });
    }
  };
  window.addEventListener("message", handleMessage);
}, []);
```

#### New Message Handler (Zustand):

```typescript
// In webview message handler
useEffect(() => {
  const handleMessage = (event: MessageEvent) => {
    const message = event.data;
    const store = useExtensionStore.getState();

    switch (message.type) {
      case "ANALYSIS_STATE_UPDATE":
        // ✅ Only update analysis slice
        store.setRuleSets(message.analysis.ruleSets);
        store.setEnhancedIncidents(message.analysis.enhancedIncidents);
        store.setIsAnalyzing(message.analysis.isAnalyzing);
        break;

      case "CHAT_MESSAGES_UPDATE":
        // ✅ Only update chat (doesn't trigger analysis re-renders)
        store.setChatMessages(message.chatMessages);
        break;

      case "CHAT_STREAMING_CHUNK":
        // ✅ Batched automatically
        store.appendStreamingChunk(message.messageId, message.chunk);
        break;
    }
  };
  window.addEventListener("message", handleMessage);
}, []);
```

---

### Phase 6: Performance Testing (1-2 days)

1. **Measure Before:**

   ```typescript
   console.time("State Update");
   mutateData((draft) => {
     draft.isAnalyzing = true;
   });
   console.timeEnd("State Update");
   ```

2. **Measure After:**

   ```typescript
   console.time("State Update");
   useExtensionStore.getState().setIsAnalyzing(true);
   console.timeEnd("State Update");
   ```

3. **Profile React Renders:**
   - Open React DevTools Profiler
   - Compare render counts before/after
   - Expect 50-80% reduction in unnecessary renders

4. **Memory Testing:**
   - Open VSCode Task Manager
   - Monitor webview memory over time
   - Should see less memory growth with large datasets

---

### Phase 7: Cleanup (1 day)

1. **Remove old code:**
   - Delete `ExtensionStateContext.tsx`
   - Remove `immer` from `extension.ts`
   - Remove `mutateData` and `mutateChatMessages` functions
   - Clean up `_onDidChange` event emitter

2. **Update package.json:**
   - Can optionally remove `immer` from dependencies (if using Redux or Zustand without Immer middleware)

---

## Migration Checklist

### Extension Side (vscode/core/src/)

- [ ] Install new state management library
- [ ] Create store/bridge setup
- [ ] Replace `mutateData` calls with store actions
- [ ] Replace `mutateChatMessages` with chat-specific actions
- [ ] Update message broadcasting to be selective
- [ ] Remove old Immer-based state management
- [ ] Test all VSCode commands still work

### Webview Side (webview-ui/src/)

- [ ] Setup store provider (Redux) or import store (Zustand)
- [ ] Replace `useExtensionStateContext` with store hooks
- [ ] Update all components to use selectors
- [ ] Update message handler to use store actions
- [ ] Remove `ExtensionStateContext.tsx`
- [ ] Test all UI interactions work
- [ ] Profile React renders to verify improvements

### Testing

- [ ] Run unit tests
- [ ] Test analysis flow end-to-end
- [ ] Test chat functionality
- [ ] Test agent mode
- [ ] Load test with large rulesets (1000+ incidents)
- [ ] Memory profiling
- [ ] Performance benchmarks

---

## Expected Improvements

### Performance

- ✅ **50-80% reduction** in unnecessary React re-renders
- ✅ **10-50ms** faster state updates (no full Immer clones)
- ✅ **60-80% reduction** in webview message size (selective updates)
- ✅ **Better memory stability** with large datasets

### Developer Experience

- ✅ **Redux DevTools** for state debugging (both Redux & Zustand)
- ✅ **Type safety** with TypeScript
- ✅ **Simpler code** (especially with Zustand)
- ✅ **Better testability** (store can be tested in isolation)

---

## Rollback Plan

If issues arise, you can run both systems side-by-side:

1. Keep `ExtensionStateContext.tsx` as fallback
2. Add feature flag: `USE_NEW_STATE_MANAGEMENT`
3. Conditionally use old or new system
4. Gradually migrate components one by one

## Need Help?

- Redux Toolkit: https://redux-toolkit.js.org/
- Zustand: https://github.com/pmndrs/zustand
- Continue's implementation: https://github.com/continuedev/continue/tree/main/gui/src/redux
