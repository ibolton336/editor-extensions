# Expandable Footer - Decorator Flow Integration

## Overview

The `BatchReviewExpandable` footer now fully integrates the decorator review flow, matching the behavior from `ModifiedFileMessage` and `ModifiedFileActions`.

## Key Updates

### 1. **Filename Only Display**

**Before:**

```
📁 /Users/ibolton/Development/coolstore/src/main/java/.../InventoryEntity.java
```

**After:**

```
📁 InventoryEntity.java
```

Much cleaner, saves horizontal space, and easier to scan.

### 2. **Decorator State Tracking**

Now subscribes to `activeDecorators` from Zustand store:

```typescript
const activeDecorators = useExtensionStore((state) => state.activeDecorators);
const isViewingDiff = !!(activeDecorators && activeDecorators[currentFile.messageToken]);
```

When a file is opened with decorators, the footer UI changes to reflect this state.

### 3. **Conditional Action UI**

The actions section now has two states:

#### State A: Normal Review (isViewingDiff = false)

```
┌─────────────────────────────────────────────────────────┐
│  [←] [📝 Review in Editor] [Reject] [Accept] [→]       │
└─────────────────────────────────────────────────────────┘
```

#### State B: Reviewing with Decorators (isViewingDiff = true)

```
┌─────────────────────────────────────────────────────────┐
│  📝 Reviewing in editor - use CodeLens...  [Continue]   │
└─────────────────────────────────────────────────────────┘
```

### 4. **Continue Button Flow**

Matches `ModifiedFileActions` behavior:

```typescript
const handleContinue = () => {
  // Check current file state and apply/reject based on changes
  window.vscode.postMessage({
    type: "CONTINUE_WITH_FILE_STATE",
    payload: {
      messageToken: currentFile.messageToken,
      path: currentFile.path,
      content: currentFile.content,
    },
  });

  // Auto-advance to next file after backend responds
  if (currentIndex < pendingFiles.length - 1) {
    setTimeout(() => setCurrentIndex(currentIndex + 1), 300);
  }
};
```

## User Journey with Decorators

### Complete Flow

```
1. Footer shows: "InventoryEntity.java"
   UI: [←] [📝 Review in Editor] [Reject] [Accept] [→]

2. User clicks "📝 Review in Editor"
   → VSCode opens file with decorators
   → activeDecorators[messageToken] = true
   → Footer UI changes

3. Footer now shows:
   UI: 📝 Reviewing in editor - use CodeLens... [Continue]

4. User reviews in editor:
   - Sees inline diff decorators
   - Uses CodeLens "Accept All" or "Reject All"
   - Or edits individual blocks
   - Saves file (Ctrl/Cmd+S)

5. User clicks "Continue"
   → Backend checks file state
   → Auto-applies if changes detected
   → Auto-rejects if no changes
   → Footer advances to next file

6. Next file shown:
   UI: [←] [📝 Review in Editor] [Reject] [Accept] [→]
```

## State Synchronization

### Backend → Frontend Flow

```
User clicks "Review in Editor"
  ↓
SHOW_DIFF_WITH_DECORATORS message
  ↓
Backend opens file with decorators
Backend sets activeDecorators[messageToken] = filePath
  ↓
DECORATORS_UPDATE message sent to webview
  ↓
Zustand store updates: activeDecorators[messageToken] = filePath
  ↓
BatchReviewExpandable re-renders
  ↓
isViewingDiff = true
  ↓
UI shows: "Reviewing in editor..." + Continue button
```

### Continue Flow

```
User clicks "Continue"
  ↓
CONTINUE_WITH_FILE_STATE message
  ↓
Backend checks if file was modified
  ↓
FILE_RESPONSE sent (apply or reject)
  ↓
Backend clears activeDecorators[messageToken]
  ↓
DECORATORS_UPDATE sent to webview
  ↓
isViewingDiff = false
  ↓
Footer auto-advances to next file
```

## UI States

### State 1: Initial

```
┌─────────────────────────────────────────────────────┐
│ 📁 Controller.java                          [New]   │
│ [←] [📝 Review in Editor] [Reject] [Accept] [→]    │
└─────────────────────────────────────────────────────┘
```

### State 2: Reviewing with Decorators

```
┌─────────────────────────────────────────────────────┐
│ 📁 Controller.java                          [New]   │
│ 📝 Reviewing in editor - use CodeLens... [Continue] │
└─────────────────────────────────────────────────────┘
```

### State 3: Decision Made

```
┌─────────────────────────────────────────────────────┐
│ 📁 Controller.java           [✓ Applied]            │
│ [←] [📝 Review in Editor] [✓] [Accept] [→]         │
└─────────────────────────────────────────────────────┘
     ↑ Buttons disabled after decision
```

## Code Comparison: ModifiedFileActions vs BatchReviewExpandable

### ModifiedFileActions Pattern

```typescript
// Shows DiffStatusBanner when viewing
if (isViewingDiff && actionTaken === null) {
  return (
    <DiffStatusBanner
      onApplyChanges={() => onContinue?.()}
      hasActiveDecorators={hasActiveDecorators}
    />
  );
}
```

### BatchReviewExpandable Pattern

```typescript
// Conditional render in actions section
{isViewingDiff ? (
  <Flex>
    <span>📝 Reviewing in editor...</span>
    <Button onClick={handleContinue}>Continue</Button>
  </Flex>
) : (
  <Flex>
    {/* Normal review actions */}
  </Flex>
)}
```

Same logic, adapted for compact footer layout!

## Benefits

### ✅ Visual Feedback

User always knows when file is open in editor:

- Text changes: "Review in Editor" → "Reviewing in editor..."
- Continue button appears
- Matches familiar pattern from `ModifiedFileMessage`

### ✅ Guided Workflow

- Can't navigate away while reviewing (buttons disabled)
- Must click Continue to proceed
- Clear instruction: "use CodeLens to accept/reject"

### ✅ State Consistency

- Same `activeDecorators` tracking as individual messages
- Same `CONTINUE_WITH_FILE_STATE` protocol
- Predictable behavior across all review methods

### ✅ Compact Layout

- Even decorator status fits in single row
- No height increase when state changes
- Smooth, minimal UI

## Technical Details

### State Variables

```typescript
const activeDecorators = useExtensionStore((state) => state.activeDecorators);
const isViewingDiff = !!(activeDecorators && activeDecorators[currentFile.messageToken]);
const currentFileName = currentFile.path.split("/").pop() || currentFile.path;
```

### Messages Sent

1. **SHOW_DIFF_WITH_DECORATORS** - Opens file
2. **CONTINUE_WITH_FILE_STATE** - Checks state and proceeds
3. **FILE_RESPONSE** - Direct apply/reject

### Backend Integration

- Uses existing `handleFileResponse` logic
- Integrates with `VerticalDiffManager`
- Clears decorators on Continue
- Updates chat message status

## Accessibility

- ✅ **Screen reader support** - Status changes announced
- ✅ **Keyboard navigation** - Still accessible
- ✅ **Focus management** - Buttons disabled appropriately
- ✅ **Clear instructions** - Text explains what to do

## Mobile/Responsive

```css
@media (max-width: 768px) {
  .batch-review-decorator-status {
    font-size: var(--pf-v5-global--FontSize--xs);
    display: block;
    margin-bottom: 0.5rem;
  }
}
```

Status text wraps on narrow screens.

## Related Files

- **`BatchReviewExpandable.tsx`** - Main component with decorator flow
- **`batchReviewExpandable.css`** - Decorator status styling
- **`ModifiedFileActions.tsx`** - Original decorator flow pattern
- **`ModifiedFileMessage.tsx`** - Reference implementation
- **`handleFileResponse.ts`** - Backend continue logic

## Testing Checklist

- [x] Shows filename only (not full path)
- [x] "Review in Editor" opens file with decorators
- [x] UI changes to decorator state when file opens
- [x] Continue button appears
- [x] Navigation disabled while reviewing
- [x] Continue checks file state properly
- [x] Auto-advances to next file after Continue
- [x] State resets when moving to next file
- [x] Accept/Reject still work without decorator flow
- [x] Bulk actions still functional

Perfect match with `ModifiedFileMessage` behavior, but in a compact footer! 🎯
