import * as vscode from "vscode";
import { parse } from "@babel/parser";
import type { Node, Program } from "@babel/types";

const supportedLanguages = ["javascript", "javascriptreact", "typescript", "typescriptreact"];

export function registerReadTime(context: vscode.ExtensionContext) {
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  statusBarItem.command = "devToolkit.showReadTime";
  context.subscriptions.push(statusBarItem);

  const showReadTimeCommand = vscode.commands.registerCommand("devToolkit.showReadTime", () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.isUntitled || editor.document.uri.scheme !== "file") {
      vscode.window.showInformationMessage("Estimated read time is available for saved code files only.");
      return;
    }

    const estimate = computeReadTime(editor.document);
    vscode.window.showInformationMessage(`$(clock) Estimated read time: ${estimate.label} (${estimate.details})`);
  });

  context.subscriptions.push(showReadTimeCommand);

  const debounce = <T extends (...args: any[]) => void>(fn: T, ms: number) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return (...args: Parameters<T>) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  };

  const refreshStatusBar = (editor: vscode.TextEditor | undefined) => {
    if (!editor || editor.document.isUntitled || editor.document.uri.scheme !== "file") {
      statusBarItem.hide();
      return;
    }

    if (!supportedLanguages.includes(editor.document.languageId)) {
      statusBarItem.hide();
      return;
    }

    const estimate = computeReadTime(editor.document);
    statusBarItem.text = `$(clock) ${estimate.label}`;
    
    // ✅ FIX: Set properties directly to avoid TS2345 constructor mismatch
    const tooltipMd = new vscode.MarkdownString(estimate.tooltip);
    tooltipMd.supportThemeIcons = true;
    tooltipMd.isTrusted = true;
    statusBarItem.tooltip = tooltipMd;
    
    statusBarItem.show();
  };

  const debouncedRefresh = debounce(refreshStatusBar, 250);

  vscode.window.onDidChangeActiveTextEditor(refreshStatusBar, null, context.subscriptions);
  vscode.window.onDidChangeVisibleTextEditors(() => refreshStatusBar(vscode.window.activeTextEditor), null, context.subscriptions);
  vscode.workspace.onDidOpenTextDocument((document) => {
    if (vscode.window.activeTextEditor?.document.uri.toString() === document.uri.toString()) {
      refreshStatusBar(vscode.window.activeTextEditor);
    }
  }, null, context.subscriptions);
  vscode.workspace.onDidChangeTextDocument((event) => {
    if (vscode.window.activeTextEditor?.document.uri.toString() === event.document.uri.toString()) {
      debouncedRefresh(vscode.window.activeTextEditor);
    }
  }, null, context.subscriptions);
  vscode.workspace.onDidSaveTextDocument((document) => {
    if (vscode.window.activeTextEditor?.document.uri.toString() === document.uri.toString()) {
      refreshStatusBar(vscode.window.activeTextEditor);
    }
  }, null, context.subscriptions);

  refreshStatusBar(vscode.window.activeTextEditor);
}

interface ReadTimeEstimate {
  label: string;
  details: string;
  tooltip: string;
}

function computeReadTime(document: vscode.TextDocument): ReadTimeEstimate {
  const text = document.getText();
  if (!text.trim()) return { label: "Empty", details: "0 sec", tooltip: "File is empty." };

  // 1. Count effective code lines (non-blank, non-comment)
  const lines = text.split(/\r?\n/);
  let codeLines = 0;
  let inMultiComment = false;
  for (const line of lines) {
    const t = line.trim();
    if (t === "") continue;
    if (inMultiComment) {
      if (t.includes("*/")) inMultiComment = false;
      continue;
    }
    if (t.startsWith("//")) continue;
    if (t.startsWith("/*")) { inMultiComment = true; continue; }
    codeLines++;
  }
  if (codeLines === 0) return { label: "Empty", details: "0 sec", tooltip: "No executable code." };

  // 2. AST-based complexity analysis
  let complexity = 1.0;
  let maxDepth = 0;
  let asyncCount = 0;
  let controlFlowCount = 0;
  try {
    const ast = parse(text, { sourceType: "module", plugins: ["typescript", "jsx"], errorRecovery: true });
    const result = analyzeComplexity(ast.program);
    complexity = result.complexity;
    maxDepth = result.maxDepth;
    asyncCount = result.asyncCount;
    controlFlowCount = result.controlFlowCount;
  } catch {
    complexity = 1.0;
  }

  // 3. Realistic time calculation
  const baseSpeed = 26.0; // ~26 effective LOC/min for average JS/TS reading
  const adjustedSpeed = baseSpeed / Math.min(complexity, 2.4);
  const estimatedMinutes = codeLines / adjustedSpeed;
  const estimatedSeconds = Math.max(20, Math.round(estimatedMinutes * 60));

  return formatReadTime(estimatedSeconds, { codeLines, complexity, maxDepth, asyncCount, controlFlowCount });
}

function analyzeComplexity(program: Program) {
  let controlFlowCount = 0;
  let maxDepth = 0;
  let asyncCount = 0;

  const controlFlowTypes = new Set([
    "IfStatement", "ForStatement", "ForInStatement", "ForOfStatement",
    "WhileStatement", "DoWhileStatement", "SwitchStatement", "CatchClause",
    "ConditionalExpression"
  ]);
  const scopeTypes = new Set([
    "BlockStatement", "FunctionDeclaration", "FunctionExpression",
    "ArrowFunctionExpression", "ClassDeclaration", "ClassExpression", "ObjectExpression"
  ]);
  const skipKeys = new Set([
    "loc", "start", "end", "leadingComments", "trailingComments",
    "extra", "range", "innerComments", "directives", "interpreter"
  ]);

  const isNode = (v: unknown): v is Node =>
    typeof v === "object" && v !== null && "type" in v && typeof (v as any).type === "string";

  const stack: Array<{ node: Node; depth: number }> = [{ node: program, depth: 0 }];

  while (stack.length > 0) {
    const { node, depth } = stack.pop()!;
    if (depth > maxDepth) maxDepth = depth;
    if (controlFlowTypes.has(node.type)) controlFlowCount++;
    if (node.type === "AwaitExpression") asyncCount++;
    if (node.type === "FunctionDeclaration" && (node as any).async) asyncCount++;

    const nextDepth = scopeTypes.has(node.type) ? depth + 1 : depth;

    for (const key in node) {
      if (skipKeys.has(key)) continue;
      const child = (node as any)[key];
      if (!child) continue;

      if (Array.isArray(child)) {
        for (let i = child.length - 1; i >= 0; i--) {
          if (isNode(child[i])) stack.push({ node: child[i], depth: nextDepth });
        }
      } else if (isNode(child)) {
        stack.push({ node: child, depth: nextDepth });
      }
    }
  }

  // Complexity scoring (1.0 to ~2.4x)
  let score = 1.0;
  score += Math.min(controlFlowCount * 0.03, 0.7);      // Control flow impact
  score += Math.max(0, maxDepth - 2) * 0.12;            // Nesting penalty (starts after depth 2)
  score += Math.min(asyncCount * 0.06, 0.4);            // Async/await cognitive load

  return { complexity: Math.min(score, 2.4), maxDepth, asyncCount, controlFlowCount };
}

function formatReadTime(seconds: number, metrics: {
  codeLines: number;
  complexity: number;
  maxDepth: number;
  asyncCount: number;
  controlFlowCount: number;
}): ReadTimeEstimate {
  const mins = Math.round(seconds / 60 * 10) / 10;
  let label: string;

  if (seconds < 45) label = `<1 min`;
  else if (seconds < 90) label = `~1 min`;
  else {
    const hrs = Math.floor(mins / 60);
    const remainingMins = Math.round(mins % 60);
    label = hrs === 0 ? `~${remainingMins} min` : remainingMins === 0 ? `~${hrs} hr` : `~${hrs} hr ${remainingMins} min`;
  }

  const details = `${mins.toFixed(1)} min (${Math.round(seconds)} sec)`;
  
  // ✅ FIX: Use \n\n for proper Markdown line breaks
  const tooltip = [
    `$(book) **Estimated reading time:** ${details}`,
    `$(graph) **Structural Analysis:**`,
    `  • Effective code lines: ${metrics.codeLines}`,
    `  • Control flow nodes: ${metrics.controlFlowCount}`,
    `  • Max nesting depth: ${metrics.maxDepth}`,
    `  • Async/await usage: ${metrics.asyncCount}`,
    `  • Complexity factor: ${metrics.complexity.toFixed(2)}x`,
    `$(info) *Based on AST control-flow analysis & developer reading benchmarks*`,
  ].join("\n\n");

  return { label, details, tooltip };
}