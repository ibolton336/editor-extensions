---
name: patternfly-chatbot
description: Build chat UI with PatternFly Chatbot components. Use when working on the ResolutionsPage, adding chat messages, Message, Chatbot, ChatbotContent, ChatbotFooter, ChatbotFootnote, MessageBox, quick responses, tool messages, modified file messages, or scroll management.
---

# PatternFly Chatbot (webview-ui)

Use this skill when building or extending the **chat-based resolution UI** in the webview, which uses the [PatternFly Chatbot](https://github.com/patternfly/chatbot) extension library (`@patternfly/chatbot`). Docs: [PatternFly Chatbot docs](https://pf-virt-assist.surge.sh/).

## Package and CSS

**Dependency**: `@patternfly/chatbot` (version `^6.3.0` in [webview-ui/package.json](webview-ui/package.json)).

**CSS import order** (must be last in [webview-ui/src/index.tsx](webview-ui/src/index.tsx)):

```typescript
import "@patternfly/patternfly/patternfly.css";
import "@patternfly/chatbot/dist/css/main.css"; // must come after patternfly core
import "@patternfly/react-core/dist/styles/base.css";
import "./index.css";
```

The chatbot CSS overrides certain PatternFly component styles, so it must be imported after the core PatternFly CSS and before any local overrides.

## Layout components

The chat UI lives in [ResolutionsPage.tsx](webview-ui/src/components/ResolutionsPage/ResolutionsPage.tsx). The component tree:

```
<Chatbot displayMode={ChatbotDisplayMode.embedded}>
  <ChatbotContent>
    <MessageBox ref={messageBoxRef}>
      {/* UserRequestMessages (SentMessage) */}
      {/* AI responses (ReceivedMessage) */}
      {/* ToolMessage, ModifiedFileMessage, etc. */}
    </MessageBox>
  </ChatbotContent>
  <ChatbotFooter>
    <BatchReviewExpandable />
    <ChatbotFootnote label="..." popover={{ title: "...", description: "..." }} />
  </ChatbotFooter>
</Chatbot>
```

| Component         | From                  | Purpose                                                                           |
| ----------------- | --------------------- | --------------------------------------------------------------------------------- |
| `Chatbot`         | `@patternfly/chatbot` | Root container; `displayMode={ChatbotDisplayMode.embedded}` for sidebar/panel use |
| `ChatbotContent`  | `@patternfly/chatbot` | Scrollable message area wrapper                                                   |
| `MessageBox`      | `@patternfly/chatbot` | Wraps messages; accepts a `ref` (`MessageBoxHandle`) for scroll control           |
| `ChatbotFooter`   | `@patternfly/chatbot` | Sticky footer area                                                                |
| `ChatbotFootnote` | `@patternfly/chatbot` | AI disclaimer with popover                                                        |

## Message components

### SentMessage (user)

[SentMessage.tsx](webview-ui/src/components/ResolutionsPage/SentMessage.tsx) wraps the PatternFly `Message` component:

```tsx
<Message
  name="User"
  role="user"
  avatar={userAv}
  content={content}
  timestamp={formatTimestamp(timestamp)}
  extraContent={extraContent ? { afterMainContent: extraContent } : undefined}
/>
```

- `role="user"` renders the message on the right (sent style).
- `extraContent.afterMainContent` renders arbitrary React below the message text (e.g. incident tables).

### ReceivedMessage (bot)

[ReceivedMessage.tsx](webview-ui/src/components/ResolutionsPage/ReceivedMessage.tsx) wraps `Message` with:

- `role="bot"` (left-aligned, bot style).
- **Markdown rendering** via `additionalRehypePlugins={[rehypeRaw, rehypeSanitize]}`.
- **Quick responses**: Pass `quickResponses` array; each item gets an `onClick` that posts a `QUICK_RESPONSE` message to the extension. Selected state is tracked locally and restored from persistence.

### ToolMessage (custom)

[ToolMessage.tsx](webview-ui/src/components/ResolutionsPage/ToolMessage.tsx) is a **custom** component (not from `@patternfly/chatbot`). Shows tool execution status:

- Human-readable tool name mapping (`writeFile` -> "Suggesting file changes", etc.).
- Icon selection based on tool category (file, search, code, git, build, package, database).
- Status: `succeeded` (green check), `failed` (red X, expandable error details), `running` (sync spinner).

### ModifiedFileMessage (custom)

[ModifiedFileMessage.tsx](webview-ui/src/components/ResolutionsPage/ModifiedFile/ModifiedFileMessage.tsx) shows a read-only diff preview of proposed file changes. User accept/reject actions are in `BatchReviewExpandable` (footer), not per-message.

## Chat message types and rendering

Messages come from the Zustand store (`chatMessages`). Each has a `kind` from `ChatMessageType`:

| Kind                           | Component             | Data                                              |
| ------------------------------ | --------------------- | ------------------------------------------------- |
| `ChatMessageType.String`       | `ReceivedMessage`     | `{ message: string }` + optional `quickResponses` |
| `ChatMessageType.Tool`         | `ToolMessage`         | `{ toolName, toolStatus }`                        |
| `ChatMessageType.ModifiedFile` | `ModifiedFileMessage` | `ModifiedFileMessageValue` (path, diff, isNew)    |

All messages are wrapped in `MessageWrapper` for consistent spacing. Rendering logic is in `renderChatMessages()` in ResolutionsPage.

## Scroll management

[useScrollManagement.ts](webview-ui/src/hooks/useScrollManagement.ts) handles auto-scroll:

- Uses `MessageBoxHandle` ref from `@patternfly/chatbot` `MessageBox`.
- Finds the scrollable container via PatternFly class selectors (`.pf-chatbot__messagebox`, etc.).
- Auto-scrolls to bottom on new messages unless the user has manually scrolled up.
- More aggressive scrolling during `isFetchingSolution` (polling every 1s).
- Handles layout changes (content height changes from expanding components).

## Adding a new message type to the chat

1. Add the type to `ChatMessageType` in [shared/src/types/types.ts](shared/src/types/types.ts).
2. Create a new component in `webview-ui/src/components/ResolutionsPage/`.
3. Add a rendering branch in `renderChatMessages()` in ResolutionsPage.
4. Wrap in `<MessageWrapper>` for consistent layout.
5. If the message needs data from the extension, define a message value interface in shared types and build `@shared`.

## Adding a new chatbot feature

When implementing new chatbot features (e.g. attachments, file upload, feedback, sources):

- Check [PatternFly Chatbot docs](https://pf-virt-assist.surge.sh/) and the [GitHub repo](https://github.com/patternfly/chatbot) for available components.
- Import from `@patternfly/chatbot` (e.g. `ChatbotAlert`, `SourcesCard`, `FileDropZone`).
- Follow PatternFly naming conventions for props and CSS classes.
- Use CSS custom properties (`--pf-chatbot-*`) for theming; the webview uses `pf-v6-theme-dark` by default but must work in all VS Code themes.
- Custom CSS should use camelCase class names scoped to the component (e.g. `.toolMessageContainer`).

## Key file locations

| File                                                            | Purpose                                                    |
| --------------------------------------------------------------- | ---------------------------------------------------------- |
| `webview-ui/src/components/ResolutionsPage/ResolutionsPage.tsx` | Main chat page (layout + message rendering)                |
| `webview-ui/src/components/ResolutionsPage/SentMessage.tsx`     | User messages                                              |
| `webview-ui/src/components/ResolutionsPage/ReceivedMessage.tsx` | Bot messages (markdown, quick responses)                   |
| `webview-ui/src/components/ResolutionsPage/ToolMessage.tsx`     | Tool execution status                                      |
| `webview-ui/src/components/ResolutionsPage/ModifiedFile/`       | File change display + diff preview                         |
| `webview-ui/src/components/ResolutionsPage/BatchReview/`        | Batch accept/reject of accumulated file changes            |
| `webview-ui/src/components/ResolutionsPage/ChatCard/`           | Styled card wrapper for chat content                       |
| `webview-ui/src/hooks/useScrollManagement.ts`                   | Auto-scroll logic for MessageBox                           |
| `shared/src/types/types.ts`                                     | `ChatMessageType`, `ChatMessage`, message value interfaces |
