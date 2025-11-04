# Batch Review Auto-Advance Behavior

## Overview

When files are processed (accepted, rejected, or continued), they are **automatically removed** from `pendingBatchReview`, causing the footer to automatically show the next file without manual navigation.

## How It Works

### The Magic of Array Filtering

```typescript
// Backend removes file from array
draft.pendingBatchReview = draft.pendingBatchReview.filter(
  (file) => file.messageToken !== messageToken,
);

// Array shrinks:
Before: [file1, file2, file3, file4]  currentIndex = 1 (file2)
After:  [file1, file3, file4]         currentIndex = 1 (file3) ✨

// Same index now points to next file!
```

### Frontend Auto-Adjustment

```typescript
React.useEffect(() => {
  // If index is beyond array (last file was removed), adjust
  if (currentIndex >= pendingFiles.length && pendingFiles.length > 0) {
    setCurrentIndex(Math.max(0, pendingFiles.length - 1));
  }

  // If all files processed, collapse footer
  if (pendingFiles.length === 0) {
    setIsExpanded(false);
  }
}, [pendingFiles.length, currentIndex]);
```

## Complete Flow

### Scenario 1: Accept File via Continue

```
1. User at file 3 of 24
   pendingBatchReview: [file1, file2, file3, ..., file24]
   currentIndex: 2

2. User clicks "Review in Editor"
   → VSCode opens file3 with decorators

3. User accepts changes in editor (CodeLens)
   → Saves file (Ctrl/Cmd+S)

4. User clicks "Continue"
   → CONTINUE_WITH_FILE_STATE message sent

5. Backend checks file state
   → Detects changes
   → Calls handleFileResponse("apply", ...)
   → Removes file3 from pendingBatchReview

6. State update:
   pendingBatchReview: [file1, file2, file4, ..., file24]
   currentIndex: 2 (still)

7. Frontend re-renders:
   → pendingFiles[2] is now file4
   → Footer automatically shows file4 ✨
   → No manual navigation needed!
```

### Scenario 2: Direct Accept

```
1. User at file 5 of 24
   currentIndex: 4

2. User clicks "Accept" button
   → FILE_RESPONSE sent with "apply"

3. Backend:
   → Applies file
   → Removes from pendingBatchReview

4. Frontend:
   → Array shrinks
   → Same index now points to next file
   → Auto-advance! ✨
```

### Scenario 3: Last File

```
1. User at last file (file 24 of 24)
   pendingBatchReview: [file24]
   currentIndex: 0

2. User clicks "Accept"
   → Backend removes file24

3. Frontend:
   pendingBatchReview: []
   pendingFiles.length === 0
   → Auto-collapses footer ✨
   → Review complete!
```

## Backend Implementation

### Individual File Processing

**Handler:** `FILE_RESPONSE`

```typescript
FILE_RESPONSE: async ({ responseId, messageToken, path, content }, state, logger) => {
  await handleFileResponse(messageToken, responseId, path, content, state);

  // Remove from pendingBatchReview
  state.mutateSolutionWorkflow((draft) => {
    if (draft.pendingBatchReview) {
      draft.pendingBatchReview = draft.pendingBatchReview.filter((file) => file.messageToken !== messageToken);
    }
  });
};
```

**Handler:** `CONTINUE_WITH_FILE_STATE`

```typescript
CONTINUE_WITH_FILE_STATE: async ({ path, messageToken, content }, state) => {
  // Check file state
  const responseId = hasChanges ? "apply" : "reject";
  await handleFileResponse(messageToken, responseId, path, finalContent, state);

  // Remove from pendingBatchReview
  state.mutateSolutionWorkflow((draft) => {
    if (draft.pendingBatchReview) {
      draft.pendingBatchReview = draft.pendingBatchReview.filter((file) => file.messageToken !== messageToken);
    }
  });
};
```

### Bulk Processing

**Handler:** `BATCH_APPLY_ALL`

```typescript
BATCH_APPLY_ALL: async ({ files }, state, logger) => {
  // Process all files
  for (const file of files) {
    await handleFileResponse(file.messageToken, "apply", file.path, file.content, state);
  }

  // Clear entire array
  state.mutateSolutionWorkflow((draft) => {
    draft.pendingBatchReview = [];
  });
};
```

**Handler:** `BATCH_REJECT_ALL`

```typescript
BATCH_REJECT_ALL: async ({ files }, state, logger) => {
  // Process all files
  for (const file of files) {
    await handleFileResponse(file.messageToken, "reject", file.path, undefined, state);
  }

  // Clear entire array
  state.mutateSolutionWorkflow((draft) => {
    draft.pendingBatchReview = [];
  });
};
```

## State Synchronization

```
Backend removes file
  ↓
mutateSolutionWorkflow called
  ↓
SOLUTION_WORKFLOW_UPDATE message sent
  ↓
Frontend useVSCodeMessageHandler receives update
  ↓
Zustand store.batchUpdate({ pendingBatchReview: [...] })
  ↓
BatchReviewExpandable re-renders
  ↓
useEffect detects pendingFiles.length change
  ↓
Auto-adjusts currentIndex if needed
  ↓
Shows next file at same index! ✨
```

## Benefits

### ✅ Automatic Progression

- No manual "Next" clicking needed after decisions
- Files disappear when processed
- List shrinks automatically

### ✅ Clean State

- No stale files in the list
- Footer shows only pending files
- Clear indication of progress

### ✅ Intuitive UX

```
Start:  24 files ready → Expand
Review: File 1 → Accept → File 2 appears
Review: File 2 → Reject → File 3 appears
Review: File 3 → Accept → File 4 appears
...
End:    File 24 → Accept → Footer collapses ✨
```

### ✅ Resilient

- Index auto-adjusts if out of bounds
- Footer auto-collapses when empty
- No edge cases to worry about

## Edge Cases Handled

### 1. **Remove Last File**

```typescript
if (currentIndex >= pendingFiles.length && pendingFiles.length > 0) {
  setCurrentIndex(Math.max(0, pendingFiles.length - 1));
}
```

### 2. **All Files Processed**

```typescript
if (pendingFiles.length === 0) {
  setIsExpanded(false); // Auto-collapse
}
```

### 3. **Manual Navigation While Processing**

User can still use ← → to navigate before making decisions. Only disabled after decision is made (but file is removed immediately, so this is rare).

## Testing Scenarios

### Test 1: Sequential Review

```
1. 5 files pending
2. Accept file 1 → Shows file 2 (was at index 1, now at index 0)
3. Accept file 2 → Shows file 3
4. Reject file 3 → Shows file 4
5. Accept file 4 → Shows file 5
6. Accept file 5 → Footer collapses ✓
```

### Test 2: Skip Around

```
1. 5 files pending, at index 0
2. Click → → → (navigate to index 3)
3. Accept file at index 3
4. File removed, now at index 3 (which is now file5)
5. Click ← (navigate to index 2)
6. Accept file at index 2
7. File removed, stays at index 2
```

### Test 3: Bulk Operations

```
1. 10 files pending
2. Review files 1-3 individually
3. Click "Apply All"
4. All 10 files processed in backend
5. pendingBatchReview = []
6. Footer auto-collapses ✓
```

## Implementation Files

**Backend:**

- `vscode/core/src/webviewMessageHandler.ts`
  - FILE_RESPONSE handler
  - CONTINUE_WITH_FILE_STATE handler
  - BATCH_APPLY_ALL handler
  - BATCH_REJECT_ALL handler

**Frontend:**

- `webview-ui/src/components/ResolutionsPage/BatchReview/BatchReviewExpandable.tsx`
  - Auto-adjustment useEffect
  - Removal of manual index advancement

**State Management:**

- `vscode/core/src/extension.ts` - mutateSolutionWorkflow broadcasts updates
- `webview-ui/src/hooks/useVSCodeMessageHandler.ts` - Receives SOLUTION_WORKFLOW_UPDATE
- `webview-ui/src/store/store.ts` - Updates pendingBatchReview

## Performance

- ✅ **Efficient filtering** - O(n) per removal
- ✅ **Minimal re-renders** - Only when array changes
- ✅ **Smooth UX** - No flicker or jank
- ✅ **State consistency** - Single source of truth

## Key Takeaway

**By removing files from the source array instead of tracking processed state separately, we get automatic progression for free!** The same index naturally points to the next file when the current one is removed. 🎯
