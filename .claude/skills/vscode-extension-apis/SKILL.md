---
name: vscode-extension-apis
description: Implement or refactor VSCode extension features using Chat Participant API, Language Model API, and APIs from 1.109+. Use when adding a chat participant, packaging skills with an extension (chatSkills), using vscode.lm, contributing chatParticipants, Chat Model Provider configuration, chat resource providers, or Quick Input button location/toggle.
---

# VSCode Extension APIs (Chat, Language Model & 1.109+)

Use this skill when working on VS Code extension features that use **Chat Participant API**, **Language Model API**, or capabilities introduced in **VS Code 1.109** (January 2026) and later. See [VS Code 1.109 release notes](https://code.visualstudio.com/updates/v1_109) for the full changelog.

## Chat Participant API

### Register in package.json

```json
"contributes": {
  "chatParticipants": [{
    "id": "konveyor-core.migration-assistant",
    "name": "konveyor",
    "fullName": "Konveyor",
    "description": "Ask about migration analysis and resolution.",
    "isSticky": true,
    "commands": [
      { "name": "explain", "description": "Explain the selected incident or rule" }
    ]
  }]
}
```

- Use lowercase `name` (for @-mentions), title case `fullName`.
- Slash commands go under `commands`; reference in handler via `request.command`.

### Implement the participant

1. **Create participant and handler in activation** (e.g. in `extension.ts`):

```typescript
const participant = vscode.chat.createChatParticipant(
  "konveyor-core.migration-assistant",
  async (request, context, stream, token) => {
    if (request.command === "explain") {
      // handle /explain
    }
    // Use request.prompt, request.variables, request.model
    stream.progress("Analyzing...");
    stream.markdown("...");
    stream.button({
      command: "konveyor-core.showResolutionPanel",
      title: vscode.l10n.t("Open Resolution View"),
      arguments: [],
    });
    return { metadata: {} };
  },
);
participant.iconPath = vscode.Uri.joinPath(context.extensionUri, "resources", "icon.png");
context.subscriptions.push(participant);
```

2. **Use the user’s chosen model** from the chat request (do not call `vscode.lm.selectChatModels` for chat UI):

```typescript
const model = request.model; // user's selection in chat model dropdown
```

3. **Stream the response**: Use `stream.markdown()`, `stream.progress()`, `stream.reference()`, `stream.button()` for rich responses. Stream incrementally for long output.

4. **Follow-ups** (optional): Set `participant.followupProvider` to return `vscode.ChatFollowup[]` (e.g. `{ prompt: "...", label: vscode.l10n.t("...") }`).

### References and buttons

- **References**: `stream.reference(uri)` or `stream.reference(new vscode.Location(uri, range))`.
- **Command buttons**: `stream.button({ command: "command.id", title: vscode.l10n.t("Label"), arguments: [] })`. For args: `encodeURIComponent(JSON.stringify(args))` in command URIs in markdown.
- **Trusted command links in markdown**: Use `vscode.MarkdownString` with `isTrusted: { enabledCommands: ["command.id"] }`.

## Language Model API

### When to use

- **Inside a Chat Participant**: Prefer `request.model` from the handler so the user’s chat model is respected.
- **From a command or other UI**: Use `vscode.lm.selectChatModels()` and then `model.sendRequest()`. Call `selectChatModels` only in a **user-initiated** action (e.g. command) so consent/availability can be handled.

### Select model and send request

```typescript
const [model] = await vscode.lm.selectChatModels({ vendor: "copilot", family: "gpt-4o" });
if (!model) {
  // show message: no model available or user consent needed
  return;
}

const messages = [
  vscode.LanguageModelChatMessage.User("System/context instruction"),
  vscode.LanguageModelChatMessage.User(userPrompt),
];
const response = await model.sendRequest(messages, {}, token);

for await (const fragment of response.text) {
  stream.markdown(fragment);
}
```

- **Message types**: Only `User` and `Assistant`. No system message; put system-like content in a `User` message.
- **Streaming**: `response.text` is async iterable; use it to stream into `ChatResponseStream` when used from a chat participant.

### Error handling

```typescript
try {
  const response = await model.sendRequest(messages, {}, token);
  // ...
} catch (err) {
  if (err instanceof vscode.LanguageModelError) {
    // err.code, err.message, err.cause (e.g. consent, quota, off_topic)
    stream.markdown(vscode.l10n.t("Model unavailable: {0}", err.message));
  } else {
    throw err;
  }
}
```

## New in VS Code 1.109 (January 2026)

The following are relevant for extension authors. Check API stability (finalized vs proposed) and set `engines.vscode` accordingly.

### Package Agent Skills with your extension

VS Code discovers skills in `.github/skills`, `.claude/skills`, and user folders. Extensions can **ship skills** so users get them without copying files:

```json
"contributes": {
  "chatSkills": [
    { "path": "./skills/my-skill" }
  ]
}
```

Each entry is a folder containing `SKILL.md` (and optional supporting files). Users see these in **Chat: Configure Skills**. Custom skill locations are configured via `chat.agentSkillsLocations`; extensions add skills on top of that.

### Chat Model Provider Configuration (proposed)

Language model chat providers can declare a **configuration schema** in `languageModelChatProviders`. VS Code then provides the UI for API keys and options; the extension receives `configuration` in its provider callback instead of implementing `managementCommand`. Use `configuration.properties` (e.g. `apiKey` with `secret: true`) and optional `models` array for custom endpoints. Proposal: `vscode.proposed.lmConfiguration.d.ts`.

### Chat resource providers (proposed)

Extensions can contribute **dynamic** prompts, agents, instructions, and skills (not just static files):

```typescript
vscode.chat.registerSkillProvider({
  onDidChangeSkills: onDidChangeEvent,
  provideSkills(context, token): ChatResource[] {
    return [{ uri: vscode.Uri.parse("my-extension:/skills/debugging/SKILL.md") }];
  },
});
```

Similar: `registerCustomAgentProvider()`, `registerInstructionsProvider()`, `registerPromptFileProvider()`. Use for context-dependent or remotely loaded resources. Proposal: `vscode.proposed.chatPromptFiles.d.ts`.

### Chat session item controller (proposed)

Push **chat session items** to the built-in chat sessions view instead of VS Code pulling:

```typescript
const controller = vscode.chat.createChatSessionItemController(
  "myExtension.chatSessions",
  async (token) => {
    const sessions = await fetchSessionsFromBackend();
    const items = sessions.map((s) =>
      controller.createChatSessionItem(vscode.Uri.parse(`my-scheme://session/${s.id}`), s.title),
    );
    controller.items.replace(items);
  },
);
```

Items are managed: update `item.label` or other properties to refresh the UI. Proposal: see 1.109 Extensions and API section.

### Quick Input: button location and toggle (finalized)

- **Button location**: On `QuickPick`/`InputBox` buttons, set `location` to `QuickInputButtonLocation.Title` (default), `Inline`, or `Input` to control placement.
- **Toggle buttons**: Set `toggle: { checked: boolean }` on a `QuickInputButton`; use the `checked` property to read/update state for two-state actions.

### Other 1.109 APIs

- **Chat output renderer**: Extensions receive `ChatOutputWebview` (not only `Webview`) so they can detect when the webview is disposed and clean up.
- **Portable mode**: `vscode.env.isAppPortable` (proposed) indicates VS Code is running in portable mode. Proposal: `vscode.proposed.envIsAppPortable.d.ts`.

## Repo-specific notes

- **Extension ID**: Commands and participant IDs use the `konveyor-core` prefix (see `package.json` contributes).
- **l10n**: Use `vscode.l10n.t()` for all user-visible strings (e.g. button titles, progress, errors).
- **Existing chat**: The repo has a custom webview chat (ResolutionsPage, `solutionWorkflowOrchestrator`, LangChain). A Chat Participant can complement it (e.g. quick @konveyor questions) without replacing the full resolution workflow.
- **Engines**: This repo uses `vscode: ^1.93.0`. Chat Participant and Language Model APIs are available there; for 1.109 features (chatSkills, provider configuration, resource providers, session controller) require a higher engine or optional/experimental adoption.

## Official references

- [VS Code 1.109 release notes (January 2026)](https://code.visualstudio.com/updates/v1_109) — Agent Skills in extensions, Chat Model Provider config, chat resource providers, Quick Input APIs, proposed APIs
- [Chat Participant API](https://code.visualstudio.com/api/extension-guides/ai/chat)
- [Language Model API](https://code.visualstudio.com/api/extension-guides/ai/language-model)
- [Chat sample](https://github.com/microsoft/vscode-extension-samples/tree/main/chat-sample)

For detailed API surface and tool calling, see the docs above. For this repo’s webview messaging and state patterns, use the project’s `.claude` docs and any `vscode-webview-messages` / `vscode-extension-state` skills when added.
