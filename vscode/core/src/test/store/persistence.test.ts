import { expect } from "expect";
import { createExtensionStore } from "../../store/extensionStore";
import { PersistenceManager } from "../../store/persistence";

/** Mock VS Code workspaceState */
function createMockWorkspaceState() {
  const storage = new Map<string, unknown>();
  return {
    get<T>(key: string): T | undefined {
      return storage.get(key) as T | undefined;
    },
    update(key: string, value: unknown): Thenable<void> {
      storage.set(key, value);
      return Promise.resolve();
    },
    keys: () => [...storage.keys()],
    _storage: storage,
  };
}

/** Mock VS Code ExtensionContext (only workspaceState needed) */
function createMockContext() {
  return {
    workspaceState: createMockWorkspaceState(),
  } as any;
}

describe("PersistenceManager", () => {
  describe("hydrate", () => {
    it("should load persisted analysis results into store", () => {
      const store = createExtensionStore();
      const context = createMockContext();

      // Pre-populate workspace state
      context.workspaceState.update("konveyor.analysis.results", {
        ruleSets: [{ name: "test-rule" }],
        enhancedIncidents: [{ violationId: "v1", uri: "file.ts", message: "test" }],
      });

      const pm = new PersistenceManager(store, context);
      pm.hydrate();

      expect(store.getState().ruleSets).toHaveLength(1);
      expect((store.getState().ruleSets[0] as any).name).toBe("test-rule");
      expect(store.getState().enhancedIncidents).toHaveLength(1);

      pm.dispose();
    });

    it("should load persisted profiles into store", () => {
      const store = createExtensionStore();
      const context = createMockContext();

      context.workspaceState.update("konveyor.profiles", {
        profiles: [{ id: "p1", name: "default" }],
        activeProfileId: "p1",
      });

      const pm = new PersistenceManager(store, context);
      pm.hydrate();

      expect(store.getState().profiles).toHaveLength(1);
      expect(store.getState().activeProfileId).toBe("p1");

      pm.dispose();
    });

    it("should load persisted settings into store", () => {
      const store = createExtensionStore();
      const context = createMockContext();

      context.workspaceState.update("konveyor.settings", {
        solutionServerEnabled: true,
        isAgentMode: true,
        profileSyncEnabled: true,
      });

      const pm = new PersistenceManager(store, context);
      pm.hydrate();

      expect(store.getState().solutionServerEnabled).toBe(true);
      expect(store.getState().isAgentMode).toBe(true);
      expect(store.getState().profileSyncEnabled).toBe(true);

      pm.dispose();
    });

    it("should handle missing persisted data gracefully", () => {
      const store = createExtensionStore();
      const context = createMockContext();
      // No data pre-populated

      const pm = new PersistenceManager(store, context);
      pm.hydrate();

      // Should still have defaults
      expect(store.getState().ruleSets).toEqual([]);
      expect(store.getState().profiles).toEqual([]);
      expect(store.getState().isAgentMode).toBe(false);

      pm.dispose();
    });
  });

  describe("subscribe", () => {
    it("should write analysis changes to workspace state after debounce", async () => {
      const store = createExtensionStore();
      const context = createMockContext();
      const pm = new PersistenceManager(store, context);

      pm.subscribe();

      store.getState().updateAnalysis((draft) => {
        draft.ruleSets = [{ name: "new-rule" } as any];
      });

      // Wait for debounce (1000ms + buffer)
      await new Promise((resolve) => setTimeout(resolve, 1200));

      const persisted = context.workspaceState.get("konveyor.analysis.results") as any;
      expect(persisted).toBeDefined();
      expect(persisted.ruleSets).toHaveLength(1);

      pm.dispose();
    });

    it("should not persist ephemeral slices (chat, server, etc.)", async () => {
      const store = createExtensionStore();
      const context = createMockContext();
      const pm = new PersistenceManager(store, context);

      pm.subscribe();

      store.getState().updateChat((draft) => {
        draft.chatMessages = [{ messageToken: "test" } as any];
      });

      store.getState().updateServer((draft) => {
        draft.serverState = "running";
      });

      await new Promise((resolve) => setTimeout(resolve, 1200));

      // Chat and server should NOT be persisted
      expect(context.workspaceState._storage.has("konveyor.chat")).toBe(false);
      expect(context.workspaceState._storage.has("konveyor.server")).toBe(false);

      pm.dispose();
    });

    it("should stop writing after dispose", async () => {
      const store = createExtensionStore();
      const context = createMockContext();
      const pm = new PersistenceManager(store, context);

      pm.subscribe();
      pm.dispose();

      store.getState().updateAnalysis((draft) => {
        draft.ruleSets = [{ name: "should-not-persist" } as any];
      });

      await new Promise((resolve) => setTimeout(resolve, 1200));

      const persisted = context.workspaceState.get("konveyor.analysis.results");
      expect(persisted).toBeUndefined();
    });
  });
});
