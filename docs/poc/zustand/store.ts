/**
 * Zustand Store POC
 *
 * ✅ BENEFITS over Redux Toolkit:
 * - Much simpler API
 * - No boilerplate (no slices, actions, reducers)
 * - Still has selector-based subscriptions
 * - Smaller bundle size (~1KB)
 * - Can optionally use Immer middleware
 *
 * ✅ BENEFITS over current Context approach:
 * - Selective subscriptions (no unnecessary re-renders)
 * - Better performance
 * - Can still use Immer but in a smarter way
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type {
  RuleSet,
  EnhancedIncident,
  ChatMessage,
  AnalysisProfile,
  ConfigError,
  ServerState,
  SolutionState,
} from '@editor-extensions/shared';

const MAX_CHAT_MESSAGES = 200;

// ✅ BENEFIT: Single interface for entire state (simpler than Redux slices)
interface ExtensionStore {
  // Analysis state
  ruleSets: RuleSet[];
  enhancedIncidents: EnhancedIncident[];
  profiles: AnalysisProfile[];
  activeProfileId: string | null;
  isAnalyzing: boolean;
  isAnalysisScheduled: boolean;
  serverState: ServerState;

  // Chat state
  chatMessages: ChatMessage[];
  streamingMessageId: string | null;
  streamingContent: string;

  // UI state
  isFetchingSolution: boolean;
  isStartingServer: boolean;
  isInitializingServer: boolean;
  isWaitingForUserInteraction: boolean;
  isProcessingQueuedMessages: boolean;
  activeDecorators: Record<string, string>;

  // Config state
  workspaceRoot: string;
  configErrors: ConfigError[];
  solutionState: SolutionState;
  solutionServerEnabled: boolean;
  solutionServerConnected: boolean;
  isAgentMode: boolean;
  isContinueInstalled: boolean;

  // ✅ BENEFIT: Actions are just methods on the store
  // No need for separate action creators like Redux
  setRuleSets: (ruleSets: RuleSet[]) => void;
  setEnhancedIncidents: (incidents: EnhancedIncident[]) => void;
  setIsAnalyzing: (isAnalyzing: boolean) => void;
  setServerState: (state: ServerState) => void;

  addChatMessage: (message: ChatMessage) => void;
  appendStreamingChunk: (messageId: string, chunk: string) => void;
  finalizeStreamingMessage: () => void;
  clearChatMessages: () => void;

  setIsFetchingSolution: (isFetching: boolean) => void;
  setActiveDecorators: (decorators: Record<string, string>) => void;

  setConfigErrors: (errors: ConfigError[]) => void;
  setIsAgentMode: (isAgentMode: boolean) => void;

  // Utility
  clearAnalysisData: () => void;
}

/**
 * ✅ BENEFIT: Create store with middleware stack
 * - immer: Safe mutations (optional, can remove for max performance)
 * - devtools: Redux DevTools integration
 * - persist: Persist to localStorage
 */
export const useExtensionStore = create<ExtensionStore>()(
  devtools(
    persist(
      immer((set) => ({
        // Initial state
        ruleSets: [],
        enhancedIncidents: [],
        profiles: [],
        activeProfileId: null,
        isAnalyzing: false,
        isAnalysisScheduled: false,
        serverState: 'initial',
        chatMessages: [],
        streamingMessageId: null,
        streamingContent: '',
        isFetchingSolution: false,
        isStartingServer: false,
        isInitializingServer: false,
        isWaitingForUserInteraction: false,
        isProcessingQueuedMessages: false,
        activeDecorators: {},
        workspaceRoot: '/',
        configErrors: [],
        solutionState: 'none',
        solutionServerEnabled: false,
        solutionServerConnected: false,
        isAgentMode: false,
        isContinueInstalled: false,

        // ✅ BENEFIT: Actions are simple functions
        // With Immer middleware, you can write mutable code
        setRuleSets: (ruleSets) =>
          set((state) => {
            state.ruleSets = ruleSets;
          }),

        setEnhancedIncidents: (incidents) =>
          set((state) => {
            state.enhancedIncidents = incidents;
          }),

        setIsAnalyzing: (isAnalyzing) =>
          set((state) => {
            state.isAnalyzing = isAnalyzing;
          }),

        setServerState: (serverState) =>
          set((state) => {
            state.serverState = serverState;
          }),

        // ✅ BENEFIT: Complex logic in actions
        addChatMessage: (message) =>
          set((state) => {
            state.chatMessages.push(message);

            // Auto-limit messages
            if (state.chatMessages.length > MAX_CHAT_MESSAGES) {
              state.chatMessages = state.chatMessages.slice(-MAX_CHAT_MESSAGES);
              console.warn(`Keeping last ${MAX_CHAT_MESSAGES} messages`);
            }
          }),

        appendStreamingChunk: (messageId, chunk) =>
          set((state) => {
            if (state.streamingMessageId !== messageId) {
              state.streamingMessageId = messageId;
              state.streamingContent = chunk;
            } else {
              state.streamingContent += chunk;
            }
          }),

        finalizeStreamingMessage: () =>
          set((state) => {
            if (!state.streamingMessageId) return;

            const message = state.chatMessages.find(
              (m) => m.messageToken === state.streamingMessageId
            );

            if (message && typeof message.value === 'object' && 'message' in message.value) {
              message.value.message = state.streamingContent;
              message.timestamp = new Date().toISOString();
            }

            state.streamingMessageId = null;
            state.streamingContent = '';
          }),

        clearChatMessages: () =>
          set((state) => {
            state.chatMessages = [];
            state.streamingMessageId = null;
            state.streamingContent = '';
          }),

        setIsFetchingSolution: (isFetching) =>
          set((state) => {
            state.isFetchingSolution = isFetching;
          }),

        setActiveDecorators: (decorators) =>
          set((state) => {
            state.activeDecorators = decorators;
          }),

        setConfigErrors: (errors) =>
          set((state) => {
            state.configErrors = errors;
          }),

        setIsAgentMode: (isAgentMode) =>
          set((state) => {
            state.isAgentMode = isAgentMode;
          }),

        clearAnalysisData: () =>
          set((state) => {
            state.ruleSets = [];
            state.enhancedIncidents = [];
          }),
      })),
      {
        name: 'konveyor-storage',
        // ✅ Only persist specific fields
        partialize: (state) => ({
          activeProfileId: state.activeProfileId,
          profiles: state.profiles,
          isAgentMode: state.isAgentMode,
          solutionServerEnabled: state.solutionServerEnabled,
          // NOT persisting large arrays like ruleSets or enhancedIncidents
        }),
      }
    )
  )
);

/**
 * ✅ BENEFIT: Can create derived selectors (like Redux)
 * But without the boilerplate
 */
export const selectIncidentCount = (state: ExtensionStore) => state.enhancedIncidents.length;

export const selectIncidentsByFile = (state: ExtensionStore) => {
  const byFile = new Map<string, EnhancedIncident[]>();
  state.enhancedIncidents.forEach((incident) => {
    const uri = incident.uri;
    if (!byFile.has(uri)) {
      byFile.set(uri, []);
    }
    byFile.get(uri)!.push(incident);
  });
  return byFile;
};

export const selectIsLoading = (state: ExtensionStore) =>
  state.isAnalyzing ||
  state.isFetchingSolution ||
  state.isStartingServer ||
  state.isInitializingServer;
