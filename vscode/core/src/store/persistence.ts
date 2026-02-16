import type { ExtensionContext } from "vscode";
import type { ExtensionData } from "@editor-extensions/shared";
import type { ExtensionStore, ExtensionStoreState } from "./extensionStore";

/**
 * Keys for workspace-scoped persisted state.
 * Each key maps to a subset of store fields that survive IDE restarts.
 */
const PERSISTENCE_KEYS = {
  analysisResults: "konveyor.analysis.results",
  profiles: "konveyor.profiles",
  settings: "konveyor.settings",
} as const;

/**
 * Debounce timeout for persistence writes (ms).
 * Prevents rapid-fire writes during batch state changes.
 */
const DEBOUNCE_MS = 1000;

/**
 * Fields persisted under each key.
 * Only these fields are read from / written to storage.
 */
interface PersistedAnalysis {
  ruleSets: ExtensionData["ruleSets"];
  enhancedIncidents: ExtensionData["enhancedIncidents"];
}

interface PersistedProfiles {
  profiles: ExtensionData["profiles"];
  activeProfileId: ExtensionData["activeProfileId"];
}

interface PersistedSettings {
  solutionServerEnabled: ExtensionData["solutionServerEnabled"];
  isAgentMode: ExtensionData["isAgentMode"];
  profileSyncEnabled: ExtensionData["profileSyncEnabled"];
}

/**
 * PersistenceManager handles reading/writing durable state slices
 * to VS Code's workspaceState storage.
 *
 * Durable slices: analysis results, profiles, settings
 * Ephemeral slices: chat, server, solution, config, decorators
 */
export class PersistenceManager {
  private _store: ExtensionStore;
  private _context: ExtensionContext;
  private _unsubscribers: Array<() => void> = [];
  private _debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private _disposed = false;

  constructor(store: ExtensionStore, context: ExtensionContext) {
    this._store = store;
    this._context = context;
  }

  /**
   * Load persisted state from workspaceState and hydrate the store.
   * Called once during extension activation, before any webviews connect.
   */
  hydrate(): void {
    const ws = this._context.workspaceState;

    const analysis = ws.get<PersistedAnalysis>(PERSISTENCE_KEYS.analysisResults);
    if (analysis) {
      this._store.getState().updateAnalysis((draft) => {
        if (analysis.ruleSets) {
          draft.ruleSets = analysis.ruleSets;
        }
        if (analysis.enhancedIncidents) {
          draft.enhancedIncidents = analysis.enhancedIncidents;
        }
      });
    }

    const profiles = ws.get<PersistedProfiles>(PERSISTENCE_KEYS.profiles);
    if (profiles) {
      this._store.getState().updateProfiles((draft) => {
        if (profiles.profiles) {
          draft.profiles = profiles.profiles;
        }
        if (profiles.activeProfileId !== undefined) {
          draft.activeProfileId = profiles.activeProfileId;
        }
      });
    }

    const settings = ws.get<PersistedSettings>(PERSISTENCE_KEYS.settings);
    if (settings) {
      this._store.getState().updateSettings((draft) => {
        if (settings.solutionServerEnabled !== undefined) {
          draft.solutionServerEnabled = settings.solutionServerEnabled;
        }
        if (settings.isAgentMode !== undefined) {
          draft.isAgentMode = settings.isAgentMode;
        }
        if (settings.profileSyncEnabled !== undefined) {
          draft.profileSyncEnabled = settings.profileSyncEnabled;
        }
      });
    }
  }

  /**
   * Subscribe to durable slices and write changes to workspaceState.
   * Writes are debounced to prevent rapid-fire persistence during batch updates.
   */
  subscribe(): void {
    if (this._disposed) {
      return;
    }

    // Watch analysis results
    let prevAnalysis = this._selectAnalysis(this._store.getState());
    const unsubAnalysis = this._store.subscribe((state: ExtensionStoreState) => {
      const current = this._selectAnalysis(state);
      if (prevAnalysis !== current) {
        prevAnalysis = current;
        this._debouncedWrite(PERSISTENCE_KEYS.analysisResults, current);
      }
    });
    this._unsubscribers.push(unsubAnalysis);

    // Watch profiles
    let prevProfiles = this._selectProfiles(this._store.getState());
    const unsubProfiles = this._store.subscribe((state: ExtensionStoreState) => {
      const current = this._selectProfiles(state);
      if (prevProfiles !== current) {
        prevProfiles = current;
        this._debouncedWrite(PERSISTENCE_KEYS.profiles, current);
      }
    });
    this._unsubscribers.push(unsubProfiles);

    // Watch settings
    let prevSettings = this._selectSettings(this._store.getState());
    const unsubSettings = this._store.subscribe((state: ExtensionStoreState) => {
      const current = this._selectSettings(state);
      if (prevSettings !== current) {
        prevSettings = current;
        this._debouncedWrite(PERSISTENCE_KEYS.settings, current);
      }
    });
    this._unsubscribers.push(unsubSettings);
  }

  /**
   * Clean up subscriptions and pending timers.
   */
  dispose(): void {
    this._disposed = true;

    for (const unsub of this._unsubscribers) {
      unsub();
    }
    this._unsubscribers.length = 0;

    for (const timer of this._debounceTimers.values()) {
      clearTimeout(timer);
    }
    this._debounceTimers.clear();
  }

  // ── Private helpers ──────────────────────────────────────────────

  private _selectAnalysis(state: ExtensionStoreState): PersistedAnalysis {
    return {
      ruleSets: state.ruleSets,
      enhancedIncidents: state.enhancedIncidents,
    };
  }

  private _selectProfiles(state: ExtensionStoreState): PersistedProfiles {
    return {
      profiles: state.profiles,
      activeProfileId: state.activeProfileId,
    };
  }

  private _selectSettings(state: ExtensionStoreState): PersistedSettings {
    return {
      solutionServerEnabled: state.solutionServerEnabled,
      isAgentMode: state.isAgentMode,
      profileSyncEnabled: state.profileSyncEnabled,
    };
  }

  private _debouncedWrite(key: string, value: unknown): void {
    const existing = this._debounceTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this._debounceTimers.delete(key);
      if (!this._disposed) {
        this._context.workspaceState.update(key, value);
      }
    }, DEBOUNCE_MS);

    this._debounceTimers.set(key, timer);
  }
}
