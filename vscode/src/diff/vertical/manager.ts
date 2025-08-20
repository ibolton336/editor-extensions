import { DiffLine, FileEditor } from "../types";
import * as URI from "uri-js";
import * as vscode from "vscode";
import { VerticalDiffHandler, VerticalDiffHandlerOptions } from "./handler";
import { InMemoryCacheWithRevisions } from "@editor-extensions/agentic";
import { fileUriToPath } from "../../utilities/pathUtils";
import { Logger } from "winston";

export interface VerticalDiffCodeLens {
  start: number;
  numRed: number;
  numGreen: number;
}

export class VerticalDiffManager {
  public refreshCodeLens: () => void = () => {};
  public onDiffStatusChange: ((fileUri: string) => void) | undefined;

  private fileUriToHandler: Map<string, VerticalDiffHandler> = new Map();
  fileUriToCodeLens: Map<string, VerticalDiffCodeLens[]> = new Map();

  private userChangeListener: vscode.Disposable | undefined;

  logDiffs: DiffLine[] | undefined;

  constructor(
    private readonly fileEditor: FileEditor,
    private readonly kaiFsCache: InMemoryCacheWithRevisions<string, string>,
    private readonly logger: Logger,
  ) {
    this.userChangeListener = undefined;
  }

  async createVerticalDiffHandler(
    fileUri: string,
    startLine: number,
    endLine: number,
    options: VerticalDiffHandlerOptions,
  ): Promise<VerticalDiffHandler | undefined> {
    if (this.fileUriToHandler.has(fileUri)) {
      await this.fileUriToHandler.get(fileUri)?.clear(false);
      this.fileUriToHandler.delete(fileUri);
    }
    const editor = vscode.window.activeTextEditor;
    if (editor && URI.equal(editor.document.uri.toString(), fileUri)) {
      const handler = new VerticalDiffHandler(
        startLine,
        endLine,
        editor,
        this.fileUriToCodeLens,
        this.clearForFileUri.bind(this),
        this.refreshCodeLens,
        options,
      );
      this.fileUriToHandler.set(fileUri, handler);
      return handler;
    } else {
      return undefined;
    }
  }

  getHandlerForFile(fileUri: string) {
    return this.fileUriToHandler.get(fileUri);
  }

  getStreamIdForFile(fileUri: string): string | undefined {
    return this.fileUriToHandler.get(fileUri)?.streamId;
  }

  // Creates a listener for document changes by user.
  private enableDocumentChangeListener(): vscode.Disposable | undefined {
    if (this.userChangeListener) {
      //Only create one listener per file
      return;
    }

    this.userChangeListener = vscode.workspace.onDidChangeTextDocument((event) => {
      // Check if there is an active handler for the affected file
      const fileUri = event.document.uri.toString();
      const handler = this.getHandlerForFile(fileUri);
      if (handler) {
        // If there is an active diff for that file, handle the document change
        this.handleDocumentChange(event, handler);
      }
    });
  }

  // Listener for user doc changes is disabled during updates to the text document by continue
  public disableDocumentChangeListener() {
    if (this.userChangeListener) {
      this.userChangeListener.dispose();
      this.userChangeListener = undefined;
    }
  }

  private handleDocumentChange(
    event: vscode.TextDocumentChangeEvent,
    _handler: VerticalDiffHandler,
  ) {
    // Loop through each change in the event
    event.contentChanges.forEach((change) => {
      // Calculate the number of lines added or removed
      const linesAdded = change.text.split("\n").length - 1;
      const linesDeleted = change.range.end.line - change.range.start.line;

      // Calculate the net change in lines
      const lineDelta = linesAdded - linesDeleted;

      // Get the line number where the change occurred
      const lineNumber = change.range.start.line;

      // Update decorations based on the change
      // Note: updateDecorations method would need to be implemented in handler
      // For now, we'll just log the change
      this.logger.debug(`Document change at line ${lineNumber}, delta: ${lineDelta}`);
    });
  }

  async acceptRejectVerticalDiffBlock(accept: boolean, fileUri?: string, index?: number) {
    if (!fileUri) {
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        return;
      }
      fileUri = activeEditor.document.uri.toString();
    }

    const handler = this.fileUriToHandler.get(fileUri);
    if (!handler) {
      this.logger.warn(`No handler found for file: ${fileUri}`);
      return;
    }

    const blocks = this.fileUriToCodeLens.get(fileUri);
    if (!blocks) {
      this.logger.warn(`No code lens blocks found for file: ${fileUri}`);
      return;
    }

    const block = index !== undefined ? blocks[index] : blocks[0];
    if (!block) {
      this.logger.warn(`Block at index ${index} not found`);
      return;
    }

    await handler.acceptRejectBlock(accept, block.start, block.numGreen, block.numRed);

    if (blocks.length === 1) {
      await this.clearForFileUri(fileUri, true);
    } else {
      // Re-enable listener for user changes to file
      this.enableDocumentChangeListener();
    }

    this.refreshCodeLens();

    // Notify status change
    if (this.onDiffStatusChange) {
      this.onDiffStatusChange(fileUri);
    }
  }

  async clearForFileUri(fileUri: string | undefined, accept: boolean = false) {
    if (!fileUri) {
      return;
    }

    const handler = this.fileUriToHandler.get(fileUri);
    if (handler) {
      await handler.clear(accept);
      this.fileUriToHandler.delete(fileUri);
    }

    this.disableDocumentChangeListener();

    this.fileUriToCodeLens.delete(fileUri);
    this.refreshCodeLens();

    void vscode.commands.executeCommand("setContext", "konveyor.diffVisible", false);

    // Notify status change
    if (this.onDiffStatusChange) {
      this.onDiffStatusChange(fileUri);
    }
  }

  /**
   * Simplified method for streaming diff lines for static diffs
   */
  async streamDiffLines(diffStream: AsyncGenerator<DiffLine>, streamId?: string) {
    this.logger.debug(`[Manager] streamDiffLines called - streamId: ${streamId}`);
    void vscode.commands.executeCommand("setContext", "konveyor.diffVisible", true);

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      this.logger.warn("[Manager] No active editor");
      return;
    }

    const fileUri = editor.document.uri.toString();
    this.logger.debug(`[Manager] Working with file: ${fileUri}`);

    const startLine = 0;
    const endLine = editor.document.lineCount - 1;
    this.logger.debug(`[Manager] Selection range: ${startLine}-${endLine}`);

    // Small delay to ensure UI updates
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Create new handler
    this.logger.debug("[Manager] Creating new vertical diff handler");
    const diffHandler = await this.createVerticalDiffHandler(fileUri, startLine, endLine, {
      onStatusUpdate: (status, numDiffs, fileContent) => {
        this.logger.debug(`[Manager] Status update: ${status}, numDiffs: ${numDiffs}`);

        // Update cache when status is "closed" and we have final file content
        if (status === "closed" && fileContent) {
          try {
            // Convert fileUri to absolute file system path for cache key
            // This ensures the path format matches what the agent expects (absolute paths)
            const filePath = fileUriToPath(fileUri);
            this.kaiFsCache.set(filePath, fileContent);
            this.logger.debug(`[Manager] Updated cache for file: ${filePath}`);
          } catch (error) {
            this.logger.error(`[Manager] Failed to update cache:`, error);
          }
        }
      },
      streamId,
      onDiffStatusChange: (fileUri) => {
        if (this.onDiffStatusChange) {
          this.onDiffStatusChange(fileUri);
        }
      },
    });

    if (!diffHandler) {
      this.logger.warn("[Manager] Failed to create vertical diff handler");
      return;
    }

    void vscode.commands.executeCommand("setContext", "konveyor.streamingDiff", true);

    try {
      this.logger.debug("[Manager] Starting diff handler.run()");
      this.logDiffs = await diffHandler.run(diffStream);
      this.logger.debug(`[Manager] Diff handler completed, logDiffs: ${this.logDiffs?.length}`);

      // Enable listener for user edits to file while diff is open
      this.enableDocumentChangeListener();
    } catch (e) {
      this.logger.error("[Manager] Error in streamDiffLines:", e);
      this.disableDocumentChangeListener();
      throw e;
    } finally {
      void vscode.commands.executeCommand("setContext", "konveyor.streamingDiff", false);
    }
  }

  // Accept all changes in the current file
  async acceptAll(fileUri?: string) {
    if (!fileUri) {
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        return;
      }
      fileUri = activeEditor.document.uri.toString();
    }

    const handler = this.fileUriToHandler.get(fileUri);
    if (handler) {
      // Accept all blocks - take a shallow copy to avoid race conditions
      const blocks = this.fileUriToCodeLens.get(fileUri)?.slice();
      if (blocks) {
        for (const block of blocks) {
          await handler.acceptRejectBlock(true, block.start, block.numGreen, block.numRed);
        }
      }
      await this.clearForFileUri(fileUri, true);
    }
  }

  // Reject all changes in the current file
  async rejectAll(fileUri?: string) {
    if (!fileUri) {
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        return;
      }
      fileUri = activeEditor.document.uri.toString();
    }

    const handler = this.fileUriToHandler.get(fileUri);
    if (handler) {
      // Reject all blocks - take a shallow copy to avoid race conditions
      const blocks = this.fileUriToCodeLens.get(fileUri)?.slice();
      if (blocks) {
        for (const block of blocks) {
          await handler.acceptRejectBlock(false, block.start, block.numGreen, block.numRed);
        }
      }
      await this.clearForFileUri(fileUri, false);
    }
  }

  /**
   * Dispose of all resources and clear all active diffs
   * Called during extension deactivation to prevent memory leaks
   */
  async dispose() {
    // Clear all active handlers
    for (const [fileUri, handler] of this.fileUriToHandler.entries()) {
      try {
        await handler.clear(false);
      } catch (error) {
        this.logger.error(`Error clearing handler for ${fileUri}:`, error);
      }
    }
    this.fileUriToHandler.clear();

    // Clear all code lens
    this.fileUriToCodeLens.clear();

    // Dispose document change listener
    this.disableDocumentChangeListener();

    // Clear callback references
    this.onDiffStatusChange = undefined;
    this.refreshCodeLens = () => {};
  }
}
