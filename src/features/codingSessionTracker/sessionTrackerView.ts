import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import {
    SessionRecord,
    getCurrentSessionRecord,
    isSessionTrackingActive,
    onSessionStateChange,
    startSessionTracking,
    stopSessionTracking,
    toggleSessionTracking,
    getLiveEfficiency,
    getLiveIsIdle,       
} from "./sessionTimer";


export function registerSessionTracker(context: vscode.ExtensionContext) {
    const provider = new SessionTrackerViewProvider(context);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider("devToolkit.sessionTracker", provider, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );

    // ── Navigation helpers ───────────────────────────────────────
    const focusAndNavigate = (tab: string) => {
        vscode.commands.executeCommand("devToolkit.sessionTracker.focus");
        // Give the webview time to become visible before posting the message
        setTimeout(() => provider.navigateToTab(tab), 150);
    };

    // ── Command: Start Session ───────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand("devToolkit.startSession", () => {
            startSessionTracking();
            vscode.window.setStatusBarMessage("$(play) Session started.", 2000);
        })
    );

    // ── Command: End Session ─────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand("devToolkit.endSession", () => {
            stopSessionTracking();
            vscode.window.setStatusBarMessage("$(debug-stop) Session ended.", 2000);
        })
    );

    // ── Command: Open Dashboard ──────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand("devToolkit.openSessionDashboard", () => {
            focusAndNavigate("today");
        })
    );

    // ── Command: View Achievements ───────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand("devToolkit.viewAchievements", () => {
            focusAndNavigate("achievements");
        })
    );

    // ── Command: View Badges ─────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand("devToolkit.viewBadges", () => {
            focusAndNavigate("achievements"); // badges live in the achievements tab
        })
    );

    // ── Command: View History ────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand("devToolkit.viewHistory", () => {
            focusAndNavigate("history");
        })
    );

    // ── Command: Export Data ─────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand("devToolkit.exportSessionData", async () => {
            const choice = await vscode.window.showQuickPick(
                [
                    { label: "$(json) Export as JSON", value: "json" },
                    { label: "$(table) Export as CSV",  value: "csv"  }
                ],
                { placeHolder: "Choose export format" }
            );
            if (!choice) return;
            const history = context.globalState.get<SessionRecord[]>(
                "devToolkit.sessionHistory", []
            );
            provider.triggerExport(choice.value as "json" | "csv", history);
        })
    );

    // ── Command: Reset Today ─────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand("devToolkit.resetToday", async () => {
            const confirm = await vscode.window.showWarningMessage(
                "Clear all session data recorded today?",
                { modal: true },
                "Clear Today"
            );
            if (confirm !== "Clear Today") return;
            const today   = new Date().toDateString();
            const history = context.globalState.get<SessionRecord[]>(
                "devToolkit.sessionHistory", []
            );
            const filtered = history.filter(
                s => new Date(s.date).toDateString() !== today
            );
            await context.globalState.update("devToolkit.sessionHistory", filtered);
            provider.refresh();
            vscode.window.setStatusBarMessage("$(discard) Today's data cleared.", 2000);
        })
    );

    // ── Command: Set Daily Goal ──────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand("devToolkit.setDailyGoal", async () => {
            const input = await vscode.window.showInputBox({
                prompt:      "Enter your daily coding goal (minutes)",
                placeHolder: "e.g. 120",
                validateInput: (v) => {
                    const n = parseInt(v, 10);
                    if (isNaN(n) || n < 15 || n > 720) return "Enter a value between 15 and 720.";
                    return undefined;
                }
            });
            if (input === undefined) return;
            const minutes = parseInt(input, 10);
            await vscode.workspace
                .getConfiguration("devToolkit.sessionTracker")
                .update("dailyGoalMinutes", minutes, vscode.ConfigurationTarget.Global);
            focusAndNavigate("goals");
            vscode.window.setStatusBarMessage(`$(target) Daily goal set to ${minutes} minutes.`, 2500);
        })
    );
}

class SessionTrackerViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private readonly context: vscode.ExtensionContext;
  private liveStateSubscription?: vscode.Disposable;

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
        case "toggleTracking":
            toggleSessionTracking();
            this.sendHistory();
            break;
        case "startTracking":
            startSessionTracking();
            this.sendHistory();
            break;
        case "stopTracking":
            stopSessionTracking();
            this.sendHistory();
            break;
        case "clearHistory":
            await this.clearHistory();
            break;
        case "exportData":                                           // ← ADD
            await this.handleExport(msg.format, msg.history);
            break;
    }
});


    this.liveStateSubscription?.dispose();
    this.liveStateSubscription = onSessionStateChange(() => this.sendHistory());
    this.view.onDidDispose(() => this.liveStateSubscription?.dispose());

    this.sendHistory();
  }

private sendHistory() {
    const persistedHistory = this.context.globalState.get<SessionRecord[]>(
        "devToolkit.sessionHistory", []
    );
    const history    = [...persistedHistory];
    const liveRecord = getCurrentSessionRecord();

    if (liveRecord) {
        const existingIndex = history.findIndex(e => e.id === liveRecord.id);
        if (existingIndex >= 0) {
            history[existingIndex] = liveRecord;
        } else {
            history.push(liveRecord);
        }
    }

    this.view?.webview.postMessage({
        type:        "history",
        history,
        isTracking:  isSessionTrackingActive(),
        efficiency:  getLiveEfficiency(),
        liveSession: liveRecord ?? null,
        isIdle:      getLiveIsIdle(),
    });
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

  private async handleExport(format: "json" | "csv", history: SessionRecord[]) {
    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`session-history.${format}`),
        filters: format === "json"
            ? { "JSON": ["json"] }
            : { "CSV":  ["csv"]  }
    });
    if (!uri) return;

    let content: string;
    if (format === "json") {
        content = JSON.stringify(history, null, 2);
    } else {
        const header = "id,date,activeTime,totalTime,maxStreak\n";
        const rows   = history.map(s =>
            [s.id, s.date, s.activeTime, s.totalTime, s.maxStreak].join(",")
        ).join("\n");
        content = header + rows;
    }

    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));
    vscode.window.showInformationMessage(
        `$(export) Session history exported as ${format.toUpperCase()}.`
    );
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
  /** Called by commands to switch the active tab in the webview. */
  public navigateToTab(tab: string) {
      this.view?.webview.postMessage({ type: "navigateTab", tab });
  }

  /** Called by the export command to trigger a save dialog. */
  public async triggerExport(format: "json" | "csv", history: SessionRecord[]) {
      await this.handleExport(format, history);
  }

  /** Forces a data refresh — used after resetToday. */
  public refresh() {
      this.sendHistory();
  }
}
