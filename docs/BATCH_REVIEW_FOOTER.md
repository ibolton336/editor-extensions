# Batch Review Footer Integration

## Overview

The Batch Review Footer provides a persistent, compact UI for managing accumulated file changes within the PatternFly Chatbot footer. This follows the [PatternFly AI Chatbot Footer patterns](https://www.patternfly.org/patternfly-ai/chatbot/chatbot-footer) for integrated footer components.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Chatbot Content                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Chat Messages                                        │  │
│  │  - ReceivedMessage                                    │  │
│  │  - ModifiedFileMessage (individual files)            │  │
│  │  - ToolMessage                                        │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                     Chatbot Footer                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  BatchReviewFooter (NEW!)                            │  │
│  │  ⚠️ 5 files ready for review  [View list ▼]          │  │
│  │     [Reject All] [Apply All (5)] [Review Changes]    │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  ChatbotFootnote                                      │  │
│  │  "Always review AI generated content..."             │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. BatchReviewFooter (New)

**Location:** `webview-ui/src/components/ResolutionsPage/BatchReview/BatchReviewFooter.tsx`

A compact, always-visible footer bar that:

- ✅ Shows pending file count with visual indicator
- ✅ Provides quick access to file list via popover
- ✅ Offers bulk actions (Apply All, Reject All)
- ✅ Opens detailed review modal
- ✅ Animates in/out smoothly
- ✅ Responsive design for mobile

**Key Features:**

```typescript
// Only renders when files are pending
if (pendingFiles.length === 0) return null;

// Integrates with existing BatchReviewModal
<BatchReviewModal
  files={pendingFiles}
  onClose={() => setIsModalOpen(false)}
/>

// Provides popover preview
<Popover bodyContent={fileListPopover}>
  <Button variant="link">View list</Button>
</Popover>
```

### 2. BatchReviewModal (Existing)

**Location:** `webview-ui/src/components/ResolutionsPage/BatchReview/BatchReviewModal.tsx`

Full-featured modal for reviewing changes:

- 📄 File-by-file review with diff preview
- ⌨️ Keyboard navigation (h/l for prev/next, a for apply, r for reject)
- 📊 Progress tracking
- 🎯 Quick jump to specific files
- 💾 Bulk actions

### 3. BatchReviewSummary (Existing)

**Location:** `webview-ui/src/components/ResolutionsPage/BatchReview/BatchReviewSummary.tsx`

Card-based summary in chat content area (kept for context):

- Shows up to 8 files inline
- Provides same actions as footer
- Good for when user is scrolled to bottom

## User Experience Flow

### Scenario 1: Agent Mode - Streaming Multiple Files

```
1. Agent starts fixing multiple issues
2. Files stream in as ModifiedFileMessage components (read-only)
3. As files accumulate, BatchReviewFooter appears at bottom
4. User can monitor progress via footer indicator
5. When complete, user clicks "Review Changes" in footer
6. BatchReviewModal opens for detailed review
7. User reviews each file, applies/rejects individually or in bulk
8. Footer disappears when all decisions made
```

### Scenario 2: Quick Bulk Actions

```
1. Multiple files ready for review
2. Footer shows: "⚠️ 12 files ready for review"
3. User clicks "View list" popover
4. Scans file names quickly
5. Decides to "Apply All" directly from footer
6. All changes applied without opening modal
```

### Scenario 3: Selective Review

```
1. Footer shows: "⚠️ 8 files ready for review"
2. User clicks "Review Changes"
3. Modal opens with first file
4. User navigates: Next (l) → Apply (a) → Next (l) → Reject (r)
5. Progress bar updates: "Reviewed 4/8"
6. User finishes review, clicks "Finish"
7. Footer reflects remaining pending files
```

## Integration with ResolutionsPage

**File:** `webview-ui/src/components/ResolutionsPage/ResolutionsPage.tsx`

```tsx
<Chatbot displayMode={ChatbotDisplayMode.embedded}>
  <ChatbotContent>
    <MessageBox>
      {/* Individual messages */}
      {renderChatMessages()}

      {/* Optional: Keep BatchReviewSummary for in-content preview */}
      {/* <BatchReviewSummary/> */}
    </MessageBox>
  </ChatbotContent>

  <ChatbotFooter>
    {/* NEW: Persistent footer indicator */}
    <BatchReviewFooter />

    {/* Existing footnote */}
    <ChatbotFootnote label="Always review AI generated content..." />
  </ChatbotFooter>
</Chatbot>
```

## State Management

**Zustand Store:** `webview-ui/src/store/store.ts`

```typescript
interface ExtensionStore {
  // Batch review state
  pendingBatchReview: PendingBatchReviewFile[];
  // ... other state
}

// BatchReviewFooter subscribes selectively
const pendingFiles = useExtensionStore((state) => state.pendingBatchReview || []);
```

## Message Protocol

### Messages Sent by Footer Components

```typescript
// Apply all files
{
  type: "BATCH_APPLY_ALL",
  payload: {
    files: [
      { messageToken: "...", path: "...", content: "..." }
    ]
  }
}

// Reject all files
{
  type: "BATCH_REJECT_ALL",
  payload: {
    files: [
      { messageToken: "...", path: "..." }
    ]
  }
}

// Individual file response (from modal)
{
  type: "FILE_RESPONSE",
  payload: {
    responseId: "apply" | "reject",
    messageToken: "...",
    path: "...",
    content?: "..."
  }
}
```

## Styling

**File:** `webview-ui/src/components/ResolutionsPage/BatchReview/batchReviewFooter.css`

Key design principles:

- ✅ Matches PatternFly Chatbot footer aesthetic
- ✅ Clear visual hierarchy (status → actions)
- ✅ Smooth animations (slide in from bottom)
- ✅ Accessible focus states
- ✅ Dark theme support
- ✅ Responsive breakpoints

## Accessibility

- ✅ ARIA labels on all interactive elements
- ✅ Keyboard navigation support
- ✅ Focus indicators on buttons
- ✅ Screen reader announcements for file counts
- ✅ Popover dismissible with Escape key
- ✅ Modal focus trap

## Performance Considerations

1. **Selective Rendering:**

   ```typescript
   if (pendingFiles.length === 0) return null;
   ```

2. **Memoized Components:**
   - BatchReviewFooter rerenders only when pendingFiles changes
   - Modal only mounts when open

3. **Efficient Updates:**
   - Zustand selector prevents unnecessary rerenders
   - Popover content only renders when opened

## Future Enhancements

Consider:

- 🔮 **File grouping** by directory in popover
- 🔮 **Keyboard shortcuts** displayed in footer
- 🔮 **Undo last action** button
- 🔮 **Drag to reorder** files in modal
- 🔮 **Save review session** for later
- 🔮 **Export diff** functionality
- 🔮 **Conflict resolution** indicators

## Related Documentation

- [Performance Optimizations](./PERFORMANCE_OPTIMIZATIONS.md) - Memoization strategies
- [State Management](./EXECUTIVE_SUMMARY_STATE_MANAGEMENT.md) - Zustand patterns
- [PatternFly Chatbot Footer](https://www.patternfly.org/patternfly-ai/chatbot/chatbot-footer) - Design patterns
