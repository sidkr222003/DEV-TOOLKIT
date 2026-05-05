/**
 * CommitScorer – Feature Registration
 *
 * Entry point that wires together:
 *   • SCM input box monitoring (debounced, 300 ms)
 *   • Real-time scoring via commitScorerEngine
 *   • Status bar feedback (icon + score)
 *   • Quick fix command palette
 *   • Toggle command
 *   • Session persistence via globalState
 *
 * Architecture:
 *   registerCommitScorer(context) is called from extension.ts once.
 *   All disposables are pushed to context.subscriptions.
 *
 * Hooks used:
 *   • vscode.scm.onDidChangeInputBox          — fires when active SCM input changes
 *   • SCMInputBox.onDidChange                 — fires on every keystroke in the box
 *   • vscode.workspace.onDidChangeTextDocument — fallback for COMMIT_EDITMSG
 *   • vscode.workspace.onDidChangeConfiguration — hot-reload settings
 */

import * as vscode from 'vscode';
import { scoreCommit, ScoreResult } from './commitScorerEngine';
import { getConfig } from './commitScorerConfig';
import { CommitScorerStatusBar } from './commitScorerStatusBar';
import {
  showQuickFixPicker,
  SHOW_QUICK_FIX_COMMAND,
  TOGGLE_COMMAND,
} from './commitScorerCommands';
import { debounce } from '../../utils/debounce';
import { createLogger } from '../../utils/logger';

const logger = createLogger('CommitScorer');

const STATE_KEY_LAST_SCORE = 'commitScorer.lastScore';

// ─── Main registration ───────────────────────────────────────────────────────

export function registerCommitScorer(context: vscode.ExtensionContext): void {
  const config = getConfig();
  if (!config.enabled) {
    logger.info('CommitScorer is disabled via settings');
  }

  const statusBar = new CommitScorerStatusBar(context);
  let lastResult: ScoreResult | null = null;
  let currentMessage = '';

  // Per-tier decoration types (created once, disposed on deactivate)
  const decorationTypes = {
    green: vscode.window.createTextEditorDecorationType({
      after: {
        color: new vscode.ThemeColor('charts.green'),
        fontStyle: 'italic',
        margin: '0 0 0 1em',
      },
    }),
    yellow: vscode.window.createTextEditorDecorationType({
      after: {
        color: new vscode.ThemeColor('charts.yellow'),
        fontStyle: 'italic',
        margin: '0 0 0 1em',
      },
    }),
    red: vscode.window.createTextEditorDecorationType({
      after: {
        color: new vscode.ThemeColor('errorForeground'),
        fontStyle: 'italic',
        margin: '0 0 0 1em',
      },
    }),
  };
  context.subscriptions.push(
    decorationTypes.green,
    decorationTypes.yellow,
    decorationTypes.red,
  );

  // ── Core score-and-update function (sync, <10ms) ─────────────────────────

  function scoreAndUpdate(message: string): void {
    const cfg = getConfig();
    currentMessage = message;

    if (!cfg.enabled) {
      statusBar.hide();
      clearAllDecorations();
      return;
    }

    const result = scoreCommit(message, cfg.bannedWords, cfg.conventionalOnly);
    lastResult = result;

    // Persist last score to globalState for session continuity
    context.globalState.update(STATE_KEY_LAST_SCORE, result.score.total);

    // Update status bar
    if (cfg.showStatusBar) {
      statusBar.update(result);
    }

    // Update inline decoration on COMMIT_EDITMSG
    if (cfg.showInlineDecoration) {
      updateCommitEditmsgDecoration(result, decorationTypes);
    }

    logger.info(`Scored: ${result.score.total}/100 for: "${message.slice(0, 60)}"`);
  }

  const debouncedScore = debounce(scoreAndUpdate, 300);

  // ── Hook 1: SCM input box changes (primary hook) ─────────────────────────

  function attachToInputBox(inputBox: vscode.SourceControlInputBox): vscode.Disposable {
    // onDidChange is not in older @types/vscode but exists at runtime — safe cast
    const box = inputBox as any;
    if (typeof box.onDidChange === 'function') {
      return box.onDidChange((value: string) => {
        debouncedScore(value);
      }) as vscode.Disposable;
    }
    return { dispose() {} };
  }

  // Attach to all currently-registered SCM providers
  const inputBoxListeners: vscode.Disposable[] = [];

  function refreshScmListeners(): void {
    // Dispose old listeners
    inputBoxListeners.forEach(d => d.dispose());
    inputBoxListeners.length = 0;

    // VS Code exposes all source control instances
    for (const scm of getAllSourceControls()) {
      const disposable = attachToInputBox(scm.inputBox);
      inputBoxListeners.push(disposable);
      context.subscriptions.push(disposable);

      // Score current value immediately on attach
      if (scm.inputBox.value) {
        scoreAndUpdate(scm.inputBox.value);
      }
    }
  }

  refreshScmListeners();

  // When new SCM providers register (e.g. workspace folder added)
  // onDidChangeInputBox is not in @types/vscode but exists at runtime in some versions
  const scmAny = vscode.scm as any;
  if (typeof scmAny.onDidChangeInputBox === 'function') {
    context.subscriptions.push(
      scmAny.onDidChangeInputBox((inputBox: vscode.SourceControlInputBox) => {
        const d = attachToInputBox(inputBox);
        inputBoxListeners.push(d);
        context.subscriptions.push(d);
        logger.info('CommitScorer attached to new SCM input box');
      }),
    );
  }

  // ── Hook 2: COMMIT_EDITMSG text document (fallback / git commit --verbose) ─

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      const doc = event.document;
      if (!isCommitEditmsgDoc(doc)) { return; }

      const text = doc.getText();
      // Strip comment lines (lines starting with #)
      const stripped = text
        .split('\n')
        .filter(l => !l.startsWith('#'))
        .join('\n')
        .trim();

      debouncedScore(stripped);
    }),
  );

  // Score COMMIT_EDITMSG if it's already open
  for (const doc of vscode.workspace.textDocuments) {
    if (isCommitEditmsgDoc(doc)) {
      const stripped = doc.getText()
        .split('\n')
        .filter(l => !l.startsWith('#'))
        .join('\n')
        .trim();
      scoreAndUpdate(stripped);
    }
  }

  // ── Hook 3: Configuration changes (hot-reload) ────────────────────────────

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('commitScorer')) {
        logger.info('CommitScorer config changed — re-scoring');
        if (currentMessage) {
          scoreAndUpdate(currentMessage);
        }
      }
    }),
  );

  // ── Command: Show Quick Fix ───────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand(SHOW_QUICK_FIX_COMMAND, async () => {
      if (!lastResult) {
        vscode.window.showInformationMessage(
          'CommitScorer: Start typing a commit message to receive feedback.',
        );
        return;
      }

      const newMessage = await showQuickFixPicker(lastResult, currentMessage);
      if (newMessage !== undefined) {
        // Apply the fix back to all active SCM input boxes
        applyMessageToScm(newMessage);
        // Re-score immediately
        scoreAndUpdate(newMessage);
      }
    }),
  );

  // ── Command: Toggle ───────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand(TOGGLE_COMMAND, async () => {
      const cfg = getConfig();
      const newValue = !cfg.enabled;
      await vscode.workspace.getConfiguration('commitScorer').update(
        'enabled',
        newValue,
        vscode.ConfigurationTarget.Global,
      );
      vscode.window.showInformationMessage(
        `CommitScorer is now ${newValue ? 'enabled' : 'disabled'}.`,
      );
      if (!newValue) {
        statusBar.hide();
        clearAllDecorations();
      } else if (currentMessage) {
        scoreAndUpdate(currentMessage);
      }
    }),
  );

  // ── Command: Show Score Report ────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('commitScorer.showReport', () => {
      if (!lastResult) {
        vscode.window.showInformationMessage('No commit message has been scored yet.');
        return;
      }
      showScoreReport(lastResult, currentMessage);
    }),
  );

  logger.info('CommitScorer registered');

  // ── Inline decoration helpers ─────────────────────────────────────────────

  function clearAllDecorations(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      if (isCommitEditmsgDoc(editor.document)) {
        editor.setDecorations(decorationTypes.green, []);
        editor.setDecorations(decorationTypes.yellow, []);
        editor.setDecorations(decorationTypes.red, []);
      }
    }
  }
}

// ─── Decoration for COMMIT_EDITMSG ───────────────────────────────────────────

function updateCommitEditmsgDecoration(
  result: ScoreResult,
  decorationTypes: { green: vscode.TextEditorDecorationType; yellow: vscode.TextEditorDecorationType; red: vscode.TextEditorDecorationType },
): void {
  const editors = vscode.window.visibleTextEditors.filter(e => isCommitEditmsgDoc(e.document));
  if (editors.length === 0) { return; }

  for (const editor of editors) {
    // Clear all tiers first
    editor.setDecorations(decorationTypes.green, []);
    editor.setDecorations(decorationTypes.yellow, []);
    editor.setDecorations(decorationTypes.red, []);

    if (result.isEmpty) { continue; }

    // Place decoration at end of first non-comment line
    const lines = editor.document.getText().split('\n');
    let firstContentLine = 0;
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].startsWith('#')) {
        firstContentLine = i;
        break;
      }
    }

    const lineText = editor.document.lineAt(firstContentLine).text;
    const endChar = lineText.length;
    const range = new vscode.Range(firstContentLine, endChar, firstContentLine, endChar);

    const hint = buildDecorationText(result);
    const decoration: vscode.DecorationOptions = {
      range,
      renderOptions: {
        after: {
          contentText: hint,
        },
      },
    };

    editor.setDecorations(decorationTypes[result.tier], [decoration]);
  }
}

function buildDecorationText(result: ScoreResult): string {
  const score = result.score.total;
  const parts: string[] = [`  ${score}/100`];

  if (result.suggestions.length > 0) {
    // Show first suggestion label, truncated
    const first = result.suggestions[0].label;
    parts.push(first.length > 40 ? first.slice(0, 37) + '…' : first);
  } else if (score >= 80) {
    parts.push('✓ Good commit message');
  }

  return parts.join('  ·  ');
}

// ─── SCM helpers ─────────────────────────────────────────────────────────────

/**
 * VS Code doesn't expose `vscode.scm.inputBoxes` directly.
 * We access all registered source controls via the internal API.
 * Fall back gracefully if the API changes.
 */
function getAllSourceControls(): vscode.SourceControl[] {
  try {
    // `vscode.scm` exposes `inputBox` (singular) for the "active" one in older API
    // For multi-root workspaces we iterate workspace folders
    const controls: vscode.SourceControl[] = [];
    // The recommended pattern: store when created. Since we can't enumerate,
    // we use a workaround via the extension's own scm creation or listen for changes.
    // In practice, the primary inputBox is accessible:
    if ((vscode.scm as any).inputBox) {
      // Old API (VS Code < 1.84) — single input box
      controls.push({ inputBox: (vscode.scm as any).inputBox } as any);
    }
    return controls;
  } catch {
    return [];
  }
}

function applyMessageToScm(message: string): void {
  try {
    // Apply to all visible SCM input boxes we can reach
    const scmInputBox: any = (vscode.scm as any).inputBox;
    if (scmInputBox) {
      scmInputBox.value = message;
    }
  } catch (e) {
    logger.info('Could not write back to SCM input box: ' + e);
  }
}

function isCommitEditmsgDoc(doc: vscode.TextDocument): boolean {
  return (
    doc.fileName.endsWith('COMMIT_EDITMSG') ||
    doc.fileName.endsWith('MERGE_MSG') ||
    doc.languageId === 'git-commit'
  );
}

// ─── Score report webview ────────────────────────────────────────────────────

function showScoreReport(result: ScoreResult, message: string): void {
  const panel = vscode.window.createWebviewPanel(
    'commitScorerReport',
    'Commit Score Report',
    vscode.ViewColumn.Beside,
    { enableScripts: false },
  );

  const { score, parsed, suggestions, tier } = result;
  const tierColor = tier === 'green' ? '#4caf50' : tier === 'yellow' ? '#ff9800' : '#f44336';

  const suggestionRows = suggestions
    .map(s => `<tr><td>${escHtml(s.label)}</td><td>${escHtml(s.detail)}</td></tr>`)
    .join('');

  panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Commit Score Report</title>
  <style>
    :root { --bg: #1e1e1e; --fg: #d4d4d4; --card: #252526; --border: #3c3c3c; --accent: ${tierColor}; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--fg); font-family: 'Segoe UI', system-ui, sans-serif; padding: 24px; line-height: 1.6; }
    h1 { font-size: 1.4rem; margin-bottom: 4px; color: var(--accent); }
    .score-badge { display: inline-block; font-size: 2.5rem; font-weight: 700; color: var(--accent); margin: 12px 0; }
    .message-box { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 12px 16px; font-family: monospace; white-space: pre-wrap; word-break: break-all; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border); }
    th { color: #888; font-size: 0.78rem; text-transform: uppercase; letter-spacing: .05em; }
    tr:last-child td { border-bottom: none; }
    .bar-wrap { background: var(--border); border-radius: 3px; height: 6px; width: 120px; display: inline-block; vertical-align: middle; }
    .bar-fill { height: 6px; border-radius: 3px; background: var(--accent); }
    h2 { font-size: 1rem; margin: 20px 0 8px; color: #888; text-transform: uppercase; letter-spacing: .06em; }
    .empty { color: #555; font-style: italic; }
    .parsed-pill { display: inline-block; background: var(--card); border: 1px solid var(--border); border-radius: 4px; padding: 2px 8px; font-family: monospace; font-size: 0.85rem; margin: 2px; }
  </style>
</head>
<body>
  <h1>Commit Scorer Report</h1>
  <div class="score-badge">${score.total}<span style="font-size:1rem;color:#888">/100</span></div>

  <h2>Message</h2>
  <div class="message-box">${escHtml(message || '(empty)')}</div>

  ${parsed.isConventional ? `
  <h2>Parsed</h2>
  <p>
    ${parsed.type ? `<span class="parsed-pill">type: ${escHtml(parsed.type)}</span>` : ''}
    ${parsed.scope ? `<span class="parsed-pill">scope: ${escHtml(parsed.scope)}</span>` : ''}
    ${parsed.breaking ? '<span class="parsed-pill">BREAKING CHANGE</span>' : ''}
    ${parsed.subject ? `<span class="parsed-pill">subject: ${escHtml(parsed.subject.slice(0, 60))}</span>` : ''}
  </p>` : ''}

  <h2>Breakdown</h2>
  <table>
    <thead><tr><th>Dimension</th><th>Score</th><th>Max</th><th></th></tr></thead>
    <tbody>
      ${scoreRow('Format', score.format, 40)}
      ${scoreRow('Length', score.length, 20)}
      ${scoreRow('Clarity', score.clarity, 20)}
      ${scoreRow('Scope', score.scope, 20)}
    </tbody>
  </table>

  <h2>Suggestions</h2>
  ${suggestions.length === 0
    ? '<p class="empty">No suggestions — commit message looks good!</p>'
    : `<table><thead><tr><th>Fix</th><th>Detail</th></tr></thead><tbody>${suggestionRows}</tbody></table>`
  }
</body>
</html>`;

  function scoreRow(label: string, val: number, max: number): string {
    const pct = Math.round((val / max) * 100);
    return `<tr>
      <td>${label}</td>
      <td>${val}</td>
      <td style="color:#555">${max}</td>
      <td><span class="bar-wrap"><span class="bar-fill" style="width:${pct}%"></span></span></td>
    </tr>`;
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
