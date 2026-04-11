
const vscode = acquireVsCodeApi();
const $ = id => document.getElementById(id);

const els = {
    loadText: $("loadText"), progFill: $("progFill"), progStep: $("progStep"),
    errMsg: $("errMsg"),
    aiBadge: $("aiBadge"), algoBadge: $("algoBadge"), langBadge: $("langBadge"),
    modeStd: $("modeStd"), modeBeg: $("modeBeg"),
    tabBasic: $("tabBasic"), tabAnalysis: $("tabAnalysis"),
    basicPane: $("basicPane"), analysisPane: $("analysisPane"),
    patternTags: $("patternTags"), tagPrev: $("tagPrev"), tagNext: $("tagNext"),
    mComp: $("mComp"), mCompDesc: $("mCompDesc"),
    mCyc: $("mCyc"), mNest: $("mNest"), mMaint: $("mMaint"),
    mCog: $("mCog"), mSmells: $("mSmells"),
    insights: $("insightsList"),
    sumText: $("sumText"),
    detText: $("detText"),
    contributors: $("contributorsList"), algorithmResults: $("algorithmResults"), aiNote: $("aiNote"),
    copyIns: $("copyIns"), copySum: $("copySum"), copyDet: $("copyDet"),
    expandDetBtn: $("expandDetBtn"),
    lang: $("langLabel"), status: $("statusLabel"),
    refresh: $("refreshBtn"), copy: $("copyBtn"), exportBtn: $("exportBtn"), retry: $("retryBtn")
};

let detExpanded = false;

function showState(id) {
    ["stateLoading", "stateEmpty", "stateError", "stateContent"].forEach(s => {
        const el = $(s);
        if (el) {
            el.classList.toggle("active", s === id);
            if (s === "stateContent") el.style.display = s === id ? "block" : "none";
        }
    });
}

let currentTab = "basic";

function setActiveTab(tab) {
    currentTab = tab;
    els.tabBasic.classList.toggle("active", tab === "basic");
    els.tabAnalysis.classList.toggle("active", tab === "analysis");
    els.basicPane.classList.toggle("active", tab === "basic");
    els.analysisPane.classList.toggle("active", tab === "analysis");
}

function updateModeButtons(mode) {
    els.modeStd.classList.toggle("active", mode === "standard");
    els.modeBeg.classList.toggle("active", mode === "beginner");
}

function esc(t) {
    return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c] || c));
}

function updateTagScrollButtons() {
    if (!els.patternTags || !els.tagPrev || !els.tagNext) return;
    const scrollEl = els.patternTags;
    const canScrollLeft = scrollEl.scrollLeft > 2;
    const canScrollRight = scrollEl.scrollLeft + scrollEl.clientWidth < scrollEl.scrollWidth - 2;
    const hasOverflow = scrollEl.scrollWidth > scrollEl.clientWidth + 2;
    els.tagPrev.disabled = !canScrollLeft;
    els.tagNext.disabled = !canScrollRight;
    els.tagPrev.style.visibility = "visible";
    els.tagNext.style.visibility = "visible";
    if (!hasOverflow) {
        els.tagPrev.disabled = true;
        els.tagNext.disabled = true;
    }
}

function scrollTags(offset) {
    if (!els.patternTags) return;
    els.patternTags.scrollBy({ left: offset, behavior: "smooth" });
    setTimeout(updateTagScrollButtons, 160);
}

function getCompDesc(l) {
    return { low: "Easy to follow", medium: "Moderate", high: "Consider refactor" }[l] || "";
}

const TAG_ICONS = {
    "function": "codicon-symbol-function", "class": "codicon-symbol-class",
    "interface": "codicon-symbol-interface", "async": "codicon-symbol-event",
    "react": "codicon-symbol-structure", "component": "codicon-symbol-method",
    "import": "codicon-symbol-namespace", "export": "codicon-symbol-package",
    "error-handling": "codicon-warning", "validation": "codicon-check",
    "data-fetch": "codicon-cloud-download", "state-management": "codicon-database",
    "routing": "codicon-link", "styling": "codicon-paintcan", "testing": "codicon-beaker",
    "performance": "codicon-zap", "security": "codicon-shield", "documentation": "codicon-book",
    "types": "codicon-symbol-boolean", "naming": "codicon-tag", "hooks": "codicon-symbol-event",
    "promise": "codicon-symbol-event", "generator": "codicon-refresh"
};

function getTagIcon(p) {
    const key = p.toLowerCase().replace(/\s+/g, "-");
    return TAG_ICONS[key] || "codicon-symbol-misc";
}

const ALGO_ICONS = {
    "AST Parser": "codicon-symbol-file", "Complexity": "codicon-graph", "Patterns": "codicon-symbol-keyword",
    "Testability": "codicon-symbol-boolean", "Dependencies": "codicon-symbol-package",
    "Documentation": "codicon-book", "Naming": "codicon-tag", "Security": "codicon-shield",
    "Performance": "codicon-zap", "Framework": "codicon-symbol-structure",
    "Data Flow": "codicon-symbol-namespace", "Control Flow": "codicon-debug-alt",
    "Types": "codicon-symbol-boolean", "Halstead": "codicon-graph-line",
    "Code Smells": "codicon-bug", "Dead Code": "codicon-trash", "Promise Flow": "codicon-sync",
    "Regex": "codicon-regex", "Cognitive": "codicon-combine", "Comment Quality": "codicon-comment",
    "Side Effects": "codicon-flame", "Error Handling": "codicon-issue-reopened", "Readability": "codicon-eye",
    "Naming Consistency": "codicon-symbol-keyword", "Dependency Audit": "codicon-symbol-package",
    "Immutability": "codicon-lock", "Modern Syntax": "codicon-symbol-constant",
    "Style Consistency": "codicon-bracket", "Security Injection": "codicon-shield",
    "Concurrency Safety": "codicon-sync", "Resource Management": "codicon-server",
    "Duplicate Patterns": "codicon-copy", "Validation": "codicon-checklist",
    "Logging Patterns": "codicon-debug", "Exception Patterns": "codicon-alert",
    "Test Signals": "codicon-beaker", "Configuration Usage": "codicon-gear",
    "Build Safety": "codicon-package", "Lifecycle Hooks": "codicon-flame",
    "Legacy API Usage": "codicon-history"
};

function getAlgoIcon(name) {
    return ALGO_ICONS[name] || "codicon-symbol-misc";
}

const INS_ICONS = {
    positive: "codicon-check", warning: "codicon-warning",
    suggestion: "codicon-lightbulb", info: "codicon-info"
};

function getInsIcon(t) { return INS_ICONS[t] || "codicon-info"; }

// ── EVENT HANDLERS ──
els.refresh.onclick = () => vscode.postMessage({ type: "refreshSelection" });
els.retry.onclick = () => vscode.postMessage({ type: "refreshSelection" });
els.modeStd.onclick = () => vscode.postMessage({ type: "setMode", mode: "standard" });
els.modeBeg.onclick = () => vscode.postMessage({ type: "setMode", mode: "beginner" });
els.tagPrev.onclick = () => scrollTags(-140);
els.tagNext.onclick = () => scrollTags(140);
if (els.patternTags) {
    els.patternTags.onscroll = updateTagScrollButtons;
}
els.tabBasic.onclick = () => setActiveTab("basic");
els.tabAnalysis.onclick = () => setActiveTab("analysis");
els.copyIns.onclick = () => vscode.postMessage({ type: "copySection", section: "insights" });
els.copySum.onclick = () => vscode.postMessage({ type: "copySection", section: "summary" });
els.copyDet.onclick = () => vscode.postMessage({ type: "copySection", section: "details" });
els.copy.onclick = () => vscode.postMessage({ type: "copySection", section: "summary" });
els.exportBtn.onclick = () => vscode.postMessage({ type: "exportMarkdown" });
els.expandDetBtn.onclick = () => {
    detExpanded = !detExpanded;
    els.detText.classList.toggle("expanded", detExpanded);
    els.expandDetBtn.innerHTML = detExpanded
        ? '<i class="codicon codicon-fold"></i> Collapse'
        : '<i class="codicon codicon-unfold"></i> Expand';
};

// ── MESSAGE HANDLER ──
window.addEventListener("message", e => {
    const m = e.data;

    if (m.type === "loading") {
        showState("stateLoading");
        els.loadText.textContent = m.step || "Analyzing...";
        els.progFill.style.width = Math.min(100, m.progress || 0) + "%";
        els.progStep.textContent = m.step || "";
    }

    if (m.type === "empty") {
        showState("stateEmpty");
        els.status.textContent = "Waiting";
    }

    if (m.type === "error") {
        els.errMsg.textContent = m.message || "An error occurred.";
        showState("stateError");
        els.status.textContent = "Error";
    }

    if (m.type === "toggleDetailsExpand") {
        detExpanded = !detExpanded;
        els.detText.classList.toggle("expanded", detExpanded);
    }

    if (m.type === "update") {
        const d = m.explanation;
        updateModeButtons(d.mode);
        els.algoBadge.textContent = d.algorithmsUsed + " analyzers";
        els.aiBadge.classList.toggle("visible", !!d.aiEnhanced);

        const langUpper = (d.language || "").toUpperCase();
        els.langBadge.textContent = langUpper;
        els.langBadge.classList.toggle("visible", !!langUpper);
        els.lang.textContent = "Lang: " + (d.language || "-");

        // Metrics
        const met = d.metrics;
        els.mComp.textContent = met.complexity.toUpperCase();
        els.mComp.className = "card-val " + met.complexity;
        els.mCompDesc.textContent = getCompDesc(met.complexity);
        els.mCyc.textContent = met.cyclomatic;
        els.mNest.textContent = met.nestingDepth;
        els.mMaint.textContent = met.maintainabilityIndex;
        els.mMaint.className = "card-val " + (met.maintainabilityIndex >= 65 ? "low" : met.maintainabilityIndex >= 40 ? "medium" : "high");
        els.mCog.textContent = met.cognitiveComplexity;
        els.mCog.className = "card-val " + (met.cognitiveComplexity <= 5 ? "low" : met.cognitiveComplexity <= 15 ? "medium" : "high");
        els.mSmells.textContent = met.codeSmells;
        els.mSmells.className = "card-val " + (met.codeSmells === 0 ? "low" : met.codeSmells <= 3 ? "medium" : "high");

        // Pattern tags
        els.patternTags.innerHTML = d.patterns.slice(0, 10).map(p =>
            '<span class="tag"><i class="codicon ' + getTagIcon(p) + '"></i>' + esc(p) + '</span>'
        ).join("");
        requestAnimationFrame(updateTagScrollButtons);

        // Insights
        els.insights.innerHTML = d.insights.slice(0, 8).map(i => {
            const link = i.learnMore
                ? '<a href="#" class="learn" data-url="' + esc(i.learnMore) + '"><i class="codicon codicon-link-external"></i> Learn</a>'
                : "";
            return '<div class="insight ' + esc(i.type) + '">' +
                '<div class="ins-icon"><i class="codicon ' + getInsIcon(i.type) + '"></i></div>' +
                '<div class="ins-body">' +
                '<div class="ins-msg">' + esc(i.message) + '</div>' +
                (i.detail ? '<div class="ins-detail">' + esc(i.detail) + '</div>' : '') +
                '<div class="ins-meta"><span class="pri ' + esc(i.priority) + '">' + esc(i.priority) + '</span>' + (link ? ' ' + link : '') + '</div>' +
                '</div>' +
                '</div>';
        }).join("");

        // Attach learn-more handlers
        els.insights.querySelectorAll(".learn").forEach(a => {
            a.onclick = ev => {
                ev.preventDefault();
                vscode.postMessage({ type: "openLearnMore", url: a.dataset.url });
            };
        });

        // Summary
        const summaryText = d.mode === "beginner" ? d.beginner : d.standard;
        els.sumText.textContent = summaryText || "(No summary available)";
        els.sumText.className = "sum-text" + (d.mode === "beginner" ? " beginner" : "");

        setActiveTab(currentTab);

        // Details
        els.detText.textContent = d.details || "(No details available)";
        detExpanded = false;
        els.detText.classList.remove("expanded");
        els.expandDetBtn.innerHTML = '<i class="codicon codicon-unfold"></i> Expand';

        // Algorithm result summaries
        els.algorithmResults.innerHTML = d.signals.map(s =>
            '<div class="algo-item"><div class="algo-title"><i class="codicon ' + getAlgoIcon(s.algorithm) + '"></i>' + esc(s.algorithm) + '</div>' +
            '<div class="algo-summary">' + esc(s.summary) + '</div></div>'
        ).join("");

        // Contributors
        els.contributors.innerHTML = d.topContributors.map(c =>
            '<span class="contributor"><i class="codicon ' + getAlgoIcon(c) + '"></i>' + esc(c) + '</span>'
        ).join("");

        // AI note
        const aiOk = !!d.aiEnhanced;
        const aiText = d.aiStatus || (aiOk ? "AI-enhanced analysis active." : "Static analysis only (AI unavailable).");
        els.aiNote.innerHTML = '<i class="codicon ' + (aiOk ? "codicon-check" : "codicon-warning") + '"></i> ' + esc(aiText);
        els.aiNote.className = "ai-note " + (aiOk ? "ok" : "warn");

        showState("stateContent");
        els.status.textContent = aiOk ? "AI-Enhanced" : "Static Analysis";
    }
});

// Init
showState("stateEmpty");