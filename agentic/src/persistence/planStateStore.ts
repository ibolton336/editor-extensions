import * as fs from "fs/promises";
import * as path from "path";
import type { PlanStep, ResearchFinding, PlanStatus } from "../schemas/planMode";
import type { Logger } from "winston";

/**
 * Persisted plan state - allows resuming plan execution after process restart
 */
export interface PersistedPlanState {
  // Plan identification
  planId: string;
  planTitle: string;
  planSummary: string;
  createdAt: string;
  updatedAt: string;

  // Plan content
  researchFindings: ResearchFinding[];
  allSteps: PlanStep[];
  approvedSteps: PlanStep[];
  selectedStepIds: string[];

  // Execution progress
  status: PlanStatus;
  currentStepIdx: number;
  completedStepIds: string[];
  failedStepIds: string[];

  // Context
  migrationHint: string;
  programmingLanguage: string;
  incidentCount: number;
}

/**
 * Interface for plan state persistence
 */
export interface PlanStateStore {
  /**
   * Save the current plan state
   */
  savePlanState(workspaceDir: string, state: PersistedPlanState): Promise<void>;

  /**
   * Load the saved plan state if it exists
   */
  loadPlanState(workspaceDir: string): Promise<PersistedPlanState | undefined>;

  /**
   * Clear the saved plan state
   */
  clearPlanState(workspaceDir: string): Promise<void>;

  /**
   * Check if a saved plan state exists
   */
  hasPlanState(workspaceDir: string): Promise<boolean>;

  /**
   * Update execution progress for a specific step
   */
  updateStepProgress(
    workspaceDir: string,
    stepId: string,
    status: "pending" | "in_progress" | "completed" | "skipped",
  ): Promise<void>;
}

/**
 * File-based implementation of PlanStateStore
 * Stores state in a hidden .kai folder within the workspace
 */
export class FilePlanStateStore implements PlanStateStore {
  private static readonly KAI_DIR = ".kai";
  private static readonly STATE_FILE = "plan-state.json";

  constructor(private readonly logger?: Logger) {}

  private getKaiDir(workspaceDir: string): string {
    return path.join(workspaceDir, FilePlanStateStore.KAI_DIR);
  }

  private getStatePath(workspaceDir: string): string {
    return path.join(this.getKaiDir(workspaceDir), FilePlanStateStore.STATE_FILE);
  }

  async savePlanState(workspaceDir: string, state: PersistedPlanState): Promise<void> {
    try {
      const kaiDir = this.getKaiDir(workspaceDir);
      const statePath = this.getStatePath(workspaceDir);

      // Ensure .kai directory exists
      await fs.mkdir(kaiDir, { recursive: true });

      // Update timestamp
      const stateToSave: PersistedPlanState = {
        ...state,
        updatedAt: new Date().toISOString(),
      };

      // Write state file
      await fs.writeFile(statePath, JSON.stringify(stateToSave, null, 2), "utf-8");

      this.logger?.debug("Plan state saved", {
        planId: state.planId,
        path: statePath,
      });
    } catch (error) {
      this.logger?.error("Failed to save plan state", { error });
      throw error;
    }
  }

  async loadPlanState(workspaceDir: string): Promise<PersistedPlanState | undefined> {
    try {
      const statePath = this.getStatePath(workspaceDir);
      const content = await fs.readFile(statePath, "utf-8");
      const state = JSON.parse(content) as PersistedPlanState;

      this.logger?.debug("Plan state loaded", {
        planId: state.planId,
        path: statePath,
      });

      return state;
    } catch (error) {
      // File doesn't exist or is invalid - return undefined
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.logger?.debug("No plan state file found", {
          path: this.getStatePath(workspaceDir),
        });
        return undefined;
      }

      this.logger?.error("Failed to load plan state", { error });
      return undefined;
    }
  }

  async clearPlanState(workspaceDir: string): Promise<void> {
    try {
      const statePath = this.getStatePath(workspaceDir);
      await fs.unlink(statePath);

      this.logger?.debug("Plan state cleared", { path: statePath });
    } catch (error) {
      // Ignore if file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        this.logger?.error("Failed to clear plan state", { error });
        throw error;
      }
    }
  }

  async hasPlanState(workspaceDir: string): Promise<boolean> {
    try {
      const statePath = this.getStatePath(workspaceDir);
      await fs.access(statePath);
      return true;
    } catch {
      return false;
    }
  }

  async updateStepProgress(
    workspaceDir: string,
    stepId: string,
    status: "pending" | "in_progress" | "completed" | "skipped",
  ): Promise<void> {
    const state = await this.loadPlanState(workspaceDir);
    if (!state) {
      this.logger?.warn("Cannot update step progress - no plan state found");
      return;
    }

    // Update the step status in allSteps
    state.allSteps = state.allSteps.map((step) =>
      step.id === stepId ? { ...step, status } : step,
    );

    // Update the step status in approvedSteps
    state.approvedSteps = state.approvedSteps.map((step) =>
      step.id === stepId ? { ...step, status } : step,
    );

    // Update completed/failed lists
    if (status === "completed") {
      if (!state.completedStepIds.includes(stepId)) {
        state.completedStepIds.push(stepId);
      }
      // Remove from failed if it was there
      state.failedStepIds = state.failedStepIds.filter((id) => id !== stepId);
    }

    // Update current step index
    const approvedIndex = state.approvedSteps.findIndex((s) => s.id === stepId);
    if (approvedIndex !== -1 && status === "completed") {
      state.currentStepIdx = Math.min(approvedIndex + 1, state.approvedSteps.length);
    }

    // Update overall status
    const allApprovedCompleted = state.approvedSteps.every(
      (s) => state.completedStepIds.includes(s.id) || s.status === "skipped",
    );
    if (allApprovedCompleted) {
      state.status = "completed";
    } else if (status === "in_progress") {
      state.status = "executing";
    }

    await this.savePlanState(workspaceDir, state);
  }
}

/**
 * In-memory implementation of PlanStateStore for testing or ephemeral use
 */
export class InMemoryPlanStateStore implements PlanStateStore {
  private states = new Map<string, PersistedPlanState>();

  async savePlanState(workspaceDir: string, state: PersistedPlanState): Promise<void> {
    this.states.set(workspaceDir, {
      ...state,
      updatedAt: new Date().toISOString(),
    });
  }

  async loadPlanState(workspaceDir: string): Promise<PersistedPlanState | undefined> {
    return this.states.get(workspaceDir);
  }

  async clearPlanState(workspaceDir: string): Promise<void> {
    this.states.delete(workspaceDir);
  }

  async hasPlanState(workspaceDir: string): Promise<boolean> {
    return this.states.has(workspaceDir);
  }

  async updateStepProgress(
    workspaceDir: string,
    stepId: string,
    status: "pending" | "in_progress" | "completed" | "skipped",
  ): Promise<void> {
    const state = this.states.get(workspaceDir);
    if (!state) {
      return;
    }

    state.allSteps = state.allSteps.map((step) =>
      step.id === stepId ? { ...step, status } : step,
    );

    state.approvedSteps = state.approvedSteps.map((step) =>
      step.id === stepId ? { ...step, status } : step,
    );

    if (status === "completed" && !state.completedStepIds.includes(stepId)) {
      state.completedStepIds.push(stepId);
    }

    state.updatedAt = new Date().toISOString();
  }
}

/**
 * Create a default plan state store based on environment
 */
export function createPlanStateStore(logger?: Logger): PlanStateStore {
  return new FilePlanStateStore(logger);
}
