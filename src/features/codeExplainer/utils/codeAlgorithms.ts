import * as ts from "typescript"
import { AnalysisSignal, Insight, StaticAnalysisResult, CombinedMetrics } from "./codeExplainerTypes"

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1: STATIC ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────

export async function runStaticAnalysis(
  code: string,
  languageId: string,
  onProgress: (p: number, s: string) => void
): Promise<StaticAnalysisResult> {
  const step = (p: number, s: string) => onProgress(p, s);

  step(2,  "Parsing AST structure...");              const ast  = analyzeAST(code);
  step(4,  "Building control flow...");               const cfg  = analyzeControlFlow(code);
  step(6,  "Tracking data flow...");                  const df   = analyzeDataFlow(code);
  step(8,  "Calculating complexity metrics...");      const cm   = calculateComplexityMetrics(code);
  step(10, "Computing cognitive complexity...");       const cog  = analyzeCognitiveComplexity(code);
  step(12, "Recognizing patterns...");                const pat  = detectPatterns(code);
  step(14, "Labeling semantic roles...");             const sem  = labelSemanticRoles(code);
  step(16, "Mapping dependencies...");                const dep  = buildDependencyGraph(code);
  step(18, "Inferring types...");                     const typ  = inferTypes(code, languageId);
  step(20, "Extracting documentation...");            const doc  = extractDocumentation(code);
  step(22, "Analyzing naming conventions...");        const nam  = analyzeNamingConventions(code);
  step(24, "Scanning security risks...");             const sec  = scanSecurityHeuristics(code);
  step(26, "Checking performance hints...");          const perf = generatePerformanceHints(code);
  step(28, "Detecting framework context...");         const fw   = detectFrameworkContext(code);
  step(30, "Assessing testability...");               const test = assessTestability(code);
  step(32, "Computing Halstead metrics...");          const hal  = analyzeHalstead(code);
  step(34, "Detecting code smells...");               const smells = detectCodeSmells(code);
  step(36, "Analyzing promise/async flow...");        const prom = analyzePromiseFlow(code);
  step(38, "Scanning regex usage.f..");                const rx   = analyzeRegexUsage(code);
  step(40, "Checking comment quality...");            const cq   = analyzeCommentQuality(code);
  step(42, "Reviewing side-effects...");             const side = analyzeSideEffects(code);
  step(44, "Validating error handling...");          const errHand = analyzeErrorHandling(code);
  step(46, "Scoring readability...");                 const read = analyzeReadability(code);
  step(48, "Checking naming consistency...");         const nameCons = detectNamingConsistency(code);
  step(50, "Auditing dependencies...");               const depAudit = auditDependencies(code);
  step(52, "Evaluating immutability...");            const immut = analyzeImmutability(code);
  step(54, "Checking modern syntax...");             const modern = analyzeModernSyntax(code);
  step(56, "Reviewing style consistency...");         const style = checkStyleConsistency(code);
  step(58, "Scanning injection risks...");            const secInj = analyzeSecurityInjection(code);
  step(60, "Assessing concurrency safety...");       const concurrency = assessConcurrencySafety(code);
  step(62, "Inspecting resource management...");       const resource = inspectResourceManagement(code);
  step(64, "Detecting duplicate patterns...");         const duplicates = detectDuplicatePatterns(code);
  step(66, "Validating data flows...");               const validation = analyzeValidationPatterns(code);
  step(68, "Reviewing logging patterns...");          const logging = analyzeLoggingPatterns(code);
  step(70, "Examining exception handling...");        const exceptionPatterns = analyzeExceptionPatterns(code);
  step(72, "Assessing test signal quality...");       const testSignals = analyzeTestSignals(code);
  step(74, "Auditing configuration usage...");        const config = auditConfigUsage(code);
  step(76, "Verifying build safety...");              const build = evaluateBuildSafety(code);
  step(78, "Inspecting lifecycle hooks...");          const lifecycle = inspectLifecycleHooks(code);
  step(80, "Detecting legacy API usage...");          const legacy = detectLegacyAPIUsage(code);

  step(82, "Synthesizing results...");
  return synthesizeStaticSignals([
    ast, cfg, df, cm, cog, pat, sem, dep, typ, doc, nam, sec, perf, fw, test, hal, smells, prom, rx, cq,
    side, errHand, read, nameCons, depAudit, immut, modern, style, secInj, concurrency, resource, duplicates,
    validation, logging, exceptionPatterns, testSignals, config, build, lifecycle, legacy
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// 20 ALGORITHMS
// ─────────────────────────────────────────────────────────────────────────────

// 1. AST Parser
function analyzeAST(code: string): AnalysisSignal {
  try {
    const source = ts.createSourceFile("snippet.ts", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const stmts = source.statements.filter(n => n.kind !== ts.SyntaxKind.EmptyStatement);
    if (!stmts.length) {
      return { algorithm: "AST Parser", confidence: 0.9, summary: "Empty or comment-only selection.", details: [], tags: ["empty"], insights: [] };
    }

    const sums: string[] = [], dets: string[] = [];
    const tags = new Set<string>();
    for (const s of stmts) {
      const r = visitASTNode(s, source);
      if (r) { sums.push(r.summary); dets.push(...r.details); r.tags.forEach(t => tags.add(t)); }
    }

    // Count node types
    let nodeCount = 0;
    const countNodes = (node: ts.Node) => { nodeCount++; ts.forEachChild(node, countNodes); };
    countNodes(source);

    dets.push(`AST nodes: ${nodeCount}`);
    dets.push(`Top-level statements: ${stmts.length}`);

    return {
      algorithm: "AST Parser",
      confidence: 0.95,
      summary: sums.length ? sums.join(". ") + "." : "Mixed procedural block.",
      details: dets,
      tags: Array.from(tags),
      insights: []
    };
  } catch {
    return {
      algorithm: "AST Parser",
      confidence: 0.3,
      summary: "AST parse failed; using fallback heuristics.",
      details: [],
      tags: ["parse-fallback"],
      insights: [{ type: "warning", message: "Code may contain syntax errors.", detail: "Parser could not build AST", priority: "medium" }]
    };
  }
}

function visitASTNode(node: ts.Node, src: ts.SourceFile): { summary: string; details: string[]; tags: string[] } | null {
  if (isFunctionLike(node)) {
    const n = (node as ts.FunctionLikeDeclaration & { name?: ts.Identifier }).name?.getText(src) || "anonymous";
    const p = (node as ts.FunctionLikeDeclaration).parameters.map(x => x.name.getText(src)).join(", ") || "none";
    const isAsync = (node as ts.FunctionLikeDeclaration).modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
    return {
      summary: `${isAsync ? "Async " : ""}function ${n}(${p})`,
      details: [`Declaration: ${isAsync ? "async " : ""}function '${n}' with params: ${p}`],
      tags: ["function", isAsync ? "async" : "sync"]
    };
  }
  if (ts.isVariableStatement(node)) {
    const names = node.declarationList.declarations.map(d => d.name.getText(src)).join(", ");
    const isConst = (node.declarationList.flags & ts.NodeFlags.Const) !== 0;
    return { summary: `${isConst ? "const" : "let/var"}: ${names}`, details: [`Variable declaration: ${names}`], tags: ["variable"] };
  }
  if (ts.isClassDeclaration(node)) {
    const heritage = node.heritageClauses?.map(h => h.getText(src)).join(", ") || "";
    return { summary: `Class: ${node.name?.text || "anon"}${heritage ? " " + heritage : ""}`, details: [`Class: ${node.name?.text || "anon"}`], tags: ["class", "oop"] };
  }
  if (ts.isInterfaceDeclaration(node)) return { summary: `Interface: ${node.name.text}`, details: [], tags: ["interface", "type"] };
  if (ts.isImportDeclaration(node)) {
    const mod = node.moduleSpecifier.getText(src).replace(/['"]/g, "");
    return { summary: `Import: ${mod}`, details: [`Import from '${mod}'`], tags: ["import", "dependency"] };
  }
  if (ts.isExportDeclaration(node)) return { summary: "Export statement", details: [], tags: ["export", "module"] };
  if (ts.isIfStatement(node) || ts.isSwitchStatement(node)) return { summary: "Conditional branch", details: [], tags: ["control-flow", "branch"] };
  if (ts.isForStatement(node) || ts.isWhileStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node)) return { summary: "Loop construct", details: [], tags: ["control-flow", "iteration"] };
  if (ts.isTryStatement(node)) return { summary: "Error handling block", details: [], tags: ["error-handling", "try-catch"] };
  if (ts.isTypeAliasDeclaration(node)) return { summary: `Type alias: ${node.name.text}`, details: [], tags: ["type", "alias"] };
  if (ts.isEnumDeclaration(node)) return { summary: `Enum: ${node.name.text}`, details: [], tags: ["enum", "type"] };
  return null;
}

function isFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node);
}

// 2. Control Flow
function analyzeControlFlow(code: string): AnalysisSignal {
  const br = (code.match(/\b(if|else\s+if|switch|case|catch|\?:|\|\||&&)\b/g) || []).length;
  const lo = (code.match(/\b(for|while|do)\b/g) || []).length;
  const ret = (code.match(/\breturn\b/g) || []).length;
  const throw_ = (code.match(/\bthrow\b/g) || []).length;
  const paths = 1 + br + lo;
  const insights: Insight[] = [];
  if (paths > 15) insights.push({ type: "warning", message: "Very high path count (>15) reduces testability significantly.", priority: "high", learnMore: "https://en.wikipedia.org/wiki/Cyclomatic_complexity" });
  else if (paths > 10) insights.push({ type: "warning", message: "High path count reduces testability.", priority: "medium" });
  if (ret > 5) insights.push({ type: "suggestion", message: "Multiple return points; consider early-return pattern.", priority: "low" });
  return {
    algorithm: "Control Flow",
    confidence: 0.85,
    summary: `~${paths} paths, ${br} branches, ${lo} loops, ${ret} returns.`,
    details: [`Branches: ${br}`, `Loops: ${lo}`, `Return statements: ${ret}`, `Throw statements: ${throw_}`, `Estimated paths: ${paths}`],
    tags: ["control-flow"],
    insights
  };
}

// 3. Data Flow
function analyzeDataFlow(code: string): AnalysisSignal {
  const defs = (code.match(/\b(const|let|var)\s+\w+/g) || []).length;
  const muts = (code.match(/\b\w+\s*[+\-*/%&|^]?=/g) || []).length - defs; // subtract initial defs
  const closureUse = (code.match(/\b(closure|bind|apply|call)\b/g) || []).length;
  const isPure = defs > 0 && muts <= 0;
  return {
    algorithm: "Data Flow",
    confidence: 0.75,
    summary: `${defs} defs, ~${Math.max(0, muts)} mutations (${isPure ? "pure" : "impure"}).`,
    details: [`Definitions: ${defs}`, `Mutations: ~${Math.max(0, muts)}`, `Closure indicators: ${closureUse}`, `Purity: ${isPure ? "Pure (no mutations)" : "Impure (has mutations)"}`],
    tags: ["data-flow", isPure ? "pure" : "side-effects"],
    insights: muts > 6 ? [{ type: "suggestion", message: "High mutation count; prefer immutable patterns.", priority: "low" }] : []
  };
}

// 4. Complexity Metrics
function calculateComplexityMetrics(code: string): AnalysisSignal & { metrics: CombinedMetrics } {
  const lines = code.split("\n").filter(l => l.trim() && !/^\s*\/\//.test(l) && !/^\s*\/\*/.test(l)).length;
  const branches = (code.match(/\b(if|else if|else|for|while|do|switch|case|catch|\?|&&|\|\|)\b/g) || []).length;
  const cyclo = 1 + branches;

  let depth = 0;
  let maxDepth = 0;
  const cleaned = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const char of cleaned) {
    if (char === "{") {
      depth += 1;
      maxDepth = Math.max(maxDepth, depth);
    } else if (char === "}") {
      depth = Math.max(0, depth - 1);
    }
  }

  const safeLines = Math.max(lines, 1);
  const mi = Math.max(0, Math.min(100, (171 - 5.2 * Math.log(Math.max(cyclo, 1)) - 0.23 * maxDepth - 16.2 * Math.log(safeLines)) / 1.71));
  const comp: "low" | "medium" | "high" = cyclo <= 7 && maxDepth <= 3 && lines <= 40
    ? "low"
    : cyclo <= 14 && maxDepth <= 5
      ? "medium"
      : "high";

  const metrics: Partial<CombinedMetrics> = {
    complexity: comp,
    cyclomatic: cyclo,
    nestingDepth: maxDepth,
    linesOfCode: lines,
    maintainabilityIndex: Math.round(mi)
  };

  return {
    algorithm: "Complexity",
    confidence: 0.95,
    summary: `${comp} complexity (cyclomatic: ${cyclo}, nesting: ${maxDepth}).`,
    details: [`Lines of code: ${lines}`, `Cyclomatic complexity: ${cyclo}`, `Max nesting depth: ${maxDepth}`, `Maintainability index: ${Math.round(mi)}/100`],
    tags: ["metrics", "complexity", comp],
    insights: comp === "high"
      ? [{ type: "warning", message: "Consider refactoring into smaller, focused functions.", priority: "high", learnMore: "https://refactoring.guru/refactoring" }]
      : [],
    metrics: metrics as CombinedMetrics
  };
}

// 5. Cognitive Complexity (NEW)
function analyzeCognitiveComplexity(code: string): AnalysisSignal {
  // Cognitive complexity adds score for nesting + control flow structures
  let score = 0;
  const lines = code.split("\n");
  let nestLevel = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    // Control flow adds nesting weight
    if (/^\s*(if|else if|for|while|do|switch)\b/.test(line)) {
      score += 1 + nestLevel;
      nestLevel++;
    } else if (/^\s*else\b/.test(line)) {
      score += 1;
    } else if (/^\s*(catch|finally)\b/.test(line)) {
      score += 1;
    } else if (/\&\&|\|\|/.test(trimmed)) {
      score += (trimmed.match(/\&\&|\|\|/g) || []).length;
    }
    // Track nesting via braces
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    nestLevel = Math.max(0, nestLevel + opens - closes);
  }

  const insights: Insight[] = [];
  if (score > 20) insights.push({ type: "warning", message: `Cognitive complexity score (${score}) is very high; this code is hard to reason about.`, priority: "high", learnMore: "https://www.sonarsource.com/docs/CognitiveComplexity.pdf" });
  else if (score > 10) insights.push({ type: "suggestion", message: `Cognitive complexity (${score}) is moderate. Consider simplification.`, priority: "medium" });
  else insights.push({ type: "positive", message: `Cognitive complexity (${score}) is low — code is readable.`, priority: "low" });

  return {
    algorithm: "Cognitive",
    confidence: 0.82,
    summary: `Cognitive complexity score: ${score}.`,
    details: [`Score: ${score}`, `Threshold low: <10`, `Threshold high: >20`, `Interpretation: ${score <= 10 ? "Easy to understand" : score <= 20 ? "Moderately complex" : "Hard to understand"}`],
    tags: ["cognitive", score <= 10 ? "readable" : score <= 20 ? "moderate" : "complex"],
    insights,
    metrics: { cognitiveComplexity: score } as any
  };
}

// 6. Pattern Detection
function detectPatterns(code: string): AnalysisSignal {
  const tags: string[] = [];
  const ins: Insight[] = [];
  const t = code.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");

  const add = (n: string) => { if (!tags.includes(n)) tags.push(n); };

  if (/\buseState\b|\buseEffect\b|\buseRef\b|\buseCallback\b|\buseMemo\b|\buseContext\b/.test(t)) {
    add("React Hooks");
    ins.push({ type: "info", message: "Follow React Hooks rules (no conditionals).", priority: "low", learnMore: "https://react.dev/reference/rules/rules-of-hooks" });
  }
  if (/export\s+default\s+function|const\s+\w+\s*=\s*\(\)\s*=>\s*(<[\w>]|React\.)/.test(t)) add("React Component");
  if (/\bapp\.(get|post|put|delete|patch)\b|\bRouter\(\)/.test(t)) add("Express Route");
  if (/\basync\s+function|\bawait\s/.test(t) && /fetch\b|axios|http|request/.test(t)) add("Async Data Fetch");
  if (/\btry\s*\{|catch\s*\(/.test(t)) add("Error Handling");
  if (/\bmap\b|\bfilter\b|\breduce\b|\bforEach\b|\bflatMap\b/.test(t)) add("Functional Array Ops");
  if (/\bnew\s+Promise\b|\bPromise\.(all|race|allSettled|any)\b/.test(t)) add("Promise Composition");
  if (/function\s*\*|yield\b/.test(t)) add("Generator");
  if (/\bObservable\b|\bSubject\b|\bpipe\b|\bof\b|\bfrom\b/.test(t) && /rxjs/.test(t)) add("RxJS / Reactive");
  if (/class\b.*\bimplements\b/.test(t) || /interface\b/.test(t)) add("OOP / Interface");
  if (/\bsingleton\b|\binstance\b/i.test(t)) add("Singleton Pattern");
  if (/dispatch\(|createSlice|useSelector|combineReducers/.test(t)) add("Redux Pattern");
  if (!tags.length) tags.push("Procedural");

  return {
    algorithm: "Patterns",
    confidence: 0.82,
    summary: `Detected: ${tags.join(", ")}.`,
    details: tags.map(p => `- ${p}`),
    tags,
    insights: ins
  };
}

// 7. Semantic Roles
function labelSemanticRoles(code: string): AnalysisSignal {
  const roles: string[] = [];
  if (/\breturn\b/.test(code)) roles.push("transformer");
  if (/validate|error|throw|assert/.test(code)) roles.push("validator");
  if (/render|JSX|<[\w>]|createElement/.test(code)) roles.push("renderer");
  if (/handle|on[A-Z]|callback|listener|emit/.test(code)) roles.push("event-handler");
  if (/fetch|axios|http|request|api/i.test(code)) roles.push("data-fetcher");
  if (/set\w+State|dispatch|store\./i.test(code)) roles.push("state-mutator");
  if (!roles.length) roles.push("general");
  return {
    algorithm: "Semantic Roles",
    confidence: 0.7,
    summary: `Semantic role(s): ${roles.join(", ")}.`,
    details: roles.map(r => `- ${r}`),
    tags: roles,
    insights: []
  };
}

// 8. Dependency Graph
function buildDependencyGraph(code: string): AnalysisSignal {
  const importMatches = code.match(/import\s+.*?from\s+['"](.+?)['"]/g) || [];
  const externalImports = importMatches.filter(i => !i.includes("from '.'") && !i.includes('from ".')).length;
  const localImports = importMatches.length - externalImports;
  const exports = (code.match(/export\s+(default\s+)?(const|function|class|type|interface|enum)/g) || []).length;
  const dynamicImports = (code.match(/import\s*\(/g) || []).length;
  const insights: Insight[] = [];
  if (externalImports > 7) insights.push({ type: "suggestion", message: "High external dependency count; consider consolidation.", priority: "low" });
  if (dynamicImports > 0) insights.push({ type: "info", message: `${dynamicImports} dynamic import(s) found — good for code splitting.`, priority: "low" });
  return {
    algorithm: "Dependencies",
    confidence: 0.9,
    summary: `${importMatches.length} imports (${externalImports} external, ${localImports} local), ${exports} exports.`,
    details: [`Total imports: ${importMatches.length}`, `External: ${externalImports}`, `Local: ${localImports}`, `Dynamic imports: ${dynamicImports}`, `Exports: ${exports}`],
    tags: ["dependencies", externalImports > 5 ? "high-coupling" : "low-coupling"],
    insights
  };
}

// 9. Type Inference
function inferTypes(code: string, lang: string): AnalysisSignal {
  if (!["typescript", "typescriptreact"].includes(lang)) {
    return { algorithm: "Types", confidence: 0.2, summary: "Non-TypeScript file; type analysis skipped.", details: [], tags: ["no-types"], insights: [{ type: "suggestion", message: "Consider TypeScript for stronger type safety.", priority: "low", learnMore: "https://www.typescriptlang.org/" }] };
  }
  const ann = (code.match(/:\s*[\w<>,\s\|&\[\]]+/g) || []).length;
  const generics = (code.match(/<[\w,\s]+>/g) || []).length;
  const anyUsage = (code.match(/:\s*any\b/g) || []).length;
  const assertNonNull = (code.match(/!/g) || []).length;
  const insights: Insight[] = [];
  if (anyUsage > 0) insights.push({ type: "warning", message: `${anyUsage} use(s) of 'any' type found — prefer stricter types.`, priority: "medium", learnMore: "https://www.typescriptlang.org/tsconfig#strict" });
  if (ann === 0) insights.push({ type: "suggestion", message: "Add type annotations for better safety and IDE support.", priority: "medium" });
  if (assertNonNull > 3) insights.push({ type: "suggestion", message: "Many non-null assertions (!); consider null checks instead.", priority: "low" });
  else if (assertNonNull > 0) insights.push({ type: "positive", message: `${ann} type annotations and ${generics} generics found — well-typed.`, priority: "low" });
  return {
    algorithm: "Types",
    confidence: 0.85,
    summary: `${ann} annotations, ${generics} generics, ${anyUsage} 'any' usages.`,
    details: [`Type annotations: ${ann}`, `Generics: ${generics}`, `'any' usages: ${anyUsage}`, `Non-null assertions: ${assertNonNull}`],
    tags: ["types", ann > 5 ? "well-typed" : "loose-types", anyUsage > 0 ? "has-any" : "no-any"],
    insights
  };
}

// 10. Documentation
function extractDocumentation(code: string): AnalysisSignal {
  const jsdoc = (code.match(/\/\*\*[\s\S]*?\*\//g) || []).length;
  const lineComments = (code.match(/\/\/\s*.+/g) || []).length;
  const todos = (code.match(/\/\/\s*(TODO|FIXME|HACK|XXX|BUG)/gi) || []).length;
  const totalLines = code.split("\n").length;
  const commentRatio = Math.round((lineComments / Math.max(totalLines, 1)) * 100);
  const insights: Insight[] = [];
  if (todos > 0) insights.push({ type: "warning", message: `${todos} TODO/FIXME comment(s) — track in issue tracker.`, priority: "low" });
  if (jsdoc + lineComments === 0) insights.push({ type: "suggestion", message: "No comments found; add docs for maintainability.", priority: "low", learnMore: "https://jsdoc.app/" });
  else if (jsdoc > 0) insights.push({ type: "positive", message: `${jsdoc} JSDoc block(s) found — good for documentation.`, priority: "low" });
  return {
    algorithm: "Documentation",
    confidence: 0.9,
    summary: `${jsdoc} JSDoc, ${lineComments} comments (${commentRatio}% of lines), ${todos} TODOs.`,
    details: [`JSDoc blocks: ${jsdoc}`, `Line comments: ${lineComments}`, `Comment ratio: ${commentRatio}%`, `TODOs/FIXMEs: ${todos}`],
    tags: ["documentation", jsdoc > 0 ? "jsdoc" : "comments"],
    insights,
    metrics: { commentDensity: commentRatio } as any
  };
}

// 11. Naming Conventions
function analyzeNamingConventions(code: string): AnalysisSignal {
  const ids = code.match(/\b[a-zA-Z_$][\w$]*\b/g) || [];
  const reserved = new Set(["if","else","for","while","do","switch","case","break","continue","return","function","class","const","let","var","new","delete","typeof","instanceof","void","null","undefined","true","false","import","export","default","try","catch","finally","throw","async","await","yield","of","in","extends","implements","interface","type","enum","abstract","public","private","protected","static","readonly","declare","namespace","module","from","as"]);
  const userIds = [...new Set(ids.filter(i => !reserved.has(i) && i.length > 1))];
  const camel = userIds.filter(i => /^[a-z][a-zA-Z0-9]*[A-Z]/.test(i)).length;
  const pascal = userIds.filter(i => /^[A-Z][a-zA-Z0-9]+$/.test(i)).length;
  const snake = userIds.filter(i => /^[a-z_][a-z0-9_]+_[a-z]/.test(i)).length;
  const screaming = userIds.filter(i => /^[A-Z][A-Z0-9_]{2,}$/.test(i)).length;
  const singleChar = userIds.filter(i => /^[a-z]$/.test(i)).length;
  const styles = [camel > 0, pascal > 0, snake > 0].filter(Boolean).length;
  return {
    algorithm: "Naming",
    confidence: 0.8,
    summary: `${styles} naming style(s): ${camel} camelCase, ${pascal} PascalCase, ${snake} snake_case.`,
    details: [`camelCase: ${camel}`, `PascalCase: ${pascal}`, `snake_case: ${snake}`, `SCREAMING_CASE: ${screaming}`, `Single-char: ${singleChar}`, `Total unique identifiers: ${userIds.length}`],
    tags: ["naming", styles === 1 ? "consistent" : "mixed"],
    insights: [
      ...(styles > 2 ? [{ type: "suggestion" as const, message: "Multiple naming styles — standardize for consistency.", priority: "low" as const }] : []),
      ...(singleChar > 3 ? [{ type: "suggestion" as const, message: `${singleChar} single-char variables — use descriptive names.`, priority: "low" as const }] : [])
    ]
  };
}

// 12. Security Heuristics
function scanSecurityHeuristics(code: string): AnalysisSignal {
  const risks = [
    { p: /\beval\s*\(/, m: "eval() usage is a critical security risk.", pri: "high" as const, url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/eval#never_use_eval!" },
    { p: /\.innerHTML\s*=|\.outerHTML\s*=/, m: "innerHTML assignment risks XSS attacks.", pri: "high" as const, url: "https://owasp.org/www-community/attacks/xss/" },
    { p: /new\s+Function\s*\(/, m: "Dynamic Function constructor is a security risk.", pri: "medium" as const },
    { p: /document\.write\s*\(/, m: "document.write() is deprecated and risky.", pri: "medium" as const },
    { p: /localStorage\.(getItem|setItem)\s*\([^)]*password|localStorage\.(getItem|setItem)\s*\([^)]*token/i, m: "Avoid storing sensitive data in localStorage.", pri: "high" as const },
    { p: /\bconsole\.log\s*\([^)]*password|console\.log\s*\([^)]*secret|console\.log\s*\([^)]*token/i, m: "Possible sensitive data logged to console.", pri: "high" as const },
    { p: /Math\.random\s*\(\).*token|Math\.random\s*\(\).*secret/i, m: "Math.random() is not cryptographically secure.", pri: "medium" as const, url: "https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues" },
    { p: /http:\/\/(?!localhost)/, m: "Non-HTTPS URL detected; prefer HTTPS.", pri: "medium" as const }
  ];
  const found = risks
    .filter(r => r.p.test(code))
    .map(r => ({ type: "warning" as const, message: r.m, priority: r.pri, learnMore: r.url }));
  return {
    algorithm: "Security",
    confidence: 0.78,
    summary: found.length ? `${found.length} security concern(s) detected.` : "No obvious security risks.",
    details: found.length ? found.map(f => `- ${f.message}`) : ["No high-risk patterns found"],
    tags: found.length ? ["security", "review"] : ["security", "clean"],
    insights: found
  };
}

// 13. Performance Hints
function generatePerformanceHints(code: string): AnalysisSignal {
  const hints: Insight[] = [];
  if (/\.forEach\s*\([^)]*\)\s*\{[^}]*\bawait\b/.test(code)) hints.push({ type: "suggestion", message: "Use Promise.all() instead of await inside forEach.", priority: "medium", learnMore: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all" });
  if (/JSON\.parse\s*\(\s*JSON\.stringify\s*\(/.test(code)) hints.push({ type: "info", message: "structuredClone() is faster and safer than JSON roundtrip for deep cloning.", priority: "low" });
  if (/\bconsole\.(log|debug|info)\s*\(/.test(code)) hints.push({ type: "suggestion", message: "Remove console.log() calls before production.", priority: "low" });
  if (/new\s+Array\([\d]+\)\.fill/.test(code)) hints.push({ type: "info", message: "Consider Array.from({length: n}) instead of new Array().fill() for clarity.", priority: "low" });
  if (/\b(document\.querySelector|getElementsBy)\b/.test(code) && /for\s*\(|while\s*\(/.test(code)) hints.push({ type: "suggestion", message: "Avoid DOM queries inside loops; cache selector results.", priority: "medium" });
  if (/\bsetTimeout\(.*0\)|\bsetInterval\(.*0\)/.test(code)) hints.push({ type: "info", message: "setTimeout(fn, 0) trick detected; consider queueMicrotask() or requestAnimationFrame().", priority: "low" });
  return {
    algorithm: "Performance",
    confidence: 0.72,
    summary: hints.length ? `${hints.length} performance hint(s).` : "No obvious performance issues.",
    details: hints.length ? hints.map(h => `- ${h.message}`) : ["Clean performance profile"],
    tags: hints.length ? ["performance", "hints"] : ["performance", "clean"],
    insights: hints
  };
}

// 14. Framework Detection
function detectFrameworkContext(code: string): AnalysisSignal {
  const fws = [
    { p: /from\s+['"]react['"]|React\.\w+/, name: "React" },
    { p: /from\s+['"]vue['"]|Vue\.component|defineComponent/, name: "Vue" },
    { p: /from\s+['"]@angular\/core['"]/, name: "Angular" },
    { p: /from\s+['"]express['"]|app\.(get|post|put|delete)/, name: "Express" },
    { p: /from\s+['"]next['"]|getServerSideProps|getStaticProps|NextPage/, name: "Next.js" },
    { p: /from\s+['"]svelte['"]|<script lang="ts">/, name: "Svelte" },
    { p: /from\s+['"]@remix-run/, name: "Remix" },
    { p: /from\s+['"]gatsby['"]/, name: "Gatsby" },
    { p: /from\s+['"]@nestjs\//, name: "NestJS" },
    { p: /from\s+['"]react-query['"]|useQuery|useMutation/, name: "React Query" },
    { p: /from\s+['"]zustand['"]|create\(\)/, name: "Zustand" },
    { p: /from\s+['"]@reduxjs\//, name: "Redux Toolkit" }
  ];
  const det = fws.filter(f => f.p.test(code)).map(f => f.name);
  return {
    algorithm: "Framework",
    confidence: 0.9,
    summary: det.length ? `Framework context: ${det.join(", ")}.` : "Vanilla JS/TS or unknown framework.",
    details: det.length ? det.map(f => `- ${f}`) : ["- No framework-specific patterns detected"],
    tags: det.length ? det.map(d => d.toLowerCase().replace(/\s+/g, "-")) : ["vanilla"],
    insights: []
  };
}

// 15. Testability Assessment
function assessTestability(code: string): AnalysisSignal {
  const hasExports = /export\s+(default\s+)?(const|function|class|type)/.test(code) ? 2 : 0;
  const pureFunctions = (code.match(/(?:function\s+\w+|const\s+\w+\s*=\s*(?:async\s*)?\()\s*[^)]*\)\s*(?::\s*\w+)?\s*(?:=>|{)[^}]*return[^}]*/g) || []).length;
  const sideEffects = (code.match(/\b(console|fetch|setTimeout|setInterval|document\.|window\.|localStorage|sessionStorage|navigator\.)\b/g) || []).length;
  const globals = (code.match(/\b(process|global|__dirname|__filename)\b/g) || []).length;
  const dependencies = (code.match(/import\s+.*?from\s+['"].+?['"]/g) || []).length;
  const score = Math.min(5, hasExports + Math.min(2, pureFunctions) - Math.min(2, sideEffects > 2 ? 2 : sideEffects > 0 ? 1 : 0) - (globals > 0 ? 1 : 0));
  const level = score >= 4 ? "high" : score >= 2 ? "medium" : "low";
  return {
    algorithm: "Testability",
    confidence: 0.75,
    summary: `Testability: ${level} (score ${Math.max(0, score)}/5).`,
    details: [`Score: ${Math.max(0, score)}/5`, `Exports: ${hasExports > 0 ? "yes" : "no"}`, `Pure function patterns: ${pureFunctions}`, `Side-effects: ${sideEffects}`, `External dependencies: ${dependencies}`],
    tags: ["testability", level],
    insights: level === "low"
      ? [{ type: "suggestion", message: "Extract pure functions and reduce global side-effects for easier testing.", priority: "medium", learnMore: "https://jestjs.io/docs/getting-started" }]
      : level === "high"
        ? [{ type: "positive", message: "Good testability — functions are exported and have few side-effects.", priority: "low" }]
        : []
  };
}

// 16. Halstead Metrics (NEW)
function analyzeHalstead(code: string): AnalysisSignal {
  // Operators
  const opPattern = /(\+\+|--|&&|\|\||===|!==|>=|<=|=>|[+\-*/%=&|^~!<>?:,.])/g;
  const ops = code.match(opPattern) || [];
  const n1 = new Set(ops).size; // distinct operators
  const N1 = ops.length;         // total operators

  // Operands (identifiers + literals)
  const operandPattern = /\b([a-zA-Z_$][\w$]*|\d+(\.\d+)?|['"`][^'"`]*['"`])\b/g;
  const operands = (code.match(operandPattern) || []).filter(o => !["if","else","for","while","return","const","let","var","function","class","import","export","async","await"].includes(o));
  const n2 = new Set(operands).size;
  const N2 = operands.length;

  const n = n1 + n2;
  const N = N1 + N2;
  const vocabulary = Math.max(n, 2);
  const length = Math.max(N, 2);
  const volume = length * Math.log2(vocabulary);
  const difficulty = (n1 / 2) * (N2 / Math.max(n2, 1));
  const effort = difficulty * volume;

  const insights: Insight[] = [];
  if (volume > 1000) insights.push({ type: "warning", message: "High Halstead volume — code may be hard to comprehend.", priority: "medium", learnMore: "https://en.wikipedia.org/wiki/Halstead_complexity_measures" });
  if (difficulty > 20) insights.push({ type: "suggestion", message: "High Halstead difficulty — consider simplifying logic.", priority: "low" });

  return {
    algorithm: "Halstead",
    confidence: 0.72,
    summary: `Halstead: volume=${Math.round(volume)}, difficulty=${Math.round(difficulty)}.`,
    details: [`Distinct operators: ${n1}`, `Total operators: ${N1}`, `Distinct operands: ${n2}`, `Total operands: ${N2}`, `Volume: ${Math.round(volume)}`, `Difficulty: ${Math.round(difficulty)}`, `Effort: ${Math.round(effort)}`],
    tags: ["halstead", volume > 1000 ? "high-volume" : "manageable"],
    insights,
    metrics: { halsteadVolume: Math.round(volume) } as any
  };
}

// 17. Code Smells Detection (NEW)
function detectCodeSmells(code: string): AnalysisSignal {
  const smells: Insight[] = [];

  // Long parameter list (>4 params in function)
  const paramMatches = code.match(/function\s+\w*\s*\(([^)]{40,})\)/g) || [];
  if (paramMatches.length > 0) smells.push({ type: "warning", message: `Long parameter list detected (${paramMatches.length} function(s)). Consider object parameter.`, priority: "medium", learnMore: "https://refactoring.guru/smells/long-parameter-list" });

  // Magic numbers
  const magicNums = code.match(/(?<![.\w])\b(?!0|1|2|100)\d{2,}\b(?!px|em|rem|%|ms|s)/g) || [];
  if (magicNums.length > 2) smells.push({ type: "suggestion", message: `${magicNums.length} magic number(s) — name them as constants.`, priority: "low", learnMore: "https://refactoring.guru/replace-magic-number-with-symbolic-constant" });

  // Deeply nested callbacks (callback hell)
  const nestedCallbacks = (code.match(/function\s*\([^)]*\)\s*\{[^}]*function\s*\([^)]*\)\s*\{[^}]*function/g) || []).length;
  if (nestedCallbacks > 0) smells.push({ type: "warning", message: "Callback nesting detected — consider async/await.", priority: "medium", learnMore: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises" });

  // Dead code indicators
  const deadCode = (code.match(/\/\*[\s\S]*?return[\s\S]*?\*\/|if\s*\(\s*false\s*\)|if\s*\(\s*0\s*\)/g) || []).length;
  if (deadCode > 0) smells.push({ type: "warning", message: `Possible dead code found (${deadCode} instance(s)).`, priority: "medium" });

  // Duplicate code (simple: repeated 10+ char strings)
  const chunks = code.match(/[a-z]{10,}/gi) || [];
  const seen = new Map<string, number>();
  chunks.forEach(c => seen.set(c.toLowerCase(), (seen.get(c.toLowerCase()) || 0) + 1));
  const dups = [...seen.values()].filter(v => v > 3).length;
  if (dups > 0) smells.push({ type: "info", message: "Possible repeated patterns — consider extracting shared logic.", priority: "low" });

  // God function (too many lines)
  const fnMatches = code.match(/function[^{]*\{([^}]*\n){30,}[^}]*\}/g) || [];
  if (fnMatches.length > 0) smells.push({ type: "warning", message: "Large function(s) detected (30+ lines) — consider splitting.", priority: "high", learnMore: "https://refactoring.guru/smells/long-method" });

  const totalSmells = smells.length;

  return {
    algorithm: "Code Smells",
    confidence: 0.7,
    summary: totalSmells > 0 ? `${totalSmells} code smell(s) detected.` : "No code smells detected.",
    details: totalSmells > 0 ? smells.map(s => `- ${s.message}`) : ["Code quality looks clean"],
    tags: ["code-quality", totalSmells === 0 ? "clean" : totalSmells <= 2 ? "minor-smells" : "smelly"],
    insights: smells,
    metrics: { codeSmells: totalSmells } as any
  };
}

// 18. Promise / Async Flow Analysis (NEW)
function analyzePromiseFlow(code: string): AnalysisSignal {
  const asyncFns = (code.match(/\basync\s+(function|\w+\s*=>|\([^)]*\)\s*=>)/g) || []).length;
  const awaitUsages = (code.match(/\bawait\b/g) || []).length;
  const thenChains = (code.match(/\.then\s*\(/g) || []).length;
  const catchUsages = (code.match(/\.catch\s*\(|\btry\s*\{/g) || []).length;
  const promiseAll = (code.match(/Promise\.(all|allSettled|race|any)\s*\(/g) || []).length;
  const unhandledAsync = asyncFns > 0 && catchUsages === 0;

  const insights: Insight[] = [];
  if (unhandledAsync) insights.push({ type: "warning", message: "Async function(s) without error handling — add try/catch.", priority: "high", learnMore: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises#error_handling" });
  if (thenChains > 0 && asyncFns > 0) insights.push({ type: "suggestion", message: "Mixed .then() and async/await — pick one style.", priority: "low" });
  if (promiseAll > 0) insights.push({ type: "positive", message: `Promise.all/allSettled used (${promiseAll}x) — good for parallel execution.`, priority: "low" });
  if (awaitUsages > 0 && asyncFns === 0) insights.push({ type: "warning", message: "await used outside async function — may cause runtime error.", priority: "high" });

  return {
    algorithm: "Promise Flow",
    confidence: 0.8,
    summary: `${asyncFns} async fn(s), ${awaitUsages} await(s), ${thenChains} .then() chain(s).`,
    details: [`Async functions: ${asyncFns}`, `await usages: ${awaitUsages}`, `.then() chains: ${thenChains}`, `Error handlers: ${catchUsages}`, `Promise combinators: ${promiseAll}`, `Unhandled async: ${unhandledAsync ? "yes" : "no"}`],
    tags: ["async", asyncFns > 0 ? "async-present" : "sync", promiseAll > 0 ? "promise-combinators" : ""],
    insights
  };
}

// 19. Regex Analysis (NEW)
function analyzeRegexUsage(code: string): AnalysisSignal {
  const regexLiterals = code.match(/\/(?!\/)(?:[^\/\\\n]|\\.)+\/[gimsuy]*/g) || [];
  const regexConstructors = (code.match(/new\s+RegExp\s*\(/g) || []).length;
  const total = regexLiterals.length + regexConstructors;

  const insights: Insight[] = [];
  if (total > 5) insights.push({ type: "info", message: `${total} regex patterns — consider extracting to named constants.`, priority: "low" });

  // Detect potentially catastrophic backtracking (simplified: nested quantifiers)
  const catastrophic = regexLiterals.filter(r => /\(\.\*\)\*|\(\.\+\)\+|\([^)]*[+*][^)]*\)[+*]/.test(r)).length;
  if (catastrophic > 0) insights.push({ type: "warning", message: "Potentially catastrophic regex backtracking detected.", priority: "high", learnMore: "https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS" });

  return {
    algorithm: "Regex",
    confidence: 0.65,
    summary: total > 0 ? `${total} regex pattern(s) (${regexLiterals.length} literals, ${regexConstructors} constructors).` : "No regex patterns.",
    details: [`Literal regex: ${regexLiterals.length}`, `RegExp constructors: ${regexConstructors}`, `Catastrophic patterns: ${catastrophic}`],
    tags: total > 0 ? ["regex", catastrophic > 0 ? "regex-risk" : "regex-safe"] : ["no-regex"],
    insights
  };
}

// 20. Comment Quality (NEW)
function analyzeCommentQuality(code: string): AnalysisSignal {
  const jsdocBlocks = code.match(/\/\*\*[\s\S]*?\*\//g) || [];
  const lineComments = code.match(/\/\/\s*.+/g) || [];
  const totalLines = code.split("\n").length;
  const commentLines = lineComments.length + jsdocBlocks.reduce((acc, b) => acc + b.split("\n").length, 0);
  const density = Math.round((commentLines / Math.max(totalLines, 1)) * 100);

  const jsdocWithParams = jsdocBlocks.filter(b => /@param|@returns|@throws/.test(b)).length;
  const emptyComments = lineComments.filter(c => c.replace(/\/\/\s*/, "").trim().length < 3).length;

  const insights: Insight[] = [];
  if (density === 0) insights.push({ type: "suggestion", message: "No comments — document complex logic for future maintainers.", priority: "low" });
  else if (density > 40) insights.push({ type: "info", message: "High comment density (>40%) — ensure comments add value, not noise.", priority: "low" });
  if (jsdocWithParams > 0) insights.push({ type: "positive", message: `${jsdocWithParams} JSDoc block(s) with @param/@returns — excellent!`, priority: "low" });
  if (emptyComments > 2) insights.push({ type: "suggestion", message: `${emptyComments} near-empty comment(s) — remove or flesh out.`, priority: "low" });

  return {
    algorithm: "Comment Quality",
    confidence: 0.75,
    summary: `Comment density: ${density}%, ${jsdocWithParams} JSDoc with params.`,
    details: [`Comment density: ${density}%`, `JSDoc blocks: ${jsdocBlocks.length}`, `JSDoc with @param/@returns: ${jsdocWithParams}`, `Line comments: ${lineComments.length}`, `Empty/trivial comments: ${emptyComments}`],
    tags: ["documentation", density > 20 ? "well-documented" : density > 5 ? "lightly-documented" : "undocumented"],
    insights,
    metrics: { commentDensity: density } as any
  };
}

// 21. Side Effects Analysis
function analyzeSideEffects(code: string): AnalysisSignal {
  const mutationOps = (code.match(/\b(this\.|\w+\s*\.|\w+\s*=\s*\w+\.|Object\.assign\(|\[\s*\w+\s*\])/g) || []).length;
  const externalWrites = (code.match(/\b(localStorage|sessionStorage|document\.|window\.|process\.|fs\.|net\.|fetch\()/g) || []).length;
  const pureHints = (code.match(/\bconst\b/g) || []).length;
  const level = externalWrites + (mutationOps > 5 ? 1 : 0);
  const insights: Insight[] = [];
  if (externalWrites > 0) insights.push({ type: "warning", message: "Detected side-effects or external state access; use pure functions where possible.", priority: "medium" });
  if (mutationOps > 4) insights.push({ type: "suggestion", message: "Multiple mutation points may increase maintenance cost.", priority: "low" });

  return {
    algorithm: "Side Effects",
    confidence: 0.68,
    summary: `Side-effects score: ${Math.max(0, 5 - level)}/5.`,
    details: [`External writes: ${externalWrites}`, `Mutation indicators: ${mutationOps}`, `Const usage: ${pureHints}`],
    tags: [externalWrites ? "side-effects" : "pure", mutationOps > 4 ? "mutation-heavy" : ""],
    insights
  };
}

// 22. Error Handling Review
function analyzeErrorHandling(code: string): AnalysisSignal {
  const tryBlocks = (code.match(/\btry\b/g) || []).length;
  const catchBlocks = (code.match(/\bcatch\b/g) || []).length;
  const throws = (code.match(/\bthrow\b/g) || []).length;
  const badPatterns = (code.match(/\bcatch\s*\(.*\)\s*\{\s*console\.error\(|\bcatch\s*\(.*\)\s*\{\s*return\s*;/g) || []).length;
  const insights: Insight[] = [];
  if (tryBlocks > 0 && catchBlocks === 0) insights.push({ type: "warning", message: "try block found without catch/finally — add error handling.", priority: "high" });
  if (badPatterns > 0) insights.push({ type: "suggestion", message: "Avoid bare catches or swallow errors silently.", priority: "medium" });
  if (throws > 2) insights.push({ type: "info", message: `${throws} throw statements found — verify error semantics.`, priority: "low" });

  return {
    algorithm: "Error Handling",
    confidence: 0.7,
    summary: `Error-handling coverage: ${tryBlocks} try / ${catchBlocks} catch / ${throws} throw.`,
    details: [`try blocks: ${tryBlocks}`, `catch blocks: ${catchBlocks}`, `throw statements: ${throws}`, `Suspicious error handling patterns: ${badPatterns}`],
    tags: [tryBlocks ? "has-error-handling" : "no-try", badPatterns ? "weak-error-handling" : ""],
    insights
  };
}

// 23. Readability Score
function analyzeReadability(code: string): AnalysisSignal {
  const longLines = (code.split("\n").filter(line => line.length > 100).length);
  const nestedTernaries = (code.match(/\?[^:]+:[^:]+:/g) || []).length;
  const emptyLines = (code.split("\n").filter(line => line.trim() === "").length);
  const score = Math.max(0, 10 - Math.min(5, longLines) - Math.min(3, nestedTernaries));
  const insights: Insight[] = [];
  if (longLines > 2) insights.push({ type: "suggestion", message: `${longLines} long line(s) over 100 chars — wrap or simplify expressions.`, priority: "low" });
  if (nestedTernaries > 0) insights.push({ type: "warning", message: "Nested ternaries reduce readability; prefer clearer branching.", priority: "medium" });

  return {
    algorithm: "Readability",
    confidence: 0.7,
    summary: `Readability score: ${score}/10.`,
    details: [`Long lines: ${longLines}`, `Nested ternaries: ${nestedTernaries}`, `Empty lines: ${emptyLines}`],
    tags: [longLines > 2 ? "long-lines" : "", nestedTernaries ? "complex-expression" : ""],
    insights
  };
}

// 24. Naming Consistency
function detectNamingConsistency(code: string): AnalysisSignal {
  const camel = (code.match(/\b[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\b/g) || []).length;
  const snake = (code.match(/\b[a-z]+_[a-z0-9_]+\b/g) || []).length;
  const pascal = (code.match(/\b[A-Z][a-z0-9]+[A-Z][a-zA-Z0-9]*\b/g) || []).length;
  const style = camel >= snake ? "camelCase" : "snake_case";
  const insights: Insight[] = [];
  if (snake > 0 && camel > 0) insights.push({ type: "suggestion", message: "Mixed naming styles detected — unify naming conventions.", priority: "low" });
  if (pascal > 0) insights.push({ type: "info", message: `${pascal} PascalCase identifier(s) found — likely classes or React components.`, priority: "low" });

  return {
    algorithm: "Naming Consistency",
    confidence: 0.68,
    summary: `Dominant naming style: ${style}.`,
    details: [`camelCase: ${camel}`, `snake_case: ${snake}`, `PascalCase: ${pascal}`],
    tags: [style, snake > 0 && camel > 0 ? "mixed-naming" : ""],
    insights
  };
}

// 25. Dependency Audit
function auditDependencies(code: string): AnalysisSignal {
  const imports = code.match(/\bimport\b.+?from\s+['"][^'"]+['"]/g) || [] as string[];
  const requireCalls = code.match(/\brequire\(['"][^'"]+['"]\)/g) || [] as string[];
  const external = imports.filter(i => !i.includes("./") && !i.includes("../")).length + requireCalls.filter(r => !r.includes("./") && !r.includes("../")).length;
  const insights: Insight[] = [];
  if (external > 3) insights.push({ type: "info", message: `${external} external dependency(ies) used — review package surface area.`, priority: "low" });
  if (imports.length + requireCalls.length > 8) insights.push({ type: "suggestion", message: "Many imports may indicate a large dependency surface; consider refactor.", priority: "medium" });

  return {
    algorithm: "Dependency Audit",
    confidence: 0.72,
    summary: `${imports.length + requireCalls.length} dependency references, ${external} external modules.`,
    details: [`Static imports: ${imports.length}`, `Require calls: ${requireCalls.length}`, `External modules: ${external}`],
    tags: [external > 0 ? "external-deps" : "internal-only", imports.length + requireCalls.length > 8 ? "dependency-heavy" : ""],
    insights
  };
}

// 26. Immutability Check
function analyzeImmutability(code: string): AnalysisSignal {
  const letCount = (code.match(/\blet\b/g) || []).length;
  const constCount = (code.match(/\bconst\b/g) || []).length;
  const mutateOps = (code.match(/\b(push|pop|splice|shift|unshift|sort|reverse)\b/g) || []).length;
  const insights: Insight[] = [];
  if (letCount > constCount) insights.push({ type: "suggestion", message: "More let than const declarations — prefer immutable bindings when possible.", priority: "low" });
  if (mutateOps > 1) insights.push({ type: "warning", message: "In-place mutations detected — consider immutable data transformations.", priority: "medium" });

  return {
    algorithm: "Immutability",
    confidence: 0.7,
    summary: `Const/let ratio: ${constCount}:${letCount}.`,
    details: [`const declarations: ${constCount}`, `let declarations: ${letCount}`, `Mutation helpers: ${mutateOps}`],
    tags: [mutateOps > 1 ? "mutation" : "immutable", constCount >= letCount ? "const-preferred" : ""],
    insights
  };
}

// 27. Modern Syntax Usage
function analyzeModernSyntax(code: string): AnalysisSignal {
  const optionalChaining = (code.match(/\?\./g) || []).length;
  const nullishCoalescing = (code.match(/\?\?/g) || []).length;
  const arrowFns = (code.match(/=>/g) || []).length;
  const templateStrings = (code.match(/`[^`]*`/g) || []).length;
  const insights: Insight[] = [];
  if (optionalChaining + nullishCoalescing + arrowFns + templateStrings > 3) insights.push({ type: "positive", message: "Modern JavaScript syntax used consistently.", priority: "low" });
  else insights.push({ type: "suggestion", message: "Consider modern syntax such as optional chaining or nullish coalescing for safer code.", priority: "low" });

  return {
    algorithm: "Modern Syntax",
    confidence: 0.68,
    summary: `${optionalChaining} optional chaining, ${nullishCoalescing} nullish coalescing, ${arrowFns} arrow fn(s).`,
    details: [`optional chaining: ${optionalChaining}`, `nullish coalescing: ${nullishCoalescing}`, `arrow functions: ${arrowFns}`, `template strings: ${templateStrings}`],
    tags: [optionalChaining ? "optional-chaining" : "", nullishCoalescing ? "nullish-coalescing" : ""],
    insights
  };
}

// 28. Style Consistency
function checkStyleConsistency(code: string): AnalysisSignal {
  const singleQuotes = (code.match(/'/g) || []).length;
  const doubleQuotes = (code.match(/"/g) || []).length;
  const semicolons = (code.match(/;/g) || []).length;
  const trailingSpaces = (code.split("\n").filter(line => /\s+$/.test(line)).length);
  const insights: Insight[] = [];
  if (singleQuotes > doubleQuotes && doubleQuotes > 0) insights.push({ type: "suggestion", message: "Mixed quote styles detected — standardize on one style.", priority: "low" });
  if (trailingSpaces > 0) insights.push({ type: "suggestion", message: `${trailingSpaces} trailing whitespace line(s) found.`, priority: "low" });

  return {
    algorithm: "Style Consistency",
    confidence: 0.66,
    summary: `Quote balance: ${singleQuotes}:${doubleQuotes}, ${trailingSpaces} trailing whitespace line(s).`,
    details: [`single quotes: ${singleQuotes}`, `double quotes: ${doubleQuotes}`, `semicolons: ${semicolons}`, `trailing whitespace: ${trailingSpaces}`],
    tags: [trailingSpaces ? "whitespace-issues" : ""],
    insights
  };
}

// 29. Security Injection Scan
function analyzeSecurityInjection(code: string): AnalysisSignal {
  const evalUsage = (code.match(/\beval\s*\(/g) || []).length;
  const innerHTML = (code.match(/\.innerHTML\s*=/g) || []).length;
  const templateInjection = (code.match(/\$\{[^}]+\}/g) || []).length;
  const insights: Insight[] = [];
  if (evalUsage > 0) insights.push({ type: "warning", message: "eval usage detected — this is a common injection risk.", priority: "high" });
  if (innerHTML > 0) insights.push({ type: "warning", message: "innerHTML assignment detected — prefer safe DOM APIs.", priority: "medium" });
  if (templateInjection > 5) insights.push({ type: "suggestion", message: "Template interpolation found — validate user input before rendering.", priority: "low" });

  return {
    algorithm: "Security Injection",
    confidence: 0.7,
    summary: `Injection risk checks: eval=${evalUsage}, innerHTML=${innerHTML}.`,
    details: [`eval calls: ${evalUsage}`, `innerHTML assignments: ${innerHTML}`, `template interpolations: ${templateInjection}`],
    tags: [evalUsage ? "eval" : "", innerHTML ? "innerHTML" : ""],
    insights
  };
}

// 30. Concurrency Safety
function assessConcurrencySafety(code: string): AnalysisSignal {
  const promiseUsage = (code.match(/\bPromise\b/g) || []).length;
  const asyncUsage = (code.match(/\basync\b/g) || []).length;
  const lockPatterns = (code.match(/\bAtomics\.|\bSharedArrayBuffer\b/g) || []).length;
  const insights: Insight[] = [];
  if (promiseUsage > 2 && asyncUsage === 0) insights.push({ type: "suggestion", message: "Promise-based concurrency without async functions may be harder to follow.", priority: "low" });
  if (lockPatterns > 0) insights.push({ type: "info", message: "Shared memory or Atomics usage detected — review thread safety.", priority: "medium" });

  return {
    algorithm: "Concurrency Safety",
    confidence: 0.66,
    summary: `Promise usage: ${promiseUsage}, async declarations: ${asyncUsage}.`,
    details: [`Promise references: ${promiseUsage}`, `async declarations: ${asyncUsage}`, `Atomics/shared buffer: ${lockPatterns}`],
    tags: [promiseUsage ? "async" : "", lockPatterns ? "shared-memory" : ""],
    insights
  };
}

// 31. Resource Management
function inspectResourceManagement(code: string): AnalysisSignal {
  const timers = (code.match(/\b(setTimeout|setInterval|clearTimeout|clearInterval)\b/g) || []).length;
  const listeners = (code.match(/\baddEventListener\b/g) || []).length;
  const cleanupSigns = (code.match(/\bremoveEventListener\b|\bclearTimeout\b|\bclearInterval\b/g) || []).length;
  const insights: Insight[] = [];
  if (listeners > 0 && cleanupSigns === 0) insights.push({ type: "warning", message: "Event listeners or timers found without obvious cleanup.", priority: "medium" });
  if (timers > 2) insights.push({ type: "info", message: `Timer usage: ${timers}. Ensure cleanup on component unmount or shutdown.`, priority: "low" });

  return {
    algorithm: "Resource Management",
    confidence: 0.67,
    summary: `Timers: ${timers}, listeners: ${listeners}, cleanup markers: ${cleanupSigns}.`,
    details: [`timer calls: ${timers}`, `event listeners: ${listeners}`, `cleanup markers: ${cleanupSigns}`],
    tags: [listeners ? "event-driven" : "", cleanupSigns ? "cleanup-aware" : ""],
    insights
  };
}

// 32. Duplicate Pattern Detection
function detectDuplicatePatterns(code: string): AnalysisSignal {
  const chunks = code.match(/\b[a-zA-Z0-9_]{10,}\b/g) || [];
  const seen = new Map<string, number>();
  chunks.forEach(item => seen.set(item.toLowerCase(), (seen.get(item.toLowerCase()) || 0) + 1));
  const repeats = [...seen.values()].filter(count => count > 2).length;
  const insights: Insight[] = [];
  if (repeats > 0) insights.push({ type: "suggestion", message: `${repeats} repeated token group(s) detected — extract shared logic.`, priority: "low" });

  return {
    algorithm: "Duplicate Patterns",
    confidence: 0.68,
    summary: repeats > 0 ? `${repeats} duplicated token groups found.` : "No obvious duplicate patterns.",
    details: [`Repeated token groups: ${repeats}`],
    tags: repeats > 0 ? ["duplicates"] : ["clean"],
    insights
  };
}

// 33. Validation Analysis
function analyzeValidationPatterns(code: string): AnalysisSignal {
  const checks = (code.match(/\b(typeof\s+\w+|===\s*null|!==\s*null|==\s*null|!=\s*null|\bif\s*\(.*\b===\b.*\)|\bif\s*\(.*\b!==\b.*\))/g) || []).length;
  const inputNames = (code.match(/\b(req\.|event\.|input\.|params\.|body\.)/g) || []).length;
  const insights: Insight[] = [];
  if (inputNames && checks === 0) insights.push({ type: "warning", message: "Input data referenced without apparent validation.", priority: "high" });
  if (checks > 3) insights.push({ type: "positive", message: `${checks} validation checks detected.`, priority: "low" });

  return {
    algorithm: "Validation",
    confidence: 0.66,
    summary: `Validation checks: ${checks}, input references: ${inputNames}.`,
    details: [`validation patterns: ${checks}`, `input-related tokens: ${inputNames}`],
    tags: checks > 0 ? ["validation"] : ["unvalidated"],
    insights
  };
}

// 34. Logging Patterns
function analyzeLoggingPatterns(code: string): AnalysisSignal {
  const logs = (code.match(/\bconsole\.(log|warn|error|info|debug)\b/g) || []).length;
  const structured = (code.match(/console\.log\(.*\{.*\}.*\)/g) || []).length;
  const insights: Insight[] = [];
  if (logs > 5) insights.push({ type: "info", message: `${logs} console logging calls found — ensure production noise is controlled.`, priority: "low" });
  if (structured > 0) insights.push({ type: "positive", message: `Structured logging detected (${structured}).`, priority: "low" });

  return {
    algorithm: "Logging Patterns",
    confidence: 0.65,
    summary: `${logs} logging call(s), ${structured} structured log(s).`,
    details: [`logging calls: ${logs}`, `structured logs: ${structured}`],
    tags: logs > 0 ? ["logging"] : ["clean-logs"],
    insights
  };
}

// 35. Exception Pattern Review
function analyzeExceptionPatterns(code: string): AnalysisSignal {
  const catchAll = (code.match(/catch\s*\(\s*\w+\s*\)\s*\{\s*(return|console|\/\*)/g) || []).length;
  const throwCustom = (code.match(/throw\s+new\s+\w+/g) || []).length;
  const insights: Insight[] = [];
  if (catchAll > 0) insights.push({ type: "suggestion", message: "General catch blocks may hide errors; handle specific conditions when possible.", priority: "medium" });
  if (throwCustom > 2) insights.push({ type: "info", message: `${throwCustom} custom exceptions thrown.`, priority: "low" });

  return {
    algorithm: "Exception Patterns",
    confidence: 0.67,
    summary: `Catch-all blocks: ${catchAll}, custom throws: ${throwCustom}.`,
    details: [`catch-all patterns: ${catchAll}`, `custom throw statements: ${throwCustom}`],
    tags: catchAll ? ["catch-all"] : ["specific-errors"],
    insights
  };
}

// 36. Test Signal Detection
function analyzeTestSignals(code: string): AnalysisSignal {
  const testKeywords = (code.match(/\bdescribe\b|\bit\b|\btest\b|\bexpect\b/g) || []).length;
  const mockUsage = (code.match(/\bjest\.mock\b|\bSinon\b|\bspyOn\b/g) || []).length;
  const insights: Insight[] = [];
  if (testKeywords > 0) insights.push({ type: "positive", message: `Test-related code detected (${testKeywords} markers).`, priority: "low" });
  if (mockUsage > 0) insights.push({ type: "info", message: `${mockUsage} mocking indicator(s).`, priority: "low" });

  return {
    algorithm: "Test Signals",
    confidence: 0.63,
    summary: `Test markers: ${testKeywords}, mock usage: ${mockUsage}.`,
    details: [`test markers: ${testKeywords}`, `mock/spying hints: ${mockUsage}`],
    tags: testKeywords ? ["tests-present"] : ["no-tests"],
    insights
  };
}

// 37. Configuration Usage
function auditConfigUsage(code: string): AnalysisSignal {
  const envRefs = (code.match(/\bprocess\.env\b|\bimport\.meta\.env\b|\bDeno\.env\b/g) || []).length;
  const hardcoded = (code.match(/\b(https?:\/\/|PASSWORD|SECRET|TOKEN)\b/g) || []).length;
  const insights: Insight[] = [];
  if (hardcoded > 0) insights.push({ type: "warning", message: "Hard-coded configuration or secrets detected.", priority: "high" });
  if (envRefs > 0) insights.push({ type: "positive", message: `${envRefs} environment configuration reference(s) found.`, priority: "low" });

  return {
    algorithm: "Configuration Usage",
    confidence: 0.69,
    summary: `Env references: ${envRefs}, hard-coded hints: ${hardcoded}.`,
    details: [`env references: ${envRefs}`, `hard-coded value hints: ${hardcoded}`],
    tags: envRefs ? ["config-driven"] : ["static-config"],
    insights
  };
}

// 38. Build Safety Review
function evaluateBuildSafety(code: string): AnalysisSignal {
  const dynamicImports = (code.match(/\bimport\s*\(/g) || []).length;
  const moduleExports = (code.match(/\bmodule\.exports\b|\bexport\s+(default\s+)?\w+/g) || []).length;
  const insights: Insight[] = [];
  if (dynamicImports > 0) insights.push({ type: "info", message: "Dynamic imports detected — ensure build tools handle code splitting.", priority: "low" });
  if (moduleExports === 0) insights.push({ type: "suggestion", message: "No module exports detected; confirm the snippet is not intended as reusable code.", priority: "low" });

  return {
    algorithm: "Build Safety",
    confidence: 0.66,
    summary: `Dynamic imports: ${dynamicImports}, module exports: ${moduleExports}.`,
    details: [`dynamic import calls: ${dynamicImports}`, `exports found: ${moduleExports}`],
    tags: dynamicImports ? ["dynamic-imports"] : ["static-imports"],
    insights
  };
}

// 39. Lifecycle Hook Review
function inspectLifecycleHooks(code: string): AnalysisSignal {
  const reactHooks = (code.match(/\buseEffect\b|\buseLayoutEffect\b|\bcomponentDidMount\b|\bcomponentWillUnmount\b/g) || []).length;
  const insights: Insight[] = [];
  if (reactHooks > 0) insights.push({ type: "info", message: `${reactHooks} lifecycle hook(s) detected — review cleanup and dependency arrays.`, priority: "low" });

  return {
    algorithm: "Lifecycle Hooks",
    confidence: 0.64,
    summary: `${reactHooks} lifecycle hook indicator(s) found.`,
    details: [`hook-like patterns: ${reactHooks}`],
    tags: reactHooks ? ["lifecycle"] : ["no-lifecycle"],
    insights
  };
}

// 40. Legacy API Usage
function detectLegacyAPIUsage(code: string): AnalysisSignal {
  const legacy = (code.match(/\bvar\b|\barguments\b|\.bind\(|\bXMLHttpRequest\b|\bnew\s+Buffer\b/g) || []).length;
  const insights: Insight[] = [];
  if (legacy > 0) insights.push({ type: "suggestion", message: `${legacy} legacy API reference(s) detected — consider modern alternatives.`, priority: "low" });

  return {
    algorithm: "Legacy API Usage",
    confidence: legacy > 0 ? 0.7 : 0.55,
    summary: legacy > 0 ? `${legacy} legacy API usage(s) found.` : "No obvious legacy API patterns.",
    details: [`legacy API indicators: ${legacy}`],
    tags: legacy > 0 ? ["legacy"] : ["modern"],
    insights
  };
}

function synthesizeStaticSignals(signals: AnalysisSignal[]): StaticAnalysisResult {
  const weighted = signals
    .filter(s => s.confidence >= 0.5)
    .sort((a, b) => b.confidence - a.confidence);

  const distinctSignals: AnalysisSignal[] = [];
  const seenAlgorithms = new Set<string>();
  for (const signal of weighted) {
    if (!seenAlgorithms.has(signal.algorithm)) {
      seenAlgorithms.add(signal.algorithm);
      distinctSignals.push(signal);
    }
  }

  // Merge tags
  const seenP = new Set<string>();
  const patterns = distinctSignals
    .flatMap(s => s.tags)
    .filter(t => t && !["metrics", "data-flow", "control-flow", "no-regex", ""].includes(t))
    .map(t => t.charAt(0).toUpperCase() + t.slice(1).replace(/-/g, " "))
    .filter(p => { if (seenP.has(p.toLowerCase())) return false; seenP.add(p.toLowerCase()); return true; })
    .slice(0, 12);

  // Merge insights (deduplicate, sort by priority)
  const seenI = new Set<string>();
  const insights = distinctSignals
    .flatMap(s => s.insights)
    .sort((a, b) => ({ high: 3, medium: 2, low: 1 }[b.priority] - { high: 3, medium: 2, low: 1 }[a.priority]))
    .filter(i => { const k = i.message.toLowerCase().slice(0, 40); if (seenI.has(k)) return false; seenI.add(k); return true; })
    .slice(0, 10);

  // Aggregate metrics from all signals
  const metricsSig = weighted.find(s => s.metrics?.cyclomatic !== undefined);
  const cogSig = weighted.find(s => (s.metrics as any)?.cognitiveComplexity !== undefined);
  const halSig = weighted.find(s => (s.metrics as any)?.halsteadVolume !== undefined);
  const smellsSig = weighted.find(s => (s.metrics as any)?.codeSmells !== undefined);
  const commentSig = weighted.find(s => (s.metrics as any)?.commentDensity !== undefined);

  const metrics: CombinedMetrics = {
    complexity: metricsSig?.metrics?.complexity ?? "medium",
    cyclomatic: metricsSig?.metrics?.cyclomatic ?? 5,
    nestingDepth: metricsSig?.metrics?.nestingDepth ?? 2,
    linesOfCode: metricsSig?.metrics?.linesOfCode ?? 20,
    maintainabilityIndex: metricsSig?.metrics?.maintainabilityIndex ?? 75,
    cognitiveComplexity: (cogSig?.metrics as any)?.cognitiveComplexity ?? 5,
    halsteadVolume: (halSig?.metrics as any)?.halsteadVolume ?? 0,
    commentDensity: (commentSig?.metrics as any)?.commentDensity ?? 0,
    duplicateRisk: "low",
    codeSmells: (smellsSig?.metrics as any)?.codeSmells ?? 0
  };

  const topSignals = distinctSignals.slice(0, 4).map(s => s.summary.replace(/\.$/, "")).join(". ");
  const standardSummary = `${topSignals}. Patterns: ${patterns.slice(0, 4).join(", ")}. Complexity: ${metrics.complexity} (cyclomatic: ${metrics.cyclomatic}, cognitive: ${metrics.cognitiveComplexity}).`;
  const beginnerSummary = generateBeginnerFallback(standardSummary, patterns, insights, metrics);

  const detailsText = [
    `## Code Metrics`,
    `- Complexity: ${metrics.complexity.toUpperCase()} (Cyclomatic: ${metrics.cyclomatic})`,
    `- Cognitive Complexity: ${metrics.cognitiveComplexity}`,
    `- Nesting Depth: ${metrics.nestingDepth}`,
    `- Lines of Code: ${metrics.linesOfCode}`,
    `- Maintainability Index: ${metrics.maintainabilityIndex}/100`,
    `- Halstead Volume: ${metrics.halsteadVolume}`,
    `- Comment Density: ${metrics.commentDensity}%`,
    `- Code Smells: ${metrics.codeSmells}`,
    ``,
    `## Analysis Details`,
    ...distinctSignals.flatMap(s =>
      s.details.length ? [`### ${s.algorithm}`, ...s.details.map(d => `- ${d}`)] : []
    ),
    ...(insights.length ? [``, `## Key Insights`, ...insights.map(i => `- [${i.priority.toUpperCase()}] ${i.message}`)] : [])
  ].join("\n");

  return { metrics, patterns, insights, signals: distinctSignals, standardSummary, beginnerSummary, detailsText };
}

function generateBeginnerFallback(
  _std: string,
  pats: string[],
  ins: Insight[],
  met: CombinedMetrics
): string {
  let t = "This code ";

  const lowerPats = pats.map(p => p.toLowerCase());
  if (lowerPats.some(p => p.includes("async") || p.includes("promise"))) t += "does work that takes time (like loading data from the internet). ";
  else if (lowerPats.some(p => p.includes("react") || p.includes("component"))) t += "is like a LEGO brick for a webpage — it defines what a piece of your UI looks like and how it works. ";
  else if (lowerPats.some(p => p.includes("class") || p.includes("oop"))) t += "is a blueprint — like a recipe that you can use to create many similar things. ";
  else if (lowerPats.some(p => p.includes("function"))) t += "is a set of instructions that does a specific job when called. ";
  else t += "performs a series of steps, like a recipe or a checklist. ";

  if (lowerPats.some(p => p.includes("data fetch") || p.includes("async"))) t += "It reaches out to get information (like a server asking a chef for the daily menu). ";
  if (lowerPats.some(p => p.includes("error handling"))) t += "It also has safety nets — if something goes wrong, it handles the problem gracefully instead of crashing. ";
  if (lowerPats.some(p => p.includes("array"))) t += "It processes lists of things — imagine sorting or filtering a shopping list automatically. ";

  t += met.complexity === "high"
    ? "It has many decision branches, making it powerful but complex — like a traffic intersection with many signals. "
    : met.complexity === "medium"
      ? "It has a moderate number of decisions — like following a recipe with some optional steps. "
      : "It's straightforward and easy to follow — like a simple, clear to-do list. ";

  const highIns = ins.filter(i => i.priority === "high" || i.priority === "medium").slice(0, 2);
  if (highIns.length) {
    t += "Worth knowing: " + highIns.map(i => i.message.toLowerCase().replace(/consider |try /i, "")).join(", ") + ".";
  }

  return t.trim();
}

export function getTopContributors(signals: AnalysisSignal[]): string[] {
  return Array.from(new Set(signals.map(s => s.algorithm)));
}
