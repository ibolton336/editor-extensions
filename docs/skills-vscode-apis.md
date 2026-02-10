# Skills for VSCode Extension Development in This Repo

This doc outlines how to use **skills** in this repo to leverage modern VSCode extension APIs and keep patterns consistent. Skills follow the [Agent Skills](https://agentskills.io) open standard and work across AI tools (e.g. [Claude Code](https://code.claude.com/docs/en/skills), Cursor).

## Why skills here?

- **Discovery**: The agent applies skills when the description matches the task (e.g. "add a chat participant", "use the Language Model API").
- **Project scope**: Skills under **`.claude/skills/`** are versioned with the repo and shared with the team. This location is not exclusive to one IDE -- Claude Code uses `.claude/skills/` for project skills; Cursor uses `.cursor/skills/`; keeping skills in `.claude/skills/` aligns with the [Claude Code skills docs](https://code.claude.com/docs/en/skills) and keeps one source of truth.
- **Concise guidance**: Skills encode API patterns, package.json contributes, and this repo's conventions so the agent doesn't need long explanations each time.

## Relevant VSCode APIs (current + newer)

| Area                | What this repo uses                                                                         | Newer APIs to leverage                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chat**            | Custom webview chat (LangChain, `solutionWorkflowOrchestrator`, ResolutionsPage)            | **Chat Participant API** -- `@konveyor` in VS Code Chat with `vscode.chat.createChatParticipant`, streaming, slash commands, follow-ups               |
| **Language models** | LangChain (`ChatOpenAI`, modelProvider, provider settings YAML)                             | **Language Model API** (`vscode.lm`) -- `selectChatModels`, `sendRequest`, streaming; optional **Language Model Chat Provider** to contribute a model |
| **Webviews**        | `registerWebviewViewProvider`, `KonveyorGUIWebviewViewProvider`, message types in `@shared` | Same; skills can document message types and `postMessage` patterns                                                                                    |
| **Workspace**       | `workspace.fs`, `createFileSystemWatcher`, `workspace.getConfiguration`                     | Same; skills can document paths (e.g. `.konveyor/profiles`), `RelativePattern`                                                                        |
| **Editor/UI**       | `window.show*Message`, `withProgress`, status bar, tree view, code actions                  | Same; skills can standardize l10n and error handling                                                                                                  |
| **i18n**            | `vscode.l10n.t()` in issue view, commands                                                   | Same; keep using for all user-facing strings                                                                                                          |

## Suggested skills (in `.claude/skills/`)

1. **`vscode-extension-apis`** -- `.claude/skills/vscode-extension-apis/`
   - **When**: Chat Participant API, Language Model API, or general VSCode extension patterns.
   - **What**: Register chat participant, use `request.model` and `vscode.lm`, stream with `ChatResponseStream`, contribute in `package.json`, handle `LanguageModelError`.

2. **`vscode-secondary-sidebar`** -- `.claude/skills/vscode-secondary-sidebar/`
   - **When**: Adding the right (secondary) sidebar, `secondarySideBar`, `contribSecondarySideBar`, or moving a view to the secondary sidebar.
   - **What**: Proposed API `contribSecondarySideBar`, `viewsContainers.secondarySideBar`, adding a view under that container, reusing KonveyorGUIWebviewViewProvider. **Especially relevant for the feature-flagged secondary sidebar variant.**

3. **`vscode-webview-view-provider`** -- `.claude/skills/vscode-webview-view-provider/`
   - **When**: Adding a new webview view (e.g. secondary sidebar), refactoring Analysis/Resolution/Profiles, or debugging extension-to-webview messaging for a view.
   - **What**: WebviewView vs WebviewPanel, view type constants and registration, state and messages, provider map in `state.webviewProviders`. **Especially relevant for the feature-flagged secondary sidebar variant.**

4. **`vscode-feature-flags`** -- `.claude/skills/vscode-feature-flags/`
   - **When**: Feature flag, experimental setting, `when` clause, config visibility, or enabling the secondary sidebar behind a flag.
   - **What**: Configuration property in `package.json`, reading with config helpers, `when` clauses for commands/menus, optional proposed-API gating.

5. **`vscode-webview-messages`** -- `.claude/skills/vscode-webview-messages/`
   - **When**: Adding or changing extension-to-webview message types, `postMessage`, `MessageTypes`, `useVSCodeMessageHandler`, or shared message contracts.
   - **What**: Define types and type guards in `shared/src/types/messages.ts`, post from extension via provider, handle in webview with `useVSCodeMessageHandler`, build `@shared` first.

6. **`vscode-extension-state`** -- `.claude/skills/vscode-extension-state/`
   - **When**: Changing extension state or data flow, or adding a view that consumes `ExtensionData`.
   - **What**: Immer-only updates, mutate helpers (`mutateChatMessages`, etc.), firing `onDidChangeData`, who consumes state (webview providers, commands, orchestrator).

7. **`zustand-store`** -- `.claude/skills/zustand-store/`
   - **When**: Adding store fields, selectors, actions, `useExtensionStore`, or connecting a new component to state.
   - **What**: Zustand with Immer middleware, selector patterns, `getState()` for non-reactive reads, `batchUpdate`, who updates the store (`useVSCodeMessageHandler`, components).

8. **`immer-state-updates`** -- `.claude/skills/immer-state-updates/`
   - **When**: Mutating `ExtensionData` with `produce` or mutate helpers, writing Zustand `set` actions with a draft, or debugging stale state / subscriptions not firing.
   - **What**: Extension-side `produce` via mutate helpers vs webview-side Zustand Immer middleware; common gotchas (returning from set, stale closures, class objects).

9. **`vscode-webview-lifecycle`** -- `.claude/skills/vscode-webview-lifecycle/`
   - **When**: Editing the webview HTML template, Content-Security-Policy, nonce, `retainContextWhenHidden`, `onDidDispose`, `asWebviewUri`, `localResourceRoots`, or `acquireVsCodeApi`.
   - **What**: HTML shell and CSP (prod vs dev), asset URIs, lifecycle events (`WEBVIEW_READY`, visibility, dispose), `retainContextWhenHidden`, and how to add a new webview view.

10. **`vite-webview-dev`** -- `.claude/skills/vite-webview-dev/`
    - **When**: Editing `vite.config.ts`, the dev server, HMR, base path, build output, `DEV_SERVER_ROOT`, or webview asset loading in dev vs prod.
    - **What**: Vite config settings (`base`, `server.cors`, rollup output), dev server flow (port 5173, `DEV_SERVER_ROOT`), production build to `webview-ui/build/`, shared library dependency, and adding new assets or entry points.

11. **`webpack-extension-build`** -- `.claude/skills/webpack-extension-build/`
    - **When**: Editing `webpack.config.js`, extension bundling, `CopyWebpackPlugin`, `DefinePlugin`, build-time constants, or the extension build output.
    - **What**: Webpack config (target node, ts-loader, externals), DefinePlugin constants, CopyWebpackPlugin (copies webview build into `out/webview`), full build order, language-specific extension configs, and adding new constants or copy patterns.

12. **`agentic-workflows`** -- `.claude/skills/agentic-workflows/`
    - **When**: Working on LangGraph workflows, BaseNode, AnalysisIssueFix, DiagnosticsIssueFix, KaiModelProvider, tools, schemas, caching, the solution server client, or KaiInteractiveWorkflow.
    - **What**: Package architecture (`agentic/src/`), key interfaces (KaiModelProvider, KaiWorkflow, workflow messages), nodes (BaseNode, streaming/tool calls), LangGraph state schemas, tools (FileSystemTools, JavaDependencyTools), caching (FileBasedResponseCache, InMemoryCacheWithRevisions), two-phase interactive workflow, and how to add new nodes and tools.

13. **`vscode-l10n`** (future)
    - **When**: Adding or editing user-visible strings.
    - **What**: Use `vscode.l10n.t()` for all UI strings; placeholders like `{0}`, `{1}`; no raw user-facing English in extension code.

For a **feature-flagged secondary sidebar** variant, **vscode-secondary-sidebar** and **vscode-webview-view-provider** are especially relevant; use **vscode-feature-flags** to gate the new container/view, and **vscode-webview-messages** / **vscode-extension-state** to keep messaging and state consistent. For state and rendering, **zustand-store**, **immer-state-updates**, and **vscode-webview-lifecycle** reduce context bloat by encoding the Zustand/Immer patterns and webview shell conventions once so the agent does not need to re-read `store.ts`, `getHtmlForWebview`, or the CSP logic on every task. For build pipeline, **vite-webview-dev** and **webpack-extension-build** encode the full Vite/Webpack setup so the agent knows the build order, dev server config, and asset flow without re-reading the config files.

## Skill layout

- **Location**: `.claude/skills/<skill-name>/` (project skills; see [Claude Code skills](https://code.claude.com/docs/en/skills#where-skills-live)).
- **Required**: `SKILL.md` with YAML frontmatter (`name`, `description`) and instructions. The `name` becomes the slash command (e.g. `/vscode-extension-apis`).
- **Optional**: `reference.md` (detailed API/links), `examples.md` (snippets from this repo), `scripts/` for runnable helpers.
- **Description**: Specific, include both _what_ the skill does and _when_ the agent should use it (trigger terms).

## How this repo can leverage the new APIs

- **Chat Participant**: Add an `@konveyor` participant that runs migration/analysis-related queries (e.g. "explain this incident", "what rule set should I use?") using the Chat API and optional tool calling, while keeping the existing Resolution webview for full workflows.
- **Language Model API**: For new or optional flows, use `vscode.lm.selectChatModels` + `model.sendRequest` (e.g. in a chat participant or a command) so the user's chosen model and consent are respected; keep LangChain where you need custom models or provider config (e.g. Hub, YAML-backed providers).

The starter skill in `.claude/skills/vscode-extension-apis/` focuses on Chat Participant and Language Model APIs so the agent can implement or refactor toward these patterns consistently.
