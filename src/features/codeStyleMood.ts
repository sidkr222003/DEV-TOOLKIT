import * as vscode from "vscode";
import { analyzeCodeStyle } from "./utils/codeStyleAnalyzer";
import { createLogger } from "../utils/logger";

const logger = createLogger("Code Style Mood");
const supportedLanguages = ["javascript", "javascriptreact", "typescript", "typescriptreact"];

export function registerCodeStyleMood(context: vscode.ExtensionContext) {
  // Create status bar item on the right side (priority 85 places it near other status items)
  const moodStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 85);
  moodStatusBar.name = "Code Style Mood";
  context.subscriptions.push(moodStatusBar);

  // Update status bar with automatic analysis
  const updateMoodBadge = (editor: vscode.TextEditor | undefined) => {
    if (!editor || editor.document.isUntitled || editor.document.uri.scheme !== "file") {
      moodStatusBar.hide();
      return;
    }

    if (!supportedLanguages.includes(editor.document.languageId)) {
      moodStatusBar.hide();
      return;
    }

    try {
      const mood = analyzeCodeStyle(editor.document);

      // Set the text with codicon and mood label
      moodStatusBar.text = `${mood.emoji} ${mood.mood}`;

      // Create a markdown tooltip with details
      const tooltipMd = new vscode.MarkdownString();
      tooltipMd.appendMarkdown(`### Code Style Assessment\n\n`);
      tooltipMd.appendMarkdown(`**Mood**: ${mood.emoji} ${mood.mood}\n\n`);
      tooltipMd.appendMarkdown(`**Score**: ${(mood.score * 100).toFixed(1)}%\n\n`);
      tooltipMd.appendMarkdown(`**Assessment**:\n\n`);
      tooltipMd.appendMarkdown(`${mood.details.lineLength}\n\n`);
      tooltipMd.appendMarkdown(`${mood.details.naming}\n\n`);
      tooltipMd.appendMarkdown(`${mood.details.comments}\n\n`);
      tooltipMd.appendMarkdown(`${mood.details.functions}\n\n`);
      tooltipMd.appendMarkdown(`${mood.details.cleanliness}\n\n`);
      tooltipMd.appendMarkdown(`---\n\n`);
      tooltipMd.appendMarkdown(`*${mood.emoji} ${mood.mood}*`);
      tooltipMd.supportThemeIcons = true;
      tooltipMd.isTrusted = true;

      moodStatusBar.tooltip = tooltipMd;
      moodStatusBar.show();

      logger.debug("CodeStyleMood", `Updated: ${mood.mood} (${mood.score.toFixed(2)})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("CodeStyleMood", `Analysis failed: ${message}`);
      moodStatusBar.hide();
    }
  };

  // Listen to active editor changes
  const editorChangeSubscription = vscode.window.onDidChangeActiveTextEditor(updateMoodBadge);
  context.subscriptions.push(editorChangeSubscription);

  // Debounced update on document changes
  let updateTimer: ReturnType<typeof setTimeout> | undefined;
  const debounceUpdate = () => {
    if (updateTimer !== undefined) {
      clearTimeout(updateTimer);
    }
    updateTimer = setTimeout(() => {
      updateMoodBadge(vscode.window.activeTextEditor);
    }, 200);
  };

  const docChangeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
    if (event.document === vscode.window.activeTextEditor?.document) {
      debounceUpdate();
    }
  });
  context.subscriptions.push(docChangeSubscription);

  // Initial update
  updateMoodBadge(vscode.window.activeTextEditor);
}
