import * as vscode from "vscode";
import { registerFileSize } from "./features/fileSize";
import { registerExplorerSizeDecorations } from "./features/explorerSizeDecorations";
import { registerRemoveConsoleLogs } from "./features/removeConsoleLogs";
import { registerReadTime } from "./features/readTime";
import { registerCodeExplainer } from "./features/codeExplainer";
import { registerFunctionReferences } from "./features/functionReferences";

export function activate(context: vscode.ExtensionContext) {
  registerFileSize(context);
  registerExplorerSizeDecorations(context);
  registerRemoveConsoleLogs(context);
  registerReadTime(context);
  registerCodeExplainer(context);
  registerFunctionReferences(context);
}

export function deactivate(): void {}
