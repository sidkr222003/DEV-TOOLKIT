import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { createLogger } from "../utils/logger";

const logger = createLogger("Dev Toolkit");
const cache = new Map<string, { bytes: number; files: number; timestamp: number }>();
const CACHE_TTL_MS = 30 * 1000;

export function registerExplorerSizeDecorations(context: vscode.ExtensionContext) {
  const changeEmitter = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();

  const fileDecorationProvider: vscode.FileDecorationProvider = {
    onDidChangeFileDecorations: changeEmitter.event,

    async provideFileDecoration(uri: vscode.Uri): Promise<vscode.FileDecoration | undefined> {
      if (uri.scheme !== "file") {
        return undefined;
      }

      try {
        const stat = await fs.promises.lstat(uri.fsPath);
        const realStat = stat.isSymbolicLink() ? await fs.promises.stat(uri.fsPath) : stat;

        if (realStat.isFile()) {
          return {
            tooltip: `Size: ${formatBytes(realStat.size)}`
          };
        }

        if (realStat.isDirectory()) {
          const folderSize = await getFolderSize(uri.fsPath);
          return {
            tooltip: `Size: ${formatBytes(folderSize.bytes)}\nFiles: ${folderSize.files.toLocaleString()}`
          };
        }
      } catch (error) {
        logger.error("ExplorerSizeDecorations", `Unable to decorate ${uri.fsPath}: ${error instanceof Error ? error.message : String(error)}`);
      }

      return undefined;
    }
  };

  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(fileDecorationProvider),
    changeEmitter,
  );

  const refreshDecorations = () => {
    cache.clear();
    changeEmitter.fire(undefined);
  };

  const watcher = vscode.workspace.createFileSystemWatcher("**/*");
  watcher.onDidChange(refreshDecorations, null, context.subscriptions);
  watcher.onDidCreate(refreshDecorations, null, context.subscriptions);
  watcher.onDidDelete(refreshDecorations, null, context.subscriptions);

  vscode.workspace.onDidSaveTextDocument(refreshDecorations, null, context.subscriptions);
  vscode.workspace.onDidRenameFiles(refreshDecorations, null, context.subscriptions);
}

async function getFolderSize(dir: string, visited = new Set<string>()): Promise<{ bytes: number; files: number }> {
  try {
    const realPath = await fs.promises.realpath(dir);
    if (visited.has(realPath)) {
      return { bytes: 0, files: 0 };
    }
    visited.add(realPath);
  } catch {
    // If realpath fails, fall back to regular path tracking.
    if (visited.has(dir)) {
      return { bytes: 0, files: 0 };
    }
    visited.add(dir);
  }

  const now = Date.now();
  const cached = cache.get(dir);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return { bytes: cached.bytes, files: cached.files };
  }

  let totalBytes = 0;
  let totalFiles = 0;

  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);
      try {
        const entryStat = await fs.promises.lstat(entryPath);
        const actualStat = entryStat.isSymbolicLink() ? await fs.promises.stat(entryPath) : entryStat;

        if (actualStat.isDirectory()) {
          const child = await getFolderSize(entryPath, visited);
          totalBytes += child.bytes;
          totalFiles += child.files;
        } else if (actualStat.isFile()) {
          totalBytes += actualStat.size;
          totalFiles += 1;
        }
      } catch (error) {
        logger.error("ExplorerSizeDecorations", `Skipping ${entryPath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }));
  } catch (error) {
    logger.error("ExplorerSizeDecorations", `Unable to read directory ${dir}: ${error instanceof Error ? error.message : String(error)}`);
  }

  cache.set(dir, { bytes: totalBytes, files: totalFiles, timestamp: now });
  return { bytes: totalBytes, files: totalFiles };
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
