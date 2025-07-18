import * as vscode from "vscode";
import { ExtensionState } from "./extensionState";
import {
  ADD_PROFILE,
  AnalysisProfile,
  APPLY_FILE,
  ChatMessageType,
  CONFIGURE_CUSTOM_RULES,
  CONFIGURE_LABEL_SELECTOR,
  CONFIGURE_SOURCES_TARGETS,
  DELETE_PROFILE,
  DISCARD_FILE,
  GET_SOLUTION,
  GET_SOLUTION_WITH_KONVEYOR_CONTEXT,
  GET_SUCCESS_RATE,
  LocalChange,
  OPEN_FILE,
  OPEN_GENAI_SETTINGS,
  OVERRIDE_ANALYZER_BINARIES,
  OVERRIDE_RPC_SERVER_BINARIES,
  OPEN_PROFILE_MANAGER,
  RUN_ANALYSIS,
  Scope,
  SET_ACTIVE_PROFILE,
  START_SERVER,
  STOP_SERVER,
  UPDATE_PROFILE,
  VIEW_FIX,
  WEBVIEW_READY,
  WebviewAction,
  WebviewActionType,
  ScopeWithKonveyorContext,
  ExtensionData,
  createConfigError,
} from "@editor-extensions/shared";
import { getLanguageFromExtension } from "../../shared/src/utils/languageMapping";

import { getBundledProfiles } from "./utilities/profiles/bundledProfiles";
import {
  getUserProfiles,
  saveUserProfiles,
  setActiveProfileId,
} from "./utilities/profiles/profileService";
import { handleQuickResponse } from "./utilities/ModifiedFiles/handleQuickResponse";
import { handleFileResponse } from "./utilities/ModifiedFiles/handleFileResponse";

// Simple logger implementation
const logger = {
  info: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.debug(`[DEBUG] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
};

// Helper functions for file handling
async function getBaselineContent(path: string, state: ExtensionState): Promise<string> {
  const uri = vscode.Uri.file(path);
  const modifiedFileState = state.modifiedFiles.get(path);

  if (modifiedFileState?.originalContent) {
    logger.debug(`Using original content from modifiedFiles state as baseline for ${path}`);
    return modifiedFileState.originalContent;
  } else {
    logger.debug(`Using current file content as baseline for ${path} (no modifiedFiles state)`);
    const originalContent = await vscode.workspace.fs.readFile(uri);
    return originalContent.toString();
  }
}

async function processDiffWithTimeout(
  baselineContent: string,
  diffContent: string,
  timeoutMs: number = 3000,
): Promise<string> {
  const diffParsingPromise = (async () => {
    const Diff = await import("diff");

    const suggestedContent = (Diff as any).applyPatch(baselineContent, diffContent);
    if (suggestedContent === false) {
      throw new Error("Failed to apply patch for comparison");
    }

    return suggestedContent;
  })();

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Diff processing timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([diffParsingPromise, timeoutPromise]);
}

async function openFileComparison(
  path: string,
  suggestedContent: string,
  state: ExtensionState,
): Promise<void> {
  const uri = vscode.Uri.file(path);
  const relativePath = vscode.workspace.asRelativePath(uri);

  // Check user preference for diff editor type
  const { getConfigDiffEditorType } = await import("./utilities/configuration");
  const editorType = getConfigDiffEditorType();

  if (editorType === "merge") {
    await openMergeEditor(uri, relativePath, suggestedContent, state);
  } else {
    await openDiffEditor(uri, relativePath, suggestedContent);
  }
}

async function openMergeEditor(
  uri: vscode.Uri,
  relativePath: string,
  suggestedContent: string,
  state: ExtensionState,
): Promise<void> {
  const { fromRelativeToKonveyor, KONVEYOR_READ_ONLY_SCHEME } = await import("./utilities");
  const modifiedUri = fromRelativeToKonveyor(relativePath);

  // Create directories if needed and store the suggested content
  state.memFs.createDirectoriesIfNeeded(modifiedUri, "konveyor");
  state.memFs.writeFile(modifiedUri, Buffer.from(suggestedContent), {
    create: true,
    overwrite: true,
  });

  // Create a temporary document with the baseline content for comparison
  const baselineUri = vscode.Uri.from({ ...uri, scheme: KONVEYOR_READ_ONLY_SCHEME });

  const options = {
    base: baselineUri,
    input1: { uri: uri, title: "Current" },
    input2: { uri: modifiedUri, title: "Suggested" },
    output: uri,
    options: { preserveFocus: false },
  };

  await vscode.commands.executeCommand("_open.mergeEditor", options);
}

async function openDiffEditor(
  uri: vscode.Uri,
  relativePath: string,
  suggestedContent: string,
): Promise<void> {
  const fileExtension = relativePath.split(".").pop() || "";

  const tempDoc = await vscode.workspace.openTextDocument({
    content: suggestedContent,
    language: getLanguageFromExtension(fileExtension),
  });

  await vscode.commands.executeCommand(
    "vscode.diff",
    uri,
    tempDoc.uri,
    `${relativePath} ↔ Suggested Changes`,
    { preserveFocus: false },
  );
}

async function reconstructOriginalContent(
  suggestedContent: string,
  diffContent: string,
  timeoutMs: number = 3000,
): Promise<string> {
  const diffReconstructionPromise = (async () => {
    const Diff = await import("diff");

    if (!diffContent) {
      throw new Error("No diff content available");
    }

    const reversedDiff = (Diff as any).reversePatch(diffContent);
    const reconstructedOriginal = (Diff as any).applyPatch(suggestedContent, reversedDiff);

    if (reconstructedOriginal !== false) {
      logger.debug(`Successfully reconstructed original content from diff`);
      return reconstructedOriginal;
    } else {
      throw new Error("Failed to reverse-apply diff");
    }
  })();

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Diff reconstruction timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([diffReconstructionPromise, timeoutPromise]);
}

function determineFileState(
  currentText: string,
  originalContent: string,
  suggestedContent: string,
  isDirty: boolean,
): { changesApplied: boolean; reason: string } {
  const normalize = (text: string) => text.replace(/\r\n/g, "\n").trim();
  const normalizedCurrent = normalize(currentText);
  const normalizedOriginal = normalize(originalContent);
  const normalizedSuggested = normalize(suggestedContent);

  logger.debug(`=== FILE STATE CHECK DEBUG ===`);
  logger.debug(`File isDirty: ${isDirty}`);
  logger.debug(`Current === Suggested: ${normalizedCurrent === normalizedSuggested}`);
  logger.debug(`Current === Original: ${normalizedCurrent === normalizedOriginal}`);

  let changesApplied: boolean;
  let reason: string;

  if (normalizedCurrent === normalizedSuggested) {
    changesApplied = true;
    reason = "exact match with suggested content";
  } else if (normalizedCurrent === normalizedOriginal) {
    changesApplied = false;
    reason = "exact match with original content";
  } else {
    changesApplied = !isDirty;
    reason = isDirty ? "file has unsaved changes" : "file was saved with modifications";
  }

  logger.debug(`Decision: ${changesApplied ? "APPLY" : "REJECT"} - ${reason}`);
  logger.debug(`=== END DEBUG ===`);

  return { changesApplied, reason };
}

export function setupWebviewMessageListener(webview: vscode.Webview, state: ExtensionState) {
  webview.onDidReceiveMessage(async (message) => {
    await messageHandler(message, state);
  });
}

const actions: {
  [name: string]: (payload: any, state: ExtensionState) => void | Promise<void>;
} = {
  [ADD_PROFILE]: async (profile: AnalysisProfile, state) => {
    const userProfiles = getUserProfiles(state.extensionContext);

    if (userProfiles.some((p) => p.name === profile.name)) {
      vscode.window.showErrorMessage(`A profile named "${profile.name}" already exists.`);
      return;
    }

    const updated = [...userProfiles, profile];
    saveUserProfiles(state.extensionContext, updated);

    const allProfiles = [...getBundledProfiles(), ...updated];
    setActiveProfileId(profile.id, state);

    state.mutateData((draft) => {
      draft.profiles = allProfiles;
      draft.activeProfileId = profile.id;
      updateConfigErrorsFromActiveProfile(draft);
    });
  },

  [DELETE_PROFILE]: async (profileId: string, state) => {
    const userProfiles = getUserProfiles(state.extensionContext);
    const filtered = userProfiles.filter((p) => p.id !== profileId);

    saveUserProfiles(state.extensionContext, filtered);

    const fullProfiles = [...getBundledProfiles(), ...filtered];
    state.mutateData((draft) => {
      draft.profiles = fullProfiles;

      if (draft.activeProfileId === profileId) {
        draft.activeProfileId = fullProfiles[0]?.id ?? "";
        state.extensionContext.workspaceState.update("activeProfileId", draft.activeProfileId);
      }
      updateConfigErrorsFromActiveProfile(draft);
    });
  },

  [UPDATE_PROFILE]: async ({ originalId, updatedProfile }, state) => {
    const allProfiles = [...getBundledProfiles(), ...getUserProfiles(state.extensionContext)];
    const isBundled = allProfiles.find((p) => p.id === originalId)?.readOnly;

    if (isBundled) {
      vscode.window.showWarningMessage(
        "Built-in profiles cannot be edited. Copy it to a new profile first.",
      );
      return;
    }

    const updatedList = allProfiles.map((p) =>
      p.id === originalId ? { ...p, ...updatedProfile } : p,
    );

    const userProfiles = updatedList.filter((p) => !p.readOnly);
    saveUserProfiles(state.extensionContext, userProfiles);

    const fullProfiles = [...getBundledProfiles(), ...userProfiles];
    state.mutateData((draft) => {
      draft.profiles = fullProfiles;

      if (draft.activeProfileId === originalId) {
        draft.activeProfileId = updatedProfile.id;
      }
      updateConfigErrorsFromActiveProfile(draft);
    });
  },

  [SET_ACTIVE_PROFILE]: async (profileId: string, state) => {
    const allProfiles = [...getBundledProfiles(), ...getUserProfiles(state.extensionContext)];
    const valid = allProfiles.find((p) => p.id === profileId);
    if (!valid) {
      vscode.window.showErrorMessage(`Cannot set active profile. Profile not found.`);
      return;
    }
    setActiveProfileId(profileId, state);
    state.mutateData((draft) => {
      draft.activeProfileId = profileId;
      updateConfigErrorsFromActiveProfile(draft);
    });
  },

  [OPEN_PROFILE_MANAGER]() {
    vscode.commands.executeCommand("konveyor.openProfilesPanel");
  },
  [WEBVIEW_READY]() {
    logger.info("Webview is ready");
  },
  [CONFIGURE_SOURCES_TARGETS]() {
    vscode.commands.executeCommand("konveyor.configureSourcesTargets");
  },
  [CONFIGURE_LABEL_SELECTOR]() {
    vscode.commands.executeCommand("konveyor.configureLabelSelector");
  },
  [CONFIGURE_CUSTOM_RULES]: async ({ profileId }, state) => {
    vscode.commands.executeCommand("konveyor.configureCustomRules", profileId, state);
  },

  [OVERRIDE_ANALYZER_BINARIES]() {
    vscode.commands.executeCommand("konveyor.overrideAnalyzerBinaries");
  },
  [OVERRIDE_RPC_SERVER_BINARIES]() {
    vscode.commands.executeCommand("konveyor.overrideKaiRpcServerBinaries");
  },
  [OPEN_GENAI_SETTINGS]() {
    vscode.commands.executeCommand("konveyor.modelProviderSettingsOpen");
  },
  // Solution-related actions
  [GET_SOLUTION](scope: Scope) {
    vscode.commands.executeCommand("konveyor.getSolution", scope.incidents, scope.effort);
    vscode.commands.executeCommand("konveyor.diffView.focus");
    vscode.commands.executeCommand("konveyor.showResolutionPanel");
  },

  async [GET_SOLUTION_WITH_KONVEYOR_CONTEXT]({ incident }: ScopeWithKonveyorContext) {
    vscode.commands.executeCommand("konveyor.askContinue", incident);
  },

  // File handling actions
  [VIEW_FIX](change: LocalChange) {
    vscode.commands.executeCommand(
      "konveyor.diffView.viewFix",
      vscode.Uri.from(change.originalUri),
      true,
    );
  },

  [APPLY_FILE](payload: any) {
    if (payload.originalUri) {
      vscode.commands.executeCommand(
        "konveyor.applyFile",
        vscode.Uri.from(payload.originalUri),
        true,
      );
    } else if (payload.path) {
      vscode.commands.executeCommand("konveyor.applyFile", vscode.Uri.file(payload.path), true);
    } else {
      logger.error("APPLY_FILE payload missing both originalUri and path:", payload);
    }
  },

  [DISCARD_FILE](payload: any) {
    if (payload.originalUri) {
      vscode.commands.executeCommand(
        "konveyor.discardFile",
        vscode.Uri.from(payload.originalUri),
        true,
      );
    } else if (payload.path) {
      vscode.commands.executeCommand("konveyor.discardFile", vscode.Uri.file(payload.path), true);
    } else {
      logger.error("DISCARD_FILE payload missing both originalUri and path:", payload);
    }
  },
  // Advanced file handling actions
  REJECT_FILE: async ({ path }, state) => {
    try {
      vscode.window.showInformationMessage(
        `Changes rejected for ${vscode.workspace.asRelativePath(vscode.Uri.file(path))}`,
      );
    } catch (error) {
      logger.error("Error handling REJECT_FILE:", error);
      vscode.window.showErrorMessage(`Failed to reject changes: ${error}`);
    }
  },

  SHOW_MAXIMIZED_DIFF: async ({ path, content, diff, messageToken }, state) => {
    // TODO: Implement new maximized diff view component
    logger.info("SHOW_MAXIMIZED_DIFF - placeholder for new diff view", { path, messageToken });

    // For now, fall back to old VIEW_FILE behavior
    const change = {
      originalUri: path,
      modifiedUri: path,
      diff: diff,
      state: "pending",
    };
    return actions.VIEW_FILE({ path, change }, state);
  },

  VIEW_FILE: async ({ path, change }, state) => {
    try {
      const uri = vscode.Uri.file(path);

      if (!change || !change.diff) {
        // If no change/diff provided, just open the file normally
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: true });
        return;
      }

      // Get baseline content and process diff
      const baselineContent = await getBaselineContent(path, state);
      const suggestedContent = await processDiffWithTimeout(baselineContent, change.diff);

      // Open file comparison
      await openFileComparison(path, suggestedContent, state);
    } catch (error) {
      logger.error("Error handling VIEW_FILE:", error);
      vscode.window.showErrorMessage(`Failed to open file comparison: ${error}`);
    }
  },
  // Response handling actions
  QUICK_RESPONSE: async ({ responseId, messageToken }, state) => {
    handleQuickResponse(messageToken, responseId, state);
  },

  FILE_RESPONSE: async ({ responseId, messageToken, path, content }, state) => {
    handleFileResponse(messageToken, responseId, path, content, state);
  },

  CHECK_FILE_STATE: async ({ path, messageToken }, state) => {
    try {
      const uri = vscode.Uri.file(path);
      const currentContent = await vscode.workspace.fs.readFile(uri);
      const currentText = currentContent.toString();

      // Find the chat message with the original and suggested content
      const fileMessage = state.data.chatMessages.find(
        (msg) =>
          msg.kind === ChatMessageType.ModifiedFile &&
          msg.messageToken === messageToken &&
          (msg.value as any).path === path,
      );

      if (!fileMessage) {
        vscode.window.showErrorMessage(`No changes found for file: ${path}`);
        return;
      }

      const fileValue = fileMessage.value as any;
      let originalContent = "";
      let suggestedContent = "";
      const modifiedFileState = state.modifiedFiles.get(path);

      if (modifiedFileState?.originalContent) {
        originalContent = modifiedFileState.originalContent;
        suggestedContent = fileValue.content;
        logger.debug(`Using originalContent from modifiedFiles state`);
      } else {
        try {
          originalContent = await reconstructOriginalContent(fileValue.content, fileValue.diff);
          suggestedContent = fileValue.content;
        } catch (error) {
          logger.debug(`Failed to reconstruct original content: ${error}`);

          // Fallback: Use simplified logic based on file save state
          const doc = await vscode.workspace.openTextDocument(uri);
          const responseId = !doc.isDirty ? "apply" : "reject";
          await handleFileResponse(messageToken, responseId, path, fileValue.content, state);
          return;
        }
      }

      // Determine file state and send response
      const doc = await vscode.workspace.openTextDocument(uri);
      const { changesApplied, reason } = determineFileState(
        currentText,
        originalContent,
        suggestedContent,
        doc.isDirty,
      );

      const responseId = changesApplied ? "apply" : "reject";
      await handleFileResponse(messageToken, responseId, path, fileValue.content, state);
    } catch (error) {
      logger.error("Error handling CHECK_FILE_STATE:", error);
      vscode.window.showErrorMessage(`Failed to check file state: ${error}`);
    }
  },

  // Analysis and server actions
  [RUN_ANALYSIS]() {
    vscode.commands.executeCommand("konveyor.runAnalysis");
  },

  [START_SERVER]() {
    vscode.commands.executeCommand("konveyor.startServer");
  },

  [STOP_SERVER]() {
    vscode.commands.executeCommand("konveyor.stopServer");
  },

  [GET_SUCCESS_RATE]() {
    vscode.commands.executeCommand("konveyor.getSuccessRate");
  },

  // File navigation actions
  async [OPEN_FILE]({ file, line }) {
    const fileUri = vscode.Uri.parse(file);
    try {
      const doc = await vscode.workspace.openTextDocument(fileUri);
      const editor = await vscode.window.showTextDocument(doc, { preview: true });
      const position = new vscode.Position(line - 1, 0);
      const range = new vscode.Range(position, position);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open file: ${error}`);
    }
  },
};

export const messageHandler = async (
  message: WebviewAction<WebviewActionType, unknown>,
  state: ExtensionState,
) => {
  const handler = actions?.[message?.type];
  if (handler) {
    await handler(message.payload, state);
  } else {
    defaultHandler(message);
  }
};

const defaultHandler = (message: WebviewAction<WebviewActionType, unknown>) => {
  logger.error("Unknown message from webview:", message);
};

function updateConfigErrorsFromActiveProfile(draft: ExtensionData) {
  const activeProfile = draft.profiles.find((p) => p.id === draft.activeProfileId);

  // Clear profile-related errors
  draft.configErrors = draft.configErrors.filter(
    (error) =>
      error.type !== "no-active-profile" &&
      error.type !== "invalid-label-selector" &&
      error.type !== "no-custom-rules",
  );

  if (!activeProfile) {
    draft.configErrors.push(createConfigError.noActiveProfile());
    return;
  }

  // Check label selector
  if (!activeProfile.labelSelector?.trim()) {
    draft.configErrors.push(createConfigError.invalidLabelSelector());
  }

  // Check custom rules when default rules are disabled
  if (
    !activeProfile.useDefaultRules &&
    (!activeProfile.customRules || activeProfile.customRules.length === 0)
  ) {
    draft.configErrors.push(createConfigError.noCustomRules());
  }
}
