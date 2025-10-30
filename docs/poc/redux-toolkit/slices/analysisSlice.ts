/**
 * Analysis Slice POC
 *
 * Manages: ruleSets, enhancedIncidents, profiles, analysis state
 *
 * ✅ BENEFITS:
 * - Redux Toolkit uses Immer internally but with structural sharing
 * - Only changed parts of state get new references
 * - Components using selectors only re-render when their selected data changes
 */

import { createSlice, createSelector, PayloadAction } from '@reduxjs/toolkit';
import type {
  RuleSet,
  EnhancedIncident,
  AnalysisProfile,
  ServerState,
} from '@editor-extensions/shared';
import type { RootState } from '../store';

interface AnalysisState {
  ruleSets: RuleSet[];
  enhancedIncidents: EnhancedIncident[];
  profiles: AnalysisProfile[];
  activeProfileId: string | null;
  isAnalyzing: boolean;
  isAnalysisScheduled: boolean;
  serverState: ServerState;
}

const initialState: AnalysisState = {
  ruleSets: [],
  enhancedIncidents: [],
  profiles: [],
  activeProfileId: null,
  isAnalyzing: false,
  isAnalysisScheduled: false,
  serverState: 'initial',
};

export const analysisSlice = createSlice({
  name: 'analysis',
  initialState,
  reducers: {
    // ✅ BENEFIT: Redux Toolkit uses Immer internally, but with structural sharing
    // Unchanged parts of state keep the same reference → no unnecessary re-renders
    setRuleSets: (state, action: PayloadAction<RuleSet[]>) => {
      state.ruleSets = action.payload;
      // Internally, Redux Toolkit:
      // 1. Uses Immer to create draft
      // 2. Only creates new objects for changed paths
      // 3. Keeps unchanged objects with same reference
    },

    setEnhancedIncidents: (state, action: PayloadAction<EnhancedIncident[]>) => {
      state.enhancedIncidents = action.payload;
    },

    // ✅ BENEFIT: Can update just one field without cloning entire state
    setIsAnalyzing: (state, action: PayloadAction<boolean>) => {
      state.isAnalyzing = action.payload;
      // Only the `isAnalyzing` field gets a new reference
      // ruleSets, enhancedIncidents, etc. keep their old references
    },

    setServerState: (state, action: PayloadAction<ServerState>) => {
      state.serverState = action.payload;
    },

    // ✅ BENEFIT: Complex mutations are easy and safe
    addRuleSet: (state, action: PayloadAction<RuleSet>) => {
      state.ruleSets.push(action.payload);
      // Immer handles the immutability - you write mutable code
    },

    updateIncident: (
      state,
      action: PayloadAction<{ violationId: string; updates: Partial<EnhancedIncident> }>
    ) => {
      const { violationId, updates } = action.payload;
      const incident = state.enhancedIncidents.find((i) => i.violationId === violationId);
      if (incident) {
        Object.assign(incident, updates);
        // Immer detects the change and creates a new array with structural sharing
      }
    },

    setProfiles: (state, action: PayloadAction<AnalysisProfile[]>) => {
      state.profiles = action.payload;
    },

    setActiveProfileId: (state, action: PayloadAction<string | null>) => {
      state.activeProfileId = action.payload;
    },

    // Clear large arrays when needed
    clearAnalysisData: (state) => {
      state.ruleSets = [];
      state.enhancedIncidents = [];
    },
  },
});

// ✅ BENEFIT: Memoized selectors - only recompute when dependencies change
export const selectRuleSets = (state: RootState) => state.analysis.ruleSets;
export const selectEnhancedIncidents = (state: RootState) => state.analysis.enhancedIncidents;
export const selectIsAnalyzing = (state: RootState) => state.analysis.isAnalyzing;
export const selectServerState = (state: RootState) => state.analysis.serverState;

// ✅ BENEFIT: Computed selectors with automatic memoization
export const selectIncidentsByFile = createSelector(
  [selectEnhancedIncidents],
  (incidents) => {
    // This expensive computation only runs when incidents array reference changes
    const byFile = new Map<string, EnhancedIncident[]>();
    incidents.forEach((incident) => {
      const uri = incident.uri;
      if (!byFile.has(uri)) {
        byFile.set(uri, []);
      }
      byFile.get(uri)!.push(incident);
    });
    return byFile;
  }
);

export const selectIncidentCount = createSelector(
  [selectEnhancedIncidents],
  (incidents) => incidents.length
);

export const { actions, reducer } = analysisSlice;
export const {
  setRuleSets,
  setEnhancedIncidents,
  setIsAnalyzing,
  setServerState,
  addRuleSet,
  updateIncident,
  setProfiles,
  setActiveProfileId,
  clearAnalysisData,
} = actions;

export default reducer;
