import { Logger } from "winston";
import { v4 as uuidv4 } from "uuid";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { type DynamicStructuredTool } from "@langchain/core/tools";

import { BaseNode } from "./base";
import { getCacheKey } from "../utils";
import {
  type KaiModelProvider,
  type KaiUserInteractionMessage,
  KaiWorkflowMessageType,
  type PendingUserInteraction,
} from "../types";
import {
  type PlanStep,
  type ResearchFinding,
  type PlanStepCategory,
  type PlanStepEffort,
  ResearchInputState,
  ResearchOutputState,
  PlanGenerationInputState,
  PlanGenerationOutputState,
  ValidationInputState,
  ValidationOutputState,
  ApprovalGateInputState,
  ApprovalGateOutputState,
} from "../schemas/planMode";

export class PlanModeNodes extends BaseNode {
  private readonly planApprovalPromises: Map<string, PendingUserInteraction>;

  constructor(
    modelProvider: KaiModelProvider,
    tools: DynamicStructuredTool[],
    private readonly workspaceDir: string,
    logger: Logger,
  ) {
    super("PlanMode", modelProvider, tools, logger);
    this.planApprovalPromises = new Map<string, PendingUserInteraction>();

    // Bind methods for LangGraph
    this.research = this.research.bind(this);
    this.generatePlan = this.generatePlan.bind(this);
    this.validatePlan = this.validatePlan.bind(this);
    this.approvalGate = this.approvalGate.bind(this);
    this.resolvePlanApproval = this.resolvePlanApproval.bind(this);
  }

  /**
   * Research node - analyzes the codebase and incidents to identify patterns,
   * tech debt, and migration requirements.
   */
  async research(
    state: typeof ResearchInputState.State,
  ): Promise<typeof ResearchOutputState.State> {
    this.logger.info("PlanMode: Starting research phase", {
      incidentCount: state.inputIncidents?.length ?? 0,
    });

    if (!state.inputIncidents || state.inputIncidents.length === 0) {
      return {
        researchFindings: [],
        researchSummary: undefined,
        iterationCount: state.iterationCount + 1,
      };
    }

    const sysMessage = new SystemMessage(
      `You are an expert software architect analyzing a codebase for migration planning. Your role is to identify patterns, tech debt, and migration requirements based on the incidents provided.`,
    );

    // Group incidents by file and type for analysis
    const incidentsByFile = state.inputIncidents.reduce(
      (acc, incident) => {
        const uri = incident.uri;
        if (!acc[uri]) {
          acc[uri] = [];
        }
        acc[uri].push(incident);
        return acc;
      },
      {} as Record<string, typeof state.inputIncidents>,
    );

    const humanMessage =
      new HumanMessage(`Analyze the following migration incidents and identify key findings:

## Migration Context
- Programming Language: ${state.programmingLanguage}
- Migration Goal: ${state.migrationHint}

## Incidents by File
${Object.entries(incidentsByFile)
  .map(
    ([uri, incidents]) => `
### ${uri}
${incidents.map((i) => `- ${i.message}`).join("\n")}
`,
  )
  .join("\n")}

## Your Task
Analyze these incidents and identify:
1. **Tech Debt** - Legacy patterns that need modernization
2. **Migration Patterns** - Common changes needed across files
3. **Dependency Issues** - Third-party library updates required
4. **Configuration Issues** - Config files that need updating

For each finding, provide:
- A unique ID (finding-1, finding-2, etc.)
- Type (tech_debt, migration_pattern, dependency_issue, config_issue, other)
- Title (brief description)
- Description (detailed explanation)
- Severity (low, medium, high)
- Affected files (list of file paths)

Format your response as a structured list. Example:
## Finding: finding-1
- Type: migration_pattern
- Title: Update deprecated API calls
- Description: Multiple files use the deprecated XYZ API which needs to be replaced with the new ABC API.
- Severity: high
- Affected Files: src/service/UserService.java, src/service/OrderService.java
`);

    const response = await this.streamOrInvoke(
      [sysMessage, humanMessage],
      {
        emitResponseChunks: true,
        enableTools: false,
      },
      {
        cacheKey: getCacheKey(state, "Research"),
      },
    );

    const responseText = this.aiMessageToString(response);
    const findings = this.parseResearchFindings(responseText);

    this.logger.info("PlanMode: Research phase complete", {
      findingCount: findings.length,
    });

    return {
      researchFindings: findings,
      researchSummary: responseText,
      iterationCount: state.iterationCount + 1,
    };
  }

  /**
   * Plan generation node - creates a structured execution plan based on
   * research findings and incidents.
   */
  async generatePlan(
    state: typeof PlanGenerationInputState.State,
  ): Promise<typeof PlanGenerationOutputState.State> {
    this.logger.info("PlanMode: Starting plan generation", {
      findingCount: state.researchFindings?.length ?? 0,
      incidentCount: state.inputIncidents?.length ?? 0,
    });

    const planId = uuidv4();

    if (!state.inputIncidents || state.inputIncidents.length === 0) {
      return {
        generatedPlan: [],
        planTitle: "Empty Migration Plan",
        planSummary: "No incidents to address.",
        planId,
        iterationCount: state.iterationCount + 1,
      };
    }

    const sysMessage = new SystemMessage(
      `You are an expert software architect creating a migration execution plan. Your role is to break down the migration into clear, actionable steps that can be executed independently.`,
    );

    const humanMessage =
      new HumanMessage(`Create a detailed execution plan for the following migration:

## Migration Context
- Programming Language: ${state.programmingLanguage}
- Migration Goal: ${state.migrationHint}

## Research Findings
${
  state.researchFindings && state.researchFindings.length > 0
    ? state.researchFindings
        .map(
          (f) => `
### ${f.title}
- Type: ${f.type}
- Severity: ${f.severity}
- Description: ${f.description}
- Affected Files: ${f.affectedFiles.join(", ")}
`,
        )
        .join("\n")
    : "No specific findings from research phase."
}

## Incidents to Address
${state.inputIncidents.map((i) => `- [${i.uri}] ${i.message}`).join("\n")}

## Your Task
Create a step-by-step execution plan. Each step should:
1. Be independently executable when possible
2. Have clear success criteria
3. Target specific files or components

For each step, provide:
- A unique ID (step-1, step-2, etc.)
- Title (brief action description)
- Description (detailed instructions)
- Category (refactor, dependency, config, test, other)
- Estimated Effort (low, medium, high)
- Target File (if applicable)

Order steps logically - dependencies should come before the code that uses them.

Format your response as:
## Plan Title
[Your plan title here]

## Plan Summary
[2-3 sentence summary of the plan]

## Steps

### Step: step-1
- Title: [Step title]
- Description: [Detailed description]
- Category: [refactor|dependency|config|test|other]
- Effort: [low|medium|high]
- File: [path/to/file.ext or "N/A"]

### Step: step-2
...
`);

    const response = await this.streamOrInvoke(
      [sysMessage, humanMessage],
      {
        emitResponseChunks: true,
        enableTools: false,
      },
      {
        cacheKey: getCacheKey(state, "PlanGeneration"),
      },
    );

    const responseText = this.aiMessageToString(response);
    const { title, summary, steps } = this.parsePlanResponse(responseText);

    this.logger.info("PlanMode: Plan generation complete", {
      stepCount: steps.length,
      planId,
    });

    return {
      generatedPlan: steps,
      planTitle: title,
      planSummary: summary,
      planId,
      iterationCount: state.iterationCount + 1,
    };
  }

  /**
   * Validation node - validates the plan against known rules and adds warnings.
   */
  async validatePlan(
    state: typeof ValidationInputState.State,
  ): Promise<typeof ValidationOutputState.State> {
    this.logger.info("PlanMode: Starting plan validation", {
      stepCount: state.generatedPlan?.length ?? 0,
    });

    if (!state.generatedPlan || state.generatedPlan.length === 0) {
      return {
        validatedPlan: [],
        validationPassed: false,
        validationMessages: ["No plan steps to validate"],
        iterationCount: state.iterationCount + 1,
      };
    }

    const validatedPlan: PlanStep[] = [];
    const validationMessages: string[] = [];

    for (const step of state.generatedPlan) {
      const warnings: string[] = [];

      // Check for potential issues
      if (step.category === "dependency" && step.estimatedEffort === "low") {
        warnings.push(
          "Dependency changes may have wider impact than estimated - verify downstream effects",
        );
      }

      if (step.file && step.file.includes("pom.xml")) {
        warnings.push("POM changes require dependency resolution - run Maven after this step");
      }

      if (step.file && step.file.includes("package.json")) {
        warnings.push("Package changes require npm install - run npm after this step");
      }

      if (step.category === "config") {
        warnings.push("Configuration changes may require application restart");
      }

      validatedPlan.push({
        ...step,
        validationWarnings: warnings.length > 0 ? warnings : undefined,
        status: "pending",
      });

      if (warnings.length > 0) {
        validationMessages.push(`Step "${step.title}": ${warnings.join("; ")}`);
      }
    }

    this.logger.info("PlanMode: Validation complete", {
      stepCount: validatedPlan.length,
      warningCount: validationMessages.length,
    });

    return {
      validatedPlan,
      validationPassed: true,
      validationMessages,
      iterationCount: state.iterationCount + 1,
    };
  }

  /**
   * Approval gate node - presents the plan to the user and waits for approval.
   */
  async approvalGate(
    state: typeof ApprovalGateInputState.State,
  ): Promise<typeof ApprovalGateOutputState.State> {
    this.logger.info("PlanMode: Waiting for user approval", {
      planId: state.planId,
      stepCount: state.validatedPlan?.length ?? 0,
    });

    if (!state.validatedPlan || state.validatedPlan.length === 0) {
      return {
        approvedSteps: [],
        planApproved: false,
        selectedStepIds: [],
        iterationCount: state.iterationCount + 1,
      };
    }

    const id = `plan-approval-${state.planId}`;

    // Create promise for user response
    const approvalPromise = new Promise<KaiUserInteractionMessage>((resolve, reject) => {
      this.planApprovalPromises.set(id, { resolve, reject });
    });

    // Emit plan message to UI
    this.emitWorkflowMessage({
      id,
      type: KaiWorkflowMessageType.Plan,
      data: {
        planId: state.planId,
        title: state.planTitle,
        summary: state.planSummary,
        steps: state.validatedPlan,
        status: "pending",
        researchFindings: state.researchFindings,
      },
    });

    // Also emit a user interaction to track the approval state
    this.emitWorkflowMessage({
      id,
      type: KaiWorkflowMessageType.UserInteraction,
      data: {
        type: "plan",
        systemMessage: {},
      },
    });

    try {
      const response = await approvalPromise;

      if (response.data.response?.plan?.approved && response.data.response.plan.selectedStepIds) {
        const selectedIds = new Set(response.data.response.plan.selectedStepIds);
        const approvedSteps = state.validatedPlan
          .filter((step) => selectedIds.has(step.id))
          .map((step) => ({ ...step, selected: true }));

        this.logger.info("PlanMode: Plan approved", {
          planId: state.planId,
          approvedStepCount: approvedSteps.length,
          totalStepCount: state.validatedPlan.length,
        });

        return {
          approvedSteps,
          planApproved: true,
          selectedStepIds: response.data.response.plan.selectedStepIds,
          iterationCount: state.iterationCount + 1,
        };
      }

      this.logger.info("PlanMode: Plan rejected by user", {
        planId: state.planId,
      });

      return {
        approvedSteps: [],
        planApproved: false,
        selectedStepIds: [],
        iterationCount: state.iterationCount + 1,
      };
    } catch (error) {
      this.logger.error("PlanMode: Error waiting for plan approval", { error });
      return {
        approvedSteps: [],
        planApproved: false,
        selectedStepIds: [],
        iterationCount: state.iterationCount + 1,
      };
    } finally {
      this.planApprovalPromises.delete(id);
    }
  }

  /**
   * Resolves a pending plan approval promise.
   */
  async resolvePlanApproval(response: KaiUserInteractionMessage): Promise<void> {
    this.logger.debug("PlanMode: Resolving plan approval", {
      responseId: response.id,
      hasPromise: this.planApprovalPromises.has(response.id),
    });

    const promise = this.planApprovalPromises.get(response.id);
    if (!promise) {
      this.logger.warn("PlanMode: No pending promise found for plan approval", {
        responseId: response.id,
      });
      return;
    }

    promise.resolve(response);
  }

  /**
   * Parse research findings from LLM response.
   */
  private parseResearchFindings(response: string): ResearchFinding[] {
    const findings: ResearchFinding[] = [];
    const findingBlocks = response.split(/##\s*Finding:/i).slice(1);

    for (const block of findingBlocks) {
      const finding = this.parseSingleFinding(block);
      if (finding) {
        findings.push(finding);
      }
    }

    return findings;
  }

  private parseSingleFinding(block: string): ResearchFinding | null {
    const lines = block.trim().split("\n");
    const idMatch = lines[0]?.match(/^[\s]*([a-zA-Z0-9_-]+)/);

    if (!idMatch) {
      return null;
    }

    const id = idMatch[1];
    let type: ResearchFinding["type"] = "other";
    let title = "";
    let description = "";
    let severity: ResearchFinding["severity"] = "medium";
    const affectedFiles: string[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith("- Type:")) {
        const typeValue = trimmedLine.replace("- Type:", "").trim().toLowerCase();
        if (
          ["tech_debt", "migration_pattern", "dependency_issue", "config_issue", "other"].includes(
            typeValue,
          )
        ) {
          type = typeValue as ResearchFinding["type"];
        }
      } else if (trimmedLine.startsWith("- Title:")) {
        title = trimmedLine.replace("- Title:", "").trim();
      } else if (trimmedLine.startsWith("- Description:")) {
        description = trimmedLine.replace("- Description:", "").trim();
      } else if (trimmedLine.startsWith("- Severity:")) {
        const severityValue = trimmedLine.replace("- Severity:", "").trim().toLowerCase();
        if (["low", "medium", "high"].includes(severityValue)) {
          severity = severityValue as ResearchFinding["severity"];
        }
      } else if (trimmedLine.startsWith("- Affected Files:")) {
        const filesStr = trimmedLine.replace("- Affected Files:", "").trim();
        affectedFiles.push(
          ...filesStr
            .split(",")
            .map((f) => f.trim())
            .filter(Boolean),
        );
      }
    }

    if (!title) {
      title = id;
    }

    return {
      id,
      type,
      title,
      description,
      severity,
      affectedFiles,
    };
  }

  /**
   * Parse plan response from LLM.
   */
  private parsePlanResponse(response: string): {
    title: string;
    summary: string;
    steps: PlanStep[];
  } {
    let title = "Migration Plan";
    let summary = "";
    const steps: PlanStep[] = [];

    // Extract title
    const titleMatch = response.match(/##\s*Plan Title\s*\n+([^\n#]+)/i);
    if (titleMatch) {
      title = titleMatch[1].trim();
    }

    // Extract summary
    const summaryMatch = response.match(/##\s*Plan Summary\s*\n+([\s\S]*?)(?=##|$)/i);
    if (summaryMatch) {
      summary = summaryMatch[1].trim();
    }

    // Extract steps
    const stepBlocks = response.split(/###\s*Step:/i).slice(1);

    for (const block of stepBlocks) {
      const step = this.parseSingleStep(block);
      if (step) {
        steps.push(step);
      }
    }

    return { title, summary, steps };
  }

  private parseSingleStep(block: string): PlanStep | null {
    const lines = block.trim().split("\n");
    const idMatch = lines[0]?.match(/^[\s]*([a-zA-Z0-9_-]+)/);

    if (!idMatch) {
      return null;
    }

    const id = idMatch[1];
    let stepTitle = "";
    let description = "";
    let category: PlanStepCategory = "other";
    let effort: PlanStepEffort = "medium";
    let file: string | undefined;

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith("- Title:")) {
        stepTitle = trimmedLine.replace("- Title:", "").trim();
      } else if (trimmedLine.startsWith("- Description:")) {
        description = trimmedLine.replace("- Description:", "").trim();
      } else if (trimmedLine.startsWith("- Category:")) {
        const categoryValue = trimmedLine.replace("- Category:", "").trim().toLowerCase();
        if (["refactor", "dependency", "config", "test", "other"].includes(categoryValue)) {
          category = categoryValue as PlanStepCategory;
        }
      } else if (trimmedLine.startsWith("- Effort:")) {
        const effortValue = trimmedLine.replace("- Effort:", "").trim().toLowerCase();
        if (["low", "medium", "high"].includes(effortValue)) {
          effort = effortValue as PlanStepEffort;
        }
      } else if (trimmedLine.startsWith("- File:")) {
        const fileValue = trimmedLine.replace("- File:", "").trim();
        if (fileValue && fileValue.toLowerCase() !== "n/a") {
          file = fileValue;
        }
      }
    }

    if (!stepTitle) {
      stepTitle = id;
    }

    return {
      id,
      title: stepTitle,
      description,
      category,
      estimatedEffort: effort,
      file,
      selected: true, // Default to selected
      status: "pending",
    };
  }
}
