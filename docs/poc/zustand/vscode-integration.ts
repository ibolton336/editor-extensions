/**
 * VSCode Extension Integration with Zustand
 *
 * ✅ BENEFITS:
 * - Much simpler than Redux integration
 * - Can still do selective broadcasts
 * - Direct store access (no dispatch needed)
 */

import { useExtensionStore } from './store';
import type { KonveyorGUIWebviewViewProvider } from '../../../vscode/core/src/KonveyorGUIWebviewViewProvider';

export class ZustandVSCodeBridge {
  private unsubscribe?: () => void;
  private previousState: any;

  constructor(private webviewProviders: Map<string, KonveyorGUIWebviewViewProvider>) {
    this.previousState = useExtensionStore.getState();
    this.setupStateListener();
  }

  /**
   * ✅ BENEFIT: Subscribe to store changes
   * Zustand's subscribe gives you prev and current state
   */
  private setupStateListener() {
    this.unsubscribe = useExtensionStore.subscribe((currentState) => {
      const previousState = this.previousState;

      // ✅ Check what changed (reference equality)
      const analysisChanged =
        currentState.ruleSets !== previousState.ruleSets ||
        currentState.enhancedIncidents !== previousState.enhancedIncidents ||
        currentState.isAnalyzing !== previousState.isAnalyzing;

      const chatChanged = currentState.chatMessages !== previousState.chatMessages;

      const uiChanged =
        currentState.isFetchingSolution !== previousState.isFetchingSolution ||
        currentState.isStartingServer !== previousState.isStartingServer ||
        currentState.activeDecorators !== previousState.activeDecorators;

      // ✅ Only broadcast what changed
      if (analysisChanged) {
        this.broadcastToWebviews({
          type: 'ANALYSIS_STATE_UPDATE',
          analysis: {
            ruleSets: currentState.ruleSets,
            enhancedIncidents: currentState.enhancedIncidents,
            isAnalyzing: currentState.isAnalyzing,
            serverState: currentState.serverState,
            profiles: currentState.profiles,
            activeProfileId: currentState.activeProfileId,
          },
        });
      }

      if (chatChanged) {
        this.broadcastToWebviews({
          type: 'CHAT_MESSAGES_UPDATE',
          chatMessages: currentState.chatMessages,
          previousLength: previousState.chatMessages.length,
          timestamp: new Date().toISOString(),
        });
      }

      if (uiChanged) {
        this.broadcastToWebviews({
          type: 'UI_STATE_UPDATE',
          ui: {
            isFetchingSolution: currentState.isFetchingSolution,
            isStartingServer: currentState.isStartingServer,
            activeDecorators: currentState.activeDecorators,
          },
        });
      }

      this.previousState = currentState;
    });
  }

  private broadcastToWebviews(message: any) {
    this.webviewProviders.forEach((provider) => {
      provider.sendMessageToWebview(message);
    });
  }

  /**
   * ✅ BENEFIT: No dispatch needed - just call store methods directly
   */
  exampleMigration() {
    // ❌ OLD WAY:
    // mutateData((draft) => {
    //   draft.isAnalyzing = true;
    //   draft.enhancedIncidents = newIncidents;
    // });

    // ✅ NEW WAY:
    const store = useExtensionStore.getState();
    store.setIsAnalyzing(true);
    store.setEnhancedIncidents(newIncidents);
    // ^ Simpler than Redux! No dispatch, no action types
  }

  /**
   * ✅ BENEFIT: Can subscribe to specific parts of state
   */
  setupSelectiveListener() {
    // Only listen to chat messages
    const unsubChat = useExtensionStore.subscribe(
      (state) => state.chatMessages,
      (chatMessages, prevChatMessages) => {
        if (chatMessages !== prevChatMessages) {
          this.broadcastToWebviews({
            type: 'CHAT_MESSAGES_UPDATE',
            chatMessages,
          });
        }
      }
    );

    return unsubChat;
  }

  /**
   * Get current state
   */
  getState() {
    return useExtensionStore.getState();
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
export function setupZustandIntegration(
  webviewProviders: Map<string, KonveyorGUIWebviewViewProvider>
) {
  const bridge = new ZustandVSCodeBridge(webviewProviders);

  // Replace old mutateData calls:
  // mutateData((draft) => { draft.isAnalyzing = true })
  // With:
  const { setIsAnalyzing } = useExtensionStore.getState();
  setIsAnalyzing(true);

  // Or even simpler:
  useExtensionStore.getState().setIsAnalyzing(true);

  return bridge;
}

// Declare for demo
declare const newIncidents: any[];
