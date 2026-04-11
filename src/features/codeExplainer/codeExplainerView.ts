import * as fs from "fs"
import * as path from "path"
import * as vscode from "vscode"
import { createLogger } from "../../utils/logger"
import { runMultiAlgorithmAnalysis } from "./codeAnalysis"
import { Explanation, ExplanationMode, ViewMessage, ViewPayload } from "./codeExplainerTypes"

const logger = createLogger("Dev Toolkit");

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
        (p: number, s: string) => provider.showLoading(p, s)
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
        (p: number, s: string) => this.showLoading(p, s)
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
    const webview = this.view?.webview;
    const codiconsUri = webview
      ? webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "node_modules", "@vscode", "codicons", "dist", "codicon.css"))
      : "";
    const cspSource = webview?.cspSource || "";
    const styleUri = webview
      ? webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "src", "features", "codeExplainer", "styles.css"))
      : "";
    const scriptUri = webview
      ? webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "src", "features", "codeExplainer", "script.js"))
      : "";

    const htmlPath = path.join(this.context.extensionUri.fsPath, "src", "features", "codeExplainer", "index.html");
    let html = "";
    try {
      html = fs.readFileSync(htmlPath, "utf8");
    } catch (err) {
      logger.error("Failed to load code explainer HTML", err instanceof Error ? err.message : String(err));
      return "<body><h1>Unable to load Code Explainer UI</h1></body>";
    }

    return html
      .replace(/\$\{codiconsUri\}/g, String(codiconsUri))
      .replace(/\$\{styleUri\}/g, String(styleUri))
      .replace(/\$\{scriptUri\}/g, String(scriptUri))
      .replace(/\$\{cspSource\}/g, String(cspSource));
  }
}
