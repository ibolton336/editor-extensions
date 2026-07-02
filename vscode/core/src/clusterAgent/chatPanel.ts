/**
 * Chat webview panel for cluster agent sessions.
 *
 * Deliberately a single self-contained file with inline HTML/CSS/JS and
 * no build step: this is POC-grade UX meant to be replaced by a real
 * design (or folded into the chat webview when agent backends unify).
 * It renders streaming markdown-ish bubbles, collapsible thinking and
 * tool-call sections, inline permission cards, and a context-usage
 * meter, all styled with VSCode theme variables.
 */
import * as vscode from "vscode";

export interface ChatPermissionAsk {
  title: string;
  detail?: string;
  options: Array<{ optionId: string; name: string; kind: string }>;
}

/** One selectable Agent in the run setup form, derived from Agent CRs. */
export interface SetupAgent {
  name: string;
  /** First lines of the Agent's standing prompt, as a description. */
  promptPreview?: string;
  params: Array<{
    name: string;
    type?: "string" | "number" | "boolean";
    description?: string;
    default?: string;
    required?: boolean;
  }>;
  /** Flattened provider/model choices from the Agent's LLMProviders. */
  models: Array<{ provider: string; model: string; tier?: string }>;
}

export interface SetupData {
  agents: SetupAgent[];
  /** Param prefill values (e.g. repository/branch detected from the workspace). */
  prefill: Record<string, string>;
  defaults: {
    agentRef?: string;
    provider?: string;
    model?: string;
    smartApprove: boolean;
  };
}

/** What the user submitted from the setup form. */
export interface CreateRunPayload {
  agentRef: string;
  instructions: string;
  params: Record<string, string>;
  provider?: string;
  model?: string;
  smartApprove: boolean;
}

export interface ChatPanelHandlers {
  onPrompt: (text: string) => void;
  onCancel: () => void;
  onDisconnect: () => void;
  onCreate?: (payload: CreateRunPayload) => void;
}

type ToWebview =
  | { t: "status"; runName: string; sessionId?: string; state: string }
  | { t: "user"; text: string }
  | { t: "chunk"; text: string; kind: "text" | "thinking" }
  | { t: "toolCall"; id: string; title: string; status: string }
  | { t: "toolUpdate"; id: string; status: string; result?: string }
  | { t: "usage"; used: number; size: number }
  | {
      t: "perm";
      permId: number;
      title: string;
      detail?: string;
      options: ChatPermissionAsk["options"];
    }
  | { t: "permDone"; permId: number; chosen: string }
  | { t: "turnStart" }
  | { t: "turnDone"; stopReason: string }
  | { t: "error"; msg: string }
  | { t: "setup"; data: SetupData }
  | { t: "chatMode" };

type FromWebview =
  | { t: "prompt"; text: string }
  | { t: "permChoice"; permId: number; optionId: string | null }
  | { t: "cancel" }
  | { t: "disconnect" }
  | { t: "create"; payload: CreateRunPayload };

export class ClusterChatPanel {
  private readonly panel: vscode.WebviewPanel;
  private handlers: ChatPanelHandlers;
  private nextPermId = 1;
  private pendingPerms = new Map<number, (optionId: string | null) => void>();
  private disposed = false;

  constructor(title: string, handlers: ChatPanelHandlers) {
    this.handlers = handlers;
    this.panel = vscode.window.createWebviewPanel(
      "konveyorClusterAgentChat",
      title,
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    this.panel.webview.html = html();
    this.panel.webview.onDidReceiveMessage((msg: FromWebview) => {
      switch (msg.t) {
        case "prompt":
          this.handlers.onPrompt(msg.text);
          break;
        case "permChoice": {
          const resolve = this.pendingPerms.get(msg.permId);
          if (resolve) {
            this.pendingPerms.delete(msg.permId);
            resolve(msg.optionId);
          }
          break;
        }
        case "cancel":
          this.handlers.onCancel();
          break;
        case "disconnect":
          this.handlers.onDisconnect();
          break;
        case "create":
          this.handlers.onCreate?.(msg.payload);
          break;
      }
    });
    this.panel.onDidDispose(() => {
      this.disposed = true;
      // Unanswered permission requests become cancellations.
      for (const resolve of this.pendingPerms.values()) {
        resolve(null);
      }
      this.pendingPerms.clear();
      this.handlers.onDisconnect();
    });
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  reveal(): void {
    this.panel.reveal(undefined, true);
  }

  dispose(): void {
    if (!this.disposed) {
      this.panel.dispose();
    }
  }

  private post(msg: ToWebview): void {
    if (!this.disposed) {
      void this.panel.webview.postMessage(msg);
    }
  }

  status(runName: string, state: string, sessionId?: string): void {
    this.post({ t: "status", runName, state, sessionId });
  }

  addUser(text: string): void {
    this.post({ t: "user", text });
  }

  chunk(text: string, kind: "text" | "thinking"): void {
    this.post({ t: "chunk", text, kind });
  }

  toolCall(id: string, title: string, status: string): void {
    this.post({ t: "toolCall", id, title, status });
  }

  toolUpdate(id: string, status: string, result?: string): void {
    this.post({ t: "toolUpdate", id, status, result });
  }

  usage(used: number, size: number): void {
    this.post({ t: "usage", used, size });
  }

  turnStart(): void {
    this.post({ t: "turnStart" });
  }

  turnDone(stopReason: string): void {
    this.post({ t: "turnDone", stopReason });
  }

  error(msg: string): void {
    this.post({ t: "error", msg });
  }

  /** Show the run configuration form (before a run exists). */
  showSetup(data: SetupData): void {
    this.post({ t: "setup", data });
  }

  /** Switch from setup form to chat (after the run is created). */
  startChat(): void {
    this.post({ t: "chatMode" });
  }

  /** Inline permission card; resolves with the chosen optionId or null. */
  askPermission(ask: ChatPermissionAsk): Promise<string | null> {
    if (this.disposed) {
      return Promise.resolve(null);
    }
    const permId = this.nextPermId++;
    this.reveal();
    return new Promise((resolve) => {
      this.pendingPerms.set(permId, (optionId) => {
        const chosen = ask.options.find((o) => o.optionId === optionId);
        this.post({ t: "permDone", permId, chosen: chosen?.name ?? "Cancelled" });
        resolve(optionId);
      });
      this.post({
        t: "perm",
        permId,
        title: ask.title,
        detail: ask.detail,
        options: ask.options,
      });
    });
  }
}

function html(): string {
  const nonce = Array.from({ length: 16 }, () =>
    "abcdefghijklmnopqrstuvwxyz0123456789".charAt(Math.floor(Math.random() * 36)),
  ).join("");
  return /* html */ `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  :root { color-scheme: light dark; }
  html, body { height: 100%; }
  body {
    margin: 0; display: flex; flex-direction: column;
    font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
    color: var(--vscode-foreground); background: var(--vscode-editor-background);
  }
  #header {
    display: flex; align-items: center; gap: 8px; padding: 6px 12px;
    border-bottom: 1px solid var(--vscode-panel-border);
    background: var(--vscode-sideBar-background); font-size: 12px;
  }
  #run { font-weight: 600; }
  #state { opacity: .75; }
  #usage-wrap { margin-left: auto; display: flex; align-items: center; gap: 6px; }
  #usage-bar { width: 90px; height: 5px; border-radius: 3px; overflow: hidden;
    background: var(--vscode-progressBar-background, #444); opacity: .35; }
  #usage-fill { height: 100%; width: 0; background: var(--vscode-progressBar-background, #3794ff);
    opacity: 1; transition: width .3s; }
  #usage-text { font-variant-numeric: tabular-nums; opacity: .75; }
  #disconnect { cursor: pointer; background: none; border: none; color: var(--vscode-foreground);
    opacity: .6; font-size: 14px; } #disconnect:hover { opacity: 1; }

  #chat { flex: 1; overflow-y: auto; padding: 12px; }
  .msg { max-width: 92%; margin-bottom: 10px; line-height: 1.5; border-radius: 8px;
    padding: 8px 12px; white-space: pre-wrap; word-wrap: break-word; }
  .user { margin-left: auto; background: var(--vscode-input-background);
    border: 1px solid var(--vscode-panel-border); }
  .agent { margin-right: auto; background: transparent; padding: 2px 0; }
  .msg code { font-family: var(--vscode-editor-font-family, monospace); font-size: .95em;
    background: var(--vscode-textCodeBlock-background, rgba(128,128,128,.15));
    padding: 1px 4px; border-radius: 3px; }
  .msg pre { background: var(--vscode-textCodeBlock-background, rgba(128,128,128,.15));
    padding: 8px 10px; border-radius: 6px; overflow-x: auto; white-space: pre; }
  .msg pre code { background: none; padding: 0; }

  details.thinking, details.tool { margin: 6px 0; border-radius: 6px;
    border: 1px solid var(--vscode-panel-border); padding: 4px 8px; }
  details.thinking summary { cursor: pointer; opacity: .6; font-style: italic; font-size: .9em; }
  details.thinking .body { opacity: .6; font-style: italic; white-space: pre-wrap; margin-top: 4px; }
  details.tool summary { cursor: pointer; font-size: .92em; display: flex; align-items: center; gap: 6px; }
  details.tool .result { margin-top: 6px; font-family: var(--vscode-editor-font-family, monospace);
    font-size: .88em; white-space: pre-wrap; opacity: .8; max-height: 200px; overflow-y: auto; }
  .spin { display: inline-block; animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .perm { border: 1px solid var(--vscode-inputValidation-warningBorder, #c90);
    background: var(--vscode-inputValidation-warningBackground, rgba(200,150,0,.08));
    border-radius: 8px; padding: 10px 12px; margin: 10px 0; }
  .perm .title { font-weight: 600; margin-bottom: 4px; }
  .perm .detail { font-family: var(--vscode-editor-font-family, monospace); font-size: .85em;
    white-space: pre-wrap; opacity: .8; max-height: 140px; overflow-y: auto; margin-bottom: 8px; }
  .perm .buttons { display: flex; gap: 6px; flex-wrap: wrap; }
  .perm button { cursor: pointer; border: none; border-radius: 4px; padding: 4px 12px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground); }
  .perm button.allow { background: var(--vscode-button-background);
    color: var(--vscode-button-foreground); }
  .perm .resolved { opacity: .7; font-style: italic; }

  .sys { text-align: center; font-size: .85em; opacity: .55; margin: 8px 0; }
  .err { color: var(--vscode-errorForeground); }

  #setup { flex: 1; overflow-y: auto; padding: 18px 22px; display: none; max-width: 560px; }
  #setup h2 { font-size: 1.1em; font-weight: 600; margin: 0 0 4px; }
  #setup .sub { opacity: .6; font-size: .9em; margin-bottom: 16px; }
  #setup label { display: block; font-size: .85em; font-weight: 600; margin: 12px 0 4px; }
  #setup label .req { color: var(--vscode-errorForeground); }
  #setup label .hint { font-weight: 400; opacity: .6; margin-left: 6px; }
  #setup input[type="text"], #setup input[type="number"], #setup select, #setup textarea {
    width: 100%; box-sizing: border-box; padding: 6px 9px; border-radius: 5px;
    border: 1px solid var(--vscode-input-border, transparent);
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    font-family: inherit; font-size: inherit; outline: none;
  }
  #setup input:focus, #setup select:focus, #setup textarea:focus {
    border-color: var(--vscode-focusBorder);
  }
  #setup textarea { resize: vertical; min-height: 60px; }
  #setup .agent-desc { opacity: .6; font-size: .85em; margin-top: 4px; font-style: italic; }
  #setup .check { display: flex; align-items: center; gap: 8px; margin-top: 14px; }
  #setup .check label { margin: 0; font-weight: 400; }
  #setup #create-btn { margin-top: 18px; cursor: pointer; border: none; border-radius: 6px;
    padding: 8px 18px; background: var(--vscode-button-background);
    color: var(--vscode-button-foreground); font-size: inherit; }
  #setup #create-btn:disabled { opacity: .4; cursor: default; }
  #setup .prefilled { font-size: .78em; opacity: .55; margin-top: 2px; }

  #composer { display: flex; gap: 8px; padding: 10px 12px; align-items: flex-end;
    border-top: 1px solid var(--vscode-panel-border);
    background: var(--vscode-sideBar-background); }
  #input { flex: 1; resize: none; min-height: 34px; max-height: 140px; padding: 7px 10px;
    border-radius: 6px; border: 1px solid var(--vscode-input-border, transparent);
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    font-family: inherit; font-size: inherit; outline: none; }
  #input:focus { border-color: var(--vscode-focusBorder); }
  #send, #stop { cursor: pointer; border: none; border-radius: 6px; padding: 8px 14px;
    background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  #send:disabled { opacity: .4; cursor: default; }
  #stop { background: var(--vscode-inputValidation-errorBorder, #a33);
    color: var(--vscode-button-foreground); display: none; }
</style>
</head>
<body>
  <div id="header">
    <span id="run">connecting…</span><span id="state"></span>
    <div id="usage-wrap">
      <div id="usage-bar"><div id="usage-fill"></div></div>
      <span id="usage-text"></span>
      <button id="disconnect" title="Disconnect (run keeps going)">⏻</button>
    </div>
  </div>
  <div id="setup">
    <h2>New agent run</h2>
    <div class="sub">Configure the AgentRun. Fields come from the Agent's declared parameters.</div>
    <label for="agent-select">Agent</label>
    <select id="agent-select"></select>
    <div class="agent-desc" id="agent-desc"></div>
    <label for="instructions">Instructions <span class="hint">composed with the agent's standing prompt</span></label>
    <textarea id="instructions" placeholder="What should this run accomplish?"></textarea>
    <div id="param-fields"></div>
    <label for="model-select" id="model-label">Model</label>
    <select id="model-select"></select>
    <div class="check">
      <input type="checkbox" id="smart-approve">
      <label for="smart-approve">Ask before write/execute tool calls (human-in-the-loop)</label>
    </div>
    <button id="create-btn">Create run</button>
  </div>
  <div id="chat"></div>
  <div id="composer">
    <textarea id="input" placeholder="Message the agent… (Enter to send, Esc to stop a turn)"></textarea>
    <button id="send">Send</button>
    <button id="stop">Stop</button>
  </div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const chat = document.getElementById("chat");
  const input = document.getElementById("input");
  const sendBtn = document.getElementById("send");
  const stopBtn = document.getElementById("stop");

  let agentBubble = null;   // current streaming agent message
  let agentRaw = "";
  let thinkingEl = null;
  let thinkingRaw = "";
  let turnActive = false;
  const tools = new Map();

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  // Tiny markdown-ish renderer: fences, inline code, bold. POC-grade.
  function md(s) {
    let out = "";
    const parts = s.split(/\\n?\`\`\`[a-zA-Z0-9]*\\n?/);
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        out += "<pre><code>" + esc(parts[i]) + "</code></pre>";
      } else {
        out += esc(parts[i])
          .replace(/\`([^\`\\n]+)\`/g, "<code>$1</code>")
          .replace(/\\*\\*([^*\\n]+)\\*\\*/g, "<strong>$1</strong>");
      }
    }
    return out;
  }
  function scroll() { chat.scrollTop = chat.scrollHeight; }
  function sys(text, cls) {
    const d = document.createElement("div");
    d.className = "sys" + (cls ? " " + cls : "");
    d.textContent = text;
    chat.appendChild(d); scroll();
  }
  function endAgentBubble() { agentBubble = null; agentRaw = ""; thinkingEl = null; thinkingRaw = ""; }

  function setTurn(active) {
    turnActive = active;
    sendBtn.disabled = active;
    stopBtn.style.display = active ? "inline-block" : "none";
    if (!active) { input.focus(); }
  }

  function send() {
    const text = input.value.trim();
    if (!text || turnActive) { return; }
    input.value = "";
    vscode.postMessage({ t: "prompt", text });
  }
  sendBtn.addEventListener("click", send);
  stopBtn.addEventListener("click", () => vscode.postMessage({ t: "cancel" }));
  document.getElementById("disconnect").addEventListener("click",
    () => vscode.postMessage({ t: "disconnect" }));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    if (e.key === "Escape" && turnActive) { vscode.postMessage({ t: "cancel" }); }
  });

  // ── Setup form ──────────────────────────────────────────────────
  const setupEl = document.getElementById("setup");
  const composer = document.getElementById("composer");
  let setupData = null;

  function currentAgent() {
    const name = document.getElementById("agent-select").value;
    return setupData.agents.find((a) => a.name === name) ?? setupData.agents[0];
  }

  function renderParamFields() {
    const agent = currentAgent();
    const holder = document.getElementById("param-fields");
    holder.innerHTML = "";
    document.getElementById("agent-desc").textContent = agent.promptPreview ?? "";
    for (const p of agent.params) {
      const label = document.createElement("label");
      label.textContent = p.name;
      if (p.required) {
        const r = document.createElement("span");
        r.className = "req"; r.textContent = " *";
        label.appendChild(r);
      }
      if (p.description) {
        const h = document.createElement("span");
        h.className = "hint"; h.textContent = p.description;
        label.appendChild(h);
      }
      holder.appendChild(label);
      const prefilled = setupData.prefill[p.name];
      if (p.type === "boolean") {
        const cb = document.createElement("input");
        cb.type = "checkbox"; cb.dataset.param = p.name;
        cb.checked = (prefilled ?? p.default) === "true";
        holder.appendChild(cb);
      } else {
        const input = document.createElement("input");
        input.type = p.type === "number" ? "number" : "text";
        input.dataset.param = p.name;
        input.dataset.required = p.required ? "1" : "";
        input.value = prefilled ?? p.default ?? "";
        input.placeholder = p.default ?? "";
        input.addEventListener("input", validateSetup);
        holder.appendChild(input);
        if (prefilled !== undefined) {
          const note = document.createElement("div");
          note.className = "prefilled"; note.textContent = "detected from workspace";
          holder.appendChild(note);
        }
      }
    }
    renderModelOptions();
    validateSetup();
  }

  function renderModelOptions() {
    const agent = currentAgent();
    const sel = document.getElementById("model-select");
    sel.innerHTML = "";
    const none = document.createElement("option");
    none.value = ""; none.textContent = "(agent default)";
    sel.appendChild(none);
    for (const m of agent.models) {
      const o = document.createElement("option");
      o.value = m.provider + "|" + m.model;
      o.textContent = m.model + " (" + m.provider + (m.tier ? ", " + m.tier : "") + ")";
      sel.appendChild(o);
    }
    const d = setupData.defaults;
    if (d.provider && d.model) {
      sel.value = d.provider + "|" + d.model;
      if (sel.value !== d.provider + "|" + d.model) { sel.value = ""; }
    }
  }

  function validateSetup() {
    let ok = true;
    for (const input of setupEl.querySelectorAll("input[data-required='1']")) {
      if (!input.value.trim()) { ok = false; }
    }
    document.getElementById("create-btn").disabled = !ok;
  }

  function renderSetup(data) {
    setupData = data;
    const btn = document.getElementById("create-btn");
    btn.disabled = false; btn.textContent = "Create run";
    const sel = document.getElementById("agent-select");
    sel.innerHTML = "";
    for (const a of data.agents) {
      const o = document.createElement("option");
      o.value = a.name; o.textContent = a.name;
      sel.appendChild(o);
    }
    if (data.defaults.agentRef) { sel.value = data.defaults.agentRef; }
    if (!sel.value && data.agents.length) { sel.value = data.agents[0].name; }
    sel.addEventListener("change", renderParamFields);
    document.getElementById("smart-approve").checked = data.defaults.smartApprove;
    renderParamFields();
    setupEl.style.display = "block";
    composer.style.display = "none";
    chat.style.display = "none";
  }

  document.getElementById("create-btn").addEventListener("click", () => {
    const params = {};
    for (const el of setupEl.querySelectorAll("[data-param]")) {
      const value = el.type === "checkbox" ? String(el.checked) : el.value.trim();
      if (value !== "") { params[el.dataset.param] = value; }
    }
    const modelValue = document.getElementById("model-select").value;
    const [provider, model] = modelValue ? modelValue.split("|") : [undefined, undefined];
    document.getElementById("create-btn").disabled = true;
    document.getElementById("create-btn").textContent = "Creating…";
    vscode.postMessage({ t: "create", payload: {
      agentRef: document.getElementById("agent-select").value,
      instructions: document.getElementById("instructions").value.trim(),
      params, provider, model,
      smartApprove: document.getElementById("smart-approve").checked,
    }});
  });

  function enterChatMode() {
    setupEl.style.display = "none";
    chat.style.display = "block";
    composer.style.display = "flex";
    input.focus();
  }

  window.addEventListener("message", (event) => {
    const m = event.data;
    switch (m.t) {
      case "setup": renderSetup(m.data); return;
      case "chatMode": enterChatMode(); return;
      case "status": {
        document.getElementById("run").textContent = m.runName;
        document.getElementById("state").textContent =
          m.state + (m.sessionId ? " · session " + m.sessionId.slice(0, 12) : "");
        break;
      }
      case "user": {
        endAgentBubble();
        const d = document.createElement("div");
        d.className = "msg user"; d.textContent = m.text;
        chat.appendChild(d); scroll();
        break;
      }
      case "chunk": {
        if (!agentBubble) {
          agentBubble = document.createElement("div");
          agentBubble.className = "msg agent";
          chat.appendChild(agentBubble);
        }
        if (m.kind === "thinking") {
          if (!thinkingEl) {
            thinkingEl = document.createElement("details");
            thinkingEl.className = "thinking";
            thinkingEl.innerHTML = "<summary>thinking…</summary><div class='body'></div>";
            agentBubble.appendChild(thinkingEl);
          }
          thinkingRaw += m.text;
          thinkingEl.querySelector(".body").textContent = thinkingRaw;
        } else {
          agentRaw += m.text;
          let textDiv = agentBubble.querySelector(".text");
          if (!textDiv) {
            textDiv = document.createElement("div");
            textDiv.className = "text";
            agentBubble.appendChild(textDiv);
          }
          textDiv.innerHTML = md(agentRaw);
        }
        scroll();
        break;
      }
      case "toolCall": {
        const det = document.createElement("details");
        det.className = "tool";
        det.innerHTML =
          "<summary><span class='icon spin'>◐</span> <span class='title'></span></summary>" +
          "<div class='result'></div>";
        det.querySelector(".title").textContent = m.title;
        (agentBubble ?? chat).appendChild(det);
        tools.set(m.id, det);
        // New text after a tool call starts a fresh text block visually.
        agentRaw = "";
        if (agentBubble) {
          const t = agentBubble.querySelector(".text");
          if (t) { t.classList.remove("text"); }
        }
        scroll();
        break;
      }
      case "toolUpdate": {
        const det = tools.get(m.id);
        if (!det) { break; }
        const icon = det.querySelector(".icon");
        if (m.status === "completed" || m.status === "succeeded") {
          icon.classList.remove("spin"); icon.textContent = "✓";
        } else if (m.status === "failed") {
          icon.classList.remove("spin"); icon.textContent = "✗";
        }
        if (m.result) { det.querySelector(".result").textContent = m.result; }
        break;
      }
      case "usage": {
        const pct = Math.min(100, (m.used / m.size) * 100);
        document.getElementById("usage-fill").style.width = pct + "%";
        document.getElementById("usage-text").textContent =
          (m.used >= 1000 ? (m.used / 1000).toFixed(1) + "k" : m.used) + " / " +
          (m.size >= 1000 ? Math.round(m.size / 1000) + "k" : m.size);
        break;
      }
      case "perm": {
        const card = document.createElement("div");
        card.className = "perm";
        card.dataset.permId = m.permId;
        const title = document.createElement("div");
        title.className = "title"; title.textContent = "⚠ " + m.title;
        card.appendChild(title);
        if (m.detail) {
          const det = document.createElement("div");
          det.className = "detail"; det.textContent = m.detail;
          card.appendChild(det);
        }
        const btns = document.createElement("div");
        btns.className = "buttons";
        for (const o of m.options) {
          const b = document.createElement("button");
          b.textContent = o.name;
          if (o.kind.startsWith("allow")) { b.className = "allow"; }
          b.addEventListener("click", () =>
            vscode.postMessage({ t: "permChoice", permId: m.permId, optionId: o.optionId }));
          btns.appendChild(b);
        }
        card.appendChild(btns);
        chat.appendChild(card); scroll();
        break;
      }
      case "permDone": {
        const card = chat.querySelector('.perm[data-perm-id="' + m.permId + '"]');
        if (card) {
          const btns = card.querySelector(".buttons");
          btns.innerHTML = "";
          const r = document.createElement("span");
          r.className = "resolved"; r.textContent = "→ " + m.chosen;
          btns.appendChild(r);
        }
        break;
      }
      case "turnStart": setTurn(true); break;
      case "turnDone": {
        setTurn(false); endAgentBubble();
        if (m.stopReason && m.stopReason !== "end_turn") { sys("turn ended: " + m.stopReason); }
        break;
      }
      case "error": { setTurn(false); endAgentBubble(); sys(m.msg, "err"); break; }
    }
  });
  input.focus();
</script>
</body>
</html>`;
}
