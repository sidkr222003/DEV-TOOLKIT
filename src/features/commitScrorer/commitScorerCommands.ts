/**
 * CommitScorer – Quick Fix Commands
 *
 * Provides a quick-pick palette of actionable fixes for the current commit
 * message. Commands are registered here and exposed via the status bar click.
 */

import * as vscode from 'vscode';
import type { ScoreResult, CommitSuggestion } from './commitScorerEngine';
import { CONVENTIONAL_TYPES } from './commitScorerEngine';

export const SHOW_QUICK_FIX_COMMAND = 'commitScorer.showQuickFix';
export const CONVERT_COMMAND = 'commitScorer.convertToConventional';
export const ADD_SCOPE_COMMAND = 'commitScorer.addScope';
export const TOGGLE_COMMAND = 'commitScorer.toggle';

interface QuickFixItem extends vscode.QuickPickItem {
  suggestion?: CommitSuggestion;
  special?: 'score' | 'toggle' | 'divider';
}

/**
 * Shows a QuickPick with actionable suggestions.
 * Returns the new commit message string if an action was applied, or undefined.
 */
export async function showQuickFixPicker(
  result: ScoreResult,
  currentMessage: string,
): Promise<string | undefined> {
  if (result.isEmpty) {
    vscode.window.showInformationMessage('Start typing a commit message to get scoring feedback.');
    return undefined;
  }

  const items: QuickFixItem[] = [];

  // Score summary at top (non-selectable)
  items.push({
    label: `$(graph) Score: ${result.score.total}/100`,
    description: `Format ${result.score.format}/40  ·  Length ${result.score.length}/20  ·  Clarity ${result.score.clarity}/20  ·  Scope ${result.score.scope}/20`,
    kind: vscode.QuickPickItemKind.Separator,
    special: 'score',
  });

  if (result.suggestions.length > 0) {
    items.push({
      label: 'Suggestions',
      kind: vscode.QuickPickItemKind.Separator,
    });

    for (const s of result.suggestions) {
      items.push({
        label: actionIcon(s.action) + ' ' + s.label,
        description: s.detail,
        suggestion: s,
      });
    }
  } else {
    items.push({
      label: '$(pass-filled) Looks great!',
      description: 'Your commit message passes all checks.',
    });
  }

  items.push({ label: 'Options', kind: vscode.QuickPickItemKind.Separator });
  items.push({
    label: '$(symbol-misc) Toggle Commit Scorer',
    description: 'Enable / disable commit scoring',
    special: 'toggle',
  });

  const picked = await vscode.window.showQuickPick(items, {
    title: 'Commit Scorer — Quick Fixes',
    placeHolder: 'Select a suggestion to apply or dismiss',
    matchOnDescription: true,
  });

  if (!picked || !picked.suggestion) {
    if (picked?.special === 'toggle') {
      await vscode.commands.executeCommand(TOGGLE_COMMAND);
    }
    return undefined;
  }

  return applyFix(picked.suggestion, currentMessage, result);
}

async function applyFix(
  suggestion: CommitSuggestion,
  current: string,
  result: ScoreResult,
): Promise<string | undefined> {
  switch (suggestion.action) {
    case 'convertToConventional': {
      if (suggestion.value) {
        const lines = current.split('\n');
        lines[0] = suggestion.value;
        return lines.join('\n');
      }
      // Let user pick type interactively
      return pickTypeAndBuild(current, result);
    }

    case 'addScope': {
      if (suggestion.value) {
        const lines = current.split('\n');
        lines[0] = suggestion.value;
        return lines.join('\n');
      }
      return pickScopeAndBuild(current, result);
    }

    case 'shortenSubject': {
      const lines = current.split('\n');
      const first = lines[0];
      // Trim at 72, breaking on last space
      if (first.length > 72) {
        const trimmed = first.slice(0, 72);
        const lastSpace = trimmed.lastIndexOf(' ');
        lines[0] = lastSpace > 40 ? trimmed.slice(0, lastSpace) : trimmed;
      }
      return lines.join('\n');
    }

    case 'removeTrailingPeriod': {
      const lines = current.split('\n');
      if (lines[0].endsWith('.')) {
        lines[0] = lines[0].slice(0, -1);
      }
      return lines.join('\n');
    }

    case 'removeBannedWords': {
      vscode.window.showInformationMessage(
        'Replace vague words with a specific description of the change.',
      );
      return undefined;
    }

    default:
      return undefined;
  }
}

async function pickTypeAndBuild(current: string, result: ScoreResult): Promise<string | undefined> {
  const typeItems: vscode.QuickPickItem[] = CONVENTIONAL_TYPES.map(t => ({
    label: t,
    description: typeDescription(t),
  }));

  const picked = await vscode.window.showQuickPick(typeItems, {
    title: 'Select Commit Type',
    placeHolder: 'Choose the type that best describes this change',
  });

  if (!picked) { return undefined; }

  const lines = current.split('\n');
  const subject = result.parsed.subject || lines[0];
  const scope = result.parsed.scope ? `(${result.parsed.scope})` : '';
  lines[0] = `${picked.label}${scope}: ${subject}`;
  return lines.join('\n');
}

async function pickScopeAndBuild(current: string, result: ScoreResult): Promise<string | undefined> {
  const scopeInput = await vscode.window.showInputBox({
    title: 'Add Scope',
    prompt: 'Enter a short scope identifier (e.g. auth, ui, api)',
    placeHolder: 'scope',
    validateInput(value) {
      if (!value.trim()) { return 'Scope cannot be empty'; }
      if (/[\s()]/.test(value)) { return 'Scope should not contain spaces or parentheses'; }
      return undefined;
    },
  });

  if (!scopeInput) { return undefined; }

  const lines = current.split('\n');
  const { type, breaking, subject } = result.parsed;
  if (type && subject) {
    const bang = breaking ? '!' : '';
    lines[0] = `${type}(${scopeInput})${bang}: ${subject}`;
  }
  return lines.join('\n');
}

function actionIcon(action: CommitSuggestion['action']): string {
  switch (action) {
    case 'convertToConventional': return '$(symbol-enum)';
    case 'addScope': return '$(bracket)';
    case 'shortenSubject': return '$(fold)';
    case 'removeTrailingPeriod': return '$(remove)';
    case 'removeBannedWords': return '$(edit)';
    default: return '$(info)';
  }
}

function typeDescription(type: string): string {
  const map: Record<string, string> = {
    feat: 'A new feature',
    fix: 'A bug fix',
    chore: 'Build process or tooling changes',
    refactor: 'Code change that neither fixes a bug nor adds a feature',
    docs: 'Documentation only changes',
    test: 'Adding missing tests or correcting existing tests',
    perf: 'A code change that improves performance',
    style: 'Changes that do not affect the meaning of the code',
    ci: 'Changes to CI configuration files and scripts',
    build: 'Changes that affect the build system or external dependencies',
    revert: 'Reverts a previous commit',
  };
  return map[type] ?? '';
}
