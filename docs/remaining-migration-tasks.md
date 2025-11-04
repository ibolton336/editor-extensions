# Remaining Migration Tasks

## Completed ✅

### Phase 5: Granular Message System

- ✅ Created 9 granular message types
- ✅ Implemented message handlers in webview
- ✅ Created 7 granular mutate functions in backend
- ✅ Fixed profile manager race condition bug
- ✅ Deleted old Context API (297 lines)
- ✅ **Fully migrated extension.ts** (14 calls removed)

### Files Fully Migrated

1. ✅ [extension.ts](../vscode/core/src/extension.ts) - All 14 `useExtensionStore` calls replaced
2. ✅ [webviewMessageHandler.ts](../vscode/core/src/webviewMessageHandler.ts) - All calls replaced with granular mutates

## Remaining Work 🔨

### Backend Files with Dead `useExtensionStore` Calls

These calls don't actually work (they're calling a store that only exists in webview context) and should be replaced with granular mutate functions.

#### High Priority (8-10 calls each)

**1. [solutionWorkflowOrchestrator.ts](../vscode/core/src/solutionWorkflowOrchestrator.ts)** (~8 calls)

- **Status**: Started (1/8 migrated)
- **Replacement**: Use `state.mutateSolutionWorkflow()` for workflow state
- **Lines**: 110, 251, 284, 337, 376-380, 444, 460-466, 536

Example:

```typescript
// Before
const store = useExtensionStore.getState();
store.setIsFetchingSolution(false);
store.setSolutionState("received");

// After
this.state.mutateSolutionWorkflow((draft) => {
  draft.isFetchingSolution = false;
  draft.solutionState = "received";
});
```

**2. [commands.ts](../vscode/core/src/commands.ts)** (~7 calls)

- **Status**: Not started
- **Replacement**: Use appropriate granular mutate based on what's being updated
  - Server connection: `state.mutateServerState()`
  - Analysis: `state.mutateAnalysisState()`
  - Decorators: `state.mutateDecorators()`
- **Lines**: 126, 131, 139, 186, 204-209, 528-533, 555

#### Medium Priority (ModifiedFiles utilities - ~15 calls total)

**3. [handleModifiedFile.ts](../vscode/core/src/utilities/ModifiedFiles/handleModifiedFile.ts)** (~5 calls)

- **Replacement**: `state.mutateSolutionWorkflow()` for interaction flags
- **Lines**: 35, 148-152, 187-191, 262

**4. [handleQuickResponse.ts](../vscode/core/src/utilities/ModifiedFiles/handleQuickResponse.ts)** (~3 calls)

- **Replacement**: `state.mutateSolutionWorkflow()` for interaction flags
- **Lines**: 28-32, 81, 90

**5. [queueManager.ts](../vscode/core/src/utilities/ModifiedFiles/queueManager.ts)** (~2 calls)

- **Replacement**: `state.mutateChatMessages()` and `state.mutateSolutionWorkflow()`
- **Lines**: 159, 209

**6. [handleFileResponse.ts](../vscode/core/src/utilities/ModifiedFiles/handleFileResponse.ts)** (~3 calls)

- **Replacement**: `state.mutateSolutionWorkflow()`
- **Lines**: 188-192, 197-201, 212-216

**7. [processMessage.ts](../vscode/core/src/utilities/ModifiedFiles/processMessage.ts)** (~3 calls)

- **Replacement**: `state.mutateSolutionWorkflow()`
- **Lines**: 43-47, 61, 67

#### Lower Priority (3-4 calls each)

**8. [diff/vertical/manager.ts](../vscode/core/src/diff/vertical/manager.ts)** (~3 calls)

- **Replacement**: `state.mutateDecorators()`
- **Lines**: 213-217, 215, 300

**9. [data/loadResults.ts](../vscode/core/src/data/loadResults.ts)** (~3 calls)

- **Replacement**: `state.mutateAnalysisState()`
- **Lines**: 14-16, 25

**10. [analysis/batchedAnalysisTrigger.ts](../vscode/core/src/analysis/batchedAnalysisTrigger.ts)** (~2 calls)

- **Replacement**: `state.mutateAnalysisState()`
- **Lines**: 27, 80

## Migration Pattern Reference

### Which Mutate Function to Use?

| State Being Updated                                                                                            | Granular Mutate Function                         |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Analysis (ruleSets, enhancedIncidents, isAnalyzing, isAnalysisScheduled)                                       | `state.mutateAnalysisState()`                    |
| Chat messages                                                                                                  | `state.mutateChatMessages()`                     |
| Solution workflow (isFetchingSolution, solutionState, isWaitingForUserInteraction, isProcessingQueuedMessages) | `state.mutateSolutionWorkflow()`                 |
| Server (serverState, isStartingServer, solutionServerConnected)                                                | `state.mutateServerState()`                      |
| Profiles                                                                                                       | `state.mutateProfiles()`                         |
| Config errors                                                                                                  | `state.mutateConfigErrors()`                     |
| Decorators (activeDecorators)                                                                                  | `state.mutateDecorators()`                       |
| Settings (solutionServerEnabled, isAgentMode, isContinueInstalled)                                             | `state.mutateSettings()`                         |
| Multiple unrelated fields                                                                                      | `state.mutateData()` (legacy, avoid if possible) |

### Example Migration

**Before (Broken - doesn't actually work)**:

```typescript
import { useExtensionStore } from "../../../webview-ui/src/store/store";

const store = useExtensionStore.getState(); // ❌ Store doesn't exist in backend!
store.setIsFetchingSolution(false);
store.setSolutionState("received");
store.setIsAnalyzing(false);
```

**After (Works correctly)**:

```typescript
// No import needed - use state from ExtensionState parameter

this.state.mutateSolutionWorkflow((draft) => {
  draft.isFetchingSolution = false;
  draft.solutionState = "received";
});

this.state.mutateAnalysisState((draft) => {
  draft.isAnalyzing = false;
});
```

## Why This Matters

1. **Current State**: The `useExtensionStore.getState()` calls don't work - they're trying to access a Zustand store that only exists in the webview, not in the VSCode extension backend
2. **Impact**: State updates from these calls are silently failing - the webview never receives them
3. **Fix**: Use the proper `state.mutate*()` functions which:
   - Update the backend state correctly
   - Broadcast granular messages to the webview
   - Prevent unnecessary re-renders

## Estimated Effort

- **solutionWorkflowOrchestrator.ts**: 1 hour
- **commands.ts**: 45 minutes
- **ModifiedFiles utilities (5 files)**: 1.5 hours
- **Remaining files (3 files)**: 30 minutes
- **Testing & verification**: 30 minutes

**Total**: ~4-5 hours

## Next Steps

1. Continue with solutionWorkflowOrchestrator.ts (highest priority, most calls)
2. Move to commands.ts
3. Batch migrate the ModifiedFiles utilities
4. Finish with the smaller files
5. Remove all `useExtensionStore` imports from backend
6. Final build and testing

## Progress Tracking

- [x] extension.ts (14/14 calls)
- [ ] solutionWorkflowOrchestrator.ts (1/8 calls)
- [ ] commands.ts (0/7 calls)
- [ ] handleModifiedFile.ts (0/5 calls)
- [ ] handleQuickResponse.ts (0/3 calls)
- [ ] handleFileResponse.ts (0/3 calls)
- [ ] processMessage.ts (0/3 calls)
- [ ] queueManager.ts (0/2 calls)
- [ ] diff/vertical/manager.ts (0/3 calls)
- [ ] data/loadResults.ts (0/3 calls)
- [ ] analysis/batchedAnalysisTrigger.ts (0/2 calls)

**Total Progress**: 15/53 calls (28%)
