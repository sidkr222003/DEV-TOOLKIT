/**
 * CommitScorer – Scoring Engine
 *
 * Pure, synchronous scoring logic. No VS Code API dependencies — fully testable.
 *
 * Scoring breakdown (0–100):
 *   Format   40 pts  — Conventional Commits prefix (type[!][(scope)]: subject)
 *   Length   20 pts  — Subject line 10–72 chars
 *   Clarity  20 pts  — No banned-word-only content; imperative mood; no trailing period
 *   Scope    20 pts  — Includes (scope) when a multi-component message is detected
 */

export type ConventionalType =
  | 'feat'
  | 'fix'
  | 'chore'
  | 'refactor'
  | 'docs'
  | 'test'
  | 'perf'
  | 'style'
  | 'ci'
  | 'build'
  | 'revert';

export const CONVENTIONAL_TYPES: ConventionalType[] = [
  'feat', 'fix', 'chore', 'refactor', 'docs', 'test', 'perf',
  'style', 'ci', 'build', 'revert',
];

export interface ScoreBreakdown {
  format: number;   // 0–40
  length: number;   // 0–20
  clarity: number;  // 0–20
  scope: number;    // 0–20
  total: number;    // 0–100
}

export interface ParsedCommit {
  type: string | null;
  scope: string | null;
  breaking: boolean;
  subject: string;
  body: string;
  isConventional: boolean;
}

export interface CommitSuggestion {
  id: string;
  label: string;
  detail: string;
  action: 'convertToConventional' | 'addScope' | 'shortenSubject' | 'removeTrailingPeriod' | 'removeBannedWords' | 'info';
  value?: string;
}

export interface ScoreResult {
  score: ScoreBreakdown;
  parsed: ParsedCommit;
  suggestions: CommitSuggestion[];
  label: string;           // e.g. "Score: 78/100"
  tier: 'green' | 'yellow' | 'red';
  isEmpty: boolean;
}

// ─── Regex ───────────────────────────────────────────────────────────────────

/**
 * Matches: type[(scope)][!]: subject
 * Groups: 1=type, 2=scope (optional, without parens), 3=breaking !, 4=subject
 */
const CONVENTIONAL_REGEX =
  /^([a-z]+)(?:\(([^)]*)\))?(!)?\s*:\s*(.+)$/i;

const DEFAULT_BANNED_WORDS = ['wip', 'changes', 'update', 'updates', 'fix', 'fixes', 'misc', 'stuff', 'things'];

// ─── Parser ──────────────────────────────────────────────────────────────────

export function parseCommit(raw: string): ParsedCommit {
  const lines = raw.split('\n');
  const firstLine = lines[0].trim();
  const body = lines.slice(1).join('\n').trim();

  const match = CONVENTIONAL_REGEX.exec(firstLine);
  if (!match) {
    return { type: null, scope: null, breaking: false, subject: firstLine, body, isConventional: false };
  }

  const [, type, scope, bang, subject] = match;
  const isKnownType = CONVENTIONAL_TYPES.includes(type.toLowerCase() as ConventionalType);

  return {
    type: type.toLowerCase(),
    scope: scope?.trim() || null,
    breaking: bang === '!',
    subject: subject.trim(),
    body,
    isConventional: isKnownType,
  };
}

// ─── Scorer ──────────────────────────────────────────────────────────────────

export function scoreCommit(
  raw: string,
  bannedWords: string[] = DEFAULT_BANNED_WORDS,
  conventionalOnly = false,
): ScoreResult {
  const trimmed = raw.trim();

  if (!trimmed) {
    return emptyResult();
  }

  const parsed = parseCommit(trimmed);
  const subject = parsed.isConventional ? parsed.subject : parsed.subject;
  const fullFirstLine = trimmed.split('\n')[0].trim();
  const subjectForLength = fullFirstLine;

  // ── Format (0–40) ──────────────────────────────────────────────────────────
  let format = 0;
  if (parsed.isConventional) {
    format = 40;
  } else if (!conventionalOnly && parsed.type && !CONVENTIONAL_TYPES.includes(parsed.type as ConventionalType)) {
    // Has colon structure but wrong type — partial credit
    format = 10;
  } else if (!conventionalOnly) {
    // No conventional format — 0
    format = 0;
  }

  // ── Length (0–20) ──────────────────────────────────────────────────────────
  const len = subjectForLength.length;
  let length = 0;
  if (len >= 10 && len <= 72) {
    length = 20;
  } else if (len < 10 && len > 0) {
    // Too short
    length = Math.round((len / 10) * 10);
  } else if (len > 72) {
    // Over — deduct proportionally, min 0
    const over = len - 72;
    length = Math.max(0, 20 - Math.round((over / 30) * 20));
  }

  // ── Clarity (0–20) ─────────────────────────────────────────────────────────
  let clarity = 20;
  const lowerSubject = subject.toLowerCase().trim();
  const subjectWords = lowerSubject.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);

  // Banned words check — if the entire subject (or all meaningful words) are banned words
  const normalizedBanned = bannedWords.map(b => b.toLowerCase());
  const nonBannedWords = subjectWords.filter(w => !normalizedBanned.includes(w));
  if (subjectWords.length > 0 && nonBannedWords.length === 0) {
    clarity -= 20; // Sole content is banned words
  } else if (nonBannedWords.length < subjectWords.length && subjectWords.length <= 3) {
    clarity -= 10; // Mostly banned words in a short message
  }

  // Trailing period
  if (subject.endsWith('.')) {
    clarity -= 5;
  }

  // All caps (shouting)
  if (subject === subject.toUpperCase() && subject.length > 3) {
    clarity -= 5;
  }

  clarity = Math.max(0, clarity);

  // ── Scope (0–20) ───────────────────────────────────────────────────────────
  let scope = 0;
  if (parsed.isConventional) {
    if (parsed.scope) {
      scope = 20; // Explicitly provided
    } else {
      // Heuristic: if the subject references multiple areas or is feat/fix, suggest scope
      const multiAreaKeywords = /\b(and|also|plus|both)\b/i.test(subject);
      if (multiAreaKeywords) {
        scope = 5; // Partial — might benefit from scope
      } else {
        scope = 15; // Single area, scope optional but not penalised heavily
      }
    }
  } else if (!conventionalOnly) {
    scope = 10; // Can't evaluate scope without conventional format
  }

  const total = Math.min(100, format + length + clarity + scope);

  // ── Suggestions ────────────────────────────────────────────────────────────
  const suggestions: CommitSuggestion[] = [];

  if (!parsed.isConventional) {
    suggestions.push({
      id: 'convertToConventional',
      label: 'Convert to Conventional Commits',
      detail: `Prefix with type: e.g. "feat: ${subject.slice(0, 50)}"`,
      action: 'convertToConventional',
      value: buildConventionalSuggestion(subject),
    });
  }

  if (parsed.isConventional && !parsed.scope) {
    suggestions.push({
      id: 'addScope',
      label: 'Add a scope',
      detail: 'e.g. feat(auth): … or fix(ui): …',
      action: 'addScope',
      value: buildScopeAddedSuggestion(parsed),
    });
  }

  if (len > 72) {
    suggestions.push({
      id: 'shortenSubject',
      label: 'Shorten subject line',
      detail: `Currently ${len} chars — keep under 72`,
      action: 'shortenSubject',
    });
  }

  if (len < 10 && len > 0) {
    suggestions.push({
      id: 'lengthen',
      label: 'Be more descriptive',
      detail: 'Subject line is too short — aim for 10–72 characters',
      action: 'info',
    });
  }

  if (subject.endsWith('.')) {
    suggestions.push({
      id: 'removeTrailingPeriod',
      label: 'Remove trailing period',
      detail: 'Commit subject lines should not end with a period',
      action: 'removeTrailingPeriod',
    });
  }

  if (subjectWords.length > 0 && nonBannedWords.length === 0) {
    suggestions.push({
      id: 'removeBannedWords',
      label: 'Avoid vague words',
      detail: `"${subject}" is too vague — be specific about what changed`,
      action: 'removeBannedWords',
    });
  }

  const tier = total >= 80 ? 'green' : total >= 50 ? 'yellow' : 'red';

  return {
    score: { format, length, clarity, scope, total },
    parsed,
    suggestions,
    label: buildLabel({ format, length, clarity, scope, total }, suggestions),
    tier,
    isEmpty: false,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emptyResult(): ScoreResult {
  return {
    score: { format: 0, length: 0, clarity: 0, scope: 0, total: 0 },
    parsed: { type: null, scope: null, breaking: false, subject: '', body: '', isConventional: false },
    suggestions: [],
    label: '',
    tier: 'red',
    isEmpty: true,
  };
}

function buildLabel(score: ScoreBreakdown, suggestions: CommitSuggestion[]): string {
  const parts: string[] = [`Score: ${score.total}/100`];
  if (suggestions.length > 0) {
    parts.push(suggestions[0].label);
  }
  return parts.join(' · ');
}

function buildConventionalSuggestion(subject: string): string {
  // Guess type from subject keywords
  const lower = subject.toLowerCase();
  let type = 'chore';
  if (/add|creat|implement|introduc|new|support/.test(lower)) { type = 'feat'; }
  else if (/fix|bug|broken|crash|error|issue|resolv/.test(lower)) { type = 'fix'; }
  else if (/refactor|restructur|reorganiz|clean|simplif/.test(lower)) { type = 'refactor'; }
  else if (/doc|readme|comment|changelog/.test(lower)) { type = 'docs'; }
  else if (/test|spec|jest|coverage/.test(lower)) { type = 'test'; }
  else if (/perf|optim|speed|fast|slow/.test(lower)) { type = 'perf'; }
  else if (/style|format|lint|prettier/.test(lower)) { type = 'style'; }
  else if (/ci|pipeline|workflow|action|deploy/.test(lower)) { type = 'ci'; }
  else if (/build|package|dependency|npm|yarn/.test(lower)) { type = 'build'; }
  else if (/revert/.test(lower)) { type = 'revert'; }
  return `${type}: ${subject}`;
}

function buildScopeAddedSuggestion(parsed: ParsedCommit): string {
  const scopePlaceholder = inferScope(parsed.subject);
  const breaking = parsed.breaking ? '!' : '';
  return `${parsed.type}(${scopePlaceholder})${breaking}: ${parsed.subject}`;
}

function inferScope(subject: string): string {
  const lower = subject.toLowerCase();
  if (/auth|login|logout|token|session|user/.test(lower)) { return 'auth'; }
  if (/ui|modal|button|form|input|style|css|layout/.test(lower)) { return 'ui'; }
  if (/api|endpoint|route|http|rest|graphql/.test(lower)) { return 'api'; }
  if (/db|database|schema|migration|model/.test(lower)) { return 'db'; }
  if (/config|setting|env|option/.test(lower)) { return 'config'; }
  if (/test|spec/.test(lower)) { return 'test'; }
  if (/doc|readme/.test(lower)) { return 'docs'; }
  if (/ci|pipeline|workflow|action/.test(lower)) { return 'ci'; }
  if (/build|webpack|vite|package/.test(lower)) { return 'build'; }
  return 'scope';
}
