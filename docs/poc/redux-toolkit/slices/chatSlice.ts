/**
 * Chat Slice POC
 *
 * Manages: chatMessages, streaming state
 *
 * ✅ BENEFITS:
 * - Chat messages in separate slice = updates don't affect other UI
 * - Can limit message history without affecting analysis data
 * - Streaming handled efficiently with batched updates
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { ChatMessage } from '@editor-extensions/shared';
import type { RootState } from '../store';

const MAX_CHAT_MESSAGES = 200; // Match your current limit

interface ChatState {
  messages: ChatMessage[];
  streamingMessageId: string | null;
  streamingContent: string;
}

const initialState: ChatState = {
  messages: [],
  streamingMessageId: null,
  streamingContent: '',
};

export const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    // ✅ BENEFIT: Full replacement when needed
    setChatMessages: (state, action: PayloadAction<ChatMessage[]>) => {
      // Automatically limit to prevent memory issues
      state.messages = action.payload.slice(-MAX_CHAT_MESSAGES);
    },

    // ✅ BENEFIT: Efficient append without full state clone
    addChatMessage: (state, action: PayloadAction<ChatMessage>) => {
      state.messages.push(action.payload);

      // Auto-trim if exceeded limit
      if (state.messages.length > MAX_CHAT_MESSAGES) {
        state.messages = state.messages.slice(-MAX_CHAT_MESSAGES);
        console.warn(
          `Chat messages exceeded limit. Keeping last ${MAX_CHAT_MESSAGES} messages.`
        );
      }
    },

    // ✅ BENEFIT: Streaming handled in reducer, batched by React
    appendStreamingChunk: (
      state,
      action: PayloadAction<{ messageId: string; chunk: string }>
    ) => {
      const { messageId, chunk } = action.payload;

      if (state.streamingMessageId !== messageId) {
        // New streaming message
        state.streamingMessageId = messageId;
        state.streamingContent = chunk;
      } else {
        // Append to existing stream
        state.streamingContent += chunk;
      }
      // React batches these updates automatically = smooth UI
    },

    // Commit streaming content to actual message
    finalizeStreamingMessage: (state) => {
      if (!state.streamingMessageId) return;

      const messageIndex = state.messages.findIndex(
        (m) => m.messageToken === state.streamingMessageId
      );

      if (messageIndex !== -1) {
        const message = state.messages[messageIndex];
        if (typeof message.value === 'object' && 'message' in message.value) {
          message.value.message = state.streamingContent;
          message.timestamp = new Date().toISOString();
        }
      }

      // Clear streaming state
      state.streamingMessageId = null;
      state.streamingContent = '';
    },

    updateChatMessage: (
      state,
      action: PayloadAction<{ messageToken: string; updates: Partial<ChatMessage> }>
    ) => {
      const { messageToken, updates } = action.payload;
      const message = state.messages.find((m) => m.messageToken === messageToken);
      if (message) {
        Object.assign(message, updates);
      }
    },

    clearChatMessages: (state) => {
      state.messages = [];
      state.streamingMessageId = null;
      state.streamingContent = '';
    },
  },
});

// Selectors
export const selectChatMessages = (state: RootState) => state.chat.messages;
export const selectStreamingState = (state: RootState) => ({
  messageId: state.chat.streamingMessageId,
  content: state.chat.streamingContent,
});

export const { actions, reducer } = chatSlice;
export const {
  setChatMessages,
  addChatMessage,
  appendStreamingChunk,
  finalizeStreamingMessage,
  updateChatMessage,
  clearChatMessages,
} = actions;

export default reducer;
