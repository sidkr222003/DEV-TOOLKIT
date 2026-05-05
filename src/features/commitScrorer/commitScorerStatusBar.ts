/**
 * CommitScorer – Status Bar Item
 *
 * Displays the current commit score in the VS Code status bar.
 * Clicking the item opens the quick-fix picker.
 */

import * as vscode from 'vscode';
import type { ScoreResult } from './commitScorerEngine';

const COMMAND_ID = 'commitScorer.showQuickFix';

const TIER_ICONS: Record<'green' | 'yellow' | 'red', string> = {
  green: '$(pass-filled)',
  yellow: '$(warning)',
  red: '$(error)',
};

const TIER_TOOLTIP: Record<'green' | 'yellow' | 'red', string> = {
  green: 'Great commit message! Click for details.',
  yellow: 'Commit message could be improved. Click for suggestions.',
  red: 'Commit message needs work. Click for quick fixes.',
};

export class CommitScorerStatusBar {
  private readonly item: vscode.StatusBarItem;

  constructor(context: vscode.ExtensionContext) {
    // Priority 200 — appears left of most items but right of critical ones
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 200);
    this.item.command = COMMAND_ID;
    this.item.name = 'Commit Scorer';
    context.subscriptions.push(this.item);
  }

  update(result: ScoreResult): void {
    if (result.isEmpty) {
      this.hide();
      return;
    }

    const icon = TIER_ICONS[result.tier];
    const score = result.score.total;
    this.item.text = `${icon} Commit: ${score}/100`;
    this.item.tooltip = new vscode.MarkdownString(
      `**${TIER_TOOLTIP[result.tier]}**\n\n` +
      `| Dimension | Score |\n|---|---|\n` +
      `| Format | ${result.score.format}/40 |\n` +
      `| Length | ${result.score.length}/20 |\n` +
      `| Clarity | ${result.score.clarity}/20 |\n` +
      `| Scope | ${result.score.scope}/20 |\n` +
      `| **Total** | **${score}/100** |`,
      true,
    );
    this.item.tooltip.isTrusted = true;

    // Color
    switch (result.tier) {
      case 'green':
        this.item.color = new vscode.ThemeColor('charts.green');
        this.item.backgroundColor = undefined;
        break;
      case 'yellow':
        this.item.color = new vscode.ThemeColor('charts.yellow');
        this.item.backgroundColor = undefined;
        break;
      case 'red':
        this.item.color = undefined;
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        break;
    }

    this.item.show();
  }

  hide(): void {
    this.item.hide();
  }

  dispose(): void {
    this.item.dispose();
  }
}
