import { expect } from "expect";
import { createExtensionStore } from "../../store/extensionStore";
import {
  selectAnalysisState,
  selectChatMessages,
  selectSolutionWorkflow,
  selectServerState,
  selectProfiles,
  selectConfigErrors,
  selectDecorators,
  selectSettings,
  createDefaultBindings,
} from "../../store/slices";
import { ChatMessageType, MessageTypes } from "@editor-extensions/shared";

describe("ExtensionStore", () => {
  describe("createExtensionStore", () => {
    it("should create a store with default state", () => {
      const store = createExtensionStore();
      const state = store.getState();

      expect(state.isAnalyzing).toBe(false);
      expect(state.chatMessages).toEqual([]);
      expect(state.ruleSets).toEqual([]);
      expect(state.serverState).toBe("initial");
      expect(state.solutionState).toBe("none");
      expect(state.profiles).toEqual([]);
      expect(state.configErrors).toEqual([]);
    });

    it("should accept partial initial state overrides", () => {
      const store = createExtensionStore({
        workspaceRoot: "/test/workspace",
        isAnalyzing: true,
      });
      const state = store.getState();

      expect(state.workspaceRoot).toBe("/test/workspace");
      expect(state.isAnalyzing).toBe(true);
      expect(state.chatMessages).toEqual([]);
    });
  });

  describe("actions", () => {
    it("updateAnalysis should update analysis fields via Immer draft", () => {
      const store = createExtensionStore();

      store.getState().updateAnalysis((draft) => {
        draft.isAnalyzing = true;
        draft.analysisProgress = 50;
        draft.analysisProgressMessage = "Processing...";
      });

      const state = store.getState();
      expect(state.isAnalyzing).toBe(true);
      expect(state.analysisProgress).toBe(50);
      expect(state.analysisProgressMessage).toBe("Processing...");
    });

    it("updateChat should update chat messages without affecting other fields", () => {
      const store = createExtensionStore({ isAnalyzing: true });

      store.getState().updateChat((draft) => {
        draft.chatMessages.push({
          kind: ChatMessageType.String,
          value: { message: "Hello" },
          messageToken: "msg-1",
          timestamp: new Date().toISOString(),
        });
      });

      const state = store.getState();
      expect(state.chatMessages).toHaveLength(1);
      expect(state.chatMessages[0].messageToken).toBe("msg-1");
      expect(state.isAnalyzing).toBe(true);
    });

    it("updateSolution should update solution workflow fields", () => {
      const store = createExtensionStore();

      store.getState().updateSolution((draft) => {
        draft.isFetchingSolution = true;
        draft.solutionState = "started";
      });

      expect(store.getState().isFetchingSolution).toBe(true);
      expect(store.getState().solutionState).toBe("started");
    });

    it("updateServer should update server state fields", () => {
      const store = createExtensionStore();

      store.getState().updateServer((draft) => {
        draft.serverState = "running";
        draft.solutionServerConnected = true;
      });

      expect(store.getState().serverState).toBe("running");
      expect(store.getState().solutionServerConnected).toBe(true);
    });

    it("updateProfiles should update profile fields", () => {
      const store = createExtensionStore();

      store.getState().updateProfiles((draft) => {
        draft.profiles = [{ name: "test", id: "1" } as any];
        draft.activeProfileId = "1";
      });

      expect(store.getState().profiles).toHaveLength(1);
      expect(store.getState().activeProfileId).toBe("1");
    });

    it("updateConfig should update config error fields", () => {
      const store = createExtensionStore();

      store.getState().updateConfig((draft) => {
        draft.configErrors = [{ type: "no-workspace", message: "No workspace" } as any];
      });

      expect(store.getState().configErrors).toHaveLength(1);
    });

    it("updateDecorators should update decorator fields", () => {
      const store = createExtensionStore();

      store.getState().updateDecorators((draft) => {
        draft.activeDecorators = { "file.ts": "token-1" };
      });

      expect(store.getState().activeDecorators).toEqual({
        "file.ts": "token-1",
      });
    });

    it("updateSettings should update settings fields", () => {
      const store = createExtensionStore();

      store.getState().updateSettings((draft) => {
        draft.isAgentMode = true;
        draft.solutionServerEnabled = true;
      });

      expect(store.getState().isAgentMode).toBe(true);
      expect(store.getState().solutionServerEnabled).toBe(true);
    });

    it("actions should not affect unrelated fields", () => {
      const store = createExtensionStore({
        isAnalyzing: false,
        chatMessages: [],
      });

      store.getState().updateAnalysis((draft) => {
        draft.isAnalyzing = true;
      });

      expect(store.getState().isAnalyzing).toBe(true);
      expect(store.getState().chatMessages).toEqual([]);
      expect(store.getState().serverState).toBe("initial");
    });
  });

  describe("subscribe", () => {
    it("should notify subscribers on state change", () => {
      const store = createExtensionStore();
      const changes: boolean[] = [];

      store.subscribe((state) => {
        changes.push(state.isAnalyzing);
      });

      store.getState().updateAnalysis((draft) => {
        draft.isAnalyzing = true;
      });

      expect(changes).toEqual([true]);
    });
  });
});

describe("Slice Selectors", () => {
  const store = createExtensionStore({
    isAnalyzing: true,
    analysisProgress: 75,
    chatMessages: [],
    serverState: "running",
    solutionState: "started",
    isFetchingSolution: true,
    profiles: [],
    activeProfileId: "p1",
    isInTreeMode: false,
    configErrors: [],
    activeDecorators: { "a.ts": "tok" },
    isAgentMode: true,
    solutionServerEnabled: true,
  });
  const state = store.getState();

  it("selectAnalysisState returns only analysis fields", () => {
    const slice = selectAnalysisState(state);
    expect(slice).toHaveProperty("isAnalyzing", true);
    expect(slice).toHaveProperty("analysisProgress", 75);
    expect(slice).not.toHaveProperty("chatMessages");
    expect(slice).not.toHaveProperty("serverState");
  });

  it("selectChatMessages returns only chat fields", () => {
    const slice = selectChatMessages(state);
    expect(slice).toHaveProperty("chatMessages");
    expect(slice).not.toHaveProperty("isAnalyzing");
  });

  it("selectSolutionWorkflow returns only solution fields", () => {
    const slice = selectSolutionWorkflow(state);
    expect(slice).toHaveProperty("isFetchingSolution", true);
    expect(slice).toHaveProperty("solutionState", "started");
    expect(slice).not.toHaveProperty("serverState");
  });

  it("selectServerState returns only server fields", () => {
    const slice = selectServerState(state);
    expect(slice).toHaveProperty("serverState", "running");
    expect(slice).not.toHaveProperty("isAnalyzing");
  });

  it("selectProfiles returns only profile fields", () => {
    const slice = selectProfiles(state);
    expect(slice).toHaveProperty("activeProfileId", "p1");
    expect(slice).toHaveProperty("isInTreeMode", false);
    expect(slice).not.toHaveProperty("serverState");
  });

  it("selectConfigErrors returns only config fields", () => {
    const slice = selectConfigErrors(state);
    expect(slice).toHaveProperty("configErrors");
    expect(slice).not.toHaveProperty("profiles");
  });

  it("selectDecorators returns only decorator fields", () => {
    const slice = selectDecorators(state);
    expect(slice).toHaveProperty("activeDecorators");
    expect(slice).not.toHaveProperty("configErrors");
  });

  it("selectSettings returns only settings fields", () => {
    const slice = selectSettings(state);
    expect(slice).toHaveProperty("isAgentMode", true);
    expect(slice).toHaveProperty("solutionServerEnabled", true);
    expect(slice).not.toHaveProperty("isAnalyzing");
  });
});

describe("createDefaultBindings", () => {
  it("should return 8 bindings matching MessageTypes", () => {
    const bindings = createDefaultBindings();
    expect(bindings).toHaveLength(8);

    const commands = bindings.map((b) => b.command);
    expect(commands).toContain(MessageTypes.ANALYSIS_STATE_UPDATE);
    expect(commands).toContain(MessageTypes.CHAT_MESSAGES_UPDATE);
    expect(commands).toContain(MessageTypes.SOLUTION_WORKFLOW_UPDATE);
    expect(commands).toContain(MessageTypes.SERVER_STATE_UPDATE);
    expect(commands).toContain(MessageTypes.PROFILES_UPDATE);
    expect(commands).toContain(MessageTypes.CONFIG_ERRORS_UPDATE);
    expect(commands).toContain(MessageTypes.DECORATORS_UPDATE);
    expect(commands).toContain(MessageTypes.SETTINGS_UPDATE);
  });

  it("each binding should have a name, selector, and command", () => {
    const bindings = createDefaultBindings();

    for (const binding of bindings) {
      expect(typeof binding.name).toBe("string");
      expect(typeof binding.selector).toBe("function");
      expect(typeof binding.command).toBe("string");
    }
  });
});
