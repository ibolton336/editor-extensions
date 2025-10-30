import { useEffect } from "react";
import {
  WebviewMessage,
  isFullStateUpdate,
  isChatStreamingChunk,
  isChatMessagesUpdate,
  isAnalysisStateUpdate,
  isSolutionWorkflowUpdate,
  isServerStateUpdate,
  isProfilesUpdate,
  isConfigErrorsUpdate,
  isDecoratorsUpdate,
  isSettingsUpdate,
} from "@editor-extensions/shared";
import { useExtensionStore } from "../store/store";

// Maximum number of chat messages to keep in memory
const MAX_CHAT_MESSAGES = 2000000000000;

/**
 * Hook that handles messages from VSCode extension and syncs them to Zustand store
 *
 * Uses granular message types for selective state updates instead of full state broadcasts
 */
export function useVSCodeMessageHandler() {
  useEffect(() => {
    const handleMessage = (event: MessageEvent<WebviewMessage>) => {
      const message = event.data;
      const store = useExtensionStore.getState();

      // Handle streaming chunks
      if (isChatStreamingChunk(message)) {
        store.appendStreamingChunk(message.messageId, message.chunk);
        return;
      }

      // Handle selective chat message updates
      if (isChatMessagesUpdate(message)) {
        // Finalize any streaming
        store.finalizeStreamingMessage();

        // Limit chat messages to prevent memory issues
        const limitedMessages =
          message.chatMessages.length > MAX_CHAT_MESSAGES
            ? message.chatMessages.slice(-MAX_CHAT_MESSAGES)
            : message.chatMessages;

        if (limitedMessages.length < message.chatMessages.length) {
          console.warn(
            `Chat messages exceeded limit (${message.chatMessages.length} > ${MAX_CHAT_MESSAGES}). ` +
              `Keeping only the most recent ${MAX_CHAT_MESSAGES} messages.`,
          );
        }

        store.setChatMessages(limitedMessages);
        return;
      }

      // Handle analysis state updates
      if (isAnalysisStateUpdate(message)) {
        store.batchUpdate({
          ruleSets: message.ruleSets,
          enhancedIncidents: message.enhancedIncidents,
          isAnalyzing: message.isAnalyzing,
          isAnalysisScheduled: message.isAnalysisScheduled,
        });
        return;
      }

      // Handle solution workflow updates
      if (isSolutionWorkflowUpdate(message)) {
        store.batchUpdate({
          isFetchingSolution: message.isFetchingSolution,
          solutionState: message.solutionState,
          solutionScope: message.solutionScope,
          isWaitingForUserInteraction: message.isWaitingForUserInteraction,
          isProcessingQueuedMessages: message.isProcessingQueuedMessages,
        });
        return;
      }

      // Handle server state updates
      if (isServerStateUpdate(message)) {
        store.batchUpdate({
          serverState: message.serverState,
          isStartingServer: message.isStartingServer,
          isInitializingServer: message.isInitializingServer,
          solutionServerConnected: message.solutionServerConnected,
        });
        return;
      }

      // Handle profile updates
      if (isProfilesUpdate(message)) {
        store.batchUpdate({
          profiles: message.profiles,
          activeProfileId: message.activeProfileId,
        });
        return;
      }

      // Handle config errors updates
      if (isConfigErrorsUpdate(message)) {
        store.setConfigErrors(message.configErrors);
        return;
      }

      // Handle decorators updates
      if (isDecoratorsUpdate(message)) {
        store.setActiveDecorators(message.activeDecorators);
        return;
      }

      // Handle settings updates
      if (isSettingsUpdate(message)) {
        store.batchUpdate({
          solutionServerEnabled: message.solutionServerEnabled,
          isAgentMode: message.isAgentMode,
          isContinueInstalled: message.isContinueInstalled,
        });
        return;
      }

      // Handle full state updates (used on initial load)
      if (isFullStateUpdate(message)) {
        // Finalize any streaming
        store.finalizeStreamingMessage();

        // Batch update all state at once for efficiency
        store.batchUpdate({
          ruleSets: Array.isArray(message.ruleSets) ? message.ruleSets : [],
          enhancedIncidents: Array.isArray(message.enhancedIncidents)
            ? message.enhancedIncidents
            : [],
          isAnalyzing: message.isAnalyzing ?? false,
          isFetchingSolution: message.isFetchingSolution ?? false,
          isStartingServer: message.isStartingServer ?? false,
          isInitializingServer: message.isInitializingServer ?? false,
          isAnalysisScheduled: message.isAnalysisScheduled ?? false,
          isContinueInstalled: message.isContinueInstalled ?? false,
          serverState: message.serverState ?? "initial",
          solutionState: message.solutionState ?? "none",
          solutionScope: message.solutionScope,
          solutionServerEnabled: message.solutionServerEnabled ?? false,
          solutionServerConnected: message.solutionServerConnected ?? false,
          isAgentMode: message.isAgentMode ?? false,
          workspaceRoot: message.workspaceRoot ?? "/",
          activeProfileId: message.activeProfileId ?? null,
          isWaitingForUserInteraction: message.isWaitingForUserInteraction ?? false,
          isProcessingQueuedMessages: message.isProcessingQueuedMessages ?? false,
          activeDecorators: message.activeDecorators ?? {},
          profiles: Array.isArray(message.profiles) ? message.profiles : [],
          configErrors: Array.isArray(message.configErrors) ? message.configErrors : [],
          chatMessages:
            Array.isArray(message.chatMessages) && message.chatMessages.length > MAX_CHAT_MESSAGES
              ? message.chatMessages.slice(-MAX_CHAT_MESSAGES)
              : Array.isArray(message.chatMessages)
                ? message.chatMessages
                : [],
        });
      }
    };

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);
}
