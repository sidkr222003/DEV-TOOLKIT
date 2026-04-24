/**
 * PasteShield — Configuration
 * Typed wrappers around VS Code workspace configuration.
 */

import * as vscode from 'vscode';
import { PATTERN_DEFINITIONS } from './patternDetector';


export const CONFIG_SECTION = 'pasteShield';

export interface PasteShieldConfig {
  /** Master on/off switch. */
  enabled: boolean;
  /** Pattern names (matching PatternDefinition.name) to skip during scanning. */
  ignoredPatterns: string[];
  /** Whether to show inline decorations at the paste point after a warned paste. */
  showInlineDecorations: boolean;
  /** Minimum severity level that triggers a warning. */
  minimumSeverity: 'critical' | 'high' | 'medium' | 'low';
  /** Skip files whose language IDs are in this list (e.g. ["plaintext", "markdown"]). */
  ignoredLanguages: string[];
}

export function getConfig(): PasteShieldConfig {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    enabled: cfg.get<boolean>('enabled', true),
    ignoredPatterns: cfg.get<string[]>('ignoredPatterns', []),
    showInlineDecorations: cfg.get<boolean>('showInlineDecorations', true),
    minimumSeverity: cfg.get<'critical' | 'high' | 'medium' | 'low'>('minimumSeverity', 'medium'),
    ignoredLanguages: cfg.get<string[]>('ignoredLanguages', []),
  };
}

/** All available pattern names — used to populate settings IntelliSense. */
export const ALL_PATTERN_NAMES: string[] = PATTERN_DEFINITIONS.map(p => p.name);

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function meetsSeverityThreshold(
  detectedSeverity: string,
  threshold: string,
): boolean {
  return (SEVERITY_ORDER[detectedSeverity] ?? 99) <= (SEVERITY_ORDER[threshold] ?? 99);
}
