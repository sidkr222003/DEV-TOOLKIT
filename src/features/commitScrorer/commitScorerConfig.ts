/**
 * CommitScorer – Configuration
 *
 * Centralised access to all `commitScorer.*` settings.
 * Uses VS Code's configuration API; values are re-read on each call
 * so changes take effect without reloading the extension.
 */

import * as vscode from 'vscode';

export const CONFIG_SECTION = 'commitScorer';

export interface CommitScorerConfig {
  enabled: boolean;
  conventionalOnly: boolean;
  bannedWords: string[];
  greenThreshold: number;
  yellowThreshold: number;
  showStatusBar: boolean;
  showInlineDecoration: boolean;
  showQuickFixes: boolean;
}

const DEFAULTS: CommitScorerConfig = {
  enabled: true,
  conventionalOnly: false,
  bannedWords: ['wip', 'changes', 'update', 'updates', 'fix', 'fixes', 'misc', 'stuff', 'things'],
  greenThreshold: 80,
  yellowThreshold: 50,
  showStatusBar: true,
  showInlineDecoration: true,
  showQuickFixes: true,
};

export function getConfig(): CommitScorerConfig {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    enabled: cfg.get<boolean>('enabled', DEFAULTS.enabled),
    conventionalOnly: cfg.get<boolean>('conventionalOnly', DEFAULTS.conventionalOnly),
    bannedWords: cfg.get<string[]>('bannedWords', DEFAULTS.bannedWords),
    greenThreshold: cfg.get<number>('greenThreshold', DEFAULTS.greenThreshold),
    yellowThreshold: cfg.get<number>('yellowThreshold', DEFAULTS.yellowThreshold),
    showStatusBar: cfg.get<boolean>('showStatusBar', DEFAULTS.showStatusBar),
    showInlineDecoration: cfg.get<boolean>('showInlineDecoration', DEFAULTS.showInlineDecoration),
    showQuickFixes: cfg.get<boolean>('showQuickFixes', DEFAULTS.showQuickFixes),
  };
}
