/**
 * PasteShield
 *
 * Intercepts clipboard paste operations in the editor, scans the content
 * for secrets / risky patterns, and surfaces a non-blocking warning with
 * actionable choices before the text is committed to the document.
 *
 * Architecture:
 *  • Overrides the default `editor.action.clipboardPasteAction` keybinding
 *    via a dedicated `pasteShield.paste` command (registered in package.json).
 *  • If no issues are found → delegates to the original paste immediately.
 *  • If issues are found → shows a warning with "Paste Anyway / Cancel / Details".
 *  • Inline decorations mark the insertion point for warned pastes (optional).
 *  • CodeLens providers display warnings above detected secrets in open files.
 *
 * Exceptions:
 *  • .env and .env.local files are excluded from paste interception entirely.
 *    (These files are intentionally used to store secrets locally.)
 *  • CodeLens scanning still runs on all file types including .env files.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { scanContent, DetectionResult, Severity } from './patternDetector';
import { getConfig, meetsSeverityThreshold, CONFIG_SECTION } from './pasteShieldConfig';
import { createLogger } from '../../utils/logger';
import { debounce } from '../../utils/debounce';

const logger = createLogger('PasteShield');

// ─── Constants ───────────────────────────────────────────────────────────────

const COMMAND_ID = 'pasteShield.paste';
const TOGGLE_COMMAND_ID = 'pasteShield.toggle';
const SHOW_REPORT_COMMAND_ID = 'pasteShield.showLastReport';
const CODELENS_FIX_COMMAND_ID = 'pasteShield.codeLensFix';
const CODELENS_IGNORE_COMMAND_ID = 'pasteShield.codeLensIgnore';
const CODELENS_DETAILS_COMMAND_ID = 'pasteShield.codeLensDetails';

/**
 * File names (basename only, case-insensitive) that are excluded from
 * paste interception. Secrets in these files are intentional and managed
 * locally — PasteShield should not block pasting into them.
 *
 * NOTE: CodeLens still scans these files so existing secrets are surfaced.
 */
const PASTE_EXCLUDED_FILENAMES = new Set(['.env', '.env.local']);

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: '#ff4444',
  high:     '#ff8800',
  medium:   '#ffcc00',
  low:      '#44aaff',
};

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Returns true if the document's filename is in the paste-exclusion list.
 * Comparison is case-insensitive so `.ENV` also matches on Windows.
 */
function isPasteExcludedFile(document: vscode.TextDocument): boolean {
  const basename = path.basename(document.fileName).toLowerCase();
  for (const excluded of PASTE_EXCLUDED_FILENAMES) {
    if (basename === excluded.toLowerCase()) {
      return true;
    }
  }
  return false;
}

// ─── Decoration Types ─────────────────────────────────────────────────────────

function createDecorationTypes(): {
  critical: vscode.TextEditorDecorationType;
  high: vscode.TextEditorDecorationType;
  medium: vscode.TextEditorDecorationType;
  low: vscode.TextEditorDecorationType;
} {
  const make = (color: string, glyph: string) =>
    vscode.window.createTextEditorDecorationType({
      after: {
        contentText: ` ${glyph} PasteShield`,
        color: new vscode.ThemeColor('editorWarning.foreground'),
        fontStyle: 'italic',
        margin: '0 0 0 8px',
      },
      overviewRulerColor: color,
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      light: { border: `1px dashed ${color}` },
      dark:  { border: `1px dashed ${color}` },
    });

  return {
    critical: make(SEVERITY_COLORS.critical, '$(error)'),
    high:     make(SEVERITY_COLORS.high,     '$(shield)'),
    medium:   make(SEVERITY_COLORS.medium,   '$(warning)'),
    low:      make(SEVERITY_COLORS.low,      '$(info)'),
  };
}

// ─── CodeLens Provider ────────────────────────────────────────────────────────

/**
 * One CodeLens "block" per detected issue — renders above the matched line
 * with three lenses side-by-side: severity badge | fix action | ignore action.
 */
class PasteShieldCodeLensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  /** Called by refresh() when a document is re-scanned. */
  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken,
  ): vscode.CodeLens[] {
    const config = getConfig();
    if (!config.enabled) {
      return [];
    }

    const text = document.getText();
    const detections = scanContent(text, {
      ignoredPatterns: config.ignoredPatterns,
    });

    const filtered = detections.filter(d =>
      meetsSeverityThreshold(d.severity, config.minimumSeverity),
    );

    const lenses: vscode.CodeLens[] = [];

    for (const det of filtered) {
      // det.line is 1-indexed; vscode lines are 0-indexed
      const lineIndex = (det.line ?? 1) - 1;
      const lineCount = document.lineCount;
      const safeLine = Math.min(Math.max(lineIndex, 0), lineCount - 1);
      const lineLength = document.lineAt(safeLine).text.length;
      const range = new vscode.Range(safeLine, 0, safeLine, lineLength);

      const severityIcon = severityToIcon(det.severity);
      const severityLabel = det.severity.toUpperCase();

      // Lens 1 — severity + type badge (non-interactive label)
      lenses.push(
        new vscode.CodeLens(range, {
          title: `${severityIcon} PasteShield [${severityLabel}]: ${det.type}`,
          command: CODELENS_DETAILS_COMMAND_ID,
          arguments: [[det]],
          tooltip: det.description,
        }),
      );

      // Lens 2 — "View details" action
      lenses.push(
        new vscode.CodeLens(range, {
          title: '$(info) View Details',
          command: CODELENS_DETAILS_COMMAND_ID,
          arguments: [[det]],
          tooltip: 'Open the full security report for this detection',
        }),
      );

      // Lens 3 — "Ignore this pattern" action
      lenses.push(
        new vscode.CodeLens(range, {
          title: '$(mute) Ignore Pattern',
          command: CODELENS_IGNORE_COMMAND_ID,
          arguments: [det.type],
          tooltip: `Add "${det.type}" to pasteShield.ignoredPatterns`,
        }),
      );
    }

    return lenses;
  }
}

function severityToIcon(severity: Severity): string {
  switch (severity) {
    case 'critical': return '$(error)';
    case 'high':     return '$(shield)';
    case 'medium':   return '$(warning)';
    case 'low':      return '$(info)';
  }
}

// ─── State ────────────────────────────────────────────────────────────────────

let decorationTypes: ReturnType<typeof createDecorationTypes> | undefined;
let lastReport: DetectionResult[] = [];
let statusBarItem: vscode.StatusBarItem | undefined;
let activeDecorations: Array<{
  editor: vscode.TextEditor;
  type: vscode.TextEditorDecorationType;
}> = [];
let codeLensProvider: PasteShieldCodeLensProvider | undefined;

/**
 * Debounced so rapid editor-tab switching (e.g. Ctrl+Tab held down) doesn't
 * thrash the visible-editors Set rebuild on every intermediate event.
 */
const debouncedPruneDecorations = debounce(pruneStaleDecorations, 150);

/**
 * Debounced CodeLens refresh — avoids hammering the provider on every keystroke.
 */
const debouncedRefreshCodeLens = debounce(() => {
  codeLensProvider?.refresh();
}, 500);

// ─── Activation ───────────────────────────────────────────────────────────────

export function registerPasteShield(context: vscode.ExtensionContext): void {
  decorationTypes  = createDecorationTypes();
  codeLensProvider = new PasteShieldCodeLensProvider();

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    90,
  );
  updateStatusBar(true);

  // ── CodeLens registration ──────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: 'file' }, // all files
      codeLensProvider,
    ),
  );

  // CodeLens commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      CODELENS_DETAILS_COMMAND_ID,
      async (detections: DetectionResult[]) => {
        lastReport = detections;
        await showDetailsPanel(detections);
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      CODELENS_IGNORE_COMMAND_ID,
      async (patternName: string) => {
        await addToIgnoredPatterns(patternName);
        codeLensProvider?.refresh();
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      CODELENS_FIX_COMMAND_ID,
      async (_patternName: string) => {
        // Placeholder: open settings or guide user to rotate the credential
        await vscode.commands.executeCommand(
          'workbench.action.openSettings',
          'pasteShield.ignoredPatterns',
        );
      },
    ),
  );

  // ── Paste intercept command ────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_ID, handlePaste),
  );

  // Toggle on/off from status bar or command palette
  context.subscriptions.push(
    vscode.commands.registerCommand(TOGGLE_COMMAND_ID, togglePasteShield),
  );

  // Show last scan report
  context.subscriptions.push(
    vscode.commands.registerCommand(SHOW_REPORT_COMMAND_ID, showLastReport),
  );

  // React to config changes — refresh CodeLens so ignored patterns apply live
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration(CONFIG_SECTION)) {
        updateStatusBar(getConfig().enabled);
        codeLensProvider?.refresh();
      }
    }),
  );

  // Re-scan open documents when they change (debounced)
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(() => {
      debouncedRefreshCodeLens();
    }),
  );

  // Refresh CodeLens when a new editor becomes active
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      debouncedRefreshCodeLens();
    }),
  );

  // Clear decorations when editor closes
  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(() => {
      debouncedPruneDecorations();
    }),
  );

  context.subscriptions.push(statusBarItem);
  Object.values(decorationTypes).forEach(dt => context.subscriptions.push(dt));

  statusBarItem.show();
  logger.info('PasteShield: activated');
}

// ─── Core Paste Handler ────────────────────────────────────────────────────────

async function handlePaste(): Promise<void> {
  const config = getConfig();

  // Fast path: feature disabled → delegate immediately
  if (!config.enabled) {
    await executeFallbackPaste();
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    await executeFallbackPaste();
    return;
  }

  // ── .env / .env.local exception ───────────────────────────────────────────
  // These files are intentionally used to store secrets locally. PasteShield
  // should not intercept paste operations in them. CodeLens still runs on
  // existing file content to surface any secrets that are already present.
  if (isPasteExcludedFile(editor.document)) {
    logger.info(
      `PasteShield: paste interception skipped for excluded file "${path.basename(editor.document.fileName)}"`,
    );
    await executeFallbackPaste();
    return;
  }

  // Respect ignored languages
  if (config.ignoredLanguages.includes(editor.document.languageId)) {
    await executeFallbackPaste();
    return;
  }

  // Read clipboard
  let clipboardText: string;
  try {
    clipboardText = await vscode.env.clipboard.readText();
  } catch (err) {
    logger.error('PasteShield: clipboard read failed', err);
    await executeFallbackPaste();
    return;
  }

  if (!clipboardText || clipboardText.trim().length === 0) {
    await executeFallbackPaste();
    return;
  }

  // Scan asynchronously to avoid blocking the UI thread
  const detections = await runScanAsync(clipboardText, {
    ignoredPatterns: config.ignoredPatterns,
  });

  // Filter by minimum severity
  const filtered = detections.filter(d =>
    meetsSeverityThreshold(d.severity, config.minimumSeverity),
  );

  if (filtered.length === 0) {
    await executeFallbackPaste();
    return;
  }

  // Persist report for "Show Details" / status bar command
  lastReport = filtered;

  // Build warning
  const topSeverity = filtered[0].severity; // already sorted by severity

  const summary = buildSummaryMessage(filtered);

  const choice = await vscode.window.showWarningMessage(
    `PasteShield: ${summary}`,
    'Paste Anyway',
    'Show Details',
    'Cancel',
  );

  if (choice === 'Paste Anyway') {
    const insertRange = await insertText(editor, clipboardText);
    if (insertRange && config.showInlineDecorations) {
      applyDecoration(editor, insertRange, topSeverity);
    }
    // Trigger a CodeLens refresh so the pasted secrets are highlighted
    debouncedRefreshCodeLens();
    logger.info(`PasteShield: user bypassed warning (${filtered.length} issue(s))`);
    return;
  }

  if (choice === 'Show Details') {
    await showDetailsPanel(filtered);
    // Re-prompt with modal for a deliberate second confirmation
    const finalChoice = await vscode.window.showWarningMessage(
      `PasteShield — ${filtered.length} issue(s) found. Paste anyway?`,
      { modal: true },
      'Paste Anyway',
    );
    if (finalChoice === 'Paste Anyway') {
      const insertRange = await insertText(editor, clipboardText);
      if (insertRange && config.showInlineDecorations) {
        applyDecoration(editor, insertRange, topSeverity);
      }
      debouncedRefreshCodeLens();
      logger.info('PasteShield: user bypassed warning after details review');
    } else {
      logger.info('PasteShield: paste cancelled after details review');
    }
    return;
  }

  // 'Cancel' or dismissed → do nothing
  logger.info('PasteShield: paste cancelled by user');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Runs the scan in a microtask yield so it doesn't block the event loop.
 */
function runScanAsync(
  text: string,
  options: { ignoredPatterns: string[] },
): Promise<DetectionResult[]> {
  return new Promise(resolve => {
    // setTimeout(0) yields to allow any pending UI updates first
    setTimeout(() => {
      const start = performance.now();
      const results = scanContent(text, options);
      const elapsed = performance.now() - start;
      if (elapsed > 50) {
        logger.warn(`PasteShield: scan took ${elapsed.toFixed(1)} ms (> 50 ms threshold)`);
      }
      resolve(results);
    }, 0);
  });
}

/**
 * Delegates to VS Code's built-in paste via edit builder.
 */
async function executeFallbackPaste(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const text = await vscode.env.clipboard.readText();
  if (!text) {
    return;
  }

  await editor.edit(editBuilder => {
    for (const selection of editor.selections) {
      if (selection.isEmpty) {
        editBuilder.insert(selection.active, text);
      } else {
        editBuilder.replace(selection, text);
      }
    }
  });
}

/**
 * Inserts `text` at the current cursor position(s), replacing selections.
 * Returns the range of the first insertion for decoration purposes.
 */
async function insertText(
  editor: vscode.TextEditor,
  text: string,
): Promise<vscode.Range | undefined> {
  let firstRange: vscode.Range | undefined;

  const success = await editor.edit(editBuilder => {
    for (const selection of editor.selections) {
      if (selection.isEmpty) {
        editBuilder.insert(selection.active, text);
        if (!firstRange) {
          firstRange = new vscode.Range(selection.active, selection.active);
        }
      } else {
        editBuilder.replace(selection, text);
        if (!firstRange) {
          firstRange = selection;
        }
      }
    }
  });

  if (!success) {
    logger.error('PasteShield: edit failed — document may be read-only');
    vscode.window.showErrorMessage(
      'PasteShield: Could not paste — document may be read-only.',
    );
  }

  return firstRange;
}

/**
 * Builds a short human-readable summary for the warning message.
 */
function buildSummaryMessage(detections: DetectionResult[]): string {
  const uniqueTypes = [...new Set(detections.map(d => d.type))];
  const countStr = detections.length === 1 ? '1 issue' : `${detections.length} issues`;

  if (uniqueTypes.length === 1) {
    return `${detections[0].description} (${countStr})`;
  }

  const preview = uniqueTypes.slice(0, 2).join(', ');
  const more    = uniqueTypes.length > 2 ? ` +${uniqueTypes.length - 2} more` : '';
  return `${countStr} detected — ${preview}${more}`;
}

/**
 * Opens a side panel with a formatted security report.
 */
async function showDetailsPanel(detections: DetectionResult[]): Promise<void> {
  const lines: string[] = [
    `Date: ${new Date().toLocaleString()}`,
    `Generated by DevToolkit's PasteShield`,
    '╔══════════════════════════════════════════════════════╗',
    '║          PasteShield — Security Scan Report          ║',
    '╚══════════════════════════════════════════════════════╝',
    '',
    `Issues found: ${detections.length}`,
    '',
    '─'.repeat(56),
    '',
  ];

  for (const [i, det] of detections.entries()) {
    const sevLabel  = det.severity.toUpperCase().padEnd(8);
    const lineInfo  = det.line !== undefined ? ` (line ${det.line})` : '';
    const catLabel  = det.category ? ` [${det.category}]` : '';
    lines.push(`[${i + 1}] ${sevLabel} — ${det.type}${catLabel}${lineInfo}`);
    lines.push(`     ${det.description}`);
    lines.push(`     Match: ${det.match}`);
    lines.push('');
  }

  lines.push('─'.repeat(56));
  lines.push('');
  lines.push('To suppress a pattern, add its name to:');
  lines.push('  pasteShield.ignoredPatterns  (settings.json)');
  lines.push('');
  lines.push('Files excluded from paste interception:');
  lines.push('  .env, .env.local');

  const doc = await vscode.workspace.openTextDocument({
    content: lines.join('\n'),
    language: 'plaintext',
  });

  await vscode.window.showTextDocument(doc, {
    preview:       true,
    viewColumn:    vscode.ViewColumn.Beside,
    preserveFocus: false,
  });
}

/**
 * Adds `patternName` to the `pasteShield.ignoredPatterns` setting globally.
 */
async function addToIgnoredPatterns(patternName: string): Promise<void> {
  const config  = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const current = config.get<string[]>('ignoredPatterns', []);

  if (current.includes(patternName)) {
    vscode.window.showInformationMessage(
      `PasteShield: "${patternName}" is already ignored.`,
    );
    return;
  }

  await config.update(
    'ignoredPatterns',
    [...current, patternName],
    vscode.ConfigurationTarget.Global,
  );

  vscode.window.showInformationMessage(
    `PasteShield: Pattern "${patternName}" added to ignored list.`,
  );
}

/**
 * Applies a short-lived inline decoration at `range` in `editor`.
 * Auto-clears after 10 seconds.
 */
function applyDecoration(
  editor: vscode.TextEditor,
  range: vscode.Range,
  severity: Severity,
): void {
  if (!decorationTypes) {
    return;
  }
  const dt = decorationTypes[severity];
  editor.setDecorations(dt, [range]);
  activeDecorations.push({ editor, type: dt });

  setTimeout(() => {
    editor.setDecorations(dt, []);
    activeDecorations = activeDecorations.filter(
      d => !(d.editor === editor && d.type === dt),
    );
  }, 10_000);
}

/**
 * Removes decorations for editors that are no longer visible.
 */
function pruneStaleDecorations(): void {
  const visibleEditors = new Set(vscode.window.visibleTextEditors);
  activeDecorations = activeDecorations.filter(({ editor, type }) => {
    if (!visibleEditors.has(editor)) {
      editor.setDecorations(type, []);
      return false;
    }
    return true;
  });
}

// ─── Toggle & Status Bar ──────────────────────────────────────────────────────

function updateStatusBar(enabled: boolean): void {
  if (!statusBarItem) {
    return;
  }
  if (enabled) {
    statusBarItem.text            = '$(shield)';
    statusBarItem.tooltip         = 'PasteShield is active — click to toggle or view last report';
    statusBarItem.color           = undefined;
    statusBarItem.backgroundColor = undefined;
  } else {
    statusBarItem.text            = '$(shield)';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    statusBarItem.tooltip         = 'PasteShield is disabled — click to enable';
    statusBarItem.color           = new vscode.ThemeColor('statusBarItem.warningForeground');
  }
  statusBarItem.command = TOGGLE_COMMAND_ID;
}

async function togglePasteShield(): Promise<void> {
  const config  = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const current = config.get<boolean>('enabled', true);
  await config.update('enabled', !current, vscode.ConfigurationTarget.Global);
  const next = !current;
  updateStatusBar(next);
  // Refresh CodeLens to hide/show lenses based on the new enabled state
  codeLensProvider?.refresh();
  vscode.window.withProgress(
    {
      location:    vscode.ProgressLocation.Notification,
      title:       `PasteShield ${next ? 'enabled' : 'disabled'}.`,
      cancellable: false,
    },
    () => new Promise<void>(resolve => setTimeout(resolve, 2500)),
  );
}

async function showLastReport(): Promise<void> {
  if (lastReport.length === 0) {
    vscode.window.withProgress(
      {
        location:    vscode.ProgressLocation.Notification,
        title:       'PasteShield: No scan report available yet.',
        cancellable: false,
      },
      () => new Promise<void>(resolve => setTimeout(resolve, 2500)),
    );
    return;
  }
  await showDetailsPanel(lastReport);
}