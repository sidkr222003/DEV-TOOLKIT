import * as vscode from "vscode";

function getTimestamp(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

export function createLogger(name: string) {
  const channel = vscode.window.createOutputChannel(name);

  return {
    info(feature: string, message: string) {
      channel.appendLine(`[${getTimestamp()}] ${feature}: ${message}`);
    },
    warn(feature: string, message: string) {
      channel.appendLine(`[${getTimestamp()}] ${feature}: WARNING: ${message}`);
    },
    error(feature: string, message: string) {
      channel.appendLine(`[${getTimestamp()}] ${feature}: ERROR: ${message}`);
    }
  };
}
