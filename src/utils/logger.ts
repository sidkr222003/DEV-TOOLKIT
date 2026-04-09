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

  const formatPayload = (payload?: unknown): string => {
    if (payload === undefined) return "";
    if (typeof payload === "string") return payload;
    if (payload instanceof Error) return payload.stack || payload.message;
    try {
      return JSON.stringify(payload);
    } catch {
      return String(payload);
    }
  };

  return {
    info(header: string, payload?: unknown) {
      channel.appendLine(
        `[${getTimestamp()}] ${name}: ${header}${payload !== undefined ? " " + formatPayload(payload) : ""}`
      );
    },
    warn(header: string, payload?: unknown) {
      channel.appendLine(
        `[${getTimestamp()}] ${name}: WARNING: ${header}${payload !== undefined ? " " + formatPayload(payload) : ""}`
      );
    },
    error(header: string, payload?: unknown) {
      channel.appendLine(
        `[${getTimestamp()}] ${name}: ERROR: ${header}${payload !== undefined ? " " + formatPayload(payload) : ""}`
      );
    },
    debug(header: string, payload?: unknown) {
      channel.appendLine(
        `[${getTimestamp()}] ${name}: DEBUG: ${header}${payload !== undefined ? " " + formatPayload(payload) : ""}`
      );
    }
  };
}
