import { MessageTypes } from "@editor-extensions/shared";
import type { ExtensionStoreState } from "./extensionStore";

/**
 * Slice selector functions.
 *
 * Each selector projects the store state into the exact shape expected by
 * the corresponding message type. The SyncBridge watches these selectors
 * and sends a message only when the selected value changes.
 */

export const selectAnalysisState = (state: ExtensionStoreState) => ({
  ruleSets: state.ruleSets,
  enhancedIncidents: state.enhancedIncidents,
  isAnalyzing: state.isAnalyzing,
  isAnalysisScheduled: state.isAnalysisScheduled,
  analysisProgress: state.analysisProgress,
  analysisProgressMessage: state.analysisProgressMessage,
});

export const selectChatMessages = (state: ExtensionStoreState) => ({
  chatMessages: state.chatMessages,
});

export const selectSolutionWorkflow = (state: ExtensionStoreState) => ({
  isFetchingSolution: state.isFetchingSolution,
  solutionState: state.solutionState,
  solutionScope: state.solutionScope,
  isWaitingForUserInteraction: state.isWaitingForUserInteraction,
  isProcessingQueuedMessages: state.isProcessingQueuedMessages,
  pendingBatchReview: state.pendingBatchReview,
});

export const selectServerState = (state: ExtensionStoreState) => ({
  serverState: state.serverState,
  isStartingServer: state.isStartingServer,
  isInitializingServer: state.isInitializingServer,
  solutionServerConnected: state.solutionServerConnected,
  profileSyncConnected: state.profileSyncConnected,
  llmProxyAvailable: state.llmProxyAvailable,
});

export const selectProfiles = (state: ExtensionStoreState) => ({
  profiles: state.profiles,
  activeProfileId: state.activeProfileId,
  isInTreeMode: state.isInTreeMode,
});

export const selectConfigErrors = (state: ExtensionStoreState) => ({
  configErrors: state.configErrors,
});

export const selectDecorators = (state: ExtensionStoreState) => ({
  activeDecorators: state.activeDecorators,
});

export const selectSettings = (state: ExtensionStoreState) => ({
  solutionServerEnabled: state.solutionServerEnabled,
  isAgentMode: state.isAgentMode,
  isContinueInstalled: state.isContinueInstalled,
  hubConfig: state.hubConfig,
  hubForced: state.hubForced,
  profileSyncEnabled: state.profileSyncEnabled,
  isSyncingProfiles: state.isSyncingProfiles,
  llmProxyAvailable: state.llmProxyAvailable,
});

/**
 * Slice binding definition for the SyncBridge.
 */
export interface SliceBinding<TSlice = unknown> {
  name: string;
  selector: (state: ExtensionStoreState) => TSlice;
  command: string;
}

/**
 * Create the default set of slice bindings that map each selector
 * to its corresponding MessageType constant.
 */
export function createDefaultBindings(): SliceBinding[] {
  return [
    {
      name: "analysis",
      selector: selectAnalysisState,
      command: MessageTypes.ANALYSIS_STATE_UPDATE,
    },
    {
      name: "chat",
      selector: selectChatMessages,
      command: MessageTypes.CHAT_MESSAGES_UPDATE,
    },
    {
      name: "solution",
      selector: selectSolutionWorkflow,
      command: MessageTypes.SOLUTION_WORKFLOW_UPDATE,
    },
    {
      name: "server",
      selector: selectServerState,
      command: MessageTypes.SERVER_STATE_UPDATE,
    },
    {
      name: "profiles",
      selector: selectProfiles,
      command: MessageTypes.PROFILES_UPDATE,
    },
    {
      name: "config",
      selector: selectConfigErrors,
      command: MessageTypes.CONFIG_ERRORS_UPDATE,
    },
    {
      name: "decorators",
      selector: selectDecorators,
      command: MessageTypes.DECORATORS_UPDATE,
    },
    {
      name: "settings",
      selector: selectSettings,
      command: MessageTypes.SETTINGS_UPDATE,
    },
  ];
}
