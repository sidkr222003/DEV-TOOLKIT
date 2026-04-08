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
  const provider = new CodeExplainerViewProvider();

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

    const text = editor.document.getText(editor.selection).trim();
    if (!text) {
      vscode.window.showWarningMessage("Select the code you want explained.");
      return;
    }

    await vscode.commands.executeCommand("workbench.view.extension.devToolkit");
    
    provider.showLoading(0, "Step 1: Running static analysis...");
    try {
      const useAI = vscode.workspace.getConfiguration("devToolkit").get("enableCopilotFallback", true);
      const explanation = await runMultiAlgorithmAnalysis(text, editor.document.languageId, useAI, (p, s) => {
        provider.showLoading(p, s);
      });
      provider.updateView(explanation);
    } catch (err) {
      provider.showError(err instanceof Error ? err.message : "Analysis failed.");
    }
  });

  context.subscriptions.push(explainCommand);
}

// ─────────────────────────────────────────────────────────────────────────────
// VIEW PROVIDER
// ─────────────────────────────────────────────────────────────────────────────

class CodeExplainerViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private currentExplanation: Explanation | null = null;

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    this.view.webview.options = { enableScripts: true, enableForms: false };
    this.view.webview.html = this.getHtml();

    this.view.webview.onDidReceiveMessage(async (msg: ViewMessage) => {
      switch (msg.type) {
        case "setMode": this.handleSetMode(msg.mode); break;
        case "refreshSelection": await this.handleRefresh(); break;
        case "copySection": await this.handleCopy(msg.section); break;
        case "expandDetails": this.view?.webview.postMessage({ type: "toggleDetailsExpand" }); break;
        case "exportMarkdown": await this.handleExportMarkdown(); break;
        case "openLearnMore": vscode.env.openExternal(vscode.Uri.parse(msg.url)); break;
      }
    });

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
      const useAI = vscode.workspace.getConfiguration("devToolkit").get("enableCopilotFallback", true);
      const explanation = await runMultiAlgorithmAnalysis(text, editor.document.languageId, useAI, (p, s) => {
        this.showLoading(p, s);
      });
      this.currentExplanation = explanation;
      this.postMessage({ type: "update", explanation });
    } catch (err) {
      this.showError(err instanceof Error ? err.message : "Refresh failed.");
    }
  }

  private async handleCopy(section: "summary" | "details" | "insights") {
    if (!this.currentExplanation) return;
    let text = "";
    if (section === "summary") {
      text = this.currentExplanation.mode === "beginner" ? this.currentExplanation.beginner : this.currentExplanation.standard;
    } else if (section === "details") {
      text = this.currentExplanation.details;
    } else {
      text = this.currentExplanation.insights.map(i => `[${i.priority.toUpperCase()}] ${i.message}`).join("\n");
    }

    try {
      await vscode.env.clipboard.writeText(text);
      vscode.window.setStatusBarMessage("Copied to clipboard", 1500);
    } catch {
      vscode.window.showWarningMessage("Clipboard access denied.");
    }
  }

  private async handleExportMarkdown() {
    if (!this.currentExplanation) return;
    const defaultName = `code-explanation-${Date.now()}.md`;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const defaultUri = workspaceFolder ? vscode.Uri.file(path.join(workspaceFolder, defaultName)) : vscode.Uri.file(defaultName);
    const uri = await vscode.window.showSaveDialog({
      filters: { Markdown: ["md"] },
      defaultUri
    });
    if (uri) {
      await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(this.currentExplanation.rawMarkdown));
      vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`);
    }
  }

  private postEmpty() {
    this.currentExplanation = null;
    this.postMessage({ type: "empty" });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HTML GENERATOR (FIXED SYNTAX)
  // ─────────────────────────────────────────────────────────────────────────
  private getHtml() {
    // Note: Using single quotes and concatenation for inner JS to avoid backtick nesting errors
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
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--text); background: var(--bg); line-height: 1.5; }
    .container { display: flex; flex-direction: column; height: 100vh; }
    .content { display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding-top: 16px; min-height: 0; }
    .explanation { display: flex; flex-direction: column; align-items: center; justify-content: flex-start; width: 100%; }
    .state { min-height: 300px; }
    .header { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-bottom: 1px solid var(--border); flex-wrap: wrap; gap: 8px; }
    .title-group { display: flex; align-items: center; gap: 6px; min-width: 0; }
    .title { font-weight: 600; font-size: 0.85rem; display: flex; align-items: center; gap: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .title i { font-size: 1rem; color: var(--accent); }
    .badges { display: flex; gap: 4px; flex-shrink: 0; }
    .badge { font-size: 0.6rem; padding: 2px 5px; border-radius: 9px; border: 1px solid var(--border); }
    .badge.algo { background: var(--input-bg); color: var(--text-sec); }
    .badge.ai { background: var(--purple); color: white; border-color: var(--purple); display: none; }
    .badge.ai.visible { display: inline-block; }
    .controls { display: flex; gap: 4px; flex-wrap: wrap; }
    button { background: var(--accent); color: var(--accent-fg); border: none; padding: 4px 7px; font-size: 0.7rem; border-radius: 3px; cursor: pointer; transition: 0.15s; display: inline-flex; align-items: center; gap: 4px; }
    button:hover { background: var(--accent-hover); }
    button.secondary { background: var(--input-bg); color: var(--text); border: 1px solid var(--border); }
    button.icon { padding: 4px; min-width: 26px; justify-content: center; }
    
    .content { flex: 1; padding: 10px; overflow-y: auto; }
    .state { display: none; text-align: center; padding: 20px 8px; }
    .state.active { display: block; }
    .state-icon { font-size: 2rem; margin-bottom: 8px; color: var(--text-sec); }
    .state-text { color: var(--text-sec); font-size: 0.85rem; }
    .progress { margin: 12px 0; }
    .bar { height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; margin-bottom: 4px; }
    .fill { height: 100%; background: var(--accent); width: 0%; transition: width 0.2s ease; }
    .step { font-size: 0.7rem; color: var(--text-sec); }
    
    .explanation { display: none; }
    .explanation.active { display: block; }
    
    .mode-bar { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; background: var(--input-bg); border-radius: 5px; margin-bottom: 10px; border: 1px solid var(--border); }
    .mode-label { display: flex; align-items: center; gap: 5px; font-size: 0.75rem; color: var(--text-sec); }
    .mode-group { display: flex; background: var(--bg); border-radius: 3px; overflow: hidden; border: 1px solid var(--border); }
    .mode-btn { padding: 3px 8px; font-size: 0.7rem; background: transparent; color: var(--text-sec); border: none; cursor: pointer; }
    .mode-btn.active { background: var(--accent); color: var(--accent-fg); font-weight: 500; }
    
    .tags { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px; }
    .tag { background: var(--input-bg); padding: 2px 7px; border-radius: 4px; font-size: 0.7rem; color: var(--text-sec); border: 1px solid var(--border); display: inline-flex; align-items: center; gap: 3px; }
    
    .metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin-bottom: 10px; }
    .card { background: var(--input-bg); padding: 8px; border-radius: 5px; border: 1px solid var(--border); }
    .card-head { display: flex; align-items: center; gap: 4px; color: var(--text-sec); font-size: 0.7rem; margin-bottom: 3px; }
    .card-val { font-weight: 600; font-size: 1rem; }
    .card-val.high { color: var(--error); }
    .card-val.medium { color: var(--warn); }
    .card-val.low { color: var(--success); }
    .card-desc { font-size: 0.65rem; color: var(--text-sec); margin-top: 2px; }
    
    .section { margin-bottom: 12px; }
    .sec-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid var(--border); }
    .sec-title { font-size: 0.8rem; font-weight: 600; display: flex; align-items: center; gap: 5px; }
    .sec-actions { display: flex; gap: 4px; }
    .sec-actions button { padding: 2px 5px; font-size: 0.65rem; }
    .insights { display: flex; flex-direction: column; gap: 5px; }
    .insight { display: flex; gap: 6px; padding: 7px; border-radius: 4px; font-size: 0.75rem; background: var(--input-bg); border-left: 3px solid transparent; }
    .insight.positive { border-left-color: var(--success); }
    .insight.warning { border-left-color: var(--warn); }
    .insight.suggestion { border-left-color: var(--info); }
    .insight.info { border-left-color: var(--text-sec); }
    .ins-icon { flex-shrink: 0; margin-top: 1px; }
    .contributors { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
    .contributor { display: inline-flex; align-items: center; gap: 4px; padding: 4px 7px; border-radius: 4px; background: var(--bg); border: 1px solid var(--border); font-size: 0.75rem; color: var(--text-sec); }
    .ai-note { display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: var(--text-sec); }
    .ai-note.ok { color: var(--success); }
    .ai-note.warn { color: var(--warn); }
    .ins-body { flex: 1; min-width: 0; }
    .ins-msg { font-weight: 500; margin-bottom: 2px; }
    .ins-meta { display: flex; align-items: center; gap: 6px; font-size: 0.65rem; color: var(--text-sec); }
    .pri { padding: 1px 5px; border-radius: 2px; text-transform: uppercase; font-weight: 600; font-size: 0.6rem; }
    .pri.high { background: rgba(240,80,80,0.2); color: var(--error); }
    .pri.medium { background: rgba(215,155,0,0.2); color: var(--warn); }
    .pri.low { background: rgba(46,160,67,0.2); color: var(--success); }
    .learn { color: var(--info); text-decoration: none; display: inline-flex; align-items: center; gap: 2px; }
    .learn:hover { text-decoration: underline; }
    
    .box { background: var(--input-bg); border: 1px solid var(--border); border-radius: 5px; padding: 8px; margin-bottom: 8px; }
    .sum-text { white-space: pre-wrap; line-height: 1.6; font-size: 0.85rem; }
    .sum-text.beginner { font-size: 0.95rem; line-height: 1.7; }
    .det-text { font-size: 0.8rem; color: var(--text-sec); white-space: pre-wrap; line-height: 1.5; max-height: 200px; overflow-y: auto; transition: max-height 0.2s; }
    .det-text.expanded { max-height: 1000px; }
    
    .footer { padding: 6px 10px; border-top: 1px solid var(--border); font-size: 0.65rem; color: var(--text-sec); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; }
    .foot-left { display: flex; align-items: center; gap: 6px; }
    .kbd { background: var(--input-bg); padding: 1px 4px; border-radius: 2px; font-family: monospace; border: 1px solid var(--border); }
    
    .hidden { display: none !important; }
    @media (max-width: 340px) { .hide-xs { display: none; } }
    .codicon { font-size: 0.9rem; line-height: 1; vertical-align: text-bottom; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="title-group">
        <span class="title"><i class="codicon codicon-book"></i> Code Explainer</span>
        <div class="badges">
          <span id="algoBadge" class="badge algo">0 algos</span>
          <span id="aiBadge" class="badge ai"><i class="codicon codicon-stars"></i> AI Enhanced</span>
        </div>
      </div>
      <div class="controls">
        <button id="refreshBtn" class="secondary"><i class="codicon codicon-refresh"></i><span class="hide-xs">Refresh</span></button>
        <button id="exportBtn" class="secondary"><i class="codicon codicon-markdown"></i><span class="hide-xs">Export</span></button>
        <button id="copyBtn" class="secondary"><i class="codicon codicon-copy"></i><span class="hide-xs">Copy</span></button>
      </div>
    </div>
    
    <div class="content">
      <div id="stateLoading" class="state">
        <div class="state-icon"><i class="codicon codicon-loading codicon-spin"></i></div>
        <div class="state-text" id="loadText" style="font-size:1.1rem;font-weight:500;margin-bottom:10px;text-align:center;">Analyzing your code... Please wait.</div>
        <div class="progress" style="width: 80%; max-width: 400px; margin: 12px auto;">
          <div class="bar"><div id="progFill" class="fill"></div></div>
          <div id="progStep" class="step">Preparing pipeline...</div>
        </div>
      </div>
      <div id="stateEmpty" class="state">
        <div class="state-icon"><i class="codicon codicon-search"></i></div>
        <div class="state-text" style="font-size:1.15rem;font-weight:500;margin-bottom:10px;text-align:center;">No code selected</div>
        <div style="font-size:0.95rem;color:var(--text-sec);text-align:center;max-width:340px;margin-bottom:10px;">Select some code in the editor and use <strong>Explain Selected Code</strong> from the right-click menu or press <span class="kbd">Ctrl+Shift+E</span> (<span class="kbd">Cmd+Shift+E</span> on Mac) to see an explanation here.</div>
        <div style="font-size:0.9rem;color:var(--text-sec);text-align:center;">Tip: You can select any code block, function, or class for instant analysis.</div>
      </div>
      <div id="stateError" class="state">
        <div class="state-icon"><i class="codicon codicon-error"></i></div>
        <div class="state-text" id="errMsg">Analysis failed.</div>
        <button id="retryBtn" class="secondary" style="margin-top:10px"><i class="codicon codicon-refresh"></i> Retry</button>
      </div>
      
      <div id="stateContent" class="explanation">
        <div class="mode-bar">
          <div class="mode-label"><i class="codicon codicon-lightbulb"></i> Explanation Style</div>
          <div class="mode-group">
            <button id="modeStd" class="mode-btn active">Standard</button>
            <button id="modeBeg" class="mode-btn">Beginner</button>
          </div>
        </div>
        
        <div class="tags" id="patternTags"></div>
        
        <div class="metrics">
          <div class="card"><div class="card-head"><i class="codicon codicon-graph"></i> Complexity</div><div id="mComp" class="card-val">-</div><div id="mCompDesc" class="card-desc"></div></div>
          <div class="card"><div class="card-head"><i class="codicon codicon-git-branch"></i> Cyclomatic</div><div id="mCyc" class="card-val">-</div><div class="card-desc">Paths</div></div>
          <div class="card"><div class="card-head"><i class="codicon codicon-indent"></i> Nesting</div><div id="mNest" class="card-val">-</div><div class="card-desc">Depth</div></div>
          <div class="card"><div class="card-head"><i class="codicon codicon-checklist"></i> Maintain</div><div id="mMaint" class="card-val">-</div><div class="card-desc">/100</div></div>
        </div>
        
        <div class="section">
          <div class="sec-head">
            <div class="sec-title"><i class="codicon codicon-lightbulb"></i> Key Insights</div>
            <div class="sec-actions">
              <button class="secondary icon" id="copyIns" title="Copy insights"><i class="codicon codicon-copy"></i></button>
            </div>
          </div>
          <div class="insights" id="insightsList"></div>
        </div>
        
        <div class="section">
          <div class="sec-head">
            <div class="sec-title"><i class="codicon codicon-comment-discussion"></i> Summary</div>
            <div class="sec-actions">
              <button class="secondary" id="copySum" style="padding:2px 5px;font-size:0.65rem"><i class="codicon codicon-copy"></i> Copy</button>
            </div>
          </div>
          <div class="box"><div id="sumText" class="sum-text"></div></div>
        </div>
        
        <div class="section">
          <div class="sec-head">
            <div class="sec-title"><i class="codicon codicon-star"></i> Highlights</div>
          </div>
          <div class="box">
            <div id="contributorsList" class="contributors"></div>
            <div id="aiNote" class="ai-note"></div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="footer">
      <div class="foot-left">
        <span id="langLabel">Lang: -</span>
        <span class="kbd" title="Shortcut">Ctrl+Shift+E</span>
      </div>
      <div><span id="statusLabel">Ready</span></div>
    </div>
  </div>
  
  <script>
    const vscode = acquireVsCodeApi();
    const $ = id => document.getElementById(id);
    const els = {
      loadText: $("loadText"), progFill: $("progFill"), progStep: $("progStep"),
      errMsg: $("errMsg"), aiBadge: $("aiBadge"),
      modeStd: $("modeStd"), modeBeg: $("modeBeg"),
      patternTags: $("patternTags"),
      mComp: $("mComp"), mCompDesc: $("mCompDesc"), mCyc: $("mCyc"), mNest: $("mNest"), mMaint: $("mMaint"),
      insights: $("insightsList"),
      sumText: $("sumText"),
      contributors: $("contributorsList"), aiNote: $("aiNote"),
      copyIns: $("copyIns"), copySum: $("copySum"),
      lang: $("langLabel"), status: $("statusLabel"), algoBadge: $("algoBadge"),
      refresh: $("refreshBtn"), copy: $("copyBtn"), exportBtn: $("exportBtn"), retry: $("retryBtn")
    };

    function showState(id) {
      ["stateLoading","stateEmpty","stateError","stateContent"].forEach(s => {
        const el = document.getElementById(s);
        if (el) el.classList.toggle("active", s === id);
      });
    }

    function updateModeButtons(mode) {
      els.modeStd.classList.toggle("active", mode === "standard");
      els.modeBeg.classList.toggle("active", mode === "beginner");
    }

    function sendModeChange(mode) {
      vscode.postMessage({ type: "setMode", mode });
    }

    function esc(t) { return String(t).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]||c)); }
    function getCompDesc(l) { return {low:"Easy to understand",medium:"Moderate complexity",high:"Consider simplifying"}[l]||""; }
    function getTagIcon(p) {
      const m = {"function":"symbol-function","class":"symbol-class","interface":"symbol-interface","async":"symbol-event","react":"symbol-structure","component":"symbol-method","import":"symbol-namespace","export":"symbol-package","error-handling":"warning","validation":"check","data-fetch":"cloud-download","state-management":"database","routing":"link","styling":"paintcan","testing":"beaker","performance":"zap","security":"shield","documentation":"book","types":"symbol-boolean","naming":"tag"};
      return m[p.toLowerCase()]||"symbol-misc";
    }
    function getAlgoIcon(name) {
      const m = {"AST Parser":"symbol-file","Complexity":"graph","Patterns":"symbol-keyword","Testability":"symbol-boolean","Dependencies":"symbol-package","Documentation":"book","Naming":"tag","Security":"shield","Performance":"zap","Framework":"symbol-structure","Data Flow":"symbol-namespace","Control Flow":"debug-alt","Types":"symbol-boolean"};
      return m[name]||"symbol-misc";
    }
    function getInsIcon(t) { return {positive:"check",warning:"warning",suggestion:"lightbulb",info:"info"}[t]||"info"; }

    els.refresh.onclick = () => vscode.postMessage({ type: "refreshSelection" });
    els.retry.onclick = () => vscode.postMessage({ type: "refreshSelection" });
    els.modeStd.onclick = () => sendModeChange("standard");
    els.modeBeg.onclick = () => sendModeChange("beginner");
    els.copyIns.onclick = () => vscode.postMessage({ type: "copySection", section: "insights" });
    els.copySum.onclick = () => vscode.postMessage({ type: "copySection", section: "summary" });
    els.copy.onclick = () => vscode.postMessage({ type: "copySection", section: "summary" });
    els.exportBtn.onclick = () => vscode.postMessage({ type: "exportMarkdown" });

    window.addEventListener("message", e => {
      const m = e.data;
      if (m.type === "loading") {
        showState("stateLoading");
        els.loadText.textContent = m.step;
        els.progFill.style.width = (m.progress||0)+"%";
        els.progStep.textContent = m.step;
      }
      if (m.type === "empty") { showState("stateEmpty"); els.status.textContent="Waiting"; }
      if (m.type === "error") { els.errMsg.textContent=m.message; showState("stateError"); els.status.textContent="Error"; }
      if (m.type === "update") {
        const d = m.explanation;
        updateModeButtons(d.mode);
        els.algoBadge.textContent = d.algorithmsUsed + " analyzers";
        els.aiBadge.classList.toggle("visible", d.aiEnhanced);
        els.lang.textContent = "Lang: " + d.language;
        
        els.mComp.textContent = d.metrics.complexity.toUpperCase();
        els.mComp.className = "card-val " + d.metrics.complexity;
        els.mCompDesc.textContent = getCompDesc(d.metrics.complexity);
        els.mCyc.textContent = d.metrics.cyclomatic;
        els.mNest.textContent = d.metrics.nestingDepth;
        els.mMaint.textContent = d.metrics.maintainabilityIndex;
        
        els.patternTags.innerHTML = d.patterns.slice(0,9).map(p => 
          '<span class="tag"><i class="codicon ' + getTagIcon(p) + '"></i>' + esc(p) + '</span>'
        ).join("");
        
        els.insights.innerHTML = d.insights.slice(0,6).map(i => {
          const link = i.learnMore ? '<a href="#" class="learn" data-url="' + i.learnMore + '"><i class="codicon codicon-link-external"></i> Learn</a>' : "";
          return '<div class="insight ' + i.type + '">' +
            '<div class="ins-icon"><i class="codicon ' + getInsIcon(i.type) + '"></i></div>' +
            '<div class="ins-body">' +
              '<div class="ins-msg">' + esc(i.message) + '</div>' +
              (i.detail ? '<div class="ins-meta">' + esc(i.detail) + '</div>' : '') +
              '<div class="ins-meta"><span class="pri ' + i.priority + '">' + i.priority + '</span> ' + link + '</div>' +
            '</div>' +
          '</div>';
        }).join("");
        
        els.insights.querySelectorAll(".learn").forEach(a => a.onclick = ev => { ev.preventDefault(); vscode.postMessage({ type: "openLearnMore", url: a.dataset.url }); });
        
        els.sumText.textContent = d.mode === "beginner" ? d.beginner : d.standard;
        els.sumText.className = "sum-text" + (d.mode === "beginner" ? " beginner" : "");
        
        els.contributors.innerHTML = d.topContributors.map(c => 
          '<span class="tag contributor"><i class="codicon ' + getAlgoIcon(c) + '"></i>' + esc(c) + '</span>'
        ).join("");
        const statusText = d.aiStatus || (d.aiEnhanced ? 'AI-enhanced summary is available.' : 'AI not connected; using static analysis.');
        els.aiNote.innerHTML = '<i class="codicon ' + (d.aiEnhanced ? 'codicon-check' : 'codicon-warning') + '"></i> ' + esc(statusText);
        els.aiNote.className = 'ai-note ' + (d.aiEnhanced ? 'ok' : 'warn');
        
        showState("stateContent");
        els.status.textContent = d.aiEnhanced ? "AI-Enhanced Ready" : "Static Analysis Ready";
      }
    });
  </script>
</body>
</html>`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1: STATIC ANALYSIS (14 Local Algorithms)
// ─────────────────────────────────────────────────────────────────────────────

async function runStaticAnalysis(code: string, languageId: string, onProgress: (p: number, s: string) => void): Promise<StaticAnalysisResult> {
  const step = (p: number, s: string) => onProgress(p, s);

  step(5, "Parsing AST structure...");
  const ast = analyzeAST(code);
  step(12, "Building control flow...");
  const cfg = analyzeControlFlow(code);
  step(19, "Tracking data flow...");
  const df = analyzeDataFlow(code);
  step(26, "Calculating complexity...");
  const cm = calculateComplexityMetrics(code);
  step(33, "Recognizing patterns...");
  const pat = detectPatterns(code);
  step(40, "Labeling semantic roles...");
  const sem = labelSemanticRoles(code);
  step(47, "Mapping dependencies...");
  const dep = buildDependencyGraph(code);
  step(54, "Inferring types...");
  const typ = inferTypes(code, languageId);
  step(61, "Extracting documentation...");
  const doc = extractDocumentation(code);
  step(68, "Analyzing naming...");
  const nam = analyzeNamingConventions(code);
  step(75, "Scanning security...");
  const sec = scanSecurityHeuristics(code);
  step(82, "Checking performance...");
  const perf = generatePerformanceHints(code);
  step(89, "Detecting framework...");
  const fw = detectFrameworkContext(code);
  step(93, "Assessing testability...");
  const test = assessTestability(code);

  step(96, "Synthesizing static results...");
  return synthesizeStaticSignals([ast, cfg, df, cm, pat, sem, dep, typ, doc, nam, sec, perf, fw, test]);
}

// ─────────────────────────────────────────────────────────────────────────────
// 14 ALGORITHMS
// ─────────────────────────────────────────────────────────────────────────────

function analyzeAST(code: string): AnalysisSignal {
  try {
    const source = ts.createSourceFile("snippet.ts", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const stmts = source.statements.filter(n => n.kind !== ts.SyntaxKind.EmptyStatement);
    if (!stmts.length) return { algorithm: "AST Parser", confidence: 0.9, summary: "Empty or comment-only selection.", details: [], tags: ["empty"], insights: [] };

    const sums: string[] = [], dets: string[] = [], tags = new Set<string>();
    for (const s of stmts) {
      const r = visitASTNode(s, source);
      if (r) { sums.push(r.summary); dets.push(...r.details); r.tags.forEach(t => tags.add(t)); }
    }
    return { algorithm: "AST Parser", confidence: 0.95, summary: sums.length ? sums.join(". ") + "." : "Mixed procedural block.", details: dets, tags: Array.from(tags), insights: [] };
  } catch {
    return { algorithm: "AST Parser", confidence: 0.3, summary: "AST parse failed; using fallback.", details: [], tags: ["parse-fallback"], insights: [{ type: "warning", message: "Code may contain syntax errors.", priority: "medium" }] };
  }
}

function visitASTNode(node: ts.Node, src: ts.SourceFile): { summary: string; details: string[]; tags: string[] } | null {
  if (isFunctionLike(node)) {
    const n = node.name?.getText(src) || "anonymous";
    const p = node.parameters.map(x => x.name.getText(src)).join(", ") || "none";
    const a = node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
    return { summary: `${a?"Async ":""}function ${n}(${p})`, details: [`Declaration: ${a?"async ":""}function`], tags: ["function", a?"async":"sync"] };
  }
  if (ts.isVariableStatement(node)) return { summary: `Variables: ${node.declarationList.declarations.map(d => d.name.getText(src)).join(", ")}`, details: [], tags: ["variable"] };
  if (ts.isClassDeclaration(node)) return { summary: `Class: ${node.name?.text||"anon"}`, details: [], tags: ["class", "oop"] };
  if (ts.isInterfaceDeclaration(node)) return { summary: `Interface: ${node.name.text}`, details: [], tags: ["interface", "type"] };
  if (ts.isImportDeclaration(node)) return { summary: `Import: ${node.moduleSpecifier.getText(src).replace(/['"]/g,"")}`, details: [], tags: ["import", "dependency"] };
  if (ts.isExportDeclaration(node)) return { summary: "Export statement", details: [], tags: ["export", "module"] };
  if (ts.isIfStatement(node) || ts.isSwitchStatement(node)) return { summary: "Conditional branch", details: [], tags: ["control-flow", "branch"] };
  if (ts.isForStatement(node) || ts.isWhileStatement(node)) return { summary: "Loop construct", details: [], tags: ["control-flow", "iteration"] };
  if (ts.isTryStatement(node)) return { summary: "Error handling", details: [], tags: ["error-handling", "try-catch"] };
  return null;
}

function isFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node);
}

function analyzeControlFlow(code: string): AnalysisSignal {
  const br = (code.match(/\b(if|else|switch|case|catch|\?|\|)\b/g)||[]).length;
  const lo = (code.match(/\b(for|while|do)\b/g)||[]).length;
  return { algorithm: "Control Flow", confidence: 0.85, summary: `~${1+br+lo} paths, ${br} branches, ${lo} loops.`, details: [`Branches: ${br}`, `Loops: ${lo}`], tags: ["control-flow"], insights: (1+br+lo)>10?[{type:"warning",message:"High path count reduces testability.",priority:"medium"}]:[] };
}

function analyzeDataFlow(code: string): AnalysisSignal {
  const defs = (code.match(/\b(const|let|var)\s+\w+/g)||[]).length;
  const muts = (code.match(/\b\w+\s*[+\-*/%&|^]?=/g)||[]).length;
  return { algorithm: "Data Flow", confidence: 0.75, summary: `${defs} defs, ~${muts} mutations (${defs>0&&muts===0?"pure":"impure"}).`, details: [`Definitions: ${defs}`, `Mutations: ${muts}`], tags: ["data-flow", defs>0&&muts===0?"pure":"side-effects"], insights: muts>5?[{type:"suggestion",message:"Reduce mutations for easier testing.",priority:"low"}]:[] };
}

function calculateComplexityMetrics(code: string): AnalysisSignal & { metrics: CombinedMetrics } {
  const lines = code.split("\n").filter(l => l.trim() && !/^\s*\/\//.test(l)).length;
  const branches = (code.match(/\b(if|else|switch|case|catch|\?\||\|\||&&)\b/g)||[]).length;
  const nesting = Math.max(...code.split("\n").map(l => (l.match(/^\s*/)?.[0].length||0)/2), 0);
  const cyclo = 1 + branches;
  const mi = Math.max(0, 171 - 5.2*Math.log(cyclo) - 0.23*nesting - 16.2*Math.log(lines))/1.71;
  const comp = cyclo>10||nesting>4?"high":cyclo>5||nesting>2?"medium":"low";
  const metrics: CombinedMetrics = { complexity: comp as any, cyclomatic: cyclo, nestingDepth: Math.round(nesting), linesOfCode: lines, maintainabilityIndex: Math.round(mi) };
  return { algorithm: "Complexity", confidence: 0.95, summary: `${comp} complexity (cyclo: ${cyclo}).`, details: [`Lines: ${lines}`, `Cyclomatic: ${cyclo}`, `Nesting: ${Math.round(nesting)}`, `MI: ${Math.round(mi)}/100`], tags: ["metrics", "complexity", comp], insights: comp==="high"?[{type:"warning",message:"Consider refactoring into smaller units.",priority:"high"}]:[], metrics };
}

function detectPatterns(code: string): AnalysisSignal {
  const tags: string[] = []; const ins: Insight[] = [];
  const t = code.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");
  const add = (n: string) => { if (!tags.includes(n)) tags.push(n); };
  if (/\buseState\b|\buseEffect\b|\buseRef\b/.test(t)) { add("React Hooks"); ins.push({type:"info",message:"Follow React Hooks rules.",priority:"low"}); }
  if (/\bexport\s+default\s+function|\bconst\s+\w+\s*=\s*\(\)\s*=>\s*<[\w>]/.test(t)) add("React Component");
  if (/\bapp\.(get|post|put|delete)\b|\bRouter\(\)/.test(t)) add("Express Route");
  if (/\basync\s+function|\bawait\s+/.test(t) && /fetch\b|axios|http/.test(t)) add("Async Data Fetch");
  if (/\btry\s*\{|catch\s*\(/.test(t)) add("Error Handling");
  if (/\bmap\b|\bfilter\b|\breduce\b|\bforEach\b/.test(t)) add("Functional Array Ops");
  if (!tags.length) tags.push("Procedural");
  return { algorithm: "Patterns", confidence: 0.8, summary: `Detected: ${tags.join(", ")}.`, details: tags.map(p=>`- ${p}`), tags, insights: ins };
}

function labelSemanticRoles(code: string): AnalysisSignal {
  const roles: string[] = [];
  if (/return/.test(code)) roles.push("transformer");
  if (/validate|error|throw/.test(code)) roles.push("validator");
  if (/render|JSX|<[\w>]/.test(code)) roles.push("renderer");
  if (/handle|on[A-Z]|callback/.test(code)) roles.push("event-handler");
  if (!roles.length) roles.push("general");
  return { algorithm: "Semantic Roles", confidence: 0.7, summary: `Role: ${roles[0]}.`, details: roles.map(r=>`- ${r}`), tags: roles, insights: [] };
}

function buildDependencyGraph(code: string): AnalysisSignal {
  const imp = (code.match(/import\s+.*?from\s+['"](.+?)['"]/g)||[]).length;
  const exp = (code.match(/export\s+(default\s+)?(const|function|class)/g)||[]).length;
  return { algorithm: "Dependencies", confidence: 0.9, summary: `${imp} imports, ${exp} exports.`, details: [`Imports: ${imp}`, `Exports: ${exp}`], tags: ["dependencies", imp>5?"high-coupling":"low-coupling"], insights: imp>5?[{type:"suggestion",message:"Consider barrel exports.",priority:"low"}]:[] };
}

function inferTypes(code: string, lang: string): AnalysisSignal {
  if (!["typescript","typescriptreact"].includes(lang)) return { algorithm: "Types", confidence: 0.2, summary: "Non-TS file.", details: [], tags: ["no-types"], insights: [] };
  const ann = (code.match(/:\s*[\w<>,\s\|&\[\]]+/g)||[]).length;
  const gen = (code.match(/<[\w,\s]+>/g)||[]).length;
  return { algorithm: "Type Inference", confidence: 0.85, summary: `${ann} annotations, ${gen} generics.`, details: [`Annotations: ${ann}`, `Generics: ${gen}`], tags: ["types", ann>5?"well-typed":"loose-types"], insights: ann===0?[{type:"suggestion",message:"Add type annotations for safety.",priority:"medium"}]:[] };
}

function extractDocumentation(code: string): AnalysisSignal {
  const jsdoc = (code.match(/\/\*\*[\s\S]*?\*\//g)||[]).length;
  const line = (code.match(/\/\/\s*.+/g)||[]).length;
  return { algorithm: "Documentation", confidence: 0.9, summary: `${jsdoc} JSDoc, ${line} comments.`, details: [`JSDoc: ${jsdoc}`, `Comments: ${line}`], tags: ["documentation", jsdoc>0?"jsdoc":"comments"], insights: jsdoc+line===0?[{type:"suggestion",message:"Add comments for maintainability.",priority:"low"}]:[] };
}

function analyzeNamingConventions(code: string): AnalysisSignal {
  const ids = code.match(/\b[a-zA-Z_$][\w$]*\b/g)||[];
  const uniq = [...new Set(ids)];
  const camel = uniq.filter(i => /^[a-z][a-zA-Z0-9]*$/.test(i)).length;
  const pascal = uniq.filter(i => /^[A-Z][a-zA-Z0-9]*$/.test(i)).length;
  const snake = uniq.filter(i => /^[a-z_][a-z0-9_]*$/.test(i)).length;
  const cons = [camel,pascal,snake].filter(c=>c>0).length;
  return { algorithm: "Naming", confidence: 0.8, summary: `${cons} naming style(s).`, details: [`camelCase: ${camel}`, `PascalCase: ${pascal}`, `snake_case: ${snake}`], tags: ["naming", cons===1?"consistent":"mixed"], insights: cons>2?[{type:"suggestion",message:"Standardize naming for readability.",priority:"low"}]:[] };
}

function scanSecurityHeuristics(code: string): AnalysisSignal {
  const risks = [
    { p: /\beval\s*\(/, m: "Avoid eval() for security.", pri: "high" },
    { p: /innerHTML\s*=|\.html\s*\(/, m: "XSS risk with innerHTML.", pri: "high" },
    { p: /new\s+Function\s*\(/, m: "Dynamic Function constructor risk.", pri: "medium" }
  ];
  const found = risks.filter(r => r.p.test(code)).map(r => ({type:"warning" as const, message:r.m, priority:r.pri as any}));
  return { algorithm: "Security", confidence: 0.75, summary: found.length?`${found.length} security note(s).`:"No obvious risks.", details: found.map(f=>`- ${f.message}`), tags: found.length?["security","review"]:["security","clean"], insights: found };
}

function generatePerformanceHints(code: string): AnalysisSignal {
  const hints: Insight[] = [];
  if (/\b\.forEach\s*\([^)]*\)\s*\{[^}]*\bawait\b/.test(code)) hints.push({type:"suggestion",message:"Use Promise.all instead of forEach+await.",priority:"medium"});
  if (/\bJSON\.parse\s*\(\s*JSON\.stringify\s*\(/.test(code)) hints.push({type:"info",message:"structuredClone is safer than JSON roundtrip.",priority:"low"});
  if (/\bconsole\.(log|debug)\s*\(/.test(code)) hints.push({type:"suggestion",message:"Remove console logs in production.",priority:"low"});
  return { algorithm: "Performance", confidence: 0.7, summary: hints.length?`${hints.length} hint(s).`:"Clean performance profile.", details: hints.map(h=>`- ${h.message}`), tags: hints.length?["performance","tips"]:["performance","clean"], insights: hints };
}

function detectFrameworkContext(code: string): AnalysisSignal {
  const fws = [{p:/from\s+['"]react['"]/,name:"React"},{p:/from\s+['"]vue['"]|Vue\.\w+\(/,name:"Vue"},{p:/from\s+['"]@angular\/core['"]/,name:"Angular"},{p:/from\s+['"]express['"]|app\.(get|post)/,name:"Express"},{p:/from\s+['"]next['"]/,name:"Next.js"}];
  const det = fws.filter(f=>f.p.test(code)).map(f=>f.name);
  return { algorithm: "Framework", confidence: 0.9, summary: det.length?`Context: ${det.join(", ")}.`:"Vanilla JS/TS.", details: det.map(f=>`- ${f}`), tags: det.length?det.map(d=>d.toLowerCase()):["vanilla"], insights: [] };
}

function assessTestability(code: string): AnalysisSignal {
  const exp = /export\s+(default\s+)?(const|function|class)/.test(code)?2:0;
  const pure = (code.match(/function\s+\w+\s*\([^)]*\)\s*\{?\s*return[^}]*\}/g)||[]).length;
  const side = (code.match(/\b(console|fetch|setTimeout|document\.)\b/g)||[]).length;
  const score = exp + pure - (side>3?2:side>0?1:0);
  const t = score>=3?"high":score>=1?"medium":"low";
  return { algorithm: "Testability", confidence: 0.75, summary: `Testability: ${t} (${score}/5).`, details: [`Score: ${score}/5`, `Exports: ${exp?2:0}`, `Pure: ${pure}`, `Side-effects: ${side}`], tags: ["testability", t], insights: t==="low"?[{type:"suggestion",message:"Extract pure functions for easier testing.",priority:"medium"}]:[] };
}

// ─────────────────────────────────────────────────────────────────────────────
// SYNTHESIS (Step 1 Output)
// ─────────────────────────────────────────────────────────────────────────────

function synthesizeStaticSignals(signals: AnalysisSignal[]): StaticAnalysisResult {
  const weighted = signals.filter(s => s.confidence >= 0.5).sort((a,b) => b.confidence - a.confidence);
  
  const canon: Record<string,string> = { function:"Function", class:"Class", async:"Async", "react-hooks":"React Hooks", "react-component":"React Component", "error-handling":"Error Handling", "async-data-fetch":"Data Fetching", "functional-array-ops":"Array Operations", "state-management":"State Management", "express-route":"Express Routes", "security-clean":"Security OK", "testability-high":"Highly Testable" };
  const seenP = new Set<string>();
  const patterns = weighted.flatMap(s=>s.tags)
    .map(t => canon[t] || t)
    .filter(p => { if(seenP.has(p)) return false; seenP.add(p); return true; })
    .slice(0, 10);

  const seenI = new Set<string>();
  const insights = weighted.flatMap(s=>s.insights)
    .sort((a,b) => ({high:3,medium:2,low:1}[b.priority] - ({high:3,medium:2,low:1}[a.priority])))
    .filter(i => { const k=i.message.toLowerCase(); if(seenI.has(k)) return false; seenI.add(k); return true; })
    .slice(0, 8);

  const metricsSig = weighted.find(s=>s.metrics);
  const metrics: CombinedMetrics = metricsSig?.metrics || { complexity:"medium", cyclomatic:5, nestingDepth:2, linesOfCode:20, maintainabilityIndex:75 };
  
  const standardSummary = `${weighted.slice(0,3).map(s=>s.summary.replace(/\.$/,"")).join(". ")}. Recognized patterns: ${patterns.slice(0,3).join(", ")}${patterns.length>3?"...":""}. Complexity: ${metrics.complexity}.`;
  const beginnerSummary = generateBeginnerFallback(standardSummary, patterns, insights, metrics);
  const detailsText = [
    `## Metrics`,
    `- Complexity: ${metrics.complexity.toUpperCase()}`,
    `- Cyclomatic: ${metrics.cyclomatic}`,
    `- Nesting: ${metrics.nestingDepth}`,
    `- LOC: ${metrics.linesOfCode}`,
    `- Maintainability: ${metrics.maintainabilityIndex}/100`,
    ``,
    `## Analysis`,
    ...weighted.slice(0,4).flatMap(s=>s.details.map(d=>`- ${d}`)),
    ...(insights.length?["",`## Insights`,...insights.map(i=>`- [${i.priority.toUpperCase()}] ${i.message}`)]:[])
  ].join("\n");

  return { metrics, patterns, insights, signals: weighted, standardSummary, beginnerSummary, detailsText };
}

function getTopContributors(signals: AnalysisSignal[]) {
  return signals.slice(0,3).map(s=>s.algorithm);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2: AI ENHANCEMENT
// ─────────────────────────────────────────────────────────────────────────────

async function enhanceWithAI(staticRes: StaticAnalysisResult, code: string, lang: string): Promise<AIEnhancement | null> {
  if (!vscode.lm?.selectChatModels) return null;
  try {
    // Prefer GPT-4.1 (free for all users)
    let models: readonly vscode.LanguageModelChat[] = [];
    models = await vscode.lm.selectChatModels({ vendor: 'copilot', family: 'gpt-4.1' });
    if (!models?.length) {
      // fallback to any available model
      models = await vscode.lm.selectChatModels({});
    }
    if (!models?.length) return null;
    const model = models[0];
    const context = `METRICS: ${JSON.stringify(staticRes.metrics)}\nPATTERNS: ${staticRes.patterns.join(", ")}\nINSIGHTS: ${staticRes.insights.map(i=>i.message).join("; ")}`;
    
    const systemPrompt = `You are an expert code explainer. Analyze only the provided static analysis context and code. Output valid JSON only, with exactly these keys:
{
  "standard": "Concise technical summary, 10 sentences.",
  "beginner": "Simple analogy using everyday concepts, 6-10 sentences.",
  "details": "Bulleted list of structure, complexity, best practices, and warnings."
}
Do not include any text outside this JSON object.`;

    const messages = [
      vscode.LanguageModelChatMessage.User(systemPrompt),
      vscode.LanguageModelChatMessage.User(`Static Context:\n${context}\n\nCode:\n\`\`\`${lang}\n${code}\n\`\`\``)
    ];

    const response = await model.sendRequest(messages, { justification: "AI code explanation", modelOptions: { temperature: 0.2 } });
    let fullText = "";
    for await (const chunk of response.stream) {
      const part = chunk as { value?: string };
      if (typeof part.value === "string") {
        fullText += part.value;
      }
    }

    let parsed: { standard?: string; beginner?: string; details?: string } | null = null;
    try {
      const jsonMatch = fullText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch {
      parsed = null;
    }

    const standardText = parsed?.standard?.trim() || "";
    const beginnerText = parsed?.beginner?.trim() || "";
    const detailsText = parsed?.details?.trim() || "";

    const fallback = {
      standard: staticRes.standardSummary,
      beginner: staticRes.beginnerSummary,
      details: staticRes.detailsText
    };

    const isGoodAi = (text: string, fallbackText: string) => {
      if (!text || text.length < 30) return false;
      if (text === fallbackText) return false;
      return true;
    };

    return {
      standard: isGoodAi(standardText, fallback.standard) ? standardText : fallback.standard,
      beginner: isGoodAi(beginnerText, fallback.beginner) ? beginnerText : fallback.beginner,
      details: isGoodAi(detailsText, fallback.details) ? detailsText : fallback.details
    };
  } catch (e) {
    logger.warn("AI enhancement skipped", e instanceof Error ? e.message : String(e));
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PIPELINE ORCHESTRATOR
// ─────────────────────────────────────────────────────────────────────────────

type ProgressCallback = (progress: number, step: string) => void;

async function runMultiAlgorithmAnalysis(code: string, languageId: string, useAI: boolean, onProgress?: ProgressCallback): Promise<Explanation> {
  const step = (p: number, s: string) => onProgress?.(p, s);

  // STEP 1: Always run local static analysis
  const staticResult = await runStaticAnalysis(code, languageId, step);
  
  // STEP 2: Optional AI enhancement
  let aiResult: AIEnhancement | null = null;
  let aiStatus = "AI unavailable; using static analysis.";
  if (useAI) {
    step(98, "Step 2: Enhancing with AI...");
    aiResult = await enhanceWithAI(staticResult, code, languageId);
    if (aiResult) {
      aiStatus = "AI-Enhanced by GPT-4.1.";
    } else {
      aiStatus = "AI not available; using static analysis.";
    }
  } else {
    aiStatus = "AI disabled; using static analysis.";
  }
  step(100, aiResult ? "AI Enhancement Complete" : "Static Analysis Complete");

  const finalStandard = aiResult?.standard || staticResult.standardSummary;
  const finalBeginner = aiResult?.beginner || staticResult.beginnerSummary;
  const finalDetails = aiResult?.details || staticResult.detailsText;
  const rawMarkdown = generateMarkdownExport(finalStandard, finalBeginner, finalDetails, staticResult.metrics, staticResult.patterns, staticResult.insights, languageId, !!aiResult);

  return {
    standard: finalStandard,
    beginner: finalBeginner,
    details: finalDetails,
    metrics: staticResult.metrics,
    patterns: staticResult.patterns,
    insights: staticResult.insights,
    mode: "standard",
    language: languageId,
    algorithmsUsed: 14 + (aiResult ? 1 : 0),
    topContributors: getTopContributors(staticResult.signals),
    aiEnhanced: !!aiResult,
    aiStatus,
    rawMarkdown
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERATORS & MARKDOWN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

function generateBeginnerFallback(_std: string, pats: string[], ins: Insight[], met: CombinedMetrics) {
  let t = "This code ";
  if (pats.includes("Function") || pats.includes("Async")) t += "is a helper that ";
  else if (pats.includes("Class") || pats.includes("React Component")) t += "is a blueprint for creating ";
  else t += "performs a series of steps";
  
  if (pats.includes("Data Fetching")) t += "gets information from external sources";
  else if (pats.includes("Error Handling")) t += "carefully manages unexpected problems";
  else if (pats.includes("Array Operations")) t += "processes lists of items automatically";
  else t += "does a specific job";
  
  t += met.complexity==="high"?". It has many decision points, which makes it powerful but tricky to follow.":met.complexity==="medium"?". It's moderately complex with a few decision paths.":". It's straightforward and easy to understand.";
  
  const top = ins.filter(i=>i.priority!=="low").slice(0,2);
  if (top.length) t += " " + top.map(i => i.type==="warning"?"Important: "+i.message.toLowerCase():i.message).join(" ");
  t += met.complexity==="high"?" Consider breaking it into smaller pieces for clarity.":" Good example of clean code structure.";
  return t.trim();
}

function generateMarkdownExport(standard: string, beginner: string, details: string, metrics: CombinedMetrics, patterns: string[], insights: Insight[], lang: string, aiUsed: boolean): string {
  return [
    `# Code Explanation (${lang.toUpperCase()})`,
    `> Generated with ${aiUsed ? "AI-Enhanced 15-Algorithm Pipeline" : "14-Algorithm Static Analysis"} on ${new Date().toLocaleString()}`,
    ``,
    `## Metrics`,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Complexity | ${metrics.complexity.toUpperCase()} |`,
    `| Cyclomatic | ${metrics.cyclomatic} |`,
    `| Nesting Depth | ${metrics.nestingDepth} |`,
    `| Maintainability | ${metrics.maintainabilityIndex}/100 |`,
    ``,
    `## Detected Patterns`,
    ...patterns.map(p => `- ${p}`),
    ``,
    `## Standard Explanation`,
    standard,
    ``,
    `## Beginner Explanation`,
    beginner,
    ``,
    `## Technical Details`,
    details,
    ``,
    `## Key Insights`,
    ...insights.map(i => `- **[${i.priority.toUpperCase()}]** ${i.message}${i.detail ? ` (${i.detail})` : ""}`),
    ``,
    `---`,
    `*Generated by Dev Toolkit Code Explainer*`
  ].join("\n");
}