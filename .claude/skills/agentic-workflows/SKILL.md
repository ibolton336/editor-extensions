---
name: agentic-workflows
description: Build and extend agentic workflows in the @editor-extensions/agentic package. Use when working on LangGraph workflows, BaseNode, AnalysisIssueFix, DiagnosticsIssueFix, KaiModelProvider, tools, schemas, caching, the solution server client, or KaiInteractiveWorkflow.
---

# Agentic Workflows (@editor-extensions/agentic)

Use this skill when working in the `agentic/` directory -- the LangChain/LangGraph-based agentic workflow system that powers AI-assisted code fixes and diagnostics.

## Package overview

| Item             | Detail                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| **Package**      | `@editor-extensions/agentic`                                                                                 |
| **Build**        | `tsup` (ESM + CJS + DTS)                                                                                     |
| **Entry**        | [agentic/src/index.ts](agentic/src/index.ts) -- re-exports types, cache, workflows, and SolutionServerClient |
| **Dependencies** | `@langchain/core`, `@langchain/langgraph`, `zod-to-json-schema`                                              |
| **Tests**        | Jest with `ts-jest` (ESM mode)                                                                               |

## Architecture

```
agentic/src/
  index.ts          -- public API exports
  types.ts          -- core interfaces (KaiWorkflow, KaiModelProvider, messages)
  cache.ts          -- FileBasedResponseCache, InMemoryCacheWithRevisions
  eventEmitter.ts   -- KaiWorkflowEventEmitter (relays workflow messages)
  utils.ts          -- fileUriToPath, cache key helpers
  clients/
    solutionServerClient.ts  -- MCP client for solution server (hints, solutions, file ops)
  nodes/
    base.ts               -- BaseNode: streaming, tool call handling, LLM invocation
    analysisIssueFix.ts   -- Fixes analysis incidents per file (prompts, hints, solution creation)
    diagnosticsIssueFix.ts -- Plans and fixes IDE diagnostics with specialized agents
  schemas/
    base.ts                -- BaseInputMetaState, BaseOutputMetaState (LangGraph Annotations)
    analysisIssueFix.ts    -- State schemas for analysis workflow
    diagnosticsIssueFix.ts -- State schemas for diagnostics workflow
  tools/
    filesystem.ts      -- File search/read/write tools (writes go to fsCache, not disk)
    javaDependency.ts   -- Maven Central search tool
  workflows/
    index.ts
    interactiveWorkflow.ts  -- KaiInteractiveWorkflow (main orchestrator)
```

## Key interfaces (types.ts)

### KaiModelProvider

Wraps LangChain models with explicit capability flags:

```typescript
interface KaiModelProvider {
  stream(input, options?): Promise<IterableReadableStream>;
  invoke(
    input: BaseLanguageModelInput,
    options?: KaiModelProviderInvokeCallOptions,
  ): Promise<AIMessage>;
  bindTools(tools: BindToolsInput[], kwargs?): KaiModelProvider;
  toolCallsSupported(): boolean;
  toolCallsSupportedInStreaming(): boolean;
}
```

The extension creates model providers in [modelProvider/](vscode/core/src/modelProvider/) from user config YAML. The agentic module never imports `vscode` -- it receives providers via `init()`.

### KaiWorkflow

```typescript
interface KaiWorkflow<TWorkflowInput extends KaiWorkflowInput> extends KaiWorkflowEvents {
  init(options: KaiWorkflowInitOptions): Promise<void>;
  run(input: TWorkflowInput): Promise<KaiWorkflowResponse>;
  resolveUserInteraction(response: KaiUserInteractionMessage): Promise<void>;
}
```

- **init**: Receives `modelProvider`, `workspaceDir`, `fsCache`, optional `solutionServerClient`, and `toolCache`.
- **run**: Takes incidents + config, returns `{ modified_files, errors }`.
- **resolveUserInteraction**: Resumes workflow when the user responds to a yes/no, choice, or modifiedFile prompt.

### Workflow messages

All nodes emit `KaiWorkflowMessage` via `KaiWorkflowEventEmitter`:

| Type               | Data                                  | Use                     |
| ------------------ | ------------------------------------- | ----------------------- |
| `LLMResponseChunk` | `AIMessageChunk`                      | Streaming tokens to UI  |
| `LLMResponse`      | `AIMessage`                           | Complete LLM response   |
| `ModifiedFile`     | `{ path, content, userInteraction? }` | Proposed file change    |
| `ToolCall`         | `{ id, name, args, status }`          | Tool execution progress |
| `UserInteraction`  | `{ type, systemMessage, response? }`  | Pause for user input    |
| `Error`            | `string`                              | Error during workflow   |

## Nodes

### BaseNode (base.ts)

Abstract class that all workflow nodes extend. Provides:

- **`streamOrInvoke(input, streamOptions?, callOptions?)`** -- Streams from the model, or falls back to invoke when streaming tool calls are not supported. For models that don't support native tool calls, it injects tool descriptions into the prompt and parses tool calls from the response text.
- **`runTools(state)`** -- Executes tool calls from the last AI message, returns `ToolMessage` results.
- **Event emission** -- Emits `LLMResponseChunk`, `LLMResponse`, and `ToolCall` messages during processing.

### AnalysisIssueFix (analysisIssueFix.ts)

Fixes migration/analysis incidents for a single file. Key methods that become LangGraph nodes:

- `analysisIssueFix` -- Builds a prompt with file content, incidents, migration hint, and optional solution server hints; calls `streamOrInvoke`; parses the response for updated file content and additional info.
- `summarizeAdditionalInfo` -- Summarizes accumulated additional info from all file fixes.
- `summarizeHistory` -- Summarizes all changes made so far for context in follow-up workflows.

### DiagnosticsIssueFix (diagnosticsIssueFix.ts)

Addresses IDE diagnostics (compiler errors, linter warnings) after initial analysis fixes:

- `plannerAgent` -- Plans which files to fix and how, using diagnostics and change history.
- `fixerAgent` -- Applies fixes using file system tools.
- `diagnosticsOrchestrator` -- Routes between planner and fixer based on agent state.

## Schemas (LangGraph state)

State is defined using LangGraph `Annotation.Root({...})`. Key schemas:

- **`AnalysisIssueFixInputState`** -- `inputFileUri`, `inputFileContent`, `inputIncidents`.
- **`AnalysisIssueFixOutputState`** -- `outputUpdatedFile`, `outputAdditionalInfo`, `outputReasoning`, `outputHints`.
- **`AnalysisIssueFixOrchestratorState`** -- Accumulates results across files; tracks `currentIdx`, `inputIncidentsByUris`, `outputAllResponses`.
- **`DiagnosticsOrchestratorState`** -- Tracks `currentAgent` (planner vs fixer), diagnostics input, iteration count.

Use `arrayReducer` for fields that accumulate across iterations (e.g. `outputAllResponses`).

## Tools

- **FileSystemTools** -- `searchFiles`, `readFile`, `writeFile`. Writes go to `InMemoryCacheWithRevisions` (not disk) so the user reviews changes before they're applied. Emits `ModifiedFile` and `UserInteraction` messages.
- **JavaDependencyTools** -- `searchMavenCentral`. Uses `FileBasedResponseCache` to avoid duplicate network calls.

Tools are `DynamicStructuredTool` from `@langchain/core/tools` with Zod schemas.

## Caching

- **`FileBasedResponseCache<K, V>`** -- Disk-based cache for LLM responses and tool outputs. Keyed by hash of serialized input. Used for demo mode and tracing.
- **`InMemoryCacheWithRevisions<K, V>`** -- In-memory cache that tracks revision history. Used by `FileSystemTools` as the "virtual filesystem" for proposed file changes.

## KaiInteractiveWorkflow (the main orchestrator)

Two-phase workflow:

1. **Analysis fix phase** -- Iterates over incidents grouped by file URI. For each file, runs `AnalysisIssueFix` node, accumulates results, then summarizes additional info and history.
2. **Follow-up interactive phase** -- Uses summarized additional info as input. Runs `DiagnosticsIssueFix` planner/fixer agents. Pauses for user interaction (e.g. "Apply these changes?") via `UserInteraction` messages and `resolveUserInteraction()`.

The workflow is initialized by the extension in [extension.ts](vscode/core/src/extension.ts) and orchestrated by [solutionWorkflowOrchestrator.ts](vscode/core/src/solutionWorkflowOrchestrator.ts).

## Adding a new node

1. Create a class extending `BaseNode` in `nodes/`.
2. Implement node methods that take LangGraph state and return partial state updates.
3. Define input/output state schemas in `schemas/` using `Annotation.Root`.
4. Register the node in the workflow graph (in `interactiveWorkflow.ts`) with `addNode` and connect with edges.
5. If the node uses tools, pass them to `BaseNode`'s constructor; they'll be available via `streamOrInvoke` and `runTools`.
6. Relay events: `node.on("workflowMessage", (msg) => this.emit("workflowMessage", msg))`.

## Adding a new tool

1. Create a `DynamicStructuredTool` with a Zod schema in `tools/`.
2. Pass it to the node constructor's tools array (or to `FileSystemTools.all()` if it's a filesystem tool).
3. If the tool needs caching, accept a `FileBasedResponseCache` or `InMemoryCacheWithRevisions`.
4. If the tool modifies files, emit `ModifiedFile` and optionally `UserInteraction` messages.
