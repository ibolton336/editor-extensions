/**
 * Redux Toolkit Store POC
 *
 * Based on Continue's approach - see:
 * https://github.com/continuedev/continue/blob/main/gui/src/redux/store.ts
 */

import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { createLogger } from 'redux-logger';
import {
  persistStore,
  persistReducer,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import { createFilter } from 'redux-persist-transform-filter';
import autoMergeLevel2 from 'redux-persist/lib/stateReconciler/autoMergeLevel2';

// Import slices
import analysisReducer from './slices/analysisSlice';
import chatReducer from './slices/chatSlice';
import uiReducer from './slices/uiSlice';
import configReducer from './slices/configSlice';

// Combine all reducers
const rootReducer = combineReducers({
  analysis: analysisReducer,
  chat: chatReducer,
  ui: uiReducer,
  config: configReducer,
});

// ✅ BENEFIT: Only persist what's needed - not the entire state
const saveSubsetFilters = [
  createFilter('analysis', [
    'activeProfileId',
    'profiles',
    // NOT persisting ruleSets or enhancedIncidents (too large, reload on startup)
  ]),
  createFilter('chat', [
    // Only persist last 50 messages
    // Custom transform to limit array size
  ]),
  createFilter('ui', [
    'theme',
    'sidebarCollapsed',
  ]),
  createFilter('config', [
    'solutionServerEnabled',
    'isAgentMode',
  ]),
];

const persistConfig = {
  key: 'root',
  version: 1,
  storage,
  transforms: [...saveSubsetFilters],
  stateReconciler: autoMergeLevel2,
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export function setupStore() {
  const isDevelopment = process.env.NODE_ENV === 'development';

  const store = configureStore({
    reducer: persistedReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: {
          // Ignore redux-persist actions
          ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
        },
      }).concat(
        // ✅ BENEFIT: Only enable logger in development
        isDevelopment ? [createLogger({ collapsed: true })] : []
      ),
    devTools: isDevelopment,
  });

  return store;
}

export const store = setupStore();
export const persistor = persistStore(store);

export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = typeof store.dispatch;
