/**
 * Config Slice POC
 *
 * Manages: configuration, errors, solution server settings
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { ConfigError, SolutionState } from '@editor-extensions/shared';
import type { RootState } from '../store';

interface ConfigState {
  workspaceRoot: string;
  configErrors: ConfigError[];
  solutionState: SolutionState;
  solutionServerEnabled: boolean;
  solutionServerConnected: boolean;
  isAgentMode: boolean;
  isContinueInstalled: boolean;
}

const initialState: ConfigState = {
  workspaceRoot: '/',
  configErrors: [],
  solutionState: 'none',
  solutionServerEnabled: false,
  solutionServerConnected: false,
  isAgentMode: false,
  isContinueInstalled: false,
};

export const configSlice = createSlice({
  name: 'config',
  initialState,
  reducers: {
    setWorkspaceRoot: (state, action: PayloadAction<string>) => {
      state.workspaceRoot = action.payload;
    },
    setConfigErrors: (state, action: PayloadAction<ConfigError[]>) => {
      state.configErrors = action.payload;
    },
    addConfigError: (state, action: PayloadAction<ConfigError>) => {
      state.configErrors.push(action.payload);
    },
    removeConfigError: (state, action: PayloadAction<string>) => {
      state.configErrors = state.configErrors.filter((e) => e.type !== action.payload);
    },
    setSolutionState: (state, action: PayloadAction<SolutionState>) => {
      state.solutionState = action.payload;
    },
    setSolutionServerEnabled: (state, action: PayloadAction<boolean>) => {
      state.solutionServerEnabled = action.payload;
    },
    setSolutionServerConnected: (state, action: PayloadAction<boolean>) => {
      state.solutionServerConnected = action.payload;
    },
    setIsAgentMode: (state, action: PayloadAction<boolean>) => {
      state.isAgentMode = action.payload;
    },
    setIsContinueInstalled: (state, action: PayloadAction<boolean>) => {
      state.isContinueInstalled = action.payload;
    },
  },
});

// Selectors
export const selectWorkspaceRoot = (state: RootState) => state.config.workspaceRoot;
export const selectConfigErrors = (state: RootState) => state.config.configErrors;
export const selectSolutionState = (state: RootState) => state.config.solutionState;
export const selectIsAgentMode = (state: RootState) => state.config.isAgentMode;

export const { actions, reducer } = configSlice;
export const {
  setWorkspaceRoot,
  setConfigErrors,
  addConfigError,
  removeConfigError,
  setSolutionState,
  setSolutionServerEnabled,
  setSolutionServerConnected,
  setIsAgentMode,
  setIsContinueInstalled,
} = actions;

export default reducer;
