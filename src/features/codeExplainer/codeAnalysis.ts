import * as vscode from "vscode"
import { createLogger } from "../../utils/logger"
import { runStaticAnalysis, getTopContributors } from "./codeAlgorithms"
import { Explanation, StaticAnalysisResult, AIEnhancement, CombinedMetrics, Insight } from "./codeExplainerTypes"

const logger = createLogger("Dev Toolkit");

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2: AI ENHANCEMENT (FIXED)
// ─────────────────────────────────────────────────────────────────────────────

async function enhanceWithAI(
  staticRes: StaticAnalysisResult,
  code: string,
  lang: string
): Promise<AIEnhancement | null> {
  // Guard: vscode.lm must exist and support selectChatModels
  if (!vscode.lm || typeof vscode.lm.selectChatModels !== "function") {
    logger.info("vscode.lm API not available in this VS Code version.");
    return null;
  }

  try {
    // Try preferred models in order
    const modelFamilies = ["gpt-4.1", "gpt-4o", "gpt-4", "claude-3-5-sonnet", "gemini-1.5-pro"];
    let models: readonly vscode.LanguageModelChat[] = [];

    for (const family of modelFamilies) {
      try {
        models = await vscode.lm.selectChatModels({ vendor: "copilot", family });
        if (models?.length) break;
      } catch { /* try next */ }
    }

    // Fallback: any available model
    if (!models?.length) {
      try { models = await vscode.lm.selectChatModels({}); } catch { /* none */ }
    }

    if (!models?.length) {
      logger.info("No language models available for AI enhancement.");
      return null;
    }

    const model = models[0];
    logger.info(`Using AI model: ${model.name || model.id || "unknown"}`);

    const context = [
      `Language: ${lang}`,
      `Complexity: ${staticRes.metrics.complexity} (cyclomatic: ${staticRes.metrics.cyclomatic})`,
      `Cognitive complexity: ${staticRes.metrics.cognitiveComplexity}`,
      `Patterns: ${staticRes.patterns.slice(0, 6).join(", ")}`,
      `Code smells: ${staticRes.metrics.codeSmells}`,
      `Insights: ${staticRes.insights.slice(0, 5).map(i => i.message).join("; ")}`
    ].join("\n");

    // Truncate code to stay within token limits
    const truncatedCode = code.length > 3000 ? code.slice(0, 3000) + "\n// ... (truncated)" : code;

    const systemPrompt = `You are an expert code analysis assistant. Based on the static analysis context and code provided, generate exactly this JSON object and nothing else (no markdown, no explanation):
{
  "standard": "A concise technical explanation in 3-5 sentences covering what the code does, its structure, patterns, and any concerns.",
  "beginner": "A friendly explanation in 4-6 sentences using simple everyday analogies. Avoid jargon.",
  "details": "A technical breakdown with bullet points covering: purpose, key structures, complexity notes, and improvement suggestions."
}`;

    const userPrompt = `Static Analysis:\n${context}\n\nCode (${lang}):\n\`\`\`\n${truncatedCode}\n\`\`\``;

    const messages = [
      vscode.LanguageModelChatMessage.User(systemPrompt),
      vscode.LanguageModelChatMessage.User(userPrompt)
    ];

    const cancellation = new vscode.CancellationTokenSource();
    const timeoutHandle = setTimeout(() => cancellation.cancel(), 30000); // 30s timeout

    let fullText = "";
    try {
      const response = await model.sendRequest(
        messages,
        { justification: "Generating AI-enhanced code explanation for Dev Toolkit" },
        cancellation.token
      );

      for await (const chunk of response.stream) {
        // Handle both old and new stream chunk formats
        if (typeof chunk === "string") {
          fullText += chunk;
        } else if (chunk && typeof (chunk as { value?: string }).value === "string") {
          fullText += (chunk as { value: string }).value;
        } else if (chunk instanceof vscode.LanguageModelTextPart) {
          fullText += chunk.value;
        }
      }
    } finally {
      clearTimeout(timeoutHandle);
      cancellation.dispose();
    }

    if (!fullText.trim()) {
      logger.warn("AI returned empty response.");
      return null;
    }

    // Parse JSON — strip markdown fences if present
    let parsed: { standard?: string; beginner?: string; details?: string } | null = null;
    try {
      const clean = fullText.replace(/```(?:json)?\n?/g, "").trim();
      const jsonMatch = clean.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      logger.warn("Failed to parse AI JSON response", String(parseErr));
      logger.debug("Raw AI response:", fullText.slice(0, 200));
      return null;
    }

    if (!parsed) return null;

    const isGoodAI = (text: string | undefined, minLength = 40): text is string =>
      typeof text === "string" && text.trim().length >= minLength;

    // Validate and return
    if (!isGoodAI(parsed.standard) && !isGoodAI(parsed.beginner)) {
      logger.warn("AI response did not meet quality threshold.");
      return null;
    }

    return {
      standard: isGoodAI(parsed.standard) ? parsed.standard.trim() : staticRes.standardSummary,
      beginner: isGoodAI(parsed.beginner) ? parsed.beginner.trim() : staticRes.beginnerSummary,
      details: isGoodAI(parsed.details, 20) ? parsed.details.trim() : staticRes.detailsText
    };

  } catch (err) {
    if (err instanceof Error) {
      // Don't log cancellation errors as warnings
      if (err.message.includes("cancelled") || err.message.includes("canceled")) {
        logger.info("AI enhancement cancelled.");
      } else {
        logger.warn("AI enhancement failed", err.message);
      }
    }
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PIPELINE ORCHESTRATOR
// ─────────────────────────────────────────────────────────────────────────────

type ProgressCallback = (progress: number, step: string) => void;

export async function runMultiAlgorithmAnalysis(
  code: string,
  languageId: string,
  useAI: boolean,
  onProgress?: ProgressCallback
): Promise<Explanation> {
  const step = (p: number, s: string) => onProgress?.(p, s);

  // Input validation
  if (!code || code.trim().length === 0) {
    throw new Error("No code provided for analysis.");
  }

  // STEP 1: Static analysis (40 algorithms)
  const staticResult = await runStaticAnalysis(code, languageId, step);

  // STEP 2: Optional AI enhancement
  let aiResult: AIEnhancement | null = null;
  let aiStatus = "Static analysis only.";
  let aiModelName = "";

  if (useAI) {
    step(97, "Enhancing with AI...");
    aiResult = await enhanceWithAI(staticResult, code, languageId);
    if (aiResult) {
      aiStatus = "AI-enhanced analysis complete.";
    } else {
      aiStatus = "AI unavailable — GitHub Copilot may not be connected.";
    }
  } else {
    aiStatus = "AI disabled in settings.";
  }

  step(100, aiResult ? "AI Enhancement Complete" : "Static Analysis Complete");

  const finalStandard = aiResult?.standard || staticResult.standardSummary;
  const finalBeginner = aiResult?.beginner || staticResult.beginnerSummary;
  const finalDetails = aiResult?.details || staticResult.detailsText;

  const rawMarkdown = generateMarkdownExport(
    finalStandard, finalBeginner, finalDetails,
    staticResult.metrics, staticResult.patterns,
    staticResult.insights, languageId, !!aiResult
  );

  return {
    standard: finalStandard,
    beginner: finalBeginner,
    details: finalDetails,
    metrics: staticResult.metrics,
    patterns: staticResult.patterns,
    insights: staticResult.insights,
    mode: "standard",
    language: languageId,
    algorithmsUsed: staticResult.signals.length + (aiResult ? 1 : 0),
    topContributors: getTopContributors(staticResult.signals),
    signals: staticResult.signals,
    aiEnhanced: !!aiResult,
    aiStatus: aiStatus + (aiModelName ? ` (${aiModelName})` : ""),
    rawMarkdown
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERATORS
// ─────────────────────────────────────────────────────────────────────────────

function generateMarkdownExport(
  standard: string,
  beginner: string,
  details: string,
  metrics: CombinedMetrics,
  patterns: string[],
  insights: Insight[],
  lang: string,
  aiUsed: boolean
): string {
  const lines = [
    `# Code Explanation — ${lang.toUpperCase()}`,
    ``,
    `> **Generated by Dev Toolkit** on ${new Date().toLocaleString()}`,
    `> Analysis: ${aiUsed ? "AI-Enhanced + 20-Algorithm Static Pipeline" : "20-Algorithm Static Analysis"}`,
    ``,
    `---`,
    ``,
    `## 📊 Metrics`,
    ``,
    `| Metric | Value | Rating |`,
    `|--------|-------|--------|`,
    `| Complexity | ${metrics.complexity.toUpperCase()} | ${metrics.complexity === "low" ? "✅" : metrics.complexity === "medium" ? "⚠️" : "❌"} |`,
    `| Cyclomatic | ${metrics.cyclomatic} | ${metrics.cyclomatic <= 5 ? "✅" : metrics.cyclomatic <= 10 ? "⚠️" : "❌"} |`,
    `| Cognitive Complexity | ${metrics.cognitiveComplexity} | ${metrics.cognitiveComplexity <= 10 ? "✅" : metrics.cognitiveComplexity <= 20 ? "⚠️" : "❌"} |`,
    `| Nesting Depth | ${metrics.nestingDepth} | ${metrics.nestingDepth <= 2 ? "✅" : metrics.nestingDepth <= 4 ? "⚠️" : "❌"} |`,
    `| Lines of Code | ${metrics.linesOfCode} | — |`,
    `| Maintainability Index | ${metrics.maintainabilityIndex}/100 | ${metrics.maintainabilityIndex >= 65 ? "✅" : metrics.maintainabilityIndex >= 40 ? "⚠️" : "❌"} |`,
    `| Halstead Volume | ${metrics.halsteadVolume} | — |`,
    `| Comment Density | ${metrics.commentDensity}% | — |`,
    `| Code Smells | ${metrics.codeSmells} | ${metrics.codeSmells === 0 ? "✅" : metrics.codeSmells <= 3 ? "⚠️" : "❌"} |`,
    ``,
    `---`,
    ``,
    `## Detected Patterns`,
    ``,
    ...patterns.map(p => `- ${p}`),
    ``,
    `---`,
    ``,
    `## Standard Explanation`,
    ``,
    standard,
    ``,
    `---`,
    ``,
    `## Beginner Explanation`,
    ``,
    beginner,
    ``,
    `---`,
    ``,
    `## Technical Details`,
    ``,
    details,
    ``,
    `---`,
    ``,
    `## Key Insights`,
    ``,
    ...insights.map(i => {
      const emoji = { positive: "✅", warning: "⚠️", suggestion: "💡", info: "ℹ️" }[i.type] || "•";
      const detail = i.detail ? ` _(${i.detail})_` : "";
      const link = i.learnMore ? ` [Learn more](${i.learnMore})` : "";
      return `- ${emoji} **[${i.priority.toUpperCase()}]** ${i.message}${detail}${link}`;
    }),
    ``,
    `---`,
    ``,
    `*Generated by [Dev Toolkit](https://marketplace.visualstudio.com/) Code Explainer* ( will be added after the deployment of the project)`
  ];

  return lines.join("\n");
}
