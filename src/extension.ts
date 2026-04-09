import * as vscode from "vscode";
import { registerFileSize } from "./features/fileSize";
import { registerExplorerSizeDecorations } from "./features/explorerSizeDecorations";
import { registerRemoveConsoleLogs } from "./features/removeConsoleLogs";
import { registerCodeExplainer } from "./features/codeExplainer";

export function activate(context: vscode.ExtensionContext) {
  registerFileSize(context);
  registerExplorerSizeDecorations(context);
  registerRemoveConsoleLogs(context);
  registerCodeExplainer(context);
}

export function deactivate(): void {}
