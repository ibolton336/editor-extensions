# Granular Message System (Phase 5)

## Overview

The granular message system replaces full state broadcasts with selective state updates, significantly improving performance by reducing unnecessary re-renders in the webview.

## Architecture

### Before (Phase 4)

```
Backend updates state → Broadcasts ENTIRE state → Frontend re-renders ALL components
```

### After (Phase 5)

```
Backend updates state → Broadcasts SPECIFIC slice → Frontend re-renders ONLY affected components
```

## Message Types

All message types are defined in [`shared/src/types/messages.ts`](../shared/src/types/messages.ts):

### 1. Analysis State Updates

**Type**: `ANALYSIS_STATE_UPDATE`
**Use when**: Analysis results, incidents, or analysis status changes

```typescript
state.mutateAnalysisState((draft) => {
  draft.ruleSets = newRuleSets;
  draft.enhancedIncidents = newIncidents;
  draft.isAnalyzing = false;
  draft.isAnalysisScheduled = false;
});
```

**Fields Updated**:

- `ruleSets`
- `enhancedIncidents`
- `isAnalyzing`
- `isAnalysisScheduled`

### 2. Chat Messages Updates

**Type**: `CHAT_MESSAGES_UPDATE`
**Use when**: Chat messages change

```typescript
state.mutateChatMessages((draft) => {
  draft.chatMessages.push(newMessage);
});
```

**Fields Updated**:

- `chatMessages`

### 3. Solution Workflow Updates

**Type**: `SOLUTION_WORKFLOW_UPDATE`
**Use when**: AI solution workflow state changes

```typescript
state.mutateSolutionWorkflow((draft) => {
  draft.isFetchingSolution = false;
  draft.solutionState = "received";
  draft.isProcessingQueuedMessages = false;
});
```

**Fields Updated**:

- `isFetchingSolution`
- `solutionState`
- `solutionScope`
- `isWaitingForUserInteraction`
- `isProcessingQueuedMessages`

### 4. Server State Updates

**Type**: `SERVER_STATE_UPDATE`
**Use when**: Solution server or analyzer server state changes

```typescript
state.mutateServerState((draft) => {
  draft.serverState = "running";
  draft.isStartingServer = false;
  draft.solutionServerConnected = true;
});
```

**Fields Updated**:

- `serverState`
- `isStartingServer`
- `isInitializingServer`
- `solutionServerConnected`

### 5. Profile Updates

**Type**: `PROFILES_UPDATE`
**Use when**: Analysis profiles are modified or active profile changes

```typescript
state.mutateProfiles((draft) => {
  draft.profiles = allProfiles;
  draft.activeProfileId = newActiveId;
});
```

**Fields Updated**:

- `profiles`
- `activeProfileId`

### 6. Config Errors Updates

**Type**: `CONFIG_ERRORS_UPDATE`
**Use when**: Configuration validation errors change

```typescript
state.mutateConfigErrors((draft) => {
  draft.configErrors = validationErrors;
});
```

**Fields Updated**:

- `configErrors`

### 7. Decorators Updates

**Type**: `DECORATORS_UPDATE`
**Use when**: Diff view decorators change

```typescript
state.mutateDecorators((draft) => {
  draft.activeDecorators[streamId] = decoratorId;
  // or delete
  delete draft.activeDecorators[streamId];
});
```

**Fields Updated**:

- `activeDecorators`

### 8. Settings Updates

**Type**: `SETTINGS_UPDATE`
**Use when**: Extension settings change

```typescript
state.mutateSettings((draft) => {
  draft.solutionServerEnabled = true;
  draft.isAgentMode = false;
  draft.isContinueInstalled = true;
});
```

**Fields Updated**:

- `solutionServerEnabled`
- `isAgentMode`
- `isContinueInstalled`

### 9. Full State Update

**Type**: No type field (discriminated as ExtensionData)
**Use when**: Initial load or complete state reset

```typescript
state.mutateData((draft) => {
  // Updates all fields and broadcasts entire state
  draft.isAnalyzing = true;
  draft.profiles = newProfiles;
  draft.serverState = "running";
  // ... etc
});
```

## Decision Guide: Which Mutate Function to Use?

### Use `mutateAnalysisState` when:

- Analysis starts/completes
- New analysis results arrive
- Incidents are updated
- Analysis is scheduled/unscheduled

### Use `mutateChatMessages` when:

- New chat message added
- Chat message updated (streaming)
- Chat history cleared

### Use `mutateSolutionWorkflow` when:

- Solution generation starts/completes
- Solution workflow state changes
- User interaction prompts appear
- Queued messages processing status changes

### Use `mutateServerState` when:

- Server starts/stops
- Server initialization begins/completes
- Solution server connects/disconnects

### Use `mutateProfiles` when:

- Profile created/deleted/updated
- Active profile changed
- Profiles reloaded from disk

### Use `mutateConfigErrors` when:

- Configuration validation runs
- Errors are added/removed

### Use `mutateDecorators` when:

- Diff decorators added/removed
- Decorator IDs updated

### Use `mutateSettings` when:

- Settings changed via UI or config file
- Extension settings reloaded

### Use `mutateData` (full broadcast) when:

- Initial extension activation
- Complete state reset
- Multiple unrelated fields change simultaneously
- **AVOID using for normal operations** - prefer granular updates

## Performance Benefits

### Before (Full State Broadcasts)

- **Every** state change broadcasts ~1-5KB of JSON
- **Every** component re-renders on **any** state change
- Chat streaming causes analysis page to re-render
- Profile updates cause chat page to re-render

### After (Granular Messages)

- Only affected state slice broadcasts (~100-500 bytes)
- Only subscribed components re-render
- Chat streaming only re-renders chat components
- Profile updates only re-render profile components

## Frontend Message Handling

The webview message handler ([`useVSCodeMessageHandler.ts`](../webview-ui/src/hooks/useVSCodeMessageHandler.ts)) automatically handles all message types:

```typescript
// Handles ANALYSIS_STATE_UPDATE
if (isAnalysisStateUpdate(message)) {
  store.batchUpdate({
    ruleSets: message.ruleSets,
    enhancedIncidents: message.enhancedIncidents,
    isAnalyzing: message.isAnalyzing,
    isAnalysisScheduled: message.isAnalysisScheduled,
  });
}
```

Components use Zustand selective subscriptions to only re-render on relevant changes:

```typescript
// Only re-renders when isAnalyzing changes
const isAnalyzing = useExtensionStore((state) => state.isAnalyzing);

// Only re-renders when chatMessages changes
const chatMessages = useExtensionStore((state) => state.chatMessages);
```

## Migration Example

### Before (Full State Broadcast)

```typescript
// In solutionWorkflowOrchestrator.ts
state.mutateData((draft) => {
  draft.isFetchingSolution = false;
  draft.solutionState = "received";
  draft.isProcessingQueuedMessages = false;
  draft.isAnalyzing = false;
  draft.isAnalysisScheduled = false;
});
```

**Problem**: Broadcasts entire state, causes all components to re-render

### After (Granular Messages)

```typescript
// In solutionWorkflowOrchestrator.ts
state.mutateSolutionWorkflow((draft) => {
  draft.isFetchingSolution = false;
  draft.solutionState = "received";
  draft.isProcessingQueuedMessages = false;
});

state.mutateAnalysisState((draft) => {
  draft.isAnalyzing = false;
  draft.isAnalysisScheduled = false;
});
```

**Benefit**: Only solution workflow and analysis components re-render

## Implementation Files

### Backend

- [`vscode/core/src/extension.ts`](../vscode/core/src/extension.ts) - Mutate function implementations
- [`vscode/core/src/extensionState.ts`](../vscode/core/src/extensionState.ts) - Interface definitions

### Shared

- [`shared/src/types/messages.ts`](../shared/src/types/messages.ts) - Message type definitions and type guards

### Frontend

- [`webview-ui/src/hooks/useVSCodeMessageHandler.ts`](../webview-ui/src/hooks/useVSCodeMessageHandler.ts) - Message handler
- [`webview-ui/src/store/store.ts`](../webview-ui/src/store/store.ts) - Zustand store

## Future Work

The granular mutate functions are now available in `ExtensionState`. The next step is to migrate existing `mutateData` calls throughout the codebase to use the appropriate granular functions.

**High-priority files to migrate**:

1. `solutionWorkflowOrchestrator.ts` - Solution workflow updates
2. `loadResults.ts` - Analysis results loading
3. `commands.ts` - Command handlers
4. `batchedAnalysisTrigger.ts` - Analysis scheduling
5. Profile-related files - Profile CRUD operations

This will complete the performance optimization by eliminating unnecessary full state broadcasts.
