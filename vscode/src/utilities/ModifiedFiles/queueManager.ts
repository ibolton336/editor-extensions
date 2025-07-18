import { KaiWorkflowMessage, KaiInteractiveWorkflow } from "@editor-extensions/agentic";
import { ExtensionState } from "src/extensionState";
import { ChatMessageType } from "@editor-extensions/shared";

export class MessageQueueManager {
  private messageQueue: KaiWorkflowMessage[] = [];
  private isProcessingQueue = false;

  constructor(
    private state: ExtensionState,
    private workflow: KaiInteractiveWorkflow,
    private modifiedFilesPromises: Array<Promise<void>>,
    private processedTokens: Set<string>,
    private pendingInteractions: Map<string, (response: any) => void>,
    private maxTaskManagerIterations: number,
  ) {}

  enqueueMessage(message: KaiWorkflowMessage): void {
    this.messageQueue.push(message);
  }

  shouldQueueMessage(): boolean {
    return this.state.isWaitingForUserInteraction;
  }

  getQueueLength(): number {
    return this.messageQueue.length;
  }

  isProcessingQueueActive(): boolean {
    return this.isProcessingQueue;
  }

  async processQueuedMessages(): Promise<void> {
    if (this.isProcessingQueue) {
      return;
    }

    if (this.messageQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      const queuedMessages = [...this.messageQueue];
      this.messageQueue.length = 0;

      for (let i = 0; i < queuedMessages.length; i++) {
        const queuedMsg = queuedMessages[i];

        try {
          const { processMessage } = await import("./processMessage");
          await processMessage(
            queuedMsg,
            this.state,
            this.workflow,
            this.messageQueue, // Pass the queue so new messages can be queued during processing
            this.modifiedFilesPromises,
            this.processedTokens,
            this.pendingInteractions,
            this.maxTaskManagerIterations,
            this, // Pass the queue manager itself
          );
        } catch (error) {
          console.error(`Error processing queued message ${queuedMsg.id}:`, error);
        }
      }
    } catch (error) {
      console.error("Error processing queued messages:", error);

      this.state.mutateData((draft) => {
        draft.chatMessages.push({
          kind: ChatMessageType.String,
          messageToken: `queue-error-${Date.now()}`,
          timestamp: new Date().toISOString(),
          value: {
            message: `Error processing queued messages: ${error}`,
          },
        });
      });
    } finally {
      this.isProcessingQueue = false;
    }
  }

  clearQueue(): void {
    this.messageQueue.length = 0;
  }
}

export async function handleUserInteractionComplete(
  state: ExtensionState,
  queueManager: MessageQueueManager,
): Promise<void> {
  state.isWaitingForUserInteraction = false;

  if (queueManager.getQueueLength() > 0) {
    await queueManager.processQueuedMessages();
  } else {
    console.log(`No queued messages to process`);

    // In agentic mode, if there are no more queued messages and we're not waiting for user interaction,
    // the workflow is likely complete, so we can set isFetchingSolution to false
    if (state.data.isAgentMode && state.data.isFetchingSolution) {
      state.mutateData((draft) => {
        draft.isFetchingSolution = false;
        if (draft.solutionState === "started") {
          draft.solutionState = "received";
        }
      });
    }
  }
}
