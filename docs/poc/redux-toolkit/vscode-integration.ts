/**
 * VSCode Extension Integration with Redux Store
 *
 * This shows how to replace the Immer-based mutateData approach
 * with Redux Toolkit actions
 *
 * ✅ KEY IMPROVEMENTS:
 * 1. No more full state clones on every mutation
 * 2. Selective updates to webviews (only send changed slices)
 * 3. Structural sharing = better performance
 */

import { Store } from '@reduxjs/toolkit';
import * as vscode from 'vscode';
import { RootState } from './store';
import type { KonveyorGUIWebviewViewProvider } from '../../../vscode/core/src/KonveyorGUIWebviewViewProvider';

// Import actions from slices
import {
  setRuleSets,
  setEnhancedIncidents,
  setIsAnalyzing,
  setServerState,
} from './slices/analysisSlice';
import { addChatMessage, appendStreamingChunk } from './slices/chatSlice';
import { setIsFetchingSolution } from './slices/uiSlice';

export class ReduxVSCodeBridge {
  private unsubscribe?: () => void;
  private previousState: RootState;

  constructor(
    private store: Store<RootState>,
    private webviewProviders: Map<string, KonveyorGUIWebviewViewProvider>
  ) {
    this.previousState = store.getState();
    this.setupStateListener();
  }

  /**
   * ✅ BENEFIT: Only send changed slices to webviews
   * Instead of sending entire 10MB state, only send what changed
   */
  private setupStateListener() {
    this.unsubscribe = this.store.subscribe(() => {
      const currentState = this.store.getState();
      const previousState = this.previousState;

      // ✅ Check which slices changed (by reference)
      const analysisChanged = currentState.analysis !== previousState.analysis;
      const chatChanged = currentState.chat !== previousState.chat;
      const uiChanged = currentState.ui !== previousState.ui;
      const configChanged = currentState.config !== previousState.config;

      // Only send updates for changed slices
      if (analysisChanged) {
        this.broadcastToWebviews({
          type: 'ANALYSIS_STATE_UPDATE',
          analysis: currentState.analysis,
        });
      }

      if (chatChanged) {
        // ✅ BENEFIT: Chat updates don't trigger analysis re-renders
        this.broadcastToWebviews({
          type: 'CHAT_MESSAGES_UPDATE',
          chatMessages: currentState.chat.messages,
          previousLength: previousState.chat.messages.length,
          timestamp: new Date().toISOString(),
        });
      }

      if (uiChanged) {
        this.broadcastToWebviews({
          type: 'UI_STATE_UPDATE',
          ui: currentState.ui,
        });
      }

      if (configChanged) {
        this.broadcastToWebviews({
          type: 'CONFIG_UPDATE',
          config: currentState.config,
        });
      }

      this.previousState = currentState;
    });
  }

  /**
   * ✅ BENEFIT: Targeted broadcasts instead of full state
   */
  private broadcastToWebviews(message: any) {
    this.webviewProviders.forEach((provider) => {
      provider.sendMessageToWebview(message);
    });
  }

  /**
   * Example: How to replace mutateData calls with Redux actions
   */
  exampleMigration() {
    // ❌ OLD WAY (extension.ts):
    // mutateData((draft) => {
    //   draft.isAnalyzing = true;
    //   draft.enhancedIncidents = newIncidents;
    // });
    // ^ This creates a full Immer clone and broadcasts entire state!

    // ✅ NEW WAY:
    this.store.dispatch(setIsAnalyzing(true));
    this.store.dispatch(setEnhancedIncidents(newIncidents));
    // ^ Only changed slices get new references
    // ^ Only changed slices broadcast to webview
    // ^ Components using selectors only re-render if their data changed
  }

  /**
   * Example: Streaming chat messages
   */
  handleChatStreaming(messageId: string, chunk: string) {
    // ❌ OLD WAY:
    // mutateChatMessages((draft) => {
    //   // Find message, update content, etc.
    // });

    // ✅ NEW WAY:
    this.store.dispatch(appendStreamingChunk({ messageId, chunk }));
    // ^ React batches these updates automatically
    // ^ Only chat component re-renders, not entire UI
  }

  /**
   * Get current state (replacement for getData())
   */
  getState(): RootState {
    return this.store.getState();
  }

  /**
   * Cleanup
   */
  dispose() {
    this.unsubscribe?.();
  }
}

/**
 * Example usage in extension.ts
 */
export function setupReduxIntegration(
  store: Store<RootState>,
  webviewProviders: Map<string, KonveyorGUIWebviewViewProvider>
) {
  const bridge = new ReduxVSCodeBridge(store, webviewProviders);

  // Replace old mutateData calls:
  // mutateData((draft) => { draft.isAnalyzing = true })
  // With:
  store.dispatch(setIsAnalyzing(true));

  return bridge;
}

// Declare for demo purposes
declare const newIncidents: any[];
