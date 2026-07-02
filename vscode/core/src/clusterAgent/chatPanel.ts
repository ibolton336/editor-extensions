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

export interface ChatPanelHandlers {
  onPrompt: (text: string) => void;
  onCancel: () => void;
  onDisconnect: () => void;
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
  | { t: "error"; msg: string };

type FromWebview =
  | { t: "prompt"; text: string }
  | { t: "permChoice"; permId: number; optionId: string | null }
  | { t: "cancel" }
  | { t: "disconnect" };

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

  window.addEventListener("message", (event) => {
    const m = event.data;
    switch (m.t) {
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
