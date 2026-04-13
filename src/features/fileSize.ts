import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { createLogger } from "../utils/logger";

const logger = createLogger("Dev Toolkit");

export function registerFileSize(context: vscode.ExtensionContext) {
  const showFileSizeCommand = vscode.commands.registerCommand("devToolkit.showFileSize", async (resource: vscode.Uri | undefined) => {
    const fileUri = await resolveFileUri(resource);
    if (!fileUri) {
      vscode.window.showWarningMessage("No file selected to show size.");
      return;
    }

    try {
      const stat = await fs.promises.stat(fileUri.fsPath);
      if (!stat.isFile()) {
        vscode.window.showWarningMessage("Please select a file to show its size.");
        return;
      }

      const humanSize = formatBytes(stat.size);
      const fileName = path.basename(fileUri.fsPath);
      vscode.window.showInformationMessage(`📄 ${fileName}: ${humanSize}`);
      logger.info("FileSize", `File ${fileUri.fsPath}: ${humanSize}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("FileSize", message);
      vscode.window.showErrorMessage(`Failed to get file size: ${message}`);
    }
  });

  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = "devToolkit.showFileSize";
  statusBarItem.tooltip = "Current file size";
  context.subscriptions.push(statusBarItem);

  // ✅ Fixed: Only use VALID properties for ThemableDecorationAttachmentRenderOptions
  const importDecorationType = vscode.window.createTextEditorDecorationType({
    after: {
      margin: "0 0 0 0.75rem",
      backgroundColor: new vscode.ThemeColor("editorHoverWidget.background"),
      color: new vscode.ThemeColor("editor.foreground"),
      border: "1px solid var(--vscode-editorWidget-border)",
      textDecoration: "none; font-style: normal; font-weight: normal;"
    }
  });

  const codeLensChangeEmitter = new vscode.EventEmitter<void>();
  
  const fileSizeCodeLensProvider = vscode.languages.registerCodeLensProvider({ scheme: "file" }, {
    onDidChangeCodeLenses: codeLensChangeEmitter.event,
    provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeLens[]> {
      if (document.isUntitled) {
        return [];
      }

      try {
        const stat = fs.statSync(document.uri.fsPath);
        if (!stat.isFile()) {
          return [];
        }

        return [
          new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
            title: `File size: ${formatBytes(stat.size)}`,
            command: "devToolkit.showFileSize",
            arguments: [document.uri]
          })
        ];
      } catch {
        return [];
      }
    }
  });

  context.subscriptions.push(importDecorationType, showFileSizeCommand, fileSizeCodeLensProvider, codeLensChangeEmitter);

  const updateEditorSize = async (editor: vscode.TextEditor | undefined) => {
    if (!editor || editor.document.isUntitled) {
      statusBarItem.hide();
      return;
    }

    try {
      const stat = await fs.promises.stat(editor.document.uri.fsPath);
      if (!stat.isFile()) {
        statusBarItem.hide();
        return;
      }

      statusBarItem.text = `$(file) ${formatBytes(stat.size)}`;
      statusBarItem.show();
    } catch {
      statusBarItem.hide();
    }
  };

  const refreshCurrentEditor = async (editor: vscode.TextEditor | undefined) => {
    await updateEditorSize(editor);
    updateImportDecorations(editor, importDecorationType);
    codeLensChangeEmitter.fire();
  };

  vscode.window.onDidChangeActiveTextEditor((editor) => {
    refreshCurrentEditor(editor);
  }, null, context.subscriptions);

  vscode.workspace.onDidChangeTextDocument((event) => {
    if (vscode.window.activeTextEditor?.document.uri.toString() === event.document.uri.toString()) {
      refreshCurrentEditor(vscode.window.activeTextEditor);
    }
  }, null, context.subscriptions);

  vscode.workspace.onDidSaveTextDocument((document) => {
    if (vscode.window.activeTextEditor?.document.uri.toString() === document.uri.toString()) {
      refreshCurrentEditor(vscode.window.activeTextEditor);
    }
  }, null, context.subscriptions);

  if (vscode.window.activeTextEditor) {
    refreshCurrentEditor(vscode.window.activeTextEditor);
  }
}

async function resolveFileUri(resource: vscode.Uri | undefined) {
  if (resource) {
    return resource;
  }

  const editor = vscode.window.activeTextEditor;
  return editor?.document.uri;
}

// ✅ Fixed: Only use VALID properties in renderOptions.after
function updateImportDecorations(editor: vscode.TextEditor | undefined, decorationType: vscode.TextEditorDecorationType) {
  if (!editor) {
    return;
  }

  const decorations: vscode.DecorationOptions[] = [];
  const importRegex = /(?:from\s+|import\s+)["']([^"']+)["']/g;

  for (let i = 0; i < editor.document.lineCount; i++) {
    const line = editor.document.lineAt(i);
    const matches = [...line.text.matchAll(importRegex)];
    
    for (const match of matches) {
      const modulePath = match[1];
      if (!modulePath) continue;

      const resolvedPath = resolveImportSource(editor.document.uri, modulePath);
      
      // ✅ Handle built-in modules gracefully
      if (!resolvedPath) {
        const builtInModules = ['fs', 'path', 'os', 'vscode', 'util', 'events', 'stream', 'http', 'https', 'crypto', 'child_process', 'buffer', 'querystring', 'url', 'assert', 'tty', 'net', 'dgram', 'dns', 'zlib', 'readline', 'repl', 'tls', 'punycode', 'cluster', 'worker_threads', 'perf_hooks', 'inspector', 'async_hooks', 'trace_events', 'v8', 'vm', 'wasi', 'timers', 'console', 'process', 'module'];
        if (builtInModules.includes(modulePath)) {
          decorations.push({
            range: new vscode.Range(i, line.text.length, i, line.text.length),
            renderOptions: {
              after: {
                contentText: '〈built-in〉',
                color: new vscode.ThemeColor("editorCodeLens.foreground"),
                margin: "0 0 0 0.75rem",
                fontStyle: "italic",
                textDecoration: "none"
              }
            }
          });
        }
        continue;
      }

      try {
        const stat = fs.statSync(resolvedPath);
        if (!stat.isFile()) continue;

        decorations.push({
          range: new vscode.Range(i, line.text.length, i, line.text.length),
          renderOptions: {
            after: {
              contentText: `${formatBytes(stat.size)}`,
              // ✅ ONLY valid properties for ThemableDecorationAttachmentRenderOptions:
              color: new vscode.ThemeColor("editorCodeLens.foreground"),
              margin: "0 0 0 0.75rem",
              backgroundColor: new vscode.ThemeColor("editorHoverWidget.background"),
              border: "0.5px solid var(--vscode-editorWidget-border)",
              textDecoration: "none; font-style: normal; font-weight: normal;padding: 0.1em 0.3em; border-radius: 3px;"
            }
          }
        });
      } catch {
        continue;
      }
    }
  }

  editor.setDecorations(decorationType, decorations);
}

function resolveImportSource(documentUri: vscode.Uri, importPath: string): string | undefined {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);
  const documentDir = path.dirname(documentUri.fsPath);
  const candidates: string[] = [];

  if (importPath.startsWith(".") || importPath.startsWith("/")) {
    const resolvedRoot = importPath.startsWith("/") && workspaceFolder
      ? path.join(workspaceFolder.uri.fsPath, importPath.slice(1))
      : path.resolve(documentDir, importPath);
    candidates.push(resolvedRoot);
  } else if (importPath.startsWith("@/")) {
    if (workspaceFolder) {
      candidates.push(path.join(workspaceFolder.uri.fsPath, importPath.slice(2)));
      candidates.push(path.join(workspaceFolder.uri.fsPath, "src", importPath.slice(2)));
    }
  } else if (importPath.startsWith("~/")) {
    if (workspaceFolder) {
      candidates.push(path.join(workspaceFolder.uri.fsPath, importPath.slice(2)));
    }
  } else {
    const resolved = resolveNodeModulePath(importPath, workspaceFolder?.uri.fsPath);
    if (resolved) {
      return resolved;
    }
  }

  for (const candidate of candidates) {
    const file = resolveExistingFile(candidate);
    if (file) {
      return file;
    }
  }

  return undefined;
}

function resolveNodeModulePath(importPath: string, workspaceRoot?: string): string | undefined {
  if (!workspaceRoot) {
    return undefined;
  }

  try {
    return require.resolve(importPath, { paths: [workspaceRoot] });
  } catch {
    const candidate = path.join(workspaceRoot, "node_modules", importPath);
    return resolveExistingFile(candidate);
  }
}

function resolveExistingFile(basePath: string): string | undefined {
  const extensions = ["", ".ts", ".tsx", ".js", ".jsx", ".d.ts", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"];
  for (const extension of extensions) {
    const candidate = `${basePath}${extension}`;
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kilo = bytes / 1024;
  if (kilo < 1024) {
    return `${kilo.toFixed(2)} KB`;
  }

  const mega = kilo / 1024;
  if (mega < 1024) {
    return `${mega.toFixed(2)} MB`;
  }

  return `${(mega / 1024).toFixed(2)} GB`;
}