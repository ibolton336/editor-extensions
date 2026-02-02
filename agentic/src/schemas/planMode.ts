import { Annotation } from "@langchain/langgraph";
import type { EnhancedIncident } from "@editor-extensions/shared";

import { BaseInputMetaState, BaseOutputMetaState } from "./base";

// Local types for plan mode (to avoid circular dependency with types.ts)
export type PlanStepCategory = "refactor" | "dependency" | "config" | "test" | "other";
export type PlanStepEffort = "low" | "medium" | "high";
export type PlanStatus = "pending" | "approved" | "rejected" | "executing" | "completed";

export interface PlanStep {
  id: string;
  title: string;
  description: string;
  file?: string;
  estimatedEffort: PlanStepEffort;
  category: PlanStepCategory;
  selected: boolean;
  status?: "pending" | "in_progress" | "completed" | "skipped";
  validationWarnings?: string[];
}

export interface ResearchFinding {
  id: string;
  type: "tech_debt" | "migration_pattern" | "dependency_issue" | "config_issue" | "other";
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
  affectedFiles: string[];
}

// Plan status tracking
export type PlanModeStatus =
  | "researching"
  | "planning"
  | "validating"
  | "awaiting_approval"
  | "executing"
  | "completed"
  | "rejected";

// Input state for the research node
export const ResearchInputState = Annotation.Root({
  ...BaseInputMetaState.spec,
  // Incidents to analyze for planning
  inputIncidents: Annotation<EnhancedIncident[]>,
  // Workspace directory for file analysis
  workspaceDir: Annotation<string>,
});

// Output state for the research node
export const ResearchOutputState = Annotation.Root({
  ...BaseOutputMetaState.spec,
  // Research findings from analyzing the codebase
  researchFindings: Annotation<ResearchFinding[]>,
  // Summary of the research phase
  researchSummary: Annotation<string | undefined>,
});

// Input state for the plan generation node
export const PlanGenerationInputState = Annotation.Root({
  ...BaseInputMetaState.spec,
  // Research findings from the research phase
  researchFindings: Annotation<ResearchFinding[]>,
  // Incidents to create a plan for
  inputIncidents: Annotation<EnhancedIncident[]>,
  // Research summary for context
  researchSummary: Annotation<string | undefined>,
});

// Output state for the plan generation node
export const PlanGenerationOutputState = Annotation.Root({
  ...BaseOutputMetaState.spec,
  // Generated plan steps
  generatedPlan: Annotation<PlanStep[]>,
  // Plan title
  planTitle: Annotation<string>,
  // Plan summary
  planSummary: Annotation<string>,
  // Unique plan ID
  planId: Annotation<string>,
});

// Input state for the validation node
export const ValidationInputState = Annotation.Root({
  ...BaseInputMetaState.spec,
  // Generated plan steps to validate
  generatedPlan: Annotation<PlanStep[]>,
  // Workspace directory for validation checks
  workspaceDir: Annotation<string>,
});

// Output state for the validation node
export const ValidationOutputState = Annotation.Root({
  ...BaseOutputMetaState.spec,
  // Validated plan steps (may have warnings added)
  validatedPlan: Annotation<PlanStep[]>,
  // Overall validation passed
  validationPassed: Annotation<boolean>,
  // Validation messages (warnings/errors)
  validationMessages: Annotation<string[]>,
});

// Input state for the approval gate node
export const ApprovalGateInputState = Annotation.Root({
  ...BaseInputMetaState.spec,
  // Plan ID for tracking
  planId: Annotation<string>,
  // Plan title
  planTitle: Annotation<string>,
  // Plan summary
  planSummary: Annotation<string>,
  // Validated plan steps
  validatedPlan: Annotation<PlanStep[]>,
  // Research findings for context display
  researchFindings: Annotation<ResearchFinding[]>,
});

// Output state for the approval gate node
export const ApprovalGateOutputState = Annotation.Root({
  ...BaseOutputMetaState.spec,
  // User-approved steps (filtered based on selection)
  approvedSteps: Annotation<PlanStep[]>,
  // Whether the plan was approved
  planApproved: Annotation<boolean>,
  // IDs of steps the user selected
  selectedStepIds: Annotation<string[]>,
});

// Overall orchestrator state for the plan mode workflow
export const PlanModeOrchestratorState = Annotation.Root({
  // Base meta state
  ...BaseInputMetaState.spec,
  ...BaseOutputMetaState.spec,

  // Input fields
  inputIncidents: Annotation<EnhancedIncident[]>,
  workspaceDir: Annotation<string>,

  // Research phase outputs
  researchFindings: Annotation<ResearchFinding[]>,
  researchSummary: Annotation<string | undefined>,

  // Plan generation outputs
  generatedPlan: Annotation<PlanStep[]>,
  planId: Annotation<string>,
  planTitle: Annotation<string>,
  planSummary: Annotation<string>,

  // Validation outputs
  validatedPlan: Annotation<PlanStep[]>,
  validationPassed: Annotation<boolean>,
  validationMessages: Annotation<string[]>,

  // Approval gate outputs
  approvedSteps: Annotation<PlanStep[]>,
  planApproved: Annotation<boolean>,
  selectedStepIds: Annotation<string[]>,

  // Execution tracking
  currentStepIdx: Annotation<number>,
  completedStepIds: Annotation<string[]>,

  // Mode flags
  isPlanMode: Annotation<boolean>,
  planStatus: Annotation<PlanModeStatus>,

  // Control flow
  shouldEnd: Annotation<boolean>,
});

// Output state for the plan mode workflow (what gets returned)
export const PlanModeOutputState = Annotation.Root({
  ...BaseOutputMetaState.spec,
  // Final approved steps ready for execution
  approvedSteps: Annotation<PlanStep[]>,
  // Plan was approved
  planApproved: Annotation<boolean>,
  // Plan metadata
  planId: Annotation<string>,
  planTitle: Annotation<string>,
  planSummary: Annotation<string>,
  // Research context
  researchFindings: Annotation<ResearchFinding[]>,
});
