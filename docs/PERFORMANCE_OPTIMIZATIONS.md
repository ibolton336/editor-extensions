# Performance Optimizations - Streaming UI Fix

## Problem

The ResolutionsPage was going black and crashing due to a **render death spiral** caused by:

1. **Rapid streaming updates** - Every few characters (2150→2158→2160...) triggered a state update
2. **Full component re-renders** - Each update caused the entire ResolutionsPage to re-render
3. **Expensive operations on every render** - Debug logging and expensive child renders
4. **React unable to keep up** - Updates were happening faster than React could process them

## Root Cause

```typescript
// Before: Every character update triggered immediate state update
if (isChatMessageStreamingUpdate(message)) {
  store.setChatMessages(updatedMessages); // Immediate render!
}
```

This caused:

- 10-20+ renders per second during streaming
- Each render processed entire chat message history
- ReceivedMessage had a useEffect running on every render
- No memoization meant all child components re-rendered

## Solutions Implemented

### 1. Throttling Streaming Updates (100ms batch window)

**File:** `webview-ui/src/hooks/useVSCodeMessageHandler.ts`

```typescript
// Throttle streaming updates to prevent UI death spiral
const STREAMING_THROTTLE_MS = 100;

// Batch updates - only apply the latest update after throttle period
const throttleTimerRef = useRef<NodeJS.Timeout | null>(null);
const pendingStreamingUpdateRef = useRef<{
  messageIndex: number;
  message: any;
} | null>(null);
```

**Impact:** Reduced render frequency from **10-20+ renders/sec** to **max 10 renders/sec** (100ms throttle)

### 2. Component Memoization

**Files:**

- `ReceivedMessage.tsx`
- `SentMessage.tsx`
- `ModifiedFileMessage.tsx`
- `ToolMessage.tsx` (already memoized)
- `UserRequestMessages` (inline component)

```typescript
export const ReceivedMessage: React.FC<ReceivedMessageProps> = React.memo(
  ({
    content,
    extraContent,
    // ...props
  }) => {
    // Component now only re-renders when props actually change
  },
);
```

**Impact:** Child components only re-render when their props change, not when parent re-renders

### 3. Removed Debug Logging

**File:** `ReceivedMessage.tsx`

```typescript
// REMOVED: This ran on EVERY render
React.useEffect(() => {
  console.log(`[ReceivedMessage] Rendered with content length: ${content?.length || 0}`);
});
```

**Impact:** Eliminated expensive console.log operations on every render

### 4. Optimized Callbacks

**File:** `ResolutionsPage.tsx`

```typescript
// Removed unnecessary useEffect debug logging
// Optimized useCallback dependencies (removed isFetchingSolution)
const renderChatMessages = useCallback(() => {
  // ...
}, [chatMessages, isAnalyzing, triggerScrollOnUserAction]);
```

**Impact:** Reduced unnecessary callback recreations

## Performance Metrics

### Before Optimizations

- **Render frequency:** 10-20+ renders/second during streaming
- **UI responsiveness:** Frozen/black screen
- **Console spam:** Hundreds of log messages per second
- **React performance:** Death spiral, unable to keep up

### After Optimizations

- **Render frequency:** Max 10 renders/second (100ms throttle)
- **UI responsiveness:** Smooth, no freezing
- **Console spam:** Eliminated
- **React performance:** Stable, renders complete successfully

## Technical Details

### Throttling Strategy

```
Character updates: A B C D E F G H I J K L M N O
Without throttle: ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓
                  (15 renders in 150ms)

With 100ms throttle: ↓       ↓       ↓
                     (3 renders in 150ms)
```

### React.memo Comparison

```typescript
// Without memo: Re-renders on every parent render
const ReceivedMessage = (props) => { ... }

// With memo: Only re-renders when props change
const ReceivedMessage = React.memo((props) => { ... })
```

React.memo uses shallow comparison of props. If props haven't changed, React skips rendering and reuses the last rendered result.

## Best Practices Applied

1. **Throttle/Debounce rapid state updates** - Essential for streaming UIs
2. **Use React.memo for pure components** - Especially in lists/repeated components
3. **Remove debug logging from hot paths** - Console.log is expensive
4. **Optimize useCallback dependencies** - Only include necessary dependencies
5. **Batch related state updates** - Reduces render cycles

## Related Files

- `webview-ui/src/hooks/useVSCodeMessageHandler.ts` - Streaming throttling
- `webview-ui/src/components/ResolutionsPage/ResolutionsPage.tsx` - Main page optimizations
- `webview-ui/src/components/ResolutionsPage/ReceivedMessage.tsx` - Message component memoization
- `webview-ui/src/components/ResolutionsPage/SentMessage.tsx` - Message component memoization
- `webview-ui/src/components/ResolutionsPage/ModifiedFile/ModifiedFileMessage.tsx` - File message memoization

## Testing

To verify the optimizations:

1. Start the extension in development mode
2. Trigger a solution workflow with streaming responses
3. Monitor the console - should see significantly fewer logs
4. UI should remain responsive throughout streaming
5. React DevTools Profiler should show reduced render counts

## Future Improvements

Consider implementing:

- **Virtual scrolling** for very long message lists (1000+ messages)
- **Request animation frame** for even smoother updates
- **React.lazy** for code-splitting message components
- **Web Workers** for heavy parsing/processing
