// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type ExplanationMode = "standard" | "beginner";

export type Insight = {
  type: "positive" | "warning" | "suggestion" | "info";
  message: string;
  detail?: string;
  priority: "low" | "medium" | "high";
  learnMore?: string;
};

export type CombinedMetrics = {
  complexity: "low" | "medium" | "high";
  cyclomatic: number;
  nestingDepth: number;
  linesOfCode: number;
  maintainabilityIndex: number;
  // New metrics
  cognitiveComplexity: number;
  halsteadVolume: number;
  commentDensity: number;
  duplicateRisk: "low" | "medium" | "high";
  codeSmells: number;
};

export type AnalysisSignal = {
  algorithm: string;
  confidence: number;
  summary: string;
  details: string[];
  tags: string[];
  insights: Insight[];
  metrics?: CombinedMetrics;
};

export type StaticAnalysisResult = {
  metrics: CombinedMetrics;
  patterns: string[];
  insights: Insight[];
  signals: AnalysisSignal[];
  standardSummary: string;
  beginnerSummary: string;
  detailsText: string;
};

export type AIEnhancement = {
  standard: string;
  beginner: string;
  details: string;
};

export type Explanation = {
  standard: string;
  beginner: string;
  details: string;
  metrics: CombinedMetrics;
  patterns: string[];
  insights: Insight[];
  mode: ExplanationMode;
  language: string;
  algorithmsUsed: number;
  topContributors: string[];
  signals: AnalysisSignal[];
  aiEnhanced: boolean;
  aiStatus?: string;
  rawMarkdown: string;
};

export type ViewMessage =
  | { type: "setMode"; mode: ExplanationMode }
  | { type: "refreshSelection" }
  | { type: "copySection"; section: "summary" | "details" | "insights" }
  | { type: "expandDetails" }
  | { type: "exportMarkdown" }
  | { type: "openLearnMore"; url: string };

export type ViewPayload =
  | { type: "loading"; progress: number; step: string }
  | { type: "empty" }
  | { type: "error"; message: string }
  | { type: "update"; explanation: Explanation };

