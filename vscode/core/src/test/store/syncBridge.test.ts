import { expect } from "expect";
import { createExtensionStore } from "../../store/extensionStore";
import { createDefaultBindings } from "../../store/slices";
import {
  createSyncBridge,
  WebviewMessageConsumer,
  type MessageConsumer,
} from "../../store/syncBridge";
import { MessageTypes } from "@editor-extensions/shared";

/** Simple mock consumer that records sent messages */
function createMockConsumer(): MessageConsumer & {
  messages: Array<{ type: string; [key: string]: unknown }>;
} {
  const messages: Array<{ type: string; [key: string]: unknown }> = [];
  return {
    messages,
    send(msg) {
      messages.push(msg);
    },
    isReady() {
      return true;
    },
  };
}

describe("SyncBridge", () => {
  describe("connect", () => {
    it("should not send messages until state changes", () => {
      const store = createExtensionStore();
      const consumer = createMockConsumer();
      const bridge = createSyncBridge({
        store,
        consumer,
        bindings: createDefaultBindings(),
      });

      bridge.connect();

      expect(consumer.messages).toHaveLength(0);

      bridge.dispose();
    });

    it("should send message when a watched slice changes", () => {
      const store = createExtensionStore();
      const consumer = createMockConsumer();
      const bridge = createSyncBridge({
        store,
        consumer,
        bindings: createDefaultBindings(),
      });

      bridge.connect();

      store.getState().updateAnalysis((draft) => {
        draft.isAnalyzing = true;
      });

      expect(consumer.messages).toHaveLength(1);
      expect(consumer.messages[0].type).toBe(MessageTypes.ANALYSIS_STATE_UPDATE);
      expect((consumer.messages[0] as any).isAnalyzing).toBe(true);

      bridge.dispose();
    });

    it("should not send messages for unchanged slices", () => {
      const store = createExtensionStore();
      const consumer = createMockConsumer();
      const bridge = createSyncBridge({
        store,
        consumer,
        bindings: createDefaultBindings(),
      });

      bridge.connect();

      // Update analysis — only analysis message should be sent
      store.getState().updateAnalysis((draft) => {
        draft.isAnalyzing = true;
      });

      expect(consumer.messages).toHaveLength(1);
      expect(consumer.messages[0].type).toBe(MessageTypes.ANALYSIS_STATE_UPDATE);

      // No chat, server, profiles, etc. messages
      const types = consumer.messages.map((m) => m.type);
      expect(types).not.toContain(MessageTypes.CHAT_MESSAGES_UPDATE);
      expect(types).not.toContain(MessageTypes.SERVER_STATE_UPDATE);

      bridge.dispose();
    });

    it("should include timestamp in messages", () => {
      const store = createExtensionStore();
      const consumer = createMockConsumer();
      const bridge = createSyncBridge({
        store,
        consumer,
        bindings: createDefaultBindings(),
      });

      bridge.connect();

      store.getState().updateServer((draft) => {
        draft.serverState = "running";
      });

      expect(consumer.messages[0]).toHaveProperty("timestamp");
      expect(typeof consumer.messages[0].timestamp).toBe("string");

      bridge.dispose();
    });
  });

  describe("syncAll", () => {
    it("should send current state for all slices", () => {
      const store = createExtensionStore({ isAnalyzing: true });
      const consumer = createMockConsumer();
      const bridge = createSyncBridge({
        store,
        consumer,
        bindings: createDefaultBindings(),
      });

      bridge.syncAll();

      // Should send one message per binding (8 total)
      expect(consumer.messages).toHaveLength(8);

      const types = consumer.messages.map((m) => m.type);
      expect(types).toContain(MessageTypes.ANALYSIS_STATE_UPDATE);
      expect(types).toContain(MessageTypes.CHAT_MESSAGES_UPDATE);
      expect(types).toContain(MessageTypes.SOLUTION_WORKFLOW_UPDATE);
      expect(types).toContain(MessageTypes.SERVER_STATE_UPDATE);
      expect(types).toContain(MessageTypes.PROFILES_UPDATE);
      expect(types).toContain(MessageTypes.CONFIG_ERRORS_UPDATE);
      expect(types).toContain(MessageTypes.DECORATORS_UPDATE);
      expect(types).toContain(MessageTypes.SETTINGS_UPDATE);

      // Verify the analysis message has the correct state
      const analysisMsg = consumer.messages.find(
        (m) => m.type === MessageTypes.ANALYSIS_STATE_UPDATE,
      );
      expect((analysisMsg as any).isAnalyzing).toBe(true);

      bridge.dispose();
    });
  });

  describe("pause / resume", () => {
    it("should queue messages when paused", () => {
      const store = createExtensionStore();
      const consumer = createMockConsumer();
      const bridge = createSyncBridge({
        store,
        consumer,
        bindings: createDefaultBindings(),
      });

      bridge.connect();
      bridge.pause();

      store.getState().updateAnalysis((draft) => {
        draft.isAnalyzing = true;
      });

      // No messages sent while paused
      expect(consumer.messages).toHaveLength(0);

      bridge.dispose();
    });

    it("should flush coalesced queue on resume", () => {
      const store = createExtensionStore();
      const consumer = createMockConsumer();
      const bridge = createSyncBridge({
        store,
        consumer,
        bindings: createDefaultBindings(),
      });

      bridge.connect();
      bridge.pause();

      store.getState().updateAnalysis((draft) => {
        draft.isAnalyzing = true;
      });

      store.getState().updateServer((draft) => {
        draft.serverState = "running";
      });

      bridge.resume();

      // Both queued messages should be flushed
      expect(consumer.messages).toHaveLength(2);
      const types = consumer.messages.map((m) => m.type);
      expect(types).toContain(MessageTypes.ANALYSIS_STATE_UPDATE);
      expect(types).toContain(MessageTypes.SERVER_STATE_UPDATE);

      bridge.dispose();
    });

    it("should coalesce multiple updates to the same slice while paused", () => {
      const store = createExtensionStore();
      const consumer = createMockConsumer();
      const bridge = createSyncBridge({
        store,
        consumer,
        bindings: createDefaultBindings(),
      });

      bridge.connect();
      bridge.pause();

      // Multiple analysis updates while paused
      store.getState().updateAnalysis((draft) => {
        draft.isAnalyzing = true;
        draft.analysisProgress = 25;
      });
      store.getState().updateAnalysis((draft) => {
        draft.analysisProgress = 50;
      });
      store.getState().updateAnalysis((draft) => {
        draft.analysisProgress = 100;
        draft.isAnalyzing = false;
      });

      bridge.resume();

      // Only one analysis message — the latest
      const analysisMsgs = consumer.messages.filter(
        (m) => m.type === MessageTypes.ANALYSIS_STATE_UPDATE,
      );
      expect(analysisMsgs).toHaveLength(1);
      expect((analysisMsgs[0] as any).analysisProgress).toBe(100);
      expect((analysisMsgs[0] as any).isAnalyzing).toBe(false);

      bridge.dispose();
    });
  });

  describe("dispose", () => {
    it("should stop sending messages after dispose", () => {
      const store = createExtensionStore();
      const consumer = createMockConsumer();
      const bridge = createSyncBridge({
        store,
        consumer,
        bindings: createDefaultBindings(),
      });

      bridge.connect();
      bridge.dispose();

      store.getState().updateAnalysis((draft) => {
        draft.isAnalyzing = true;
      });

      expect(consumer.messages).toHaveLength(0);
    });
  });
});

describe("WebviewMessageConsumer", () => {
  it("should queue messages before setReady", () => {
    const sent: unknown[] = [];
    const consumer = new WebviewMessageConsumer((msg) => {
      sent.push(msg);
      return Promise.resolve(true);
    });

    consumer.send({ type: "TEST", data: 1 });
    consumer.send({ type: "TEST", data: 2 });

    expect(sent).toHaveLength(0);
    expect(consumer.isReady()).toBe(false);
  });

  it("should send messages directly after setReady", () => {
    const sent: unknown[] = [];
    const consumer = new WebviewMessageConsumer((msg) => {
      sent.push(msg);
      return Promise.resolve(true);
    });

    consumer.setReady();
    consumer.send({ type: "TEST", data: 1 });

    expect(sent).toHaveLength(1);
    expect(consumer.isReady()).toBe(true);
  });

  it("should flush queued messages on flush", () => {
    const sent: unknown[] = [];
    const consumer = new WebviewMessageConsumer((msg) => {
      sent.push(msg);
      return Promise.resolve(true);
    });

    consumer.send({ type: "A" });
    consumer.send({ type: "B" });

    consumer.setReady();
    consumer.flush();

    expect(sent).toHaveLength(2);
  });

  it("should clear queue on dispose", () => {
    const sent: unknown[] = [];
    const consumer = new WebviewMessageConsumer((msg) => {
      sent.push(msg);
      return Promise.resolve(true);
    });

    consumer.send({ type: "A" });
    consumer.dispose();

    consumer.setReady();
    consumer.flush();

    expect(sent).toHaveLength(0);
    expect(consumer.isReady()).toBe(false);
  });
});
