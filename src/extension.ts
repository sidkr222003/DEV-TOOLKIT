import * as vscode from "vscode";
import { registerFileSize } from "./features/fileSize";
import { registerExplorerSizeDecorations } from "./features/explorerSizeDecorations";
import { registerRemoveConsoleLogs } from "./features/removeConsoleLogs";
import { registerRemoveUnusedImports } from "./features/removeUnusedImports";
import { registerProjectCleanup } from "./features/projectCleanup";
import { registerReadTime } from "./features/readTime";
import { registerCodeExplainer } from "./features/codeExplainer";
import { registerFunctionReferences } from "./features/functionReferences";
import { registerCodeStyleMood } from "./features/codeStyleMood";
import { registerPasteShield } from './features/pasteShield/pasteShield';
import { registerSessionTimer } from "./features/codingSessionTracker/sessionTimer";
import { registerSessionTracker } from "./features/codingSessionTracker/sessionTrackerView";

export function activate(context: vscode.ExtensionContext) {
  registerFileSize(context);
  registerExplorerSizeDecorations(context);
  registerRemoveConsoleLogs(context);
  registerRemoveUnusedImports(context);
  registerProjectCleanup(context);
  registerReadTime(context);
  registerCodeExplainer(context);
  registerFunctionReferences(context);
  registerCodeStyleMood(context);
  registerSessionTimer(context);
  registerSessionTracker(context);
  registerPasteShield(context);
}

export function deactivate(): void {}
