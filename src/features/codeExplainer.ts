import * as path from "path";
import * as ts from "typescript";
import * as vscode from "vscode";
import { createLogger } from "../utils/logger";

const logger = createLogger("Dev Toolkit");

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type ExplanationMode = "standard" | "beginner";

type Insight = {
  type: "positive" | "warning" | "suggestion" | "info";
  message: string;
  detail?: string;
  priority: "low" | "medium" | "high";
  learnMore?: string;
};

type CombinedMetrics = {
  complexity: "low" | "medium" | "high";
  cyclomatic: number;
  nestingDepth: number;
  linesOfCode: number;
  maintainabilityIndex: number;
  // New metrics
  cognitiveComplexity: number;
  halsteadVolume: number;
  commentDensity: number;
  duplicateRisk: "low" | "medium" | "high";
  codeSmells: number;
};

type AnalysisSignal = {
  algorithm: string;
  confidence: number;
  summary: string;
  details: string[];
  tags: string[];
  insights: Insight[];
  metrics?: CombinedMetrics;
};

type StaticAnalysisResult = {
  metrics: CombinedMetrics;
  patterns: string[];
  insights: Insight[];
  signals: AnalysisSignal[];
  standardSummary: string;
  beginnerSummary: string;
  detailsText: string;
};

type AIEnhancement = {
  standard: string;
  beginner: string;
  details: string;
};

type Explanation = {
  standard: string;
  beginner: string;
  details: string;
  metrics: CombinedMetrics;
  patterns: string[];
  insights: Insight[];
  mode: ExplanationMode;
  language: string;
  algorithmsUsed: number;
  topContributors: string[];
  signals: AnalysisSignal[];
  aiEnhanced: boolean;
  aiStatus?: string;
  rawMarkdown: string;
};

type ViewMessage =
  | { type: "setMode"; mode: ExplanationMode }
  | { type: "refreshSelection" }
  | { type: "copySection"; section: "summary" | "details" | "insights" }
  | { type: "expandDetails" }
  | { type: "exportMarkdown" }
  | { type: "openLearnMore"; url: string };

type ViewPayload =
  | { type: "loading"; progress: number; step: string }
  | { type: "empty" }
  | { type: "error"; message: string }
  | { type: "update"; explanation: Explanation };

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRATION
// ─────────────────────────────────────────────────────────────────────────────

export function registerCodeExplainer(context: vscode.ExtensionContext) {
  const provider = new CodeExplainerViewProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("devToolkit.codeExplainer", provider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  const explainCommand = vscode.commands.registerCommand("devToolkit.explainSelectedCode", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("Open a file and select code to explain.");
      return;
    }

    const selection = editor.selection;
    const text = editor.document.getText(selection).trim();
    if (!text) {
      vscode.window.showWarningMessage("Select the code you want explained.");
      return;
    }

    await vscode.commands.executeCommand("workbench.view.extension.devToolkit");

    provider.showLoading(0, "Step 1: Running static analysis...");
    try {
      const config = vscode.workspace.getConfiguration("devToolkit");
      const useAI = config.get<boolean>("enableCopilotFallback", true);
      const explanation = await runMultiAlgorithmAnalysis(
        text,
        editor.document.languageId,
        useAI,
        (p, s) => provider.showLoading(p, s)
      );
      provider.updateView(explanation);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Analysis failed.";
      logger.error("explainSelectedCode failed", msg);
      provider.showError(msg);
    }
  });

  // Also trigger on selection change with debounce (optional, controlled by setting)
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  const selectionListener = vscode.window.onDidChangeTextEditorSelection(() => {
    const config = vscode.workspace.getConfiguration("devToolkit");
    if (!config.get<boolean>("autoAnalyzeSelection", false)) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const text = editor.document.getText(editor.selection).trim();
      if (text.length < 10) return;
      try {
        const useAI = config.get<boolean>("enableCopilotFallback", true);
        const explanation = await runMultiAlgorithmAnalysis(text, editor.document.languageId, useAI);
        provider.updateView(explanation);
      } catch { /* silent */ }
    }, 1500);
  });

  context.subscriptions.push(explainCommand, selectionListener);
}

// ─────────────────────────────────────────────────────────────────────────────
// VIEW PROVIDER
// ─────────────────────────────────────────────────────────────────────────────

class CodeExplainerViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private currentExplanation: Explanation | null = null;
  private readonly context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    this.view.webview.options = {
      enableScripts: true,
      enableForms: false,
      localResourceRoots: [this.context.extensionUri]
    };
    this.view.webview.html = this.getHtml();

    this.view.webview.onDidReceiveMessage(async (msg: ViewMessage) => {
      switch (msg.type) {
        case "setMode": this.handleSetMode(msg.mode); break;
        case "refreshSelection": await this.handleRefresh(); break;
        case "copySection": await this.handleCopy(msg.section); break;
        case "expandDetails": this.view?.webview.postMessage({ type: "toggleDetailsExpand" }); break;
        case "exportMarkdown": await this.handleExportMarkdown(); break;
        case "openLearnMore":
          try { vscode.env.openExternal(vscode.Uri.parse(msg.url)); } catch { /* ignore */ }
          break;
      }
    }, undefined, this.context.subscriptions);

    this.postMessage({ type: "empty" });
  }

  private postMessage(payload: ViewPayload) {
    this.view?.webview.postMessage(payload);
  }

  showLoading(progress: number, step: string) {
    this.postMessage({ type: "loading", progress, step });
  }

  showError(message: string) {
    this.postMessage({ type: "error", message });
  }

  updateView(explanation: Explanation) {
    this.currentExplanation = explanation;
    this.postMessage({ type: "update", explanation });
  }

  private handleSetMode(mode: ExplanationMode) {
    if (!this.currentExplanation) return;
    if (this.currentExplanation.mode === mode) return;
    this.currentExplanation.mode = mode;
    this.postMessage({ type: "update", explanation: this.currentExplanation });
  }

  private async handleRefresh() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { this.postEmpty(); return; }
    const text = editor.document.getText(editor.selection).trim();
    if (!text) { this.postEmpty(); return; }

    this.showLoading(0, "Re-analyzing selection...");
    try {
      const config = vscode.workspace.getConfiguration("devToolkit");
      const useAI = config.get<boolean>("enableCopilotFallback", true);
      const explanation = await runMultiAlgorithmAnalysis(
        text,
        editor.document.languageId,
        useAI,
        (p, s) => this.showLoading(p, s)
      );
      this.currentExplanation = explanation;
      this.postMessage({ type: "update", explanation });
    } catch (err) {
      this.showError(err instanceof Error ? err.message : "Refresh failed.");
    }
  }

  private async handleCopy(section: "summary" | "details" | "insights") {
    if (!this.currentExplanation) return;
    let text = "";
    switch (section) {
      case "summary":
        text = this.currentExplanation.mode === "beginner"
          ? this.currentExplanation.beginner
          : this.currentExplanation.standard;
        break;
      case "details":
        text = this.currentExplanation.details;
        break;
      case "insights":
        text = this.currentExplanation.insights
          .map(i => `[${i.priority.toUpperCase()}] ${i.message}${i.detail ? ` — ${i.detail}` : ""}`)
          .join("\n");
        break;
    }

    try {
      await vscode.env.clipboard.writeText(text);
      vscode.window.setStatusBarMessage("$(check) Copied to clipboard", 1500);
    } catch {
      vscode.window.showWarningMessage("Clipboard access denied.");
    }
  }

  private async handleExportMarkdown() {
    if (!this.currentExplanation) return;
    const defaultName = `code-explanation-${Date.now()}.md`;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const defaultUri = workspaceFolder
      ? vscode.Uri.file(path.join(workspaceFolder, defaultName))
      : vscode.Uri.file(defaultName);

    const uri = await vscode.window.showSaveDialog({
      filters: { Markdown: ["md"] },
      defaultUri
    });
    if (uri) {
      try {
        await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(this.currentExplanation.rawMarkdown));
        const action = await vscode.window.showInformationMessage(
          `Exported to ${path.basename(uri.fsPath)}`,
          "Open File"
        );
        if (action === "Open File") {
          await vscode.workspace.openTextDocument(uri).then(doc => vscode.window.showTextDocument(doc));
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  private postEmpty() {
    this.currentExplanation = null;
    this.postMessage({ type: "empty" });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HTML GENERATOR
  // ─────────────────────────────────────────────────────────────────────────
  private getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https://cdnjs.cloudflare.com; font-src https://cdnjs.cloudflare.com; script-src 'unsafe-inline';" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codicons/0.0.35/codicon.css" />
  <style>
    :root {
      --bg: var(--vscode-sideBar-background);
      --border: var(--vscode-editorWidget-border);
      --text: var(--vscode-editor-foreground);
      --text-sec: var(--vscode-descriptionForeground);
      --accent: var(--vscode-button-background);
      --accent-hover: var(--vscode-button-hoverBackground);
      --accent-fg: var(--vscode-button-foreground);
      --input-bg: var(--vscode-input-background);
      --success: var(--vscode-terminal-ansiGreen);
      --warn: var(--vscode-editorWarning-foreground);
      --error: var(--vscode-inputValidation-errorForeground);
      --info: var(--vscode-editorInfo-foreground);
      --purple: var(--vscode-charts-purple);
      --panel-bg: var(--vscode-panel-background, var(--vscode-sideBar-background));
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--text);
      background: var(--bg);
      line-height: 1.5;
      overflow-x: hidden;
    }
    .container { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

    /* HEADER */
    .header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 6px 10px; border-bottom: 1px solid var(--border);
      flex-wrap: wrap; gap: 6px; flex-shrink: 0;
    }
    .title-group { display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1; }
    .title {
      font-weight: 600; font-size: 0.82rem;
      display: flex; align-items: center; gap: 4px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .title i { font-size: 0.95rem; color: var(--accent); }
    .badges { display: flex; gap: 3px; flex-shrink: 0; flex-wrap: wrap; }
    .badge { font-size: 0.58rem; padding: 2px 5px; border-radius: 9px; border: 1px solid var(--border); white-space: nowrap; }
    .badge.algo { background: var(--input-bg); color: var(--text-sec); }
    .badge.ai { background: var(--purple); color: white; border-color: var(--purple); display: none; }
    .badge.ai.visible { display: inline-block; }
    .badge.lang-badge { background: var(--input-bg); color: var(--accent); border-color: var(--accent); display: none; }
    .badge.lang-badge.visible { display: inline-block; }
    .controls { display: flex; gap: 3px; flex-shrink: 0; }
    button {
      background: var(--accent); color: var(--accent-fg); border: none;
      padding: 3px 6px; font-size: 0.68rem; border-radius: 3px; cursor: pointer;
      transition: background 0.15s, opacity 0.15s;
      display: inline-flex; align-items: center; gap: 3px;
      white-space: nowrap;
    }
    button:hover { background: var(--accent-hover); }
    button:active { opacity: 0.8; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    button.secondary { background: var(--input-bg); color: var(--text); border: 1px solid var(--border); }
    button.secondary:hover { background: var(--border); }
    button.icon { padding: 3px; min-width: 24px; justify-content: center; }

    /* SCROLL CONTENT */
    .content { flex: 1; padding: 8px; overflow-y: auto; overflow-x: hidden; min-height: 0; }

    /* STATES */
    .state { display: none; text-align: center; padding: 20px 10px; }
    .state.active { display: block; }
    .state-icon { font-size: 1.8rem; margin-bottom: 8px; color: var(--text-sec); }
    .state-text { color: var(--text-sec); font-size: 0.85rem; }
    .progress { margin: 10px auto; width: 85%; max-width: 340px; }
    .bar { height: 3px; background: rgba(255,255,255,0.12); border-radius: 2px; overflow: hidden; margin-bottom: 4px; }
    .fill { height: 100%; background: var(--accent); width: 0%; transition: width 0.25s ease; border-radius: 2px; }
    .step { font-size: 0.68rem; color: var(--text-sec); }
    .load-title { font-size: 1rem; font-weight: 500; margin-bottom: 8px; }

    /* EXPLANATION PANEL */
    .explanation { display: none; }
    .explanation.active { display: block; }

    /* MODE BAR */
    .mode-bar {
      display: flex; align-items: center; justify-content: space-between;
      padding: 5px 8px; background: var(--input-bg); border-radius: 4px;
      margin-bottom: 8px; border: 1px solid var(--border);
    }
    .mode-label { display: flex; align-items: center; gap: 4px; font-size: 0.72rem; color: var(--text-sec); }
    .mode-group { display: flex; background: var(--bg); border-radius: 3px; border: 1px solid var(--border); overflow: hidden; }
    .mode-btn { padding: 3px 8px; font-size: 0.68rem; background: transparent; color: var(--text-sec); border: none; cursor: pointer; transition: background 0.15s; }
    .mode-btn.active { background: var(--accent); color: var(--accent-fg); font-weight: 500; }
    .mode-btn:hover:not(.active) { background: var(--border); color: var(--text); }

    .tab-bar { display: flex; gap: 4px; margin-bottom: 10px; }
    .tab-btn { flex: 1; padding: 4px 8px; font-size: 0.75rem; border: 1px solid var(--border); border-radius: 4px; background: var(--input-bg); color: var(--text); cursor: pointer; transition: background 0.15s, border-color 0.15s; }
    .tab-btn.active { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
    .tab-btn:hover:not(.active) { background: var(--border); }
    .tab-pane { display: none; }
    .tab-pane.active { display: block; }

    /* TAGS */
    .tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
    .tag {
      background: var(--input-bg); padding: 2px 6px; border-radius: 3px;
      font-size: 0.67rem; color: var(--text-sec); border: 1px solid var(--border);
      display: inline-flex; align-items: center; gap: 3px;
    }

    /* METRICS GRID - responsive */
    .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin-bottom: 8px; }
    @media (max-width: 280px) { .metrics { grid-template-columns: repeat(2, 1fr); } }
    .card { background: var(--input-bg); padding: 6px 7px; border-radius: 4px; border: 1px solid var(--border); min-width: 0; }
    .card-head { display: flex; align-items: center; gap: 3px; color: var(--text-sec); font-size: 0.65rem; margin-bottom: 2px; overflow: hidden; white-space: nowrap; }
    .card-val { font-weight: 700; font-size: 0.95rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .card-val.high { color: var(--error); }
    .card-val.medium { color: var(--warn); }
    .card-val.low { color: var(--success); }
    .card-val.clean { color: var(--success); }
    .card-desc { font-size: 0.6rem; color: var(--text-sec); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    /* SECTION */
    .section { margin-bottom: 10px; }
    .sec-head {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 5px; padding-bottom: 3px; border-bottom: 1px solid var(--border);
    }
    .sec-title { font-size: 0.77rem; font-weight: 600; display: flex; align-items: center; gap: 4px; }
    .sec-actions { display: flex; gap: 3px; }
    .sec-actions button { padding: 2px 5px; font-size: 0.62rem; }

    /* INSIGHTS */
    .insights { display: flex; flex-direction: column; gap: 4px; }
    .insight {
      display: flex; gap: 5px; padding: 6px; border-radius: 4px;
      font-size: 0.72rem; background: var(--input-bg); border-left: 3px solid transparent;
      transition: opacity 0.15s;
    }
    .algorithm-results { display: grid; gap: 6px; margin-bottom: 10px; }
    .algo-item { border: 1px solid var(--border); border-radius: 4px; padding: 8px; background: var(--input-bg); }
    .algo-title { display: flex; align-items: center; gap: 6px; font-size: 0.75rem; font-weight: 600; margin-bottom: 4px; color: var(--accent); }
    .algo-summary { font-size: 0.72rem; color: var(--text-sec); line-height: 1.4; }
    .insight:hover { opacity: 0.9; }
    .insight.positive { border-left-color: var(--success); }
    .insight.warning { border-left-color: var(--warn); }
    .insight.suggestion { border-left-color: var(--info); }
    .insight.info { border-left-color: var(--text-sec); }
    .ins-icon { flex-shrink: 0; margin-top: 1px; font-size: 0.8rem; }
    .ins-body { flex: 1; min-width: 0; }
    .ins-msg { font-weight: 500; margin-bottom: 2px; word-break: break-word; }
    .ins-detail { font-size: 0.65rem; color: var(--text-sec); margin-bottom: 2px; word-break: break-word; }
    .ins-meta { display: flex; align-items: center; gap: 5px; font-size: 0.62rem; color: var(--text-sec); flex-wrap: wrap; }
    .pri {
      padding: 1px 4px; border-radius: 2px; text-transform: uppercase;
      font-weight: 700; font-size: 0.58rem; white-space: nowrap;
    }
    .pri.high { background: rgba(240,80,80,0.15); color: var(--error); }
    .pri.medium { background: rgba(215,155,0,0.15); color: var(--warn); }
    .pri.low { background: rgba(46,160,67,0.15); color: var(--success); }
    .learn { color: var(--info); text-decoration: none; display: inline-flex; align-items: center; gap: 2px; font-size: 0.62rem; }
    .learn:hover { text-decoration: underline; }

    /* SUMMARY BOX */
    .box { background: var(--input-bg); border: 1px solid var(--border); border-radius: 4px; padding: 8px; margin-bottom: 6px; }
    .sum-text { white-space: pre-wrap; line-height: 1.6; font-size: 0.82rem; word-break: break-word; }
    .sum-text.beginner { font-size: 0.88rem; line-height: 1.7; }

    /* DETAILS */
    .det-text {
      font-size: 0.75rem; color: var(--text-sec); white-space: pre-wrap;
      line-height: 1.5; max-height: 180px; overflow-y: auto;
      transition: max-height 0.25s ease; word-break: break-word;
    }
    .det-text.expanded { max-height: 600px; }

    /* CONTRIBUTORS */
    .contributors { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
    .contributor {
      display: inline-flex; align-items: center; gap: 3px;
      padding: 3px 6px; border-radius: 3px; background: var(--bg);
      border: 1px solid var(--border); font-size: 0.7rem; color: var(--text-sec);
    }
    .ai-note { display: flex; align-items: center; gap: 5px; font-size: 0.72rem; color: var(--text-sec); flex-wrap: wrap; }
    .ai-note.ok { color: var(--success); }
    .ai-note.warn { color: var(--warn); }

    /* SCORE BAR */
    .score-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
    .score-label { font-size: 0.68rem; color: var(--text-sec); width: 72px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .score-bar-wrap { flex: 1; height: 5px; background: rgba(255,255,255,0.12); border-radius: 3px; overflow: hidden; }
    .score-bar-fill { height: 100%; border-radius: 3px; transition: width 0.4s ease; }
    .score-bar-fill.high { background: var(--error); }
    .score-bar-fill.medium { background: var(--warn); }
    .score-bar-fill.low { background: var(--success); }
    .score-val { font-size: 0.65rem; color: var(--text-sec); min-width: 28px; text-align: right; flex-shrink: 0; }

    /* FOOTER */
    .footer {
      padding: 5px 10px; border-top: 1px solid var(--border);
      font-size: 0.62rem; color: var(--text-sec);
      display: flex; justify-content: space-between; align-items: center;
      flex-wrap: wrap; gap: 4px; flex-shrink: 0;
    }
    .foot-left { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
    .kbd { background: var(--input-bg); padding: 1px 3px; border-radius: 2px; font-family: monospace; border: 1px solid var(--border); font-size: 0.58rem; }

    .hidden { display: none !important; }
    .codicon { font-size: 0.88rem; line-height: 1; vertical-align: text-bottom; }
    .divider { height: 1px; background: var(--border); margin: 8px 0; }

    /* Scrollbar */
    .content::-webkit-scrollbar { width: 4px; }
    .content::-webkit-scrollbar-track { background: transparent; }
    .content::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
    .content::-webkit-scrollbar-thumb:hover { background: var(--text-sec); }

    @keyframes spin { to { transform: rotate(360deg); } }
    .spin { display: inline-block; animation: spin 1.2s linear infinite; }
  </style>
</head>
<body>
  <div class="container">
    <!-- HEADER -->
    <div class="header">
      <div class="title-group">
        <span class="title"><i class="codicon codicon-book"></i> Code Explainer</span>
        <div class="badges">
          <span id="algoBadge" class="badge algo">0 analyzers</span>
          <span id="aiBadge" class="badge ai"><i class="codicon codicon-stars"></i> AI</span>
          <span id="langBadge" class="badge lang-badge"></span>
        </div>
      </div>
      <div class="controls">
        <button id="refreshBtn" class="secondary icon" title="Refresh (re-analyze selection)"><i class="codicon codicon-refresh"></i></button>
        <button id="exportBtn" class="secondary icon" title="Export as Markdown"><i class="codicon codicon-markdown"></i></button>
        <button id="copyBtn" class="secondary icon" title="Copy summary"><i class="codicon codicon-copy"></i></button>
      </div>
    </div>

    <!-- SCROLLABLE CONTENT -->
    <div class="content">
      <!-- LOADING STATE -->
      <div id="stateLoading" class="state">
        <div class="state-icon"><i class="codicon codicon-loading spin"></i></div>
        <div class="load-title" id="loadText">Analyzing your code...</div>
        <div class="progress">
          <div class="bar"><div id="progFill" class="fill"></div></div>
          <div id="progStep" class="step">Preparing pipeline...</div>
        </div>
      </div>

      <!-- EMPTY STATE -->
      <div id="stateEmpty" class="state">
        <div class="state-icon"><i class="codicon codicon-search"></i></div>
        <div class="state-text" style="font-size:1rem;font-weight:500;margin-bottom:8px;">No code selected</div>
        <div style="font-size:0.8rem;color:var(--text-sec);max-width:320px;margin:0 auto 8px;">
          Select code in the editor, then right-click &rarr; <strong>Explain Selected Code</strong>
          or press <span class="kbd">Ctrl+Shift+E</span> / <span class="kbd">Cmd+Shift+E</span>.
        </div>
        <div style="font-size:0.75rem;color:var(--text-sec);">Works with functions, classes, snippets, and more.</div>
      </div>

      <!-- ERROR STATE -->
      <div id="stateError" class="state">
        <div class="state-icon"><i class="codicon codicon-error"></i></div>
        <div class="state-text" id="errMsg" style="word-break:break-word;">Analysis failed.</div>
        <button id="retryBtn" class="secondary" style="margin-top:10px;"><i class="codicon codicon-refresh"></i> Retry</button>
      </div>

      <!-- CONTENT STATE -->
      <div id="stateContent" class="explanation">
        <!-- Mode Toggle -->
        <div class="mode-bar">
          <div class="mode-label"><i class="codicon codicon-lightbulb"></i> Style</div>
          <div class="mode-group">
            <button id="modeStd" class="mode-btn active">Standard</button>
            <button id="modeBeg" class="mode-btn">Beginner</button>
          </div>
        </div>

        <!-- View Tabs -->
        <div class="tab-bar">
          <button id="tabBasic" class="tab-btn active">Basic</button>
          <button id="tabAnalysis" class="tab-btn">Analysis Result</button>
        </div>

        <div id="basicPane" class="tab-pane active">
          <!-- Pattern Tags -->
          <div class="tags" id="patternTags"></div>

          <!-- Metrics Grid -->
          <div class="metrics">
            <div class="card">
              <div class="card-head"><i class="codicon codicon-graph"></i> Complexity</div>
              <div id="mComp" class="card-val">-</div>
              <div id="mCompDesc" class="card-desc">-</div>
            </div>
            <div class="card">
              <div class="card-head"><i class="codicon codicon-git-branch"></i> Cyclomatic</div>
              <div id="mCyc" class="card-val">-</div>
              <div class="card-desc">paths</div>
            </div>
            <div class="card">
              <div class="card-head"><i class="codicon codicon-indent"></i> Nesting</div>
              <div id="mNest" class="card-val">-</div>
              <div class="card-desc">depth</div>
            </div>
            <div class="card">
              <div class="card-head"><i class="codicon codicon-checklist"></i> Maintain</div>
              <div id="mMaint" class="card-val">-</div>
              <div class="card-desc">/100</div>
            </div>
            <div class="card">
              <div class="card-head"><i class="codicon codicon-combine"></i> Cognitive</div>
              <div id="mCog" class="card-val">-</div>
              <div class="card-desc">score</div>
            </div>
            <div class="card">
              <div class="card-head"><i class="codicon codicon-symbol-misc"></i> Smells</div>
              <div id="mSmells" class="card-val">-</div>
              <div class="card-desc">issues</div>
            </div>
          </div>

          <!-- Score Bars -->
          <div class="section">
            <div class="sec-head">
              <div class="sec-title"><i class="codicon codicon-pulse"></i> Quality Scores</div>
            </div>
            <div id="scoreBars"></div>
          </div>

          <!-- Insights -->
          <div class="section">
            <div class="sec-head">
              <div class="sec-title"><i class="codicon codicon-lightbulb"></i> Key Insights</div>
              <div class="sec-actions">
                <button class="secondary icon" id="copyIns" title="Copy insights"><i class="codicon codicon-copy"></i></button>
              </div>
            </div>
            <div class="insights" id="insightsList"></div>
          </div>

          <!-- Summary -->
          <div class="section">
            <div class="sec-head">
              <div class="sec-title"><i class="codicon codicon-comment-discussion"></i> Summary</div>
              <div class="sec-actions">
                <button class="secondary" id="copySum"><i class="codicon codicon-copy"></i> Copy</button>
              </div>
            </div>
            <div class="box"><div id="sumText" class="sum-text"></div></div>
          </div>
        </div>

        <div id="analysisPane" class="tab-pane">
          <!-- Technical Details (collapsible) -->
          <div class="section">
            <div class="sec-head">
              <div class="sec-title"><i class="codicon codicon-list-tree"></i> Technical Details</div>
              <div class="sec-actions">
                <button class="secondary" id="expandDetBtn"><i class="codicon codicon-unfold"></i> Expand</button>
                <button class="secondary icon" id="copyDet" title="Copy details"><i class="codicon codicon-copy"></i></button>
              </div>
            </div>
            <div class="box"><div id="detText" class="det-text"></div></div>
          </div>

          <!-- Analyzer Results -->
          <div class="section">
            <div class="sec-head">
              <div class="sec-title"><i class="codicon codicon-list-selection"></i> Analyzer Results</div>
            </div>
            <div id="algorithmResults" class="algorithm-results"></div>
          </div>

          <!-- Highlights / Contributors -->
          <div class="section">
            <div class="sec-head">
              <div class="sec-title"><i class="codicon codicon-star"></i> Analysis Pipeline</div>
            </div>
            <div class="box">
              <div id="contributorsList" class="contributors"></div>
              <div id="aiNote" class="ai-note"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- FOOTER -->
    <div class="footer">
      <div class="foot-left">
        <span id="langLabel">Lang: -</span>
        <span class="kbd">Ctrl+Shift+E</span>
      </div>
      <div><span id="statusLabel">Ready</span></div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const $ = id => document.getElementById(id);

    const els = {
      loadText: $("loadText"), progFill: $("progFill"), progStep: $("progStep"),
      errMsg: $("errMsg"),
      aiBadge: $("aiBadge"), algoBadge: $("algoBadge"), langBadge: $("langBadge"),
      modeStd: $("modeStd"), modeBeg: $("modeBeg"),
      tabBasic: $("tabBasic"), tabAnalysis: $("tabAnalysis"),
      basicPane: $("basicPane"), analysisPane: $("analysisPane"),
      patternTags: $("patternTags"),
      mComp: $("mComp"), mCompDesc: $("mCompDesc"),
      mCyc: $("mCyc"), mNest: $("mNest"), mMaint: $("mMaint"),
      mCog: $("mCog"), mSmells: $("mSmells"),
      scoreBars: $("scoreBars"),
      insights: $("insightsList"),
      sumText: $("sumText"),
      detText: $("detText"),
      contributors: $("contributorsList"), algorithmResults: $("algorithmResults"), aiNote: $("aiNote"),
      copyIns: $("copyIns"), copySum: $("copySum"), copyDet: $("copyDet"),
      expandDetBtn: $("expandDetBtn"),
      lang: $("langLabel"), status: $("statusLabel"),
      refresh: $("refreshBtn"), copy: $("copyBtn"), exportBtn: $("exportBtn"), retry: $("retryBtn")
    };

    let detExpanded = false;

    function showState(id) {
      ["stateLoading","stateEmpty","stateError","stateContent"].forEach(s => {
        const el = $(s);
        if (el) {
          el.classList.toggle("active", s === id);
          if (s === "stateContent") el.style.display = s === id ? "block" : "none";
        }
      });
    }

    let currentTab = "basic";

    function setActiveTab(tab) {
      currentTab = tab;
      els.tabBasic.classList.toggle("active", tab === "basic");
      els.tabAnalysis.classList.toggle("active", tab === "analysis");
      els.basicPane.classList.toggle("active", tab === "basic");
      els.analysisPane.classList.toggle("active", tab === "analysis");
    }

    function updateModeButtons(mode) {
      els.modeStd.classList.toggle("active", mode === "standard");
      els.modeBeg.classList.toggle("active", mode === "beginner");
    }

    function esc(t) {
      return String(t).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c] || c));
    }

    function getCompDesc(l) {
      return { low: "Easy to follow", medium: "Moderate", high: "Consider refactor" }[l] || "";
    }

    const TAG_ICONS = {
      "function":"codicon-symbol-function","class":"codicon-symbol-class",
      "interface":"codicon-symbol-interface","async":"codicon-symbol-event",
      "react":"codicon-symbol-structure","component":"codicon-symbol-method",
      "import":"codicon-symbol-namespace","export":"codicon-symbol-package",
      "error-handling":"codicon-warning","validation":"codicon-check",
      "data-fetch":"codicon-cloud-download","state-management":"codicon-database",
      "routing":"codicon-link","styling":"codicon-paintcan","testing":"codicon-beaker",
      "performance":"codicon-zap","security":"codicon-shield","documentation":"codicon-book",
      "types":"codicon-symbol-boolean","naming":"codicon-tag","hooks":"codicon-symbol-event",
      "promise":"codicon-symbol-event","generator":"codicon-refresh"
    };

    function getTagIcon(p) {
      const key = p.toLowerCase().replace(/\s+/g, "-");
      return TAG_ICONS[key] || "codicon-symbol-misc";
    }

    const ALGO_ICONS = {
      "AST Parser":"codicon-symbol-file","Complexity":"codicon-graph","Patterns":"codicon-symbol-keyword",
      "Testability":"codicon-symbol-boolean","Dependencies":"codicon-symbol-package",
      "Documentation":"codicon-book","Naming":"codicon-tag","Security":"codicon-shield",
      "Performance":"codicon-zap","Framework":"codicon-symbol-structure",
      "Data Flow":"codicon-symbol-namespace","Control Flow":"codicon-debug-alt",
      "Types":"codicon-symbol-boolean","Halstead":"codicon-graph-line",
      "Code Smells":"codicon-bug","Dead Code":"codicon-trash","Promise Flow":"codicon-sync",
      "Regex":"codicon-regex","Cognitive":"codicon-combine","Comment Quality":"codicon-comment",
      "Side Effects":"codicon-flame","Error Handling":"codicon-issue-reopened","Readability":"codicon-eye",
      "Naming Consistency":"codicon-symbol-keyword","Dependency Audit":"codicon-symbol-package",
      "Immutability":"codicon-lock","Modern Syntax":"codicon-symbol-constant",
      "Style Consistency":"codicon-bracket","Security Injection":"codicon-shield",
      "Concurrency Safety":"codicon-sync","Resource Management":"codicon-server",
      "Duplicate Patterns":"codicon-copy","Validation":"codicon-checklist",
      "Logging Patterns":"codicon-debug","Exception Patterns":"codicon-alert",
      "Test Signals":"codicon-beaker","Configuration Usage":"codicon-gear",
      "Build Safety":"codicon-package","Lifecycle Hooks":"codicon-flame",
      "Legacy API Usage":"codicon-history"
    };

    function getAlgoIcon(name) {
      return ALGO_ICONS[name] || "codicon-symbol-misc";
    }

    const INS_ICONS = {
      positive: "codicon-check", warning: "codicon-warning",
      suggestion: "codicon-lightbulb", info: "codicon-info"
    };

    function getInsIcon(t) { return INS_ICONS[t] || "codicon-info"; }

    function makeScoreBars(metrics) {
      const scores = [
        { label: "Maintainability", val: metrics.maintainabilityIndex, max: 100, pct: metrics.maintainabilityIndex },
        { label: "Comment density", val: Math.round(metrics.commentDensity) + "%", max: 100, pct: metrics.commentDensity },
        { label: "Cyclomatic", val: metrics.cyclomatic, max: 20, pct: Math.min(100, (metrics.cyclomatic / 20) * 100), invert: true },
        { label: "Cognitive", val: metrics.cognitiveComplexity, max: 30, pct: Math.min(100, (metrics.cognitiveComplexity / 30) * 100), invert: true },
        { label: "Nesting depth", val: metrics.nestingDepth, max: 8, pct: Math.min(100, (metrics.nestingDepth / 8) * 100), invert: true },
      ];

      return scores.map(s => {
        const level = s.invert
          ? (s.pct > 65 ? "high" : s.pct > 35 ? "medium" : "low")
          : (s.pct > 65 ? "low" : s.pct > 35 ? "medium" : "high");
        return '<div class="score-row">' +
          '<span class="score-label">' + esc(s.label) + '</span>' +
          '<div class="score-bar-wrap"><div class="score-bar-fill ' + level + '" style="width:' + s.pct.toFixed(1) + '%"></div></div>' +
          '<span class="score-val">' + esc(String(s.val)) + '</span>' +
        '</div>';
      }).join("");
    }

    // ── EVENT HANDLERS ──
    els.refresh.onclick = () => vscode.postMessage({ type: "refreshSelection" });
    els.retry.onclick = () => vscode.postMessage({ type: "refreshSelection" });
    els.modeStd.onclick = () => vscode.postMessage({ type: "setMode", mode: "standard" });
    els.modeBeg.onclick = () => vscode.postMessage({ type: "setMode", mode: "beginner" });
    els.tabBasic.onclick = () => setActiveTab("basic");
    els.tabAnalysis.onclick = () => setActiveTab("analysis");
    els.copyIns.onclick = () => vscode.postMessage({ type: "copySection", section: "insights" });
    els.copySum.onclick = () => vscode.postMessage({ type: "copySection", section: "summary" });
    els.copyDet.onclick = () => vscode.postMessage({ type: "copySection", section: "details" });
    els.copy.onclick = () => vscode.postMessage({ type: "copySection", section: "summary" });
    els.exportBtn.onclick = () => vscode.postMessage({ type: "exportMarkdown" });
    els.expandDetBtn.onclick = () => {
      detExpanded = !detExpanded;
      els.detText.classList.toggle("expanded", detExpanded);
      els.expandDetBtn.innerHTML = detExpanded
        ? '<i class="codicon codicon-fold"></i> Collapse'
        : '<i class="codicon codicon-unfold"></i> Expand';
    };

    // ── MESSAGE HANDLER ──
    window.addEventListener("message", e => {
      const m = e.data;

      if (m.type === "loading") {
        showState("stateLoading");
        els.loadText.textContent = m.step || "Analyzing...";
        els.progFill.style.width = Math.min(100, m.progress || 0) + "%";
        els.progStep.textContent = m.step || "";
      }

      if (m.type === "empty") {
        showState("stateEmpty");
        els.status.textContent = "Waiting";
      }

      if (m.type === "error") {
        els.errMsg.textContent = m.message || "An error occurred.";
        showState("stateError");
        els.status.textContent = "Error";
      }

      if (m.type === "toggleDetailsExpand") {
        detExpanded = !detExpanded;
        els.detText.classList.toggle("expanded", detExpanded);
      }

      if (m.type === "update") {
        const d = m.explanation;
        updateModeButtons(d.mode);
        els.algoBadge.textContent = d.algorithmsUsed + " analyzers";
        els.aiBadge.classList.toggle("visible", !!d.aiEnhanced);

        const langUpper = (d.language || "").toUpperCase();
        els.langBadge.textContent = langUpper;
        els.langBadge.classList.toggle("visible", !!langUpper);
        els.lang.textContent = "Lang: " + (d.language || "-");

        // Metrics
        const met = d.metrics;
        els.mComp.textContent = met.complexity.toUpperCase();
        els.mComp.className = "card-val " + met.complexity;
        els.mCompDesc.textContent = getCompDesc(met.complexity);
        els.mCyc.textContent = met.cyclomatic;
        els.mNest.textContent = met.nestingDepth;
        els.mMaint.textContent = met.maintainabilityIndex;
        els.mMaint.className = "card-val " + (met.maintainabilityIndex >= 65 ? "low" : met.maintainabilityIndex >= 40 ? "medium" : "high");
        els.mCog.textContent = met.cognitiveComplexity;
        els.mCog.className = "card-val " + (met.cognitiveComplexity <= 5 ? "low" : met.cognitiveComplexity <= 15 ? "medium" : "high");
        els.mSmells.textContent = met.codeSmells;
        els.mSmells.className = "card-val " + (met.codeSmells === 0 ? "low" : met.codeSmells <= 3 ? "medium" : "high");

        // Score bars
        els.scoreBars.innerHTML = makeScoreBars(met);

        // Pattern tags
        els.patternTags.innerHTML = d.patterns.slice(0, 10).map(p =>
          '<span class="tag"><i class="codicon ' + getTagIcon(p) + '"></i>' + esc(p) + '</span>'
        ).join("");

        // Insights
        els.insights.innerHTML = d.insights.slice(0, 8).map(i => {
          const link = i.learnMore
            ? '<a href="#" class="learn" data-url="' + esc(i.learnMore) + '"><i class="codicon codicon-link-external"></i> Learn</a>'
            : "";
          return '<div class="insight ' + esc(i.type) + '">' +
            '<div class="ins-icon"><i class="codicon ' + getInsIcon(i.type) + '"></i></div>' +
            '<div class="ins-body">' +
              '<div class="ins-msg">' + esc(i.message) + '</div>' +
              (i.detail ? '<div class="ins-detail">' + esc(i.detail) + '</div>' : '') +
              '<div class="ins-meta"><span class="pri ' + esc(i.priority) + '">' + esc(i.priority) + '</span>' + (link ? ' ' + link : '') + '</div>' +
            '</div>' +
          '</div>';
        }).join("");

        // Attach learn-more handlers
        els.insights.querySelectorAll(".learn").forEach(a => {
          a.onclick = ev => {
            ev.preventDefault();
            vscode.postMessage({ type: "openLearnMore", url: a.dataset.url });
          };
        });

        // Summary
        const summaryText = d.mode === "beginner" ? d.beginner : d.standard;
        els.sumText.textContent = summaryText || "(No summary available)";
        els.sumText.className = "sum-text" + (d.mode === "beginner" ? " beginner" : "");

        setActiveTab(currentTab);

        // Details
        els.detText.textContent = d.details || "(No details available)";
        detExpanded = false;
        els.detText.classList.remove("expanded");
        els.expandDetBtn.innerHTML = '<i class="codicon codicon-unfold"></i> Expand';

        // Algorithm result summaries
        els.algorithmResults.innerHTML = d.signals.map(s =>
          '<div class="algo-item"><div class="algo-title"><i class="codicon ' + getAlgoIcon(s.algorithm) + '"></i>' + esc(s.algorithm) + '</div>' +
          '<div class="algo-summary">' + esc(s.summary) + '</div></div>'
        ).join("");

        // Contributors
        els.contributors.innerHTML = d.topContributors.map(c =>
          '<span class="contributor"><i class="codicon ' + getAlgoIcon(c) + '"></i>' + esc(c) + '</span>'
        ).join("");

        // AI note
        const aiOk = !!d.aiEnhanced;
        const aiText = d.aiStatus || (aiOk ? "AI-enhanced analysis active." : "Static analysis only (AI unavailable).");
        els.aiNote.innerHTML = '<i class="codicon ' + (aiOk ? "codicon-check" : "codicon-warning") + '"></i> ' + esc(aiText);
        els.aiNote.className = "ai-note " + (aiOk ? "ok" : "warn");

        showState("stateContent");
        els.status.textContent = aiOk ? "AI-Enhanced" : "Static Analysis";
      }
    });

    // Init
    showState("stateEmpty");
  </script>
</body>
</html>`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1: STATIC ANALYSIS (20 Local Algorithms)
// ─────────────────────────────────────────────────────────────────────────────

async function runStaticAnalysis(
  code: string,
  languageId: string,
  onProgress: (p: number, s: string) => void
): Promise<StaticAnalysisResult> {
  const step = (p: number, s: string) => onProgress(p, s);

  step(2,  "Parsing AST structure...");              const ast  = analyzeAST(code);
  step(4,  "Building control flow...");               const cfg  = analyzeControlFlow(code);
  step(6,  "Tracking data flow...");                  const df   = analyzeDataFlow(code);
  step(8,  "Calculating complexity metrics...");      const cm   = calculateComplexityMetrics(code);
  step(10, "Computing cognitive complexity...");       const cog  = analyzeCognitiveComplexity(code);
  step(12, "Recognizing patterns...");                const pat  = detectPatterns(code);
  step(14, "Labeling semantic roles...");             const sem  = labelSemanticRoles(code);
  step(16, "Mapping dependencies...");                const dep  = buildDependencyGraph(code);
  step(18, "Inferring types...");                     const typ  = inferTypes(code, languageId);
  step(20, "Extracting documentation...");            const doc  = extractDocumentation(code);
  step(22, "Analyzing naming conventions...");        const nam  = analyzeNamingConventions(code);
  step(24, "Scanning security risks...");             const sec  = scanSecurityHeuristics(code);
  step(26, "Checking performance hints...");          const perf = generatePerformanceHints(code);
  step(28, "Detecting framework context...");         const fw   = detectFrameworkContext(code);
  step(30, "Assessing testability...");               const test = assessTestability(code);
  step(32, "Computing Halstead metrics...");          const hal  = analyzeHalstead(code);
  step(34, "Detecting code smells...");               const smells = detectCodeSmells(code);
  step(36, "Analyzing promise/async flow...");        const prom = analyzePromiseFlow(code);
  step(38, "Scanning regex usage.f..");                const rx   = analyzeRegexUsage(code);
  step(40, "Checking comment quality...");            const cq   = analyzeCommentQuality(code);
  step(42, "Reviewing side-effects...");             const side = analyzeSideEffects(code);
  step(44, "Validating error handling...");          const errHand = analyzeErrorHandling(code);
  step(46, "Scoring readability...");                 const read = analyzeReadability(code);
  step(48, "Checking naming consistency...");         const nameCons = detectNamingConsistency(code);
  step(50, "Auditing dependencies...");               const depAudit = auditDependencies(code);
  step(52, "Evaluating immutability...");            const immut = analyzeImmutability(code);
  step(54, "Checking modern syntax...");             const modern = analyzeModernSyntax(code);
  step(56, "Reviewing style consistency...");         const style = checkStyleConsistency(code);
  step(58, "Scanning injection risks...");            const secInj = analyzeSecurityInjection(code);
  step(60, "Assessing concurrency safety...");       const concurrency = assessConcurrencySafety(code);
  step(62, "Inspecting resource management...");       const resource = inspectResourceManagement(code);
  step(64, "Detecting duplicate patterns...");         const duplicates = detectDuplicatePatterns(code);
  step(66, "Validating data flows...");               const validation = analyzeValidationPatterns(code);
  step(68, "Reviewing logging patterns...");          const logging = analyzeLoggingPatterns(code);
  step(70, "Examining exception handling...");        const exceptionPatterns = analyzeExceptionPatterns(code);
  step(72, "Assessing test signal quality...");       const testSignals = analyzeTestSignals(code);
  step(74, "Auditing configuration usage...");        const config = auditConfigUsage(code);
  step(76, "Verifying build safety...");              const build = evaluateBuildSafety(code);
  step(78, "Inspecting lifecycle hooks...");          const lifecycle = inspectLifecycleHooks(code);
  step(80, "Detecting legacy API usage...");          const legacy = detectLegacyAPIUsage(code);

  step(82, "Synthesizing results...");
  return synthesizeStaticSignals([
    ast, cfg, df, cm, cog, pat, sem, dep, typ, doc, nam, sec, perf, fw, test, hal, smells, prom, rx, cq,
    side, errHand, read, nameCons, depAudit, immut, modern, style, secInj, concurrency, resource, duplicates,
    validation, logging, exceptionPatterns, testSignals, config, build, lifecycle, legacy
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// 20 ALGORITHMS
// ─────────────────────────────────────────────────────────────────────────────

// 1. AST Parser
function analyzeAST(code: string): AnalysisSignal {
  try {
    const source = ts.createSourceFile("snippet.ts", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const stmts = source.statements.filter(n => n.kind !== ts.SyntaxKind.EmptyStatement);
    if (!stmts.length) {
      return { algorithm: "AST Parser", confidence: 0.9, summary: "Empty or comment-only selection.", details: [], tags: ["empty"], insights: [] };
    }

    const sums: string[] = [], dets: string[] = [];
    const tags = new Set<string>();
    for (const s of stmts) {
      const r = visitASTNode(s, source);
      if (r) { sums.push(r.summary); dets.push(...r.details); r.tags.forEach(t => tags.add(t)); }
    }

    // Count node types
    let nodeCount = 0;
    const countNodes = (node: ts.Node) => { nodeCount++; ts.forEachChild(node, countNodes); };
    countNodes(source);

    dets.push(`AST nodes: ${nodeCount}`);
    dets.push(`Top-level statements: ${stmts.length}`);

    return {
      algorithm: "AST Parser",
      confidence: 0.95,
      summary: sums.length ? sums.join(". ") + "." : "Mixed procedural block.",
      details: dets,
      tags: Array.from(tags),
      insights: []
    };
  } catch {
    return {
      algorithm: "AST Parser",
      confidence: 0.3,
      summary: "AST parse failed; using fallback heuristics.",
      details: [],
      tags: ["parse-fallback"],
      insights: [{ type: "warning", message: "Code may contain syntax errors.", detail: "Parser could not build AST", priority: "medium" }]
    };
  }
}

function visitASTNode(node: ts.Node, src: ts.SourceFile): { summary: string; details: string[]; tags: string[] } | null {
  if (isFunctionLike(node)) {
    const n = (node as ts.FunctionLikeDeclaration & { name?: ts.Identifier }).name?.getText(src) || "anonymous";
    const p = (node as ts.FunctionLikeDeclaration).parameters.map(x => x.name.getText(src)).join(", ") || "none";
    const isAsync = (node as ts.FunctionLikeDeclaration).modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
    return {
      summary: `${isAsync ? "Async " : ""}function ${n}(${p})`,
      details: [`Declaration: ${isAsync ? "async " : ""}function '${n}' with params: ${p}`],
      tags: ["function", isAsync ? "async" : "sync"]
    };
  }
  if (ts.isVariableStatement(node)) {
    const names = node.declarationList.declarations.map(d => d.name.getText(src)).join(", ");
    const isConst = (node.declarationList.flags & ts.NodeFlags.Const) !== 0;
    return { summary: `${isConst ? "const" : "let/var"}: ${names}`, details: [`Variable declaration: ${names}`], tags: ["variable"] };
  }
  if (ts.isClassDeclaration(node)) {
    const heritage = node.heritageClauses?.map(h => h.getText(src)).join(", ") || "";
    return { summary: `Class: ${node.name?.text || "anon"}${heritage ? " " + heritage : ""}`, details: [`Class: ${node.name?.text || "anon"}`], tags: ["class", "oop"] };
  }
  if (ts.isInterfaceDeclaration(node)) return { summary: `Interface: ${node.name.text}`, details: [], tags: ["interface", "type"] };
  if (ts.isImportDeclaration(node)) {
    const mod = node.moduleSpecifier.getText(src).replace(/['"]/g, "");
    return { summary: `Import: ${mod}`, details: [`Import from '${mod}'`], tags: ["import", "dependency"] };
  }
  if (ts.isExportDeclaration(node)) return { summary: "Export statement", details: [], tags: ["export", "module"] };
  if (ts.isIfStatement(node) || ts.isSwitchStatement(node)) return { summary: "Conditional branch", details: [], tags: ["control-flow", "branch"] };
  if (ts.isForStatement(node) || ts.isWhileStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node)) return { summary: "Loop construct", details: [], tags: ["control-flow", "iteration"] };
  if (ts.isTryStatement(node)) return { summary: "Error handling block", details: [], tags: ["error-handling", "try-catch"] };
  if (ts.isTypeAliasDeclaration(node)) return { summary: `Type alias: ${node.name.text}`, details: [], tags: ["type", "alias"] };
  if (ts.isEnumDeclaration(node)) return { summary: `Enum: ${node.name.text}`, details: [], tags: ["enum", "type"] };
  return null;
}

function isFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node);
}

// 2. Control Flow
function analyzeControlFlow(code: string): AnalysisSignal {
  const br = (code.match(/\b(if|else\s+if|switch|case|catch|\?:|\|\||&&)\b/g) || []).length;
  const lo = (code.match(/\b(for|while|do)\b/g) || []).length;
  const ret = (code.match(/\breturn\b/g) || []).length;
  const throw_ = (code.match(/\bthrow\b/g) || []).length;
  const paths = 1 + br + lo;
  const insights: Insight[] = [];
  if (paths > 15) insights.push({ type: "warning", message: "Very high path count (>15) reduces testability significantly.", priority: "high", learnMore: "https://en.wikipedia.org/wiki/Cyclomatic_complexity" });
  else if (paths > 10) insights.push({ type: "warning", message: "High path count reduces testability.", priority: "medium" });
  if (ret > 5) insights.push({ type: "suggestion", message: "Multiple return points; consider early-return pattern.", priority: "low" });
  return {
    algorithm: "Control Flow",
    confidence: 0.85,
    summary: `~${paths} paths, ${br} branches, ${lo} loops, ${ret} returns.`,
    details: [`Branches: ${br}`, `Loops: ${lo}`, `Return statements: ${ret}`, `Throw statements: ${throw_}`, `Estimated paths: ${paths}`],
    tags: ["control-flow"],
    insights
  };
}

// 3. Data Flow
function analyzeDataFlow(code: string): AnalysisSignal {
  const defs = (code.match(/\b(const|let|var)\s+\w+/g) || []).length;
  const muts = (code.match(/\b\w+\s*[+\-*/%&|^]?=/g) || []).length - defs; // subtract initial defs
  const closureUse = (code.match(/\b(closure|bind|apply|call)\b/g) || []).length;
  const isPure = defs > 0 && muts <= 0;
  return {
    algorithm: "Data Flow",
    confidence: 0.75,
    summary: `${defs} defs, ~${Math.max(0, muts)} mutations (${isPure ? "pure" : "impure"}).`,
    details: [`Definitions: ${defs}`, `Mutations: ~${Math.max(0, muts)}`, `Closure indicators: ${closureUse}`, `Purity: ${isPure ? "Pure (no mutations)" : "Impure (has mutations)"}`],
    tags: ["data-flow", isPure ? "pure" : "side-effects"],
    insights: muts > 6 ? [{ type: "suggestion", message: "High mutation count; prefer immutable patterns.", priority: "low" }] : []
  };
}

// 4. Complexity Metrics
function calculateComplexityMetrics(code: string): AnalysisSignal & { metrics: CombinedMetrics } {
  const lines = code.split("\n").filter(l => l.trim() && !/^\s*\/\//.test(l) && !/^\s*\/\*/.test(l)).length;
  const branches = (code.match(/\b(if|else if|else|for|while|do|switch|case|catch|\?|&&|\|\|)\b/g) || []).length;
  const cyclo = 1 + branches;

  let depth = 0;
  let maxDepth = 0;
  const cleaned = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const char of cleaned) {
    if (char === "{") {
      depth += 1;
      maxDepth = Math.max(maxDepth, depth);
    } else if (char === "}") {
      depth = Math.max(0, depth - 1);
    }
  }

  const safeLines = Math.max(lines, 1);
  const mi = Math.max(0, Math.min(100, (171 - 5.2 * Math.log(Math.max(cyclo, 1)) - 0.23 * maxDepth - 16.2 * Math.log(safeLines)) / 1.71));
  const comp: "low" | "medium" | "high" = cyclo <= 7 && maxDepth <= 3 && lines <= 40
    ? "low"
    : cyclo <= 14 && maxDepth <= 5
      ? "medium"
      : "high";

  const metrics: Partial<CombinedMetrics> = {
    complexity: comp,
    cyclomatic: cyclo,
    nestingDepth: maxDepth,
    linesOfCode: lines,
    maintainabilityIndex: Math.round(mi)
  };

  return {
    algorithm: "Complexity",
    confidence: 0.95,
    summary: `${comp} complexity (cyclomatic: ${cyclo}, nesting: ${maxDepth}).`,
    details: [`Lines of code: ${lines}`, `Cyclomatic complexity: ${cyclo}`, `Max nesting depth: ${maxDepth}`, `Maintainability index: ${Math.round(mi)}/100`],
    tags: ["metrics", "complexity", comp],
    insights: comp === "high"
      ? [{ type: "warning", message: "Consider refactoring into smaller, focused functions.", priority: "high", learnMore: "https://refactoring.guru/refactoring" }]
      : [],
    metrics: metrics as CombinedMetrics
  };
}

// 5. Cognitive Complexity (NEW)
function analyzeCognitiveComplexity(code: string): AnalysisSignal {
  // Cognitive complexity adds score for nesting + control flow structures
  let score = 0;
  const lines = code.split("\n");
  let nestLevel = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    // Control flow adds nesting weight
    if (/^\s*(if|else if|for|while|do|switch)\b/.test(line)) {
      score += 1 + nestLevel;
      nestLevel++;
    } else if (/^\s*else\b/.test(line)) {
      score += 1;
    } else if (/^\s*(catch|finally)\b/.test(line)) {
      score += 1;
    } else if (/\&\&|\|\|/.test(trimmed)) {
      score += (trimmed.match(/\&\&|\|\|/g) || []).length;
    }
    // Track nesting via braces
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    nestLevel = Math.max(0, nestLevel + opens - closes);
  }

  const insights: Insight[] = [];
  if (score > 20) insights.push({ type: "warning", message: `Cognitive complexity score (${score}) is very high; this code is hard to reason about.`, priority: "high", learnMore: "https://www.sonarsource.com/docs/CognitiveComplexity.pdf" });
  else if (score > 10) insights.push({ type: "suggestion", message: `Cognitive complexity (${score}) is moderate. Consider simplification.`, priority: "medium" });
  else insights.push({ type: "positive", message: `Cognitive complexity (${score}) is low — code is readable.`, priority: "low" });

  return {
    algorithm: "Cognitive",
    confidence: 0.82,
    summary: `Cognitive complexity score: ${score}.`,
    details: [`Score: ${score}`, `Threshold low: <10`, `Threshold high: >20`, `Interpretation: ${score <= 10 ? "Easy to understand" : score <= 20 ? "Moderately complex" : "Hard to understand"}`],
    tags: ["cognitive", score <= 10 ? "readable" : score <= 20 ? "moderate" : "complex"],
    insights,
    metrics: { cognitiveComplexity: score } as any
  };
}

// 6. Pattern Detection
function detectPatterns(code: string): AnalysisSignal {
  const tags: string[] = [];
  const ins: Insight[] = [];
  const t = code.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");

  const add = (n: string) => { if (!tags.includes(n)) tags.push(n); };

  if (/\buseState\b|\buseEffect\b|\buseRef\b|\buseCallback\b|\buseMemo\b|\buseContext\b/.test(t)) {
    add("React Hooks");
    ins.push({ type: "info", message: "Follow React Hooks rules (no conditionals).", priority: "low", learnMore: "https://react.dev/reference/rules/rules-of-hooks" });
  }
  if (/export\s+default\s+function|const\s+\w+\s*=\s*\(\)\s*=>\s*(<[\w>]|React\.)/.test(t)) add("React Component");
  if (/\bapp\.(get|post|put|delete|patch)\b|\bRouter\(\)/.test(t)) add("Express Route");
  if (/\basync\s+function|\bawait\s/.test(t) && /fetch\b|axios|http|request/.test(t)) add("Async Data Fetch");
  if (/\btry\s*\{|catch\s*\(/.test(t)) add("Error Handling");
  if (/\bmap\b|\bfilter\b|\breduce\b|\bforEach\b|\bflatMap\b/.test(t)) add("Functional Array Ops");
  if (/\bnew\s+Promise\b|\bPromise\.(all|race|allSettled|any)\b/.test(t)) add("Promise Composition");
  if (/function\s*\*|yield\b/.test(t)) add("Generator");
  if (/\bObservable\b|\bSubject\b|\bpipe\b|\bof\b|\bfrom\b/.test(t) && /rxjs/.test(t)) add("RxJS / Reactive");
  if (/class\b.*\bimplements\b/.test(t) || /interface\b/.test(t)) add("OOP / Interface");
  if (/\bsingleton\b|\binstance\b/i.test(t)) add("Singleton Pattern");
  if (/dispatch\(|createSlice|useSelector|combineReducers/.test(t)) add("Redux Pattern");
  if (!tags.length) tags.push("Procedural");

  return {
    algorithm: "Patterns",
    confidence: 0.82,
    summary: `Detected: ${tags.join(", ")}.`,
    details: tags.map(p => `- ${p}`),
    tags,
    insights: ins
  };
}

// 7. Semantic Roles
function labelSemanticRoles(code: string): AnalysisSignal {
  const roles: string[] = [];
  if (/\breturn\b/.test(code)) roles.push("transformer");
  if (/validate|error|throw|assert/.test(code)) roles.push("validator");
  if (/render|JSX|<[\w>]|createElement/.test(code)) roles.push("renderer");
  if (/handle|on[A-Z]|callback|listener|emit/.test(code)) roles.push("event-handler");
  if (/fetch|axios|http|request|api/i.test(code)) roles.push("data-fetcher");
  if (/set\w+State|dispatch|store\./i.test(code)) roles.push("state-mutator");
  if (!roles.length) roles.push("general");
  return {
    algorithm: "Semantic Roles",
    confidence: 0.7,
    summary: `Semantic role(s): ${roles.join(", ")}.`,
    details: roles.map(r => `- ${r}`),
    tags: roles,
    insights: []
  };
}

// 8. Dependency Graph
function buildDependencyGraph(code: string): AnalysisSignal {
  const importMatches = code.match(/import\s+.*?from\s+['"](.+?)['"]/g) || [];
  const externalImports = importMatches.filter(i => !i.includes("from '.'") && !i.includes('from ".')).length;
  const localImports = importMatches.length - externalImports;
  const exports = (code.match(/export\s+(default\s+)?(const|function|class|type|interface|enum)/g) || []).length;
  const dynamicImports = (code.match(/import\s*\(/g) || []).length;
  const insights: Insight[] = [];
  if (externalImports > 7) insights.push({ type: "suggestion", message: "High external dependency count; consider consolidation.", priority: "low" });
  if (dynamicImports > 0) insights.push({ type: "info", message: `${dynamicImports} dynamic import(s) found — good for code splitting.`, priority: "low" });
  return {
    algorithm: "Dependencies",
    confidence: 0.9,
    summary: `${importMatches.length} imports (${externalImports} external, ${localImports} local), ${exports} exports.`,
    details: [`Total imports: ${importMatches.length}`, `External: ${externalImports}`, `Local: ${localImports}`, `Dynamic imports: ${dynamicImports}`, `Exports: ${exports}`],
    tags: ["dependencies", externalImports > 5 ? "high-coupling" : "low-coupling"],
    insights
  };
}

// 9. Type Inference
function inferTypes(code: string, lang: string): AnalysisSignal {
  if (!["typescript", "typescriptreact"].includes(lang)) {
    return { algorithm: "Types", confidence: 0.2, summary: "Non-TypeScript file; type analysis skipped.", details: [], tags: ["no-types"], insights: [{ type: "suggestion", message: "Consider TypeScript for stronger type safety.", priority: "low", learnMore: "https://www.typescriptlang.org/" }] };
  }
  const ann = (code.match(/:\s*[\w<>,\s\|&\[\]]+/g) || []).length;
  const generics = (code.match(/<[\w,\s]+>/g) || []).length;
  const anyUsage = (code.match(/:\s*any\b/g) || []).length;
  const assertNonNull = (code.match(/!/g) || []).length;
  const insights: Insight[] = [];
  if (anyUsage > 0) insights.push({ type: "warning", message: `${anyUsage} use(s) of 'any' type found — prefer stricter types.`, priority: "medium", learnMore: "https://www.typescriptlang.org/tsconfig#strict" });
  if (ann === 0) insights.push({ type: "suggestion", message: "Add type annotations for better safety and IDE support.", priority: "medium" });
  if (assertNonNull > 3) insights.push({ type: "suggestion", message: "Many non-null assertions (!); consider null checks instead.", priority: "low" });
  else if (assertNonNull > 0) insights.push({ type: "positive", message: `${ann} type annotations and ${generics} generics found — well-typed.`, priority: "low" });
  return {
    algorithm: "Types",
    confidence: 0.85,
    summary: `${ann} annotations, ${generics} generics, ${anyUsage} 'any' usages.`,
    details: [`Type annotations: ${ann}`, `Generics: ${generics}`, `'any' usages: ${anyUsage}`, `Non-null assertions: ${assertNonNull}`],
    tags: ["types", ann > 5 ? "well-typed" : "loose-types", anyUsage > 0 ? "has-any" : "no-any"],
    insights
  };
}

// 10. Documentation
function extractDocumentation(code: string): AnalysisSignal {
  const jsdoc = (code.match(/\/\*\*[\s\S]*?\*\//g) || []).length;
  const lineComments = (code.match(/\/\/\s*.+/g) || []).length;
  const todos = (code.match(/\/\/\s*(TODO|FIXME|HACK|XXX|BUG)/gi) || []).length;
  const totalLines = code.split("\n").length;
  const commentRatio = Math.round((lineComments / Math.max(totalLines, 1)) * 100);
  const insights: Insight[] = [];
  if (todos > 0) insights.push({ type: "warning", message: `${todos} TODO/FIXME comment(s) — track in issue tracker.`, priority: "low" });
  if (jsdoc + lineComments === 0) insights.push({ type: "suggestion", message: "No comments found; add docs for maintainability.", priority: "low", learnMore: "https://jsdoc.app/" });
  else if (jsdoc > 0) insights.push({ type: "positive", message: `${jsdoc} JSDoc block(s) found — good for documentation.`, priority: "low" });
  return {
    algorithm: "Documentation",
    confidence: 0.9,
    summary: `${jsdoc} JSDoc, ${lineComments} comments (${commentRatio}% of lines), ${todos} TODOs.`,
    details: [`JSDoc blocks: ${jsdoc}`, `Line comments: ${lineComments}`, `Comment ratio: ${commentRatio}%`, `TODOs/FIXMEs: ${todos}`],
    tags: ["documentation", jsdoc > 0 ? "jsdoc" : "comments"],
    insights,
    metrics: { commentDensity: commentRatio } as any
  };
}

// 11. Naming Conventions
function analyzeNamingConventions(code: string): AnalysisSignal {
  const ids = code.match(/\b[a-zA-Z_$][\w$]*\b/g) || [];
  const reserved = new Set(["if","else","for","while","do","switch","case","break","continue","return","function","class","const","let","var","new","delete","typeof","instanceof","void","null","undefined","true","false","import","export","default","try","catch","finally","throw","async","await","yield","of","in","extends","implements","interface","type","enum","abstract","public","private","protected","static","readonly","declare","namespace","module","from","as"]);
  const userIds = [...new Set(ids.filter(i => !reserved.has(i) && i.length > 1))];
  const camel = userIds.filter(i => /^[a-z][a-zA-Z0-9]*[A-Z]/.test(i)).length;
  const pascal = userIds.filter(i => /^[A-Z][a-zA-Z0-9]+$/.test(i)).length;
  const snake = userIds.filter(i => /^[a-z_][a-z0-9_]+_[a-z]/.test(i)).length;
  const screaming = userIds.filter(i => /^[A-Z][A-Z0-9_]{2,}$/.test(i)).length;
  const singleChar = userIds.filter(i => /^[a-z]$/.test(i)).length;
  const styles = [camel > 0, pascal > 0, snake > 0].filter(Boolean).length;
  return {
    algorithm: "Naming",
    confidence: 0.8,
    summary: `${styles} naming style(s): ${camel} camelCase, ${pascal} PascalCase, ${snake} snake_case.`,
    details: [`camelCase: ${camel}`, `PascalCase: ${pascal}`, `snake_case: ${snake}`, `SCREAMING_CASE: ${screaming}`, `Single-char: ${singleChar}`, `Total unique identifiers: ${userIds.length}`],
    tags: ["naming", styles === 1 ? "consistent" : "mixed"],
    insights: [
      ...(styles > 2 ? [{ type: "suggestion" as const, message: "Multiple naming styles — standardize for consistency.", priority: "low" as const }] : []),
      ...(singleChar > 3 ? [{ type: "suggestion" as const, message: `${singleChar} single-char variables — use descriptive names.`, priority: "low" as const }] : [])
    ]
  };
}

// 12. Security Heuristics
function scanSecurityHeuristics(code: string): AnalysisSignal {
  const risks = [
    { p: /\beval\s*\(/, m: "eval() usage is a critical security risk.", pri: "high" as const, url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/eval#never_use_eval!" },
    { p: /\.innerHTML\s*=|\.outerHTML\s*=/, m: "innerHTML assignment risks XSS attacks.", pri: "high" as const, url: "https://owasp.org/www-community/attacks/xss/" },
    { p: /new\s+Function\s*\(/, m: "Dynamic Function constructor is a security risk.", pri: "medium" as const },
    { p: /document\.write\s*\(/, m: "document.write() is deprecated and risky.", pri: "medium" as const },
    { p: /localStorage\.(getItem|setItem)\s*\([^)]*password|localStorage\.(getItem|setItem)\s*\([^)]*token/i, m: "Avoid storing sensitive data in localStorage.", pri: "high" as const },
    { p: /\bconsole\.log\s*\([^)]*password|console\.log\s*\([^)]*secret|console\.log\s*\([^)]*token/i, m: "Possible sensitive data logged to console.", pri: "high" as const },
    { p: /Math\.random\s*\(\).*token|Math\.random\s*\(\).*secret/i, m: "Math.random() is not cryptographically secure.", pri: "medium" as const, url: "https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues" },
    { p: /http:\/\/(?!localhost)/, m: "Non-HTTPS URL detected; prefer HTTPS.", pri: "medium" as const }
  ];
  const found = risks
    .filter(r => r.p.test(code))
    .map(r => ({ type: "warning" as const, message: r.m, priority: r.pri, learnMore: r.url }));
  return {
    algorithm: "Security",
    confidence: 0.78,
    summary: found.length ? `${found.length} security concern(s) detected.` : "No obvious security risks.",
    details: found.length ? found.map(f => `- ${f.message}`) : ["No high-risk patterns found"],
    tags: found.length ? ["security", "review"] : ["security", "clean"],
    insights: found
  };
}

// 13. Performance Hints
function generatePerformanceHints(code: string): AnalysisSignal {
  const hints: Insight[] = [];
  if (/\.forEach\s*\([^)]*\)\s*\{[^}]*\bawait\b/.test(code)) hints.push({ type: "suggestion", message: "Use Promise.all() instead of await inside forEach.", priority: "medium", learnMore: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all" });
  if (/JSON\.parse\s*\(\s*JSON\.stringify\s*\(/.test(code)) hints.push({ type: "info", message: "structuredClone() is faster and safer than JSON roundtrip for deep cloning.", priority: "low" });
  if (/\bconsole\.(log|debug|info)\s*\(/.test(code)) hints.push({ type: "suggestion", message: "Remove console.log() calls before production.", priority: "low" });
  if (/new\s+Array\([\d]+\)\.fill/.test(code)) hints.push({ type: "info", message: "Consider Array.from({length: n}) instead of new Array().fill() for clarity.", priority: "low" });
  if (/\b(document\.querySelector|getElementsBy)\b/.test(code) && /for\s*\(|while\s*\(/.test(code)) hints.push({ type: "suggestion", message: "Avoid DOM queries inside loops; cache selector results.", priority: "medium" });
  if (/\bsetTimeout\(.*0\)|\bsetInterval\(.*0\)/.test(code)) hints.push({ type: "info", message: "setTimeout(fn, 0) trick detected; consider queueMicrotask() or requestAnimationFrame().", priority: "low" });
  return {
    algorithm: "Performance",
    confidence: 0.72,
    summary: hints.length ? `${hints.length} performance hint(s).` : "No obvious performance issues.",
    details: hints.length ? hints.map(h => `- ${h.message}`) : ["Clean performance profile"],
    tags: hints.length ? ["performance", "hints"] : ["performance", "clean"],
    insights: hints
  };
}

// 14. Framework Detection
function detectFrameworkContext(code: string): AnalysisSignal {
  const fws = [
    { p: /from\s+['"]react['"]|React\.\w+/, name: "React" },
    { p: /from\s+['"]vue['"]|Vue\.component|defineComponent/, name: "Vue" },
    { p: /from\s+['"]@angular\/core['"]/, name: "Angular" },
    { p: /from\s+['"]express['"]|app\.(get|post|put|delete)/, name: "Express" },
    { p: /from\s+['"]next['"]|getServerSideProps|getStaticProps|NextPage/, name: "Next.js" },
    { p: /from\s+['"]svelte['"]|<script lang="ts">/, name: "Svelte" },
    { p: /from\s+['"]@remix-run/, name: "Remix" },
    { p: /from\s+['"]gatsby['"]/, name: "Gatsby" },
    { p: /from\s+['"]@nestjs\//, name: "NestJS" },
    { p: /from\s+['"]react-query['"]|useQuery|useMutation/, name: "React Query" },
    { p: /from\s+['"]zustand['"]|create\(\)/, name: "Zustand" },
    { p: /from\s+['"]@reduxjs\//, name: "Redux Toolkit" }
  ];
  const det = fws.filter(f => f.p.test(code)).map(f => f.name);
  return {
    algorithm: "Framework",
    confidence: 0.9,
    summary: det.length ? `Framework context: ${det.join(", ")}.` : "Vanilla JS/TS or unknown framework.",
    details: det.length ? det.map(f => `- ${f}`) : ["- No framework-specific patterns detected"],
    tags: det.length ? det.map(d => d.toLowerCase().replace(/\s+/g, "-")) : ["vanilla"],
    insights: []
  };
}

// 15. Testability Assessment
function assessTestability(code: string): AnalysisSignal {
  const hasExports = /export\s+(default\s+)?(const|function|class|type)/.test(code) ? 2 : 0;
  const pureFunctions = (code.match(/(?:function\s+\w+|const\s+\w+\s*=\s*(?:async\s*)?\()\s*[^)]*\)\s*(?::\s*\w+)?\s*(?:=>|{)[^}]*return[^}]*/g) || []).length;
  const sideEffects = (code.match(/\b(console|fetch|setTimeout|setInterval|document\.|window\.|localStorage|sessionStorage|navigator\.)\b/g) || []).length;
  const globals = (code.match(/\b(process|global|__dirname|__filename)\b/g) || []).length;
  const dependencies = (code.match(/import\s+.*?from\s+['"].+?['"]/g) || []).length;
  const score = Math.min(5, hasExports + Math.min(2, pureFunctions) - Math.min(2, sideEffects > 2 ? 2 : sideEffects > 0 ? 1 : 0) - (globals > 0 ? 1 : 0));
  const level = score >= 4 ? "high" : score >= 2 ? "medium" : "low";
  return {
    algorithm: "Testability",
    confidence: 0.75,
    summary: `Testability: ${level} (score ${Math.max(0, score)}/5).`,
    details: [`Score: ${Math.max(0, score)}/5`, `Exports: ${hasExports > 0 ? "yes" : "no"}`, `Pure function patterns: ${pureFunctions}`, `Side-effects: ${sideEffects}`, `External dependencies: ${dependencies}`],
    tags: ["testability", level],
    insights: level === "low"
      ? [{ type: "suggestion", message: "Extract pure functions and reduce global side-effects for easier testing.", priority: "medium", learnMore: "https://jestjs.io/docs/getting-started" }]
      : level === "high"
        ? [{ type: "positive", message: "Good testability — functions are exported and have few side-effects.", priority: "low" }]
        : []
  };
}

// 16. Halstead Metrics (NEW)
function analyzeHalstead(code: string): AnalysisSignal {
  // Operators
  const opPattern = /(\+\+|--|&&|\|\||===|!==|>=|<=|=>|[+\-*/%=&|^~!<>?:,.])/g;
  const ops = code.match(opPattern) || [];
  const n1 = new Set(ops).size; // distinct operators
  const N1 = ops.length;         // total operators

  // Operands (identifiers + literals)
  const operandPattern = /\b([a-zA-Z_$][\w$]*|\d+(\.\d+)?|['"`][^'"`]*['"`])\b/g;
  const operands = (code.match(operandPattern) || []).filter(o => !["if","else","for","while","return","const","let","var","function","class","import","export","async","await"].includes(o));
  const n2 = new Set(operands).size;
  const N2 = operands.length;

  const n = n1 + n2;
  const N = N1 + N2;
  const vocabulary = Math.max(n, 2);
  const length = Math.max(N, 2);
  const volume = length * Math.log2(vocabulary);
  const difficulty = (n1 / 2) * (N2 / Math.max(n2, 1));
  const effort = difficulty * volume;

  const insights: Insight[] = [];
  if (volume > 1000) insights.push({ type: "warning", message: "High Halstead volume — code may be hard to comprehend.", priority: "medium", learnMore: "https://en.wikipedia.org/wiki/Halstead_complexity_measures" });
  if (difficulty > 20) insights.push({ type: "suggestion", message: "High Halstead difficulty — consider simplifying logic.", priority: "low" });

  return {
    algorithm: "Halstead",
    confidence: 0.72,
    summary: `Halstead: volume=${Math.round(volume)}, difficulty=${Math.round(difficulty)}.`,
    details: [`Distinct operators: ${n1}`, `Total operators: ${N1}`, `Distinct operands: ${n2}`, `Total operands: ${N2}`, `Volume: ${Math.round(volume)}`, `Difficulty: ${Math.round(difficulty)}`, `Effort: ${Math.round(effort)}`],
    tags: ["halstead", volume > 1000 ? "high-volume" : "manageable"],
    insights,
    metrics: { halsteadVolume: Math.round(volume) } as any
  };
}

// 17. Code Smells Detection (NEW)
function detectCodeSmells(code: string): AnalysisSignal {
  const smells: Insight[] = [];

  // Long parameter list (>4 params in function)
  const paramMatches = code.match(/function\s+\w*\s*\(([^)]{40,})\)/g) || [];
  if (paramMatches.length > 0) smells.push({ type: "warning", message: `Long parameter list detected (${paramMatches.length} function(s)). Consider object parameter.`, priority: "medium", learnMore: "https://refactoring.guru/smells/long-parameter-list" });

  // Magic numbers
  const magicNums = code.match(/(?<![.\w])\b(?!0|1|2|100)\d{2,}\b(?!px|em|rem|%|ms|s)/g) || [];
  if (magicNums.length > 2) smells.push({ type: "suggestion", message: `${magicNums.length} magic number(s) — name them as constants.`, priority: "low", learnMore: "https://refactoring.guru/replace-magic-number-with-symbolic-constant" });

  // Deeply nested callbacks (callback hell)
  const nestedCallbacks = (code.match(/function\s*\([^)]*\)\s*\{[^}]*function\s*\([^)]*\)\s*\{[^}]*function/g) || []).length;
  if (nestedCallbacks > 0) smells.push({ type: "warning", message: "Callback nesting detected — consider async/await.", priority: "medium", learnMore: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises" });

  // Dead code indicators
  const deadCode = (code.match(/\/\*[\s\S]*?return[\s\S]*?\*\/|if\s*\(\s*false\s*\)|if\s*\(\s*0\s*\)/g) || []).length;
  if (deadCode > 0) smells.push({ type: "warning", message: `Possible dead code found (${deadCode} instance(s)).`, priority: "medium" });

  // Duplicate code (simple: repeated 10+ char strings)
  const chunks = code.match(/[a-z]{10,}/gi) || [];
  const seen = new Map<string, number>();
  chunks.forEach(c => seen.set(c.toLowerCase(), (seen.get(c.toLowerCase()) || 0) + 1));
  const dups = [...seen.values()].filter(v => v > 3).length;
  if (dups > 0) smells.push({ type: "info", message: "Possible repeated patterns — consider extracting shared logic.", priority: "low" });

  // God function (too many lines)
  const fnMatches = code.match(/function[^{]*\{([^}]*\n){30,}[^}]*\}/g) || [];
  if (fnMatches.length > 0) smells.push({ type: "warning", message: "Large function(s) detected (30+ lines) — consider splitting.", priority: "high", learnMore: "https://refactoring.guru/smells/long-method" });

  const totalSmells = smells.length;

  return {
    algorithm: "Code Smells",
    confidence: 0.7,
    summary: totalSmells > 0 ? `${totalSmells} code smell(s) detected.` : "No code smells detected.",
    details: totalSmells > 0 ? smells.map(s => `- ${s.message}`) : ["Code quality looks clean"],
    tags: ["code-quality", totalSmells === 0 ? "clean" : totalSmells <= 2 ? "minor-smells" : "smelly"],
    insights: smells,
    metrics: { codeSmells: totalSmells } as any
  };
}

// 18. Promise / Async Flow Analysis (NEW)
function analyzePromiseFlow(code: string): AnalysisSignal {
  const asyncFns = (code.match(/\basync\s+(function|\w+\s*=>|\([^)]*\)\s*=>)/g) || []).length;
  const awaitUsages = (code.match(/\bawait\b/g) || []).length;
  const thenChains = (code.match(/\.then\s*\(/g) || []).length;
  const catchUsages = (code.match(/\.catch\s*\(|\btry\s*\{/g) || []).length;
  const promiseAll = (code.match(/Promise\.(all|allSettled|race|any)\s*\(/g) || []).length;
  const unhandledAsync = asyncFns > 0 && catchUsages === 0;

  const insights: Insight[] = [];
  if (unhandledAsync) insights.push({ type: "warning", message: "Async function(s) without error handling — add try/catch.", priority: "high", learnMore: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises#error_handling" });
  if (thenChains > 0 && asyncFns > 0) insights.push({ type: "suggestion", message: "Mixed .then() and async/await — pick one style.", priority: "low" });
  if (promiseAll > 0) insights.push({ type: "positive", message: `Promise.all/allSettled used (${promiseAll}x) — good for parallel execution.`, priority: "low" });
  if (awaitUsages > 0 && asyncFns === 0) insights.push({ type: "warning", message: "await used outside async function — may cause runtime error.", priority: "high" });

  return {
    algorithm: "Promise Flow",
    confidence: 0.8,
    summary: `${asyncFns} async fn(s), ${awaitUsages} await(s), ${thenChains} .then() chain(s).`,
    details: [`Async functions: ${asyncFns}`, `await usages: ${awaitUsages}`, `.then() chains: ${thenChains}`, `Error handlers: ${catchUsages}`, `Promise combinators: ${promiseAll}`, `Unhandled async: ${unhandledAsync ? "yes" : "no"}`],
    tags: ["async", asyncFns > 0 ? "async-present" : "sync", promiseAll > 0 ? "promise-combinators" : ""],
    insights
  };
}

// 19. Regex Analysis (NEW)
function analyzeRegexUsage(code: string): AnalysisSignal {
  const regexLiterals = code.match(/\/(?!\/)(?:[^\/\\\n]|\\.)+\/[gimsuy]*/g) || [];
  const regexConstructors = (code.match(/new\s+RegExp\s*\(/g) || []).length;
  const total = regexLiterals.length + regexConstructors;

  const insights: Insight[] = [];
  if (total > 5) insights.push({ type: "info", message: `${total} regex patterns — consider extracting to named constants.`, priority: "low" });

  // Detect potentially catastrophic backtracking (simplified: nested quantifiers)
  const catastrophic = regexLiterals.filter(r => /\(\.\*\)\*|\(\.\+\)\+|\([^)]*[+*][^)]*\)[+*]/.test(r)).length;
  if (catastrophic > 0) insights.push({ type: "warning", message: "Potentially catastrophic regex backtracking detected.", priority: "high", learnMore: "https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS" });

  return {
    algorithm: "Regex",
    confidence: 0.65,
    summary: total > 0 ? `${total} regex pattern(s) (${regexLiterals.length} literals, ${regexConstructors} constructors).` : "No regex patterns.",
    details: [`Literal regex: ${regexLiterals.length}`, `RegExp constructors: ${regexConstructors}`, `Catastrophic patterns: ${catastrophic}`],
    tags: total > 0 ? ["regex", catastrophic > 0 ? "regex-risk" : "regex-safe"] : ["no-regex"],
    insights
  };
}

// 20. Comment Quality (NEW)
function analyzeCommentQuality(code: string): AnalysisSignal {
  const jsdocBlocks = code.match(/\/\*\*[\s\S]*?\*\//g) || [];
  const lineComments = code.match(/\/\/\s*.+/g) || [];
  const totalLines = code.split("\n").length;
  const commentLines = lineComments.length + jsdocBlocks.reduce((acc, b) => acc + b.split("\n").length, 0);
  const density = Math.round((commentLines / Math.max(totalLines, 1)) * 100);

  const jsdocWithParams = jsdocBlocks.filter(b => /@param|@returns|@throws/.test(b)).length;
  const emptyComments = lineComments.filter(c => c.replace(/\/\/\s*/, "").trim().length < 3).length;

  const insights: Insight[] = [];
  if (density === 0) insights.push({ type: "suggestion", message: "No comments — document complex logic for future maintainers.", priority: "low" });
  else if (density > 40) insights.push({ type: "info", message: "High comment density (>40%) — ensure comments add value, not noise.", priority: "low" });
  if (jsdocWithParams > 0) insights.push({ type: "positive", message: `${jsdocWithParams} JSDoc block(s) with @param/@returns — excellent!`, priority: "low" });
  if (emptyComments > 2) insights.push({ type: "suggestion", message: `${emptyComments} near-empty comment(s) — remove or flesh out.`, priority: "low" });

  return {
    algorithm: "Comment Quality",
    confidence: 0.75,
    summary: `Comment density: ${density}%, ${jsdocWithParams} JSDoc with params.`,
    details: [`Comment density: ${density}%`, `JSDoc blocks: ${jsdocBlocks.length}`, `JSDoc with @param/@returns: ${jsdocWithParams}`, `Line comments: ${lineComments.length}`, `Empty/trivial comments: ${emptyComments}`],
    tags: ["documentation", density > 20 ? "well-documented" : density > 5 ? "lightly-documented" : "undocumented"],
    insights,
    metrics: { commentDensity: density } as any
  };
}

// 21. Side Effects Analysis
function analyzeSideEffects(code: string): AnalysisSignal {
  const mutationOps = (code.match(/\b(this\.|\w+\s*\.|\w+\s*=\s*\w+\.|Object\.assign\(|\[\s*\w+\s*\])/g) || []).length;
  const externalWrites = (code.match(/\b(localStorage|sessionStorage|document\.|window\.|process\.|fs\.|net\.|fetch\()/g) || []).length;
  const pureHints = (code.match(/\bconst\b/g) || []).length;
  const level = externalWrites + (mutationOps > 5 ? 1 : 0);
  const insights: Insight[] = [];
  if (externalWrites > 0) insights.push({ type: "warning", message: "Detected side-effects or external state access; use pure functions where possible.", priority: "medium" });
  if (mutationOps > 4) insights.push({ type: "suggestion", message: "Multiple mutation points may increase maintenance cost.", priority: "low" });

  return {
    algorithm: "Side Effects",
    confidence: 0.68,
    summary: `Side-effects score: ${Math.max(0, 5 - level)}/5.`,
    details: [`External writes: ${externalWrites}`, `Mutation indicators: ${mutationOps}`, `Const usage: ${pureHints}`],
    tags: [externalWrites ? "side-effects" : "pure", mutationOps > 4 ? "mutation-heavy" : ""],
    insights
  };
}

// 22. Error Handling Review
function analyzeErrorHandling(code: string): AnalysisSignal {
  const tryBlocks = (code.match(/\btry\b/g) || []).length;
  const catchBlocks = (code.match(/\bcatch\b/g) || []).length;
  const throws = (code.match(/\bthrow\b/g) || []).length;
  const badPatterns = (code.match(/\bcatch\s*\(.*\)\s*\{\s*console\.error\(|\bcatch\s*\(.*\)\s*\{\s*return\s*;/g) || []).length;
  const insights: Insight[] = [];
  if (tryBlocks > 0 && catchBlocks === 0) insights.push({ type: "warning", message: "try block found without catch/finally — add error handling.", priority: "high" });
  if (badPatterns > 0) insights.push({ type: "suggestion", message: "Avoid bare catches or swallow errors silently.", priority: "medium" });
  if (throws > 2) insights.push({ type: "info", message: `${throws} throw statements found — verify error semantics.`, priority: "low" });

  return {
    algorithm: "Error Handling",
    confidence: 0.7,
    summary: `Error-handling coverage: ${tryBlocks} try / ${catchBlocks} catch / ${throws} throw.`,
    details: [`try blocks: ${tryBlocks}`, `catch blocks: ${catchBlocks}`, `throw statements: ${throws}`, `Suspicious error handling patterns: ${badPatterns}`],
    tags: [tryBlocks ? "has-error-handling" : "no-try", badPatterns ? "weak-error-handling" : ""],
    insights
  };
}

// 23. Readability Score
function analyzeReadability(code: string): AnalysisSignal {
  const longLines = (code.split("\n").filter(line => line.length > 100).length);
  const nestedTernaries = (code.match(/\?[^:]+:[^:]+:/g) || []).length;
  const emptyLines = (code.split("\n").filter(line => line.trim() === "").length);
  const score = Math.max(0, 10 - Math.min(5, longLines) - Math.min(3, nestedTernaries));
  const insights: Insight[] = [];
  if (longLines > 2) insights.push({ type: "suggestion", message: `${longLines} long line(s) over 100 chars — wrap or simplify expressions.`, priority: "low" });
  if (nestedTernaries > 0) insights.push({ type: "warning", message: "Nested ternaries reduce readability; prefer clearer branching.", priority: "medium" });

  return {
    algorithm: "Readability",
    confidence: 0.7,
    summary: `Readability score: ${score}/10.`,
    details: [`Long lines: ${longLines}`, `Nested ternaries: ${nestedTernaries}`, `Empty lines: ${emptyLines}`],
    tags: [longLines > 2 ? "long-lines" : "", nestedTernaries ? "complex-expression" : ""],
    insights
  };
}

// 24. Naming Consistency
function detectNamingConsistency(code: string): AnalysisSignal {
  const camel = (code.match(/\b[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\b/g) || []).length;
  const snake = (code.match(/\b[a-z]+_[a-z0-9_]+\b/g) || []).length;
  const pascal = (code.match(/\b[A-Z][a-z0-9]+[A-Z][a-zA-Z0-9]*\b/g) || []).length;
  const style = camel >= snake ? "camelCase" : "snake_case";
  const insights: Insight[] = [];
  if (snake > 0 && camel > 0) insights.push({ type: "suggestion", message: "Mixed naming styles detected — unify naming conventions.", priority: "low" });
  if (pascal > 0) insights.push({ type: "info", message: `${pascal} PascalCase identifier(s) found — likely classes or React components.`, priority: "low" });

  return {
    algorithm: "Naming Consistency",
    confidence: 0.68,
    summary: `Dominant naming style: ${style}.`,
    details: [`camelCase: ${camel}`, `snake_case: ${snake}`, `PascalCase: ${pascal}`],
    tags: [style, snake > 0 && camel > 0 ? "mixed-naming" : ""],
    insights
  };
}

// 25. Dependency Audit
function auditDependencies(code: string): AnalysisSignal {
  const imports = code.match(/\bimport\b.+?from\s+['"][^'"]+['"]/g) || [] as string[];
  const requireCalls = code.match(/\brequire\(['"][^'"]+['"]\)/g) || [] as string[];
  const external = imports.filter(i => !i.includes("./") && !i.includes("../")).length + requireCalls.filter(r => !r.includes("./") && !r.includes("../")).length;
  const insights: Insight[] = [];
  if (external > 3) insights.push({ type: "info", message: `${external} external dependency(ies) used — review package surface area.`, priority: "low" });
  if (imports.length + requireCalls.length > 8) insights.push({ type: "suggestion", message: "Many imports may indicate a large dependency surface; consider refactor.", priority: "medium" });

  return {
    algorithm: "Dependency Audit",
    confidence: 0.72,
    summary: `${imports.length + requireCalls.length} dependency references, ${external} external modules.`,
    details: [`Static imports: ${imports.length}`, `Require calls: ${requireCalls.length}`, `External modules: ${external}`],
    tags: [external > 0 ? "external-deps" : "internal-only", imports.length + requireCalls.length > 8 ? "dependency-heavy" : ""],
    insights
  };
}

// 26. Immutability Check
function analyzeImmutability(code: string): AnalysisSignal {
  const letCount = (code.match(/\blet\b/g) || []).length;
  const constCount = (code.match(/\bconst\b/g) || []).length;
  const mutateOps = (code.match(/\b(push|pop|splice|shift|unshift|sort|reverse)\b/g) || []).length;
  const insights: Insight[] = [];
  if (letCount > constCount) insights.push({ type: "suggestion", message: "More let than const declarations — prefer immutable bindings when possible.", priority: "low" });
  if (mutateOps > 1) insights.push({ type: "warning", message: "In-place mutations detected — consider immutable data transformations.", priority: "medium" });

  return {
    algorithm: "Immutability",
    confidence: 0.7,
    summary: `Const/let ratio: ${constCount}:${letCount}.`,
    details: [`const declarations: ${constCount}`, `let declarations: ${letCount}`, `Mutation helpers: ${mutateOps}`],
    tags: [mutateOps > 1 ? "mutation" : "immutable", constCount >= letCount ? "const-preferred" : ""],
    insights
  };
}

// 27. Modern Syntax Usage
function analyzeModernSyntax(code: string): AnalysisSignal {
  const optionalChaining = (code.match(/\?\./g) || []).length;
  const nullishCoalescing = (code.match(/\?\?/g) || []).length;
  const arrowFns = (code.match(/=>/g) || []).length;
  const templateStrings = (code.match(/`[^`]*`/g) || []).length;
  const insights: Insight[] = [];
  if (optionalChaining + nullishCoalescing + arrowFns + templateStrings > 3) insights.push({ type: "positive", message: "Modern JavaScript syntax used consistently.", priority: "low" });
  else insights.push({ type: "suggestion", message: "Consider modern syntax such as optional chaining or nullish coalescing for safer code.", priority: "low" });

  return {
    algorithm: "Modern Syntax",
    confidence: 0.68,
    summary: `${optionalChaining} optional chaining, ${nullishCoalescing} nullish coalescing, ${arrowFns} arrow fn(s).`,
    details: [`optional chaining: ${optionalChaining}`, `nullish coalescing: ${nullishCoalescing}`, `arrow functions: ${arrowFns}`, `template strings: ${templateStrings}`],
    tags: [optionalChaining ? "optional-chaining" : "", nullishCoalescing ? "nullish-coalescing" : ""],
    insights
  };
}

// 28. Style Consistency
function checkStyleConsistency(code: string): AnalysisSignal {
  const singleQuotes = (code.match(/'/g) || []).length;
  const doubleQuotes = (code.match(/"/g) || []).length;
  const semicolons = (code.match(/;/g) || []).length;
  const trailingSpaces = (code.split("\n").filter(line => /\s+$/.test(line)).length);
  const insights: Insight[] = [];
  if (singleQuotes > doubleQuotes && doubleQuotes > 0) insights.push({ type: "suggestion", message: "Mixed quote styles detected — standardize on one style.", priority: "low" });
  if (trailingSpaces > 0) insights.push({ type: "suggestion", message: `${trailingSpaces} trailing whitespace line(s) found.`, priority: "low" });

  return {
    algorithm: "Style Consistency",
    confidence: 0.66,
    summary: `Quote balance: ${singleQuotes}:${doubleQuotes}, ${trailingSpaces} trailing whitespace line(s).`,
    details: [`single quotes: ${singleQuotes}`, `double quotes: ${doubleQuotes}`, `semicolons: ${semicolons}`, `trailing whitespace: ${trailingSpaces}`],
    tags: [trailingSpaces ? "whitespace-issues" : ""],
    insights
  };
}

// 29. Security Injection Scan
function analyzeSecurityInjection(code: string): AnalysisSignal {
  const evalUsage = (code.match(/\beval\s*\(/g) || []).length;
  const innerHTML = (code.match(/\.innerHTML\s*=/g) || []).length;
  const templateInjection = (code.match(/\$\{[^}]+\}/g) || []).length;
  const insights: Insight[] = [];
  if (evalUsage > 0) insights.push({ type: "warning", message: "eval usage detected — this is a common injection risk.", priority: "high" });
  if (innerHTML > 0) insights.push({ type: "warning", message: "innerHTML assignment detected — prefer safe DOM APIs.", priority: "medium" });
  if (templateInjection > 5) insights.push({ type: "suggestion", message: "Template interpolation found — validate user input before rendering.", priority: "low" });

  return {
    algorithm: "Security Injection",
    confidence: 0.7,
    summary: `Injection risk checks: eval=${evalUsage}, innerHTML=${innerHTML}.`,
    details: [`eval calls: ${evalUsage}`, `innerHTML assignments: ${innerHTML}`, `template interpolations: ${templateInjection}`],
    tags: [evalUsage ? "eval" : "", innerHTML ? "innerHTML" : ""],
    insights
  };
}

// 30. Concurrency Safety
function assessConcurrencySafety(code: string): AnalysisSignal {
  const promiseUsage = (code.match(/\bPromise\b/g) || []).length;
  const asyncUsage = (code.match(/\basync\b/g) || []).length;
  const lockPatterns = (code.match(/\bAtomics\.|\bSharedArrayBuffer\b/g) || []).length;
  const insights: Insight[] = [];
  if (promiseUsage > 2 && asyncUsage === 0) insights.push({ type: "suggestion", message: "Promise-based concurrency without async functions may be harder to follow.", priority: "low" });
  if (lockPatterns > 0) insights.push({ type: "info", message: "Shared memory or Atomics usage detected — review thread safety.", priority: "medium" });

  return {
    algorithm: "Concurrency Safety",
    confidence: 0.66,
    summary: `Promise usage: ${promiseUsage}, async declarations: ${asyncUsage}.`,
    details: [`Promise references: ${promiseUsage}`, `async declarations: ${asyncUsage}`, `Atomics/shared buffer: ${lockPatterns}`],
    tags: [promiseUsage ? "async" : "", lockPatterns ? "shared-memory" : ""],
    insights
  };
}

// 31. Resource Management
function inspectResourceManagement(code: string): AnalysisSignal {
  const timers = (code.match(/\b(setTimeout|setInterval|clearTimeout|clearInterval)\b/g) || []).length;
  const listeners = (code.match(/\baddEventListener\b/g) || []).length;
  const cleanupSigns = (code.match(/\bremoveEventListener\b|\bclearTimeout\b|\bclearInterval\b/g) || []).length;
  const insights: Insight[] = [];
  if (listeners > 0 && cleanupSigns === 0) insights.push({ type: "warning", message: "Event listeners or timers found without obvious cleanup.", priority: "medium" });
  if (timers > 2) insights.push({ type: "info", message: `Timer usage: ${timers}. Ensure cleanup on component unmount or shutdown.`, priority: "low" });

  return {
    algorithm: "Resource Management",
    confidence: 0.67,
    summary: `Timers: ${timers}, listeners: ${listeners}, cleanup markers: ${cleanupSigns}.`,
    details: [`timer calls: ${timers}`, `event listeners: ${listeners}`, `cleanup markers: ${cleanupSigns}`],
    tags: [listeners ? "event-driven" : "", cleanupSigns ? "cleanup-aware" : ""],
    insights
  };
}

// 32. Duplicate Pattern Detection
function detectDuplicatePatterns(code: string): AnalysisSignal {
  const chunks = code.match(/\b[a-zA-Z0-9_]{10,}\b/g) || [];
  const seen = new Map<string, number>();
  chunks.forEach(item => seen.set(item.toLowerCase(), (seen.get(item.toLowerCase()) || 0) + 1));
  const repeats = [...seen.values()].filter(count => count > 2).length;
  const insights: Insight[] = [];
  if (repeats > 0) insights.push({ type: "suggestion", message: `${repeats} repeated token group(s) detected — extract shared logic.`, priority: "low" });

  return {
    algorithm: "Duplicate Patterns",
    confidence: 0.68,
    summary: repeats > 0 ? `${repeats} duplicated token groups found.` : "No obvious duplicate patterns.",
    details: [`Repeated token groups: ${repeats}`],
    tags: repeats > 0 ? ["duplicates"] : ["clean"],
    insights
  };
}

// 33. Validation Analysis
function analyzeValidationPatterns(code: string): AnalysisSignal {
  const checks = (code.match(/\b(typeof\s+\w+|===\s*null|!==\s*null|==\s*null|!=\s*null|\bif\s*\(.*\b===\b.*\)|\bif\s*\(.*\b!==\b.*\))/g) || []).length;
  const inputNames = (code.match(/\b(req\.|event\.|input\.|params\.|body\.)/g) || []).length;
  const insights: Insight[] = [];
  if (inputNames && checks === 0) insights.push({ type: "warning", message: "Input data referenced without apparent validation.", priority: "high" });
  if (checks > 3) insights.push({ type: "positive", message: `${checks} validation checks detected.`, priority: "low" });

  return {
    algorithm: "Validation",
    confidence: 0.66,
    summary: `Validation checks: ${checks}, input references: ${inputNames}.`,
    details: [`validation patterns: ${checks}`, `input-related tokens: ${inputNames}`],
    tags: checks > 0 ? ["validation"] : ["unvalidated"],
    insights
  };
}

// 34. Logging Patterns
function analyzeLoggingPatterns(code: string): AnalysisSignal {
  const logs = (code.match(/\bconsole\.(log|warn|error|info|debug)\b/g) || []).length;
  const structured = (code.match(/console\.log\(.*\{.*\}.*\)/g) || []).length;
  const insights: Insight[] = [];
  if (logs > 5) insights.push({ type: "info", message: `${logs} console logging calls found — ensure production noise is controlled.`, priority: "low" });
  if (structured > 0) insights.push({ type: "positive", message: `Structured logging detected (${structured}).`, priority: "low" });

  return {
    algorithm: "Logging Patterns",
    confidence: 0.65,
    summary: `${logs} logging call(s), ${structured} structured log(s).`,
    details: [`logging calls: ${logs}`, `structured logs: ${structured}`],
    tags: logs > 0 ? ["logging"] : ["clean-logs"],
    insights
  };
}

// 35. Exception Pattern Review
function analyzeExceptionPatterns(code: string): AnalysisSignal {
  const catchAll = (code.match(/catch\s*\(\s*\w+\s*\)\s*\{\s*(return|console|\/\*)/g) || []).length;
  const throwCustom = (code.match(/throw\s+new\s+\w+/g) || []).length;
  const insights: Insight[] = [];
  if (catchAll > 0) insights.push({ type: "suggestion", message: "General catch blocks may hide errors; handle specific conditions when possible.", priority: "medium" });
  if (throwCustom > 2) insights.push({ type: "info", message: `${throwCustom} custom exceptions thrown.`, priority: "low" });

  return {
    algorithm: "Exception Patterns",
    confidence: 0.67,
    summary: `Catch-all blocks: ${catchAll}, custom throws: ${throwCustom}.`,
    details: [`catch-all patterns: ${catchAll}`, `custom throw statements: ${throwCustom}`],
    tags: catchAll ? ["catch-all"] : ["specific-errors"],
    insights
  };
}

// 36. Test Signal Detection
function analyzeTestSignals(code: string): AnalysisSignal {
  const testKeywords = (code.match(/\bdescribe\b|\bit\b|\btest\b|\bexpect\b/g) || []).length;
  const mockUsage = (code.match(/\bjest\.mock\b|\bSinon\b|\bspyOn\b/g) || []).length;
  const insights: Insight[] = [];
  if (testKeywords > 0) insights.push({ type: "positive", message: `Test-related code detected (${testKeywords} markers).`, priority: "low" });
  if (mockUsage > 0) insights.push({ type: "info", message: `${mockUsage} mocking indicator(s).`, priority: "low" });

  return {
    algorithm: "Test Signals",
    confidence: 0.63,
    summary: `Test markers: ${testKeywords}, mock usage: ${mockUsage}.`,
    details: [`test markers: ${testKeywords}`, `mock/spying hints: ${mockUsage}`],
    tags: testKeywords ? ["tests-present"] : ["no-tests"],
    insights
  };
}

// 37. Configuration Usage
function auditConfigUsage(code: string): AnalysisSignal {
  const envRefs = (code.match(/\bprocess\.env\b|\bimport\.meta\.env\b|\bDeno\.env\b/g) || []).length;
  const hardcoded = (code.match(/\b(https?:\/\/|PASSWORD|SECRET|TOKEN)\b/g) || []).length;
  const insights: Insight[] = [];
  if (hardcoded > 0) insights.push({ type: "warning", message: "Hard-coded configuration or secrets detected.", priority: "high" });
  if (envRefs > 0) insights.push({ type: "positive", message: `${envRefs} environment configuration reference(s) found.`, priority: "low" });

  return {
    algorithm: "Configuration Usage",
    confidence: 0.69,
    summary: `Env references: ${envRefs}, hard-coded hints: ${hardcoded}.`,
    details: [`env references: ${envRefs}`, `hard-coded value hints: ${hardcoded}`],
    tags: envRefs ? ["config-driven"] : ["static-config"],
    insights
  };
}

// 38. Build Safety Review
function evaluateBuildSafety(code: string): AnalysisSignal {
  const dynamicImports = (code.match(/\bimport\s*\(/g) || []).length;
  const moduleExports = (code.match(/\bmodule\.exports\b|\bexport\s+(default\s+)?\w+/g) || []).length;
  const insights: Insight[] = [];
  if (dynamicImports > 0) insights.push({ type: "info", message: "Dynamic imports detected — ensure build tools handle code splitting.", priority: "low" });
  if (moduleExports === 0) insights.push({ type: "suggestion", message: "No module exports detected; confirm the snippet is not intended as reusable code.", priority: "low" });

  return {
    algorithm: "Build Safety",
    confidence: 0.66,
    summary: `Dynamic imports: ${dynamicImports}, module exports: ${moduleExports}.`,
    details: [`dynamic import calls: ${dynamicImports}`, `exports found: ${moduleExports}`],
    tags: dynamicImports ? ["dynamic-imports"] : ["static-imports"],
    insights
  };
}

// 39. Lifecycle Hook Review
function inspectLifecycleHooks(code: string): AnalysisSignal {
  const reactHooks = (code.match(/\buseEffect\b|\buseLayoutEffect\b|\bcomponentDidMount\b|\bcomponentWillUnmount\b/g) || []).length;
  const insights: Insight[] = [];
  if (reactHooks > 0) insights.push({ type: "info", message: `${reactHooks} lifecycle hook(s) detected — review cleanup and dependency arrays.`, priority: "low" });

  return {
    algorithm: "Lifecycle Hooks",
    confidence: 0.64,
    summary: `${reactHooks} lifecycle hook indicator(s) found.`,
    details: [`hook-like patterns: ${reactHooks}`],
    tags: reactHooks ? ["lifecycle"] : ["no-lifecycle"],
    insights
  };
}

// 40. Legacy API Usage
function detectLegacyAPIUsage(code: string): AnalysisSignal {
  const legacy = (code.match(/\bvar\b|\barguments\b|\.bind\(|\bXMLHttpRequest\b|\bnew\s+Buffer\b/g) || []).length;
  const insights: Insight[] = [];
  if (legacy > 0) insights.push({ type: "suggestion", message: `${legacy} legacy API reference(s) detected — consider modern alternatives.`, priority: "low" });

  return {
    algorithm: "Legacy API Usage",
    confidence: legacy > 0 ? 0.7 : 0.55,
    summary: legacy > 0 ? `${legacy} legacy API usage(s) found.` : "No obvious legacy API patterns.",
    details: [`legacy API indicators: ${legacy}`],
    tags: legacy > 0 ? ["legacy"] : ["modern"],
    insights
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SYNTHESIS
// ─────────────────────────────────────────────────────────────────────────────

function synthesizeStaticSignals(signals: AnalysisSignal[]): StaticAnalysisResult {
  const weighted = signals
    .filter(s => s.confidence >= 0.5)
    .sort((a, b) => b.confidence - a.confidence);

  const distinctSignals: AnalysisSignal[] = [];
  const seenAlgorithms = new Set<string>();
  for (const signal of weighted) {
    if (!seenAlgorithms.has(signal.algorithm)) {
      seenAlgorithms.add(signal.algorithm);
      distinctSignals.push(signal);
    }
  }

  // Merge tags
  const seenP = new Set<string>();
  const patterns = distinctSignals
    .flatMap(s => s.tags)
    .filter(t => t && !["metrics", "data-flow", "control-flow", "no-regex", ""].includes(t))
    .map(t => t.charAt(0).toUpperCase() + t.slice(1).replace(/-/g, " "))
    .filter(p => { if (seenP.has(p.toLowerCase())) return false; seenP.add(p.toLowerCase()); return true; })
    .slice(0, 12);

  // Merge insights (deduplicate, sort by priority)
  const seenI = new Set<string>();
  const insights = distinctSignals
    .flatMap(s => s.insights)
    .sort((a, b) => ({ high: 3, medium: 2, low: 1 }[b.priority] - { high: 3, medium: 2, low: 1 }[a.priority]))
    .filter(i => { const k = i.message.toLowerCase().slice(0, 40); if (seenI.has(k)) return false; seenI.add(k); return true; })
    .slice(0, 10);

  // Aggregate metrics from all signals
  const metricsSig = weighted.find(s => s.metrics?.cyclomatic !== undefined);
  const cogSig = weighted.find(s => (s.metrics as any)?.cognitiveComplexity !== undefined);
  const halSig = weighted.find(s => (s.metrics as any)?.halsteadVolume !== undefined);
  const smellsSig = weighted.find(s => (s.metrics as any)?.codeSmells !== undefined);
  const commentSig = weighted.find(s => (s.metrics as any)?.commentDensity !== undefined);

  const metrics: CombinedMetrics = {
    complexity: metricsSig?.metrics?.complexity ?? "medium",
    cyclomatic: metricsSig?.metrics?.cyclomatic ?? 5,
    nestingDepth: metricsSig?.metrics?.nestingDepth ?? 2,
    linesOfCode: metricsSig?.metrics?.linesOfCode ?? 20,
    maintainabilityIndex: metricsSig?.metrics?.maintainabilityIndex ?? 75,
    cognitiveComplexity: (cogSig?.metrics as any)?.cognitiveComplexity ?? 5,
    halsteadVolume: (halSig?.metrics as any)?.halsteadVolume ?? 0,
    commentDensity: (commentSig?.metrics as any)?.commentDensity ?? 0,
    duplicateRisk: "low",
    codeSmells: (smellsSig?.metrics as any)?.codeSmells ?? 0
  };

  const topSignals = distinctSignals.slice(0, 4).map(s => s.summary.replace(/\.$/, "")).join(". ");
  const standardSummary = `${topSignals}. Patterns: ${patterns.slice(0, 4).join(", ")}. Complexity: ${metrics.complexity} (cyclomatic: ${metrics.cyclomatic}, cognitive: ${metrics.cognitiveComplexity}).`;
  const beginnerSummary = generateBeginnerFallback(standardSummary, patterns, insights, metrics);

  const detailsText = [
    `## Code Metrics`,
    `- Complexity: ${metrics.complexity.toUpperCase()} (Cyclomatic: ${metrics.cyclomatic})`,
    `- Cognitive Complexity: ${metrics.cognitiveComplexity}`,
    `- Nesting Depth: ${metrics.nestingDepth}`,
    `- Lines of Code: ${metrics.linesOfCode}`,
    `- Maintainability Index: ${metrics.maintainabilityIndex}/100`,
    `- Halstead Volume: ${metrics.halsteadVolume}`,
    `- Comment Density: ${metrics.commentDensity}%`,
    `- Code Smells: ${metrics.codeSmells}`,
    ``,
    `## Analysis Details`,
    ...distinctSignals.flatMap(s =>
      s.details.length ? [`### ${s.algorithm}`, ...s.details.slice(0, 4).map(d => `- ${d}`)] : []
    ),
    ...(insights.length ? [``, `## Key Insights`, ...insights.map(i => `- [${i.priority.toUpperCase()}] ${i.message}`)] : [])
  ].join("\n");

  return { metrics, patterns, insights, signals: distinctSignals, standardSummary, beginnerSummary, detailsText };
}

function getTopContributors(signals: AnalysisSignal[]): string[] {
  return Array.from(new Set(signals.map(s => s.algorithm)));
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2: AI ENHANCEMENT (FIXED)
// ─────────────────────────────────────────────────────────────────────────────

async function enhanceWithAI(
  staticRes: StaticAnalysisResult,
  code: string,
  lang: string
): Promise<AIEnhancement | null> {
  // Guard: vscode.lm must exist and support selectChatModels
  if (!vscode.lm || typeof vscode.lm.selectChatModels !== "function") {
    logger.info("vscode.lm API not available in this VS Code version.");
    return null;
  }

  try {
    // Try preferred models in order
    const modelFamilies = ["gpt-4.1", "gpt-4o", "gpt-4", "claude-3-5-sonnet", "gemini-1.5-pro"];
    let models: readonly vscode.LanguageModelChat[] = [];

    for (const family of modelFamilies) {
      try {
        models = await vscode.lm.selectChatModels({ vendor: "copilot", family });
        if (models?.length) break;
      } catch { /* try next */ }
    }

    // Fallback: any available model
    if (!models?.length) {
      try { models = await vscode.lm.selectChatModels({}); } catch { /* none */ }
    }

    if (!models?.length) {
      logger.info("No language models available for AI enhancement.");
      return null;
    }

    const model = models[0];
    logger.info(`Using AI model: ${model.name || model.id || "unknown"}`);

    const context = [
      `Language: ${lang}`,
      `Complexity: ${staticRes.metrics.complexity} (cyclomatic: ${staticRes.metrics.cyclomatic})`,
      `Cognitive complexity: ${staticRes.metrics.cognitiveComplexity}`,
      `Patterns: ${staticRes.patterns.slice(0, 6).join(", ")}`,
      `Code smells: ${staticRes.metrics.codeSmells}`,
      `Insights: ${staticRes.insights.slice(0, 5).map(i => i.message).join("; ")}`
    ].join("\n");

    // Truncate code to stay within token limits
    const truncatedCode = code.length > 3000 ? code.slice(0, 3000) + "\n// ... (truncated)" : code;

    const systemPrompt = `You are an expert code analysis assistant. Based on the static analysis context and code provided, generate exactly this JSON object and nothing else (no markdown, no explanation):
{
  "standard": "A concise technical explanation in 3-5 sentences covering what the code does, its structure, patterns, and any concerns.",
  "beginner": "A friendly explanation in 4-6 sentences using simple everyday analogies. Avoid jargon.",
  "details": "A technical breakdown with bullet points covering: purpose, key structures, complexity notes, and improvement suggestions."
}`;

    const userPrompt = `Static Analysis:\n${context}\n\nCode (${lang}):\n\`\`\`\n${truncatedCode}\n\`\`\``;

    const messages = [
      vscode.LanguageModelChatMessage.User(systemPrompt),
      vscode.LanguageModelChatMessage.User(userPrompt)
    ];

    const cancellation = new vscode.CancellationTokenSource();
    const timeoutHandle = setTimeout(() => cancellation.cancel(), 30000); // 30s timeout

    let fullText = "";
    try {
      const response = await model.sendRequest(
        messages,
        { justification: "Generating AI-enhanced code explanation for Dev Toolkit" },
        cancellation.token
      );

      for await (const chunk of response.stream) {
        // Handle both old and new stream chunk formats
        if (typeof chunk === "string") {
          fullText += chunk;
        } else if (chunk && typeof (chunk as { value?: string }).value === "string") {
          fullText += (chunk as { value: string }).value;
        } else if (chunk instanceof vscode.LanguageModelTextPart) {
          fullText += chunk.value;
        }
      }
    } finally {
      clearTimeout(timeoutHandle);
      cancellation.dispose();
    }

    if (!fullText.trim()) {
      logger.warn("AI returned empty response.");
      return null;
    }

    // Parse JSON — strip markdown fences if present
    let parsed: { standard?: string; beginner?: string; details?: string } | null = null;
    try {
      const clean = fullText.replace(/```(?:json)?\n?/g, "").trim();
      const jsonMatch = clean.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      logger.warn("Failed to parse AI JSON response", String(parseErr));
      logger.debug("Raw AI response:", fullText.slice(0, 200));
      return null;
    }

    if (!parsed) return null;

    const isGoodAI = (text: string | undefined, minLength = 40): text is string =>
      typeof text === "string" && text.trim().length >= minLength;

    // Validate and return
    if (!isGoodAI(parsed.standard) && !isGoodAI(parsed.beginner)) {
      logger.warn("AI response did not meet quality threshold.");
      return null;
    }

    return {
      standard: isGoodAI(parsed.standard) ? parsed.standard.trim() : staticRes.standardSummary,
      beginner: isGoodAI(parsed.beginner) ? parsed.beginner.trim() : staticRes.beginnerSummary,
      details: isGoodAI(parsed.details, 20) ? parsed.details.trim() : staticRes.detailsText
    };

  } catch (err) {
    if (err instanceof Error) {
      // Don't log cancellation errors as warnings
      if (err.message.includes("cancelled") || err.message.includes("canceled")) {
        logger.info("AI enhancement cancelled.");
      } else {
        logger.warn("AI enhancement failed", err.message);
      }
    }
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PIPELINE ORCHESTRATOR
// ─────────────────────────────────────────────────────────────────────────────

type ProgressCallback = (progress: number, step: string) => void;

async function runMultiAlgorithmAnalysis(
  code: string,
  languageId: string,
  useAI: boolean,
  onProgress?: ProgressCallback
): Promise<Explanation> {
  const step = (p: number, s: string) => onProgress?.(p, s);

  // Input validation
  if (!code || code.trim().length === 0) {
    throw new Error("No code provided for analysis.");
  }

  // STEP 1: Static analysis (40 algorithms)
  const staticResult = await runStaticAnalysis(code, languageId, step);

  // STEP 2: Optional AI enhancement
  let aiResult: AIEnhancement | null = null;
  let aiStatus = "Static analysis only.";
  let aiModelName = "";

  if (useAI) {
    step(97, "Enhancing with AI...");
    aiResult = await enhanceWithAI(staticResult, code, languageId);
    if (aiResult) {
      aiStatus = "AI-enhanced analysis complete.";
    } else {
      aiStatus = "AI unavailable — GitHub Copilot may not be connected.";
    }
  } else {
    aiStatus = "AI disabled in settings.";
  }

  step(100, aiResult ? "AI Enhancement Complete" : "Static Analysis Complete");

  const finalStandard = aiResult?.standard || staticResult.standardSummary;
  const finalBeginner = aiResult?.beginner || staticResult.beginnerSummary;
  const finalDetails = aiResult?.details || staticResult.detailsText;

  const rawMarkdown = generateMarkdownExport(
    finalStandard, finalBeginner, finalDetails,
    staticResult.metrics, staticResult.patterns,
    staticResult.insights, languageId, !!aiResult
  );

  return {
    standard: finalStandard,
    beginner: finalBeginner,
    details: finalDetails,
    metrics: staticResult.metrics,
    patterns: staticResult.patterns,
    insights: staticResult.insights,
    mode: "standard",
    language: languageId,
    algorithmsUsed: staticResult.signals.length + (aiResult ? 1 : 0),
    topContributors: getTopContributors(staticResult.signals),
    signals: staticResult.signals,
    aiEnhanced: !!aiResult,
    aiStatus: aiStatus + (aiModelName ? ` (${aiModelName})` : ""),
    rawMarkdown
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERATORS
// ─────────────────────────────────────────────────────────────────────────────

function generateBeginnerFallback(
  _std: string,
  pats: string[],
  ins: Insight[],
  met: CombinedMetrics
): string {
  let t = "This code ";

  const lowerPats = pats.map(p => p.toLowerCase());
  if (lowerPats.some(p => p.includes("async") || p.includes("promise"))) t += "does work that takes time (like loading data from the internet). ";
  else if (lowerPats.some(p => p.includes("react") || p.includes("component"))) t += "is like a LEGO brick for a webpage — it defines what a piece of your UI looks like and how it works. ";
  else if (lowerPats.some(p => p.includes("class") || p.includes("oop"))) t += "is a blueprint — like a recipe that you can use to create many similar things. ";
  else if (lowerPats.some(p => p.includes("function"))) t += "is a set of instructions that does a specific job when called. ";
  else t += "performs a series of steps, like a recipe or a checklist. ";

  if (lowerPats.some(p => p.includes("data fetch") || p.includes("async"))) t += "It reaches out to get information (like a server asking a chef for the daily menu). ";
  if (lowerPats.some(p => p.includes("error handling"))) t += "It also has safety nets — if something goes wrong, it handles the problem gracefully instead of crashing. ";
  if (lowerPats.some(p => p.includes("array"))) t += "It processes lists of things — imagine sorting or filtering a shopping list automatically. ";

  t += met.complexity === "high"
    ? "It has many decision branches, making it powerful but complex — like a traffic intersection with many signals. "
    : met.complexity === "medium"
      ? "It has a moderate number of decisions — like following a recipe with some optional steps. "
      : "It's straightforward and easy to follow — like a simple, clear to-do list. ";

  const highIns = ins.filter(i => i.priority === "high" || i.priority === "medium").slice(0, 2);
  if (highIns.length) {
    t += "Worth knowing: " + highIns.map(i => i.message.toLowerCase().replace(/consider |try /i, "")).join(", ") + ".";
  }

  return t.trim();
}

function generateMarkdownExport(
  standard: string,
  beginner: string,
  details: string,
  metrics: CombinedMetrics,
  patterns: string[],
  insights: Insight[],
  lang: string,
  aiUsed: boolean
): string {
  const lines = [
    `# Code Explanation — ${lang.toUpperCase()}`,
    ``,
    `> **Generated by Dev Toolkit** on ${new Date().toLocaleString()}`,
    `> Analysis: ${aiUsed ? "AI-Enhanced + 20-Algorithm Static Pipeline" : "20-Algorithm Static Analysis"}`,
    ``,
    `---`,
    ``,
    `## 📊 Metrics`,
    ``,
    `| Metric | Value | Rating |`,
    `|--------|-------|--------|`,
    `| Complexity | ${metrics.complexity.toUpperCase()} | ${metrics.complexity === "low" ? "✅" : metrics.complexity === "medium" ? "⚠️" : "❌"} |`,
    `| Cyclomatic | ${metrics.cyclomatic} | ${metrics.cyclomatic <= 5 ? "✅" : metrics.cyclomatic <= 10 ? "⚠️" : "❌"} |`,
    `| Cognitive Complexity | ${metrics.cognitiveComplexity} | ${metrics.cognitiveComplexity <= 10 ? "✅" : metrics.cognitiveComplexity <= 20 ? "⚠️" : "❌"} |`,
    `| Nesting Depth | ${metrics.nestingDepth} | ${metrics.nestingDepth <= 2 ? "✅" : metrics.nestingDepth <= 4 ? "⚠️" : "❌"} |`,
    `| Lines of Code | ${metrics.linesOfCode} | — |`,
    `| Maintainability Index | ${metrics.maintainabilityIndex}/100 | ${metrics.maintainabilityIndex >= 65 ? "✅" : metrics.maintainabilityIndex >= 40 ? "⚠️" : "❌"} |`,
    `| Halstead Volume | ${metrics.halsteadVolume} | — |`,
    `| Comment Density | ${metrics.commentDensity}% | — |`,
    `| Code Smells | ${metrics.codeSmells} | ${metrics.codeSmells === 0 ? "✅" : metrics.codeSmells <= 3 ? "⚠️" : "❌"} |`,
    ``,
    `---`,
    ``,
    `## 🏷️ Detected Patterns`,
    ``,
    ...patterns.map(p => `- ${p}`),
    ``,
    `---`,
    ``,
    `## 💬 Standard Explanation`,
    ``,
    standard,
    ``,
    `---`,
    ``,
    `## 🐣 Beginner Explanation`,
    ``,
    beginner,
    ``,
    `---`,
    ``,
    `## 🔧 Technical Details`,
    ``,
    details,
    ``,
    `---`,
    ``,
    `## 💡 Key Insights`,
    ``,
    ...insights.map(i => {
      const emoji = { positive: "✅", warning: "⚠️", suggestion: "💡", info: "ℹ️" }[i.type] || "•";
      const detail = i.detail ? ` _(${i.detail})_` : "";
      const link = i.learnMore ? ` [Learn more](${i.learnMore})` : "";
      return `- ${emoji} **[${i.priority.toUpperCase()}]** ${i.message}${detail}${link}`;
    }),
    ``,
    `---`,
    ``,
    `*Generated by [Dev Toolkit](https://marketplace.visualstudio.com/) Code Explainer*`
  ];

  return lines.join("\n");
}