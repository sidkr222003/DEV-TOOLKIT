import * as vscode from "vscode";
import { createLogger } from "../utils/logger";

const logger = createLogger("Dev Toolkit");

export function registerRemoveConsoleLogs(context: vscode.ExtensionContext) {
  const command = vscode.commands.registerCommand("devToolkit.removeConsoleLogs", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("No active editor to remove console statements from.");
      return;
    }

    const selection = editor.selection;
    const originalText = selection.isEmpty ? editor.document.getText() : editor.document.getText(selection);
    const cleanedText = removeConsoleLogs(originalText);

    if (cleanedText === originalText) {
      vscode.window.showInformationMessage("No console.* statements found.");
      return;
    }

    const editRange = selection.isEmpty
      ? new vscode.Range(new vscode.Position(0, 0), editor.document.lineAt(editor.document.lineCount - 1).range.end)
      : selection;

    const editSuccess = await editor.edit((editBuilder) => {
      editBuilder.replace(editRange, cleanedText);
    });

    if (editSuccess) {
      await vscode.commands.executeCommand("editor.action.formatDocument");
    }

    vscode.window.showInformationMessage("Removed console.* statements.");
    logger.info("RemoveConsoleLogs", selection.isEmpty ? "Removed from active file" : "Removed from selection");
  });

  context.subscriptions.push(command);
}

function removeConsoleLogs(text: string): string {
  const consoleCallRegex = /console\s*(?:\.\s*[A-Za-z_$][A-Za-z0-9_$]*|\[\s*(?:'[^']*'|"[^"]*"|`[^`]*`)\s*\])\s*\(/g;
  let result = "";
  let currentIndex = 0;

  while (currentIndex < text.length) {
    consoleCallRegex.lastIndex = currentIndex;
    const match = consoleCallRegex.exec(text);
    if (!match) {
      result += text.slice(currentIndex);
      break;
    }

    const searchIndex = match.index;
    result += text.slice(currentIndex, searchIndex);
    const openParenIndex = searchIndex + match[0].lastIndexOf("(");
    if (openParenIndex === -1) {
      result += text.slice(searchIndex, searchIndex + match[0].length);
      currentIndex = searchIndex + match[0].length;
      continue;
    }

    const closeParenIndex = findMatchingParen(text, openParenIndex);
    if (closeParenIndex === -1) {
      result += text.slice(searchIndex, openParenIndex + 1);
      currentIndex = openParenIndex + 1;
      continue;
    }

    let endIndex = closeParenIndex + 1;
    while (endIndex < text.length && /[\s;]/.test(text[endIndex])) {
      endIndex += 1;
      if (text[endIndex - 1] === ";") {
        break;
      }
    }

    const lineStart = Math.max(text.lastIndexOf("\n", searchIndex - 1), -1) + 1;
    const prefix = text.slice(lineStart, searchIndex);
    const isLineOnlyWhitespace = /^\s*$/.test(prefix);

    if (isLineOnlyWhitespace) {
      result = result.slice(0, result.length - prefix.length);
      if (text[endIndex] === "\r" && text[endIndex + 1] === "\n") {
        endIndex += 2;
      } else if (text[endIndex] === "\n") {
        endIndex += 1;
      }
    }

    currentIndex = endIndex;
  }

  return result;
}

function findMatchingParen(text: string, openIndex: number): number {
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplate = false;
  let escaped = false;

  for (let i = openIndex; i < text.length; i++) {
    const char = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (inSingleQuote) {
      if (char === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      if (char === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (inTemplate) {
      if (char === "`") {
        inTemplate = false;
      }
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      continue;
    }

    if (char === "`") {
      inTemplate = true;
      continue;
    }

    if (char === "(") {
      depth += 1;
      continue;
    }

    if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}
