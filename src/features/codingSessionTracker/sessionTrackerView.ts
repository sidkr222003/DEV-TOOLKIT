import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { SessionRecord } from "./sessionTimer";

export function registerSessionTracker(context: vscode.ExtensionContext) {
  const provider = new SessionTrackerViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("devToolkit.sessionTracker", provider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );
}

class SessionTrackerViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private readonly context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    this.view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };
    this.view.webview.html = this.getHtml();

    this.view.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case "requestData":
          this.sendHistory();
          break;
        case "clearHistory":
          await this.clearHistory();
          break;
      }
    });

    this.sendHistory();
  }

  private sendHistory() {
    const history = this.context.globalState.get<SessionRecord[]>("devToolkit.sessionHistory", []);
    this.view?.webview.postMessage({ type: "history", history });
  }

  private async clearHistory() {
    const confirm = await vscode.window.showWarningMessage(
      "Are you sure you want to clear your coding session history?",
      { modal: true },
      "Clear"
    );
    if (confirm === "Clear") {
      await this.context.globalState.update("devToolkit.sessionHistory", []);
      this.sendHistory();
    }
  }

  private getHtml(): string {
    const webview = this.view?.webview;
    const codiconsUri = webview
      ? webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "node_modules", "@vscode", "codicons", "dist", "codicon.css"))
      : "";
    const styleUri = webview
      ? webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "src", "features", "codingSessionTracker", "ui", "dashboard.css"))
      : "";
    const scriptUri = webview
      ? webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "src", "features", "codingSessionTracker", "ui", "dashboard.js"))
      : "";

    const htmlPath = path.join(this.context.extensionUri.fsPath, "src", "features", "codingSessionTracker", "ui", "dashboard.html");
    let html = "";
    try {
      html = fs.readFileSync(htmlPath, "utf8");
    } catch {
      return "<body><h1>Unable to load Dashboard UI</h1></body>";
    }

    return html
      .replace(/\$\{codiconsUri\}/g, String(codiconsUri))
      .replace(/\$\{styleUri\}/g, String(styleUri))
      .replace(/\$\{scriptUri\}/g, String(scriptUri));
  }
}
