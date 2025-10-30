/**
 * UI Slice POC
 *
 * Manages: UI state, loading indicators, decorators
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../store';

interface UiState {
  isFetchingSolution: boolean;
  isStartingServer: boolean;
  isInitializingServer: boolean;
  isWaitingForUserInteraction: boolean;
  isProcessingQueuedMessages: boolean;
  activeDecorators: Record<string, string>;
}

const initialState: UiState = {
  isFetchingSolution: false,
  isStartingServer: false,
  isInitializingServer: false,
  isWaitingForUserInteraction: false,
  isProcessingQueuedMessages: false,
  activeDecorators: {},
};

export const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setIsFetchingSolution: (state, action: PayloadAction<boolean>) => {
      state.isFetchingSolution = action.payload;
    },
    setIsStartingServer: (state, action: PayloadAction<boolean>) => {
      state.isStartingServer = action.payload;
    },
    setIsInitializingServer: (state, action: PayloadAction<boolean>) => {
      state.isInitializingServer = action.payload;
    },
    setIsWaitingForUserInteraction: (state, action: PayloadAction<boolean>) => {
      state.isWaitingForUserInteraction = action.payload;
    },
    setIsProcessingQueuedMessages: (state, action: PayloadAction<boolean>) => {
      state.isProcessingQueuedMessages = action.payload;
    },
    setActiveDecorators: (state, action: PayloadAction<Record<string, string>>) => {
      state.activeDecorators = action.payload;
    },
    updateDecorator: (state, action: PayloadAction<{ key: string; value: string }>) => {
      state.activeDecorators[action.payload.key] = action.payload.value;
    },
    removeDecorator: (state, action: PayloadAction<string>) => {
      delete state.activeDecorators[action.payload];
    },
  },
});

// Selectors
export const selectIsFetchingSolution = (state: RootState) => state.ui.isFetchingSolution;
export const selectIsStartingServer = (state: RootState) => state.ui.isStartingServer;
export const selectActiveDecorators = (state: RootState) => state.ui.activeDecorators;

export const { actions, reducer } = uiSlice;
export const {
  setIsFetchingSolution,
  setIsStartingServer,
  setIsInitializingServer,
  setIsWaitingForUserInteraction,
  setIsProcessingQueuedMessages,
  setActiveDecorators,
  updateDecorator,
  removeDecorator,
} = actions;

export default reducer;
