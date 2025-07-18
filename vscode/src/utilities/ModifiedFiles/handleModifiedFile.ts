import {
  KaiWorkflowMessage,
  KaiWorkflowMessageType,
  KaiModifiedFile,
} from "@editor-extensions/agentic";
import { createTwoFilesPatch, createPatch } from "diff";
import { ExtensionState } from "src/extensionState";
import { Uri } from "vscode";
import { ModifiedFileState, ChatMessageType } from "@editor-extensions/shared";
import { processModifiedFile } from "./processModifiedFile";
import { MessageQueueManager, handleUserInteractionComplete } from "./queueManager";
import { getConfigAgentMode } from "../configuration";

/**
 * Performs cleanup of resources and state variables when an error occurs during file processing.
 */
export const cleanupOnError = (
  filePath: string,
  msgId: string,
  state: ExtensionState,
  modifiedFiles: Map<string, ModifiedFileState>,
  pendingInteractions: Map<string, (response: any) => void>,
  processedTokens: Set<string>,
  modifiedFilesPromises: Array<Promise<void>>,
  eventEmitter?: { emit: (event: string, ...args: any[]) => void },
  error?: any,
) => {
  state.isWaitingForUserInteraction = false;

  if (pendingInteractions.has(msgId)) {
    pendingInteractions.delete(msgId);
  }

  const uri = Uri.file(filePath);
  if (modifiedFiles.has(uri.fsPath)) {
    modifiedFiles.delete(uri.fsPath);
  }

  if (processedTokens.has(msgId)) {
    processedTokens.delete(msgId);
  }

  modifiedFilesPromises.length = 0;

  if (eventEmitter) {
    eventEmitter.emit("modifiedFileError", { filePath, error });
  }

  console.log(`Cleanup completed for ${filePath} after error`);
};

/**
 * Creates a diff for UI display based on the file state and path.
 */
const createFileDiff = (fileState: ModifiedFileState, filePath: string): string => {
  const isNew = fileState.originalContent === undefined;
  const isDeleted = !isNew && fileState.modifiedContent.trim() === "";

  if (isNew) {
    return createTwoFilesPatch("", filePath, "", fileState.modifiedContent);
  } else if (isDeleted) {
    return createTwoFilesPatch(filePath, "", fileState.originalContent as string, "");
  } else {
    try {
      return createPatch(filePath, fileState.originalContent as string, fileState.modifiedContent);
    } catch (diffErr) {
      return `// Error creating diff for ${filePath}`;
    }
  }
};

/**
 * Handles a modified file message from the agent
 * 1. Processes the file modification
 * 2. Creates a diff for UI display
 * 3. Adds a chat message with accept/reject buttons
 * 4. Waits for user response before continuing
 */
export const handleModifiedFileMessage = async (
  msg: KaiWorkflowMessage,
  modifiedFiles: Map<string, ModifiedFileState>,
  modifiedFilesPromises: Array<Promise<void>>,
  processedTokens: Set<string>,
  pendingInteractions: Map<string, (response: any) => void>,
  messageQueue: KaiWorkflowMessage[],
  state: ExtensionState,
  queueManager?: MessageQueueManager,
  eventEmitter?: { emit: (event: string, ...args: any[]) => void },
) => {
  if (msg.type !== KaiWorkflowMessageType.ModifiedFile) {
    return;
  }

  const { path: filePath } = msg.data as KaiModifiedFile;
  const isAgentMode = getConfigAgentMode();

  modifiedFilesPromises.push(
    processModifiedFile(modifiedFiles, msg.data as KaiModifiedFile, eventEmitter),
  );

  const uri = Uri.file(filePath);

  try {
    await Promise.all(modifiedFilesPromises);

    const fileState = modifiedFiles.get(uri.fsPath);
    if (!fileState) {
      console.error(`File state not found for ${filePath}`);
      return;
    }

    if (isAgentMode) {
      const isNew = fileState.originalContent === undefined;
      const isDeleted = !isNew && fileState.modifiedContent.trim() === "";
      const diff = createFileDiff(fileState, filePath);

      state.mutateData((draft) => {
        draft.chatMessages.push({
          kind: ChatMessageType.ModifiedFile,
          messageToken: msg.id,
          timestamp: new Date().toISOString(),
          value: {
            path: filePath,
            content: fileState.modifiedContent,
            originalContent: fileState.originalContent,
            isNew: isNew,
            isDeleted: isDeleted,
            diff: diff,
            messageToken: msg.id,
          },
          quickResponses: [
            { id: "apply", content: "Apply" },
            { id: "reject", content: "Reject" },
          ],
        });
      });

      state.isWaitingForUserInteraction = true;

      await new Promise<void>((resolve) => {
        pendingInteractions.set(msg.id, async (response: any) => {
          try {
            if (queueManager) {
              await handleUserInteractionComplete(state, queueManager);
            } else {
              state.isWaitingForUserInteraction = false;
            }
            pendingInteractions.delete(msg.id);
            resolve();
          } catch (error) {
            console.error(`Error in ModifiedFile resolver for messageId: ${msg.id}:`, error);
            pendingInteractions.delete(msg.id);
            resolve();
          }
        });
      });
    } else {
      console.log(`Non-agentic mode: File ${filePath} processed and stored in modifiedFiles`);
    }
  } catch (err) {
    console.error(`Error in handleModifiedFileMessage for ${filePath}:`, err);

    try {
      cleanupOnError(
        filePath,
        msg.id,
        state,
        modifiedFiles,
        pendingInteractions,
        processedTokens,
        modifiedFilesPromises,
        eventEmitter,
        err,
      );
    } catch (cleanupError) {
      console.error(`Error during cleanup for ${filePath}:`, cleanupError);
      state.isWaitingForUserInteraction = false;
    }
  }
};
