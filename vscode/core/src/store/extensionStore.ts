import { createStore, type StoreApi } from "zustand/vanilla";
import { immer } from "zustand/middleware/immer";
import type { ExtensionData } from "@editor-extensions/shared";

/**
 * Extension store state: all ExtensionData fields + update actions.
 *
 * The store is flat (not nested slices) to preserve compatibility with
 * the existing ExtensionData interface. Actions use Immer drafts internally
 * and only update state — they do NOT send messages to webviews. Message
 * delivery is handled by the SyncBridge (see syncBridge.ts).
 */
export interface ExtensionStoreState extends ExtensionData {
  updateAnalysis: (recipe: (draft: ExtensionStoreState) => void) => void;
  updateChat: (recipe: (draft: ExtensionStoreState) => void) => void;
  updateSolution: (recipe: (draft: ExtensionStoreState) => void) => void;
  updateServer: (recipe: (draft: ExtensionStoreState) => void) => void;
  updateProfiles: (recipe: (draft: ExtensionStoreState) => void) => void;
  updateConfig: (recipe: (draft: ExtensionStoreState) => void) => void;
  updateDecorators: (recipe: (draft: ExtensionStoreState) => void) => void;
  updateSettings: (recipe: (draft: ExtensionStoreState) => void) => void;
}

/**
 * Default initial state matching the current extension.ts defaults.
 * Pass overrides via the `initialState` parameter of `createExtensionStore()`.
 */
export const DEFAULT_STATE: ExtensionData = {
  workspaceRoot: "",
  ruleSets: [],
  enhancedIncidents: [],
  isAnalyzing: false,
  analysisProgress: 0,
  analysisProgressMessage: "",
  isFetchingSolution: false,
  isStartingServer: false,
  isInitializingServer: false,
  isAnalysisScheduled: false,
  isContinueInstalled: false,
  serverState: "initial",
  solutionScope: undefined,
  chatMessages: [],
  solutionState: "none",
  solutionServerEnabled: false,
  configErrors: [],
  llmErrors: [],
  activeProfileId: "",
  profiles: [],
  isInTreeMode: false,
  isAgentMode: false,
  activeDecorators: {},
  solutionServerConnected: false,
  isWaitingForUserInteraction: false,
  hubConfig: undefined,
  hubForced: false,
  isProcessingQueuedMessages: false,
  profileSyncEnabled: false,
  profileSyncConnected: false,
  isSyncingProfiles: false,
  llmProxyAvailable: false,
  isWebEnvironment: false,
};

/**
 * Create a Zustand vanilla store for extension state.
 *
 * @param initialState - Optional partial state overrides (merged with DEFAULT_STATE)
 * @returns StoreApi for the extension store
 */
export function createExtensionStore(
  initialState?: Partial<ExtensionData>,
): StoreApi<ExtensionStoreState> {
  const state: ExtensionData = { ...DEFAULT_STATE, ...initialState };

  return createStore<ExtensionStoreState>()(
    immer((set) => ({
      ...state,

      updateAnalysis: (recipe) => set(recipe),
      updateChat: (recipe) => set(recipe),
      updateSolution: (recipe) => set(recipe),
      updateServer: (recipe) => set(recipe),
      updateProfiles: (recipe) => set(recipe),
      updateConfig: (recipe) => set(recipe),
      updateDecorators: (recipe) => set(recipe),
      updateSettings: (recipe) => set(recipe),
    })),
  );
}

export type ExtensionStore = StoreApi<ExtensionStoreState>;
