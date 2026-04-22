/**
 * Dev Toolkit — Session Tracker Dashboard
 * Implements: tabs, live strip, today stats, heatmap, goals ring,
 *             achievements engine, badge system, history chart, export.
 */
(() => {
    'use strict';

    const vscode = acquireVsCodeApi();

    // ── Persisted UI state ────────────────────────────────────────
    const uiState = vscode.getState() || { activeTab: 'today', goalMinutes: 120 };

    // ════════════════════════════════════════════════════════════════
    // ACHIEVEMENT DEFINITIONS
    // ════════════════════════════════════════════════════════════════
    const ACHIEVEMENTS = {
        milestones: [
            { id: 'first_session',   name: 'First Commit',    desc: 'Complete your first tracked session', icon: 'codicon-rocket',     check: (h) => h.length >= 1 },
            { id: 'hour_one',        name: 'Hour One',        desc: 'Accumulate 1 hour total',             icon: 'codicon-clock',      check: (h) => totalActiveHours(h) >= 1 },
            { id: 'tenner',          name: 'The Tenner',      desc: 'Reach 10 total hours',                icon: 'codicon-star',       check: (h) => totalActiveHours(h) >= 10 },
            { id: 'century',         name: 'Century',         desc: 'Reach 100 total hours',               icon: 'codicon-trophy',     check: (h) => totalActiveHours(h) >= 100 },
            { id: 'five_hundred',    name: '500 Club',        desc: 'Reach 500 total hours',               icon: 'codicon-verified',   check: (h) => totalActiveHours(h) >= 500 },
            { id: 'thousand_hours',  name: 'Thousand Hours',  desc: '1,000 hours — legendary',             icon: 'codicon-flame',      check: (h) => totalActiveHours(h) >= 1000 },
        ],
        streaks: [
            { id: 'consistent',   name: 'Consistent',   desc: '3-day coding streak',              icon: 'codicon-flame',     check: (h) => maxDayStreak(h) >= 3 },
            { id: 'on_a_roll',    name: 'On a Roll',    desc: '7-day streak',                     icon: 'codicon-flame',     check: (h) => maxDayStreak(h) >= 7 },
            { id: 'unstoppable',  name: 'Unstoppable',  desc: '30-day streak',                    icon: 'codicon-flame',     check: (h) => maxDayStreak(h) >= 30 },
            { id: 'iron_will',    name: 'Iron Will',    desc: '100-day streak',                   icon: 'codicon-flame',     check: (h) => maxDayStreak(h) >= 100 },
            { id: 'no_days_off',  name: 'No Days Off',  desc: 'Full calendar month without miss', icon: 'codicon-calendar',  check: (h) => fullMonthStreak(h) },
        ],
        flow: [
            { id: 'in_the_zone',   name: 'In the Zone',   desc: 'First flow state (25+ min streak)', icon: 'codicon-zap',        check: (h) => h.some(s => s.maxStreak >= 1500) },
            { id: 'deep_work',     name: 'Deep Work',     desc: '2-hour uninterrupted session',      icon: 'codicon-zap',        check: (h) => h.some(s => s.maxStreak >= 7200) },
            { id: 'the_architect', name: 'The Architect', desc: '5 flow sessions in one day',        icon: 'codicon-symbol-misc',check: (h) => fiveFlowInDay(h) },
            { id: 'monk_mode',     name: 'Monk Mode',     desc: '4-hour continuous streak',          icon: 'codicon-eye-closed', check: (h) => h.some(s => s.maxStreak >= 14400) },
        ],
        productivity: [
            { id: 'marathon',        name: 'Marathon',        desc: 'Single session > 6 hours',      icon: 'codicon-run',         check: (h) => h.some(s => s.totalTime >= 21600) },
            { id: 'weekend_warrior', name: 'Weekend Warrior', desc: '4+ hours on a weekend day',     icon: 'codicon-calendar',    check: (h) => weekendWarrior(h) },
        ],
        timeOfDay: [
            { id: 'night_owl',      name: 'Night Owl',      desc: 'Code past midnight, 5 sessions', icon: 'codicon-moon',   check: (h) => timeOfDayCount(h, 0, 2) >= 5 },
            { id: 'early_bird',     name: 'Early Bird',     desc: 'Code before 7 AM, 5 sessions',   icon: 'codicon-cloud',  check: (h) => timeOfDayCount(h, 4, 7) >= 5 },
            { id: 'graveyard',      name: 'Graveyard Shift',desc: 'Code between 2–4 AM',            icon: 'codicon-moon',   check: (h) => timeOfDayCount(h, 2, 4) >= 1 },
        ],
    };

    // ════════════════════════════════════════════════════════════════
    // BADGE DEFINITIONS  (Bronze → Silver → Gold → Platinum → Diamond)
    // ════════════════════════════════════════════════════════════════
    const BADGE_TIERS = ['none', 'bronze', 'silver', 'gold', 'platinum', 'diamond'];
    const BADGE_TIER_LABELS = ['—', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'];

    const BADGES = [
        {
            id: 'code_clock', name: 'Code Clock', icon: 'codicon-watch',
            desc: 'Total active hours',
            thresholds: [10, 50, 200, 500, 1000], // hours
            value: (h) => totalActiveHours(h),
            unit: 'h',
        },
        {
            id: 'fire_keeper', name: 'Fire Keeper', icon: 'codicon-flame',
            desc: 'Consecutive coding days',
            thresholds: [3, 7, 30, 60, 100],
            value: (h) => maxDayStreak(h),
            unit: 'days',
        },
        {
            id: 'focus_forge', name: 'Focus Forge', icon: 'codicon-zap',
            desc: 'Flow state sessions (25+ min streak)',
            thresholds: [5, 20, 50, 100, 250],
            value: (h) => h.filter(s => s.maxStreak >= 1500).length,
            unit: 'sessions',
        },
        {
            id: 'iron_coder', name: 'Iron Coder', icon: 'codicon-shield',
            desc: '% of days coded in last 90 days',
            thresholds: [25, 50, 75, 90, 100],
            value: (h) => consistencyPct(h),
            unit: '%',
        },
    ];

    // ════════════════════════════════════════════════════════════════
    // STAT HELPERS
    // ════════════════════════════════════════════════════════════════

    function totalActiveSeconds(history) {
        return history.reduce((a, s) => a + (s.activeTime || 0), 0);
    }

    function totalActiveHours(history) {
        return totalActiveSeconds(history) / 3600;
    }

    function sessionsByDay(history) {
        const map = {};
        history.forEach(s => {
            const day = new Date(s.date).toDateString();
            if (!map[day]) map[day] = [];
            map[day].push(s);
        });
        return map;
    }

    function maxDayStreak(history) {
        const days = Object.keys(sessionsByDay(history))
            .map(d => new Date(d).getTime())
            .sort((a, b) => a - b);
        if (!days.length) return 0;
        let max = 1, cur = 1;
        for (let i = 1; i < days.length; i++) {
            const diff = (days[i] - days[i - 1]) / 86400000;
            if (diff <= 1.5) { cur++; max = Math.max(max, cur); }
            else cur = 1;
        }
        return max;
    }

    function currentDayStreak(history) {
        const days = Object.keys(sessionsByDay(history))
            .map(d => new Date(d).getTime())
            .sort((a, b) => b - a); // descending
        if (!days.length) return 0;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        let cur = 0, check = today.getTime();
        for (const d of days) {
            const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
            const diff = (check - dayStart.getTime()) / 86400000;
            if (diff < 1.5) { cur++; check = dayStart.getTime() - 1; }
            else break;
        }
        return cur;
    }

    function fullMonthStreak(history) {
        const byDay = sessionsByDay(history);
        const now = new Date();
        const y = now.getFullYear(), m = now.getMonth();
        const days = new Date(y, m, 0).getDate(); // days in last month
        for (let d = 1; d <= days; d++) {
            const key = new Date(y, m - 1, d).toDateString();
            if (!byDay[key]) return false;
        }
        return true;
    }

    function fiveFlowInDay(history) {
        const byDay = sessionsByDay(history);
        return Object.values(byDay).some(sessions =>
            sessions.filter(s => s.maxStreak >= 1500).length >= 5
        );
    }

    function weekendWarrior(history) {
        const byDay = sessionsByDay(history);
        return Object.entries(byDay).some(([dayStr, sessions]) => {
            const dow = new Date(dayStr).getDay();
            if (dow !== 0 && dow !== 6) return false;
            const total = sessions.reduce((a, s) => a + s.activeTime, 0);
            return total >= 14400;
        });
    }

    function timeOfDayCount(history, hourStart, hourEnd) {
        return history.filter(s => {
            const h = new Date(s.date).getHours();
            return h >= hourStart && h < hourEnd;
        }).length;
    }

    function consistencyPct(history) {
        const byDay = sessionsByDay(history);
        const now = Date.now();
        let coded = 0;
        for (let i = 0; i < 90; i++) {
            const d = new Date(now - i * 86400000).toDateString();
            if (byDay[d]) coded++;
        }
        return Math.round((coded / 90) * 100);
    }

    function todaySeconds(history) {
        const today = new Date().toDateString();
        return history
            .filter(s => new Date(s.date).toDateString() === today)
            .reduce((a, s) => a + s.activeTime, 0);
    }

    function todayFlowSeconds(history) {
        const today = new Date().toDateString();
        return history
            .filter(s => new Date(s.date).toDateString() === today && s.maxStreak >= 1500)
            .reduce((a, s) => a + s.maxStreak, 0);
    }

    function todayBestStreak(history) {
        const today = new Date().toDateString();
        return history
            .filter(s => new Date(s.date).toDateString() === today)
            .reduce((a, s) => Math.max(a, s.maxStreak), 0);
    }

    // ════════════════════════════════════════════════════════════════
    // FORMAT HELPERS
    // ════════════════════════════════════════════════════════════════

    function fmt(sec) {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m ${s}s`;
        return `${s}s`;
    }

    function fmtHours(sec) {
        const h = (sec / 3600).toFixed(1);
        return `${h}h`;
    }

    // ════════════════════════════════════════════════════════════════
    // DOM REFS
    // ════════════════════════════════════════════════════════════════

    const $ = (id) => document.getElementById(id);
    const tabs       = document.querySelectorAll('.tab');
    const panels     = document.querySelectorAll('.tab-panel');
    const liveStrip  = $('liveStrip');

    // ── Tab navigation ────────────────────────────────────────────
    function activateTab(name) {
        tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
        panels.forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));
        uiState.activeTab = name;
        vscode.setState(uiState);
    }

    tabs.forEach(t => t.addEventListener('click', () => activateTab(t.dataset.tab)));
    activateTab(uiState.activeTab || 'today');

    // ════════════════════════════════════════════════════════════════
    // RENDER FUNCTIONS
    // ════════════════════════════════════════════════════════════════

    // ── Live strip ────────────────────────────────────────────────
    function renderLiveStrip(isTracking, efficiency, session, isIdle) {
        if (!isTracking) {
            liveStrip.classList.add('hidden');
            return;
        }
        liveStrip.classList.remove('hidden');
        $('liveTime').textContent = session ? fmt(session.activeTime) : '0m 0s';
        $('liveState').textContent = isIdle ? 'Idle' : 'Active';
        const pct = Math.max(0, Math.min(100, Math.round(efficiency)));
        $('effPct').textContent = `${pct}%`;
        const fill = $('effFill');
        fill.style.width = `${pct}%`;
        fill.style.backgroundColor =
            pct >= 70 ? 'var(--vscode-testing-iconPassed, #4caf50)' :
            pct >= 40 ? 'var(--vscode-charts-yellow, #e8a020)' :
                        'var(--vscode-testing-iconErrored, #f48771)';
    }

    // ── Today tab ─────────────────────────────────────────────────
    function renderToday(history) {
        const hasData = history.length > 0;
        $('emptyToday').classList.toggle('hidden', hasData);
        $('todayContent').style.display = hasData ? '' : 'none';
        if (!hasData) return;

        const todaySec   = todaySeconds(history);
        const todaySess  = history.filter(s => new Date(s.date).toDateString() === new Date().toDateString()).length;
        const flowSec    = todayFlowSeconds(history);
        const bestSt     = todayBestStreak(history);

        $('todayActive').textContent   = fmt(todaySec);
        $('todaySessions').textContent = todaySess;
        $('todayFlow').textContent     = flowSec > 0 ? fmt(flowSec) : '—';
        $('todayStreak').textContent   = fmt(bestSt);

        // All-time
        const allSec    = totalActiveSeconds(history);
        const allStreak = history.reduce((a, s) => Math.max(a, s.maxStreak), 0);
        const longest   = history.reduce((a, s) => Math.max(a, s.totalTime), 0);
        const firstDate = history.length
            ? new Date(history[0].date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
            : '—';

        $('allSessions').textContent = history.length;
        $('allActive').textContent   = fmtHours(allSec);
        $('allStreak').textContent   = fmt(allStreak);
        $('allLongest').textContent  = fmt(longest);
        $('allSince').textContent    = firstDate;

        renderHeatmap(history);
    }

    // ── Heatmap ───────────────────────────────────────────────────
    function renderHeatmap(history) {
        const container = $('heatmap');
        container.innerHTML = '';

        // Build a map of day → totalActiveSeconds
        const byDay = {};
        history.forEach(s => {
            const key = new Date(s.date).toDateString();
            byDay[key] = (byDay[key] || 0) + s.activeTime;
        });

        // Max for colour scaling
        const maxSec = Math.max(...Object.values(byDay), 1);

        // 12 weeks = 84 days, rendered as 12 columns of 7
        const WEEKS = 12;
        const now   = new Date(); now.setHours(23, 59, 59, 999);

        for (let w = WEEKS - 1; w >= 0; w--) {
            const col = document.createElement('div');
            col.className = 'heatmap-col';
            for (let d = 6; d >= 0; d--) {
                const dayOffset = w * 7 + d;
                const date      = new Date(now.getTime() - dayOffset * 86400000);
                const key       = date.toDateString();
                const sec       = byDay[key] || 0;
                const level     = sec === 0 ? 0 : Math.min(4, Math.ceil((sec / maxSec) * 4));
                const cell      = document.createElement('div');
                cell.className  = 'hcell';
                cell.dataset.level = level;
                cell.title = `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${sec > 0 ? fmt(sec) : 'No coding'}`;
                col.appendChild(cell);
            }
            container.appendChild(col);
        }
    }

    // ── Goals tab ─────────────────────────────────────────────────
    function renderGoals(history, isTracking) {
        const goalSec    = (uiState.goalMinutes || 120) * 60;
        const codedSec   = todaySeconds(history);
        const pct        = Math.min(100, Math.round((codedSec / goalSec) * 100));
        const remaining  = Math.max(0, goalSec - codedSec);

        $('goalTarget').textContent    = fmt(goalSec);
        $('goalCoded').textContent     = fmt(codedSec);
        $('goalRemaining').textContent = remaining > 0 ? fmt(remaining) : 'Goal reached!';
        $('goalPct').textContent       = `${pct}%`;
        $('goalInput').value           = uiState.goalMinutes || 120;

        // Ring: circumference = 2π × 42 ≈ 263.9
        const circ = 263.9;
        const offset = circ - (pct / 100) * circ;
        $('ringFill').style.strokeDashoffset = offset;
        $('ringFill').style.stroke =
            pct >= 100 ? 'var(--vscode-testing-iconPassed, #4caf50)' :
                         'var(--vscode-focusBorder, #007acc)';

        // ETA
        if (isTracking && codedSec > 0 && remaining > 0) {
            const todaySessions = history.filter(s =>
                new Date(s.date).toDateString() === new Date().toDateString()
            );
            const totalToday = todaySessions.reduce((a, s) => a + s.totalTime, 1);
            const rate = codedSec / totalToday; // active fraction
            const etaSec = remaining / Math.max(rate, 0.1);
            const eta = new Date(Date.now() + etaSec * 1000);
            $('goalEta').textContent = eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else {
            $('goalEta').textContent = pct >= 100 ? 'Done!' : '—';
        }
    }

    // ── Achievements tab ──────────────────────────────────────────
    let prevUnlocked = new Set();

    function renderAchievements(history) {
        const unlocked = new Set();
        let totalCount = 0;

        function renderCategory(containerId, list) {
            const el = $(containerId);
            el.innerHTML = '';
            list.forEach(ach => {
                totalCount++;
                const isUnlocked = ach.check(history);
                if (isUnlocked) unlocked.add(ach.id);

                const item = document.createElement('div');
                item.className = `ach-item ${isUnlocked ? 'unlocked' : 'locked'}`;
                item.innerHTML = `
                    <i class="codicon ${ach.icon} ach-icon"></i>
                    <div class="ach-text">
                        <span class="ach-name">${ach.name}</span>
                        <span class="ach-desc">${ach.desc}</span>
                    </div>
                    ${isUnlocked ? '<i class="codicon codicon-check ach-check"></i>' : ''}
                `;
                el.appendChild(item);
            });
        }

        renderCategory('achMilestones',  ACHIEVEMENTS.milestones);
        renderCategory('achStreaks',      ACHIEVEMENTS.streaks);
        renderCategory('achFlow',         ACHIEVEMENTS.flow);
        renderCategory('achProductivity', ACHIEVEMENTS.productivity);
        renderCategory('achTimeOfDay',    ACHIEVEMENTS.timeOfDay);

        $('achCount').textContent = `${unlocked.size} / ${totalCount}`;

        // Toast for newly unlocked
        unlocked.forEach(id => {
            if (!prevUnlocked.has(id) && prevUnlocked.size > 0) {
                const all = [
                    ...ACHIEVEMENTS.milestones, ...ACHIEVEMENTS.streaks,
                    ...ACHIEVEMENTS.flow, ...ACHIEVEMENTS.productivity,
                    ...ACHIEVEMENTS.timeOfDay
                ];
                const ach = all.find(a => a.id === id);
                if (ach) showToast(ach.name);
            }
        });
        prevUnlocked = unlocked;
    }

    // ── Badges tab ────────────────────────────────────────────────
    function renderBadges(history) {
        const grid = $('badgeGrid');
        grid.innerHTML = '';

        BADGES.forEach(badge => {
            const val   = badge.value(history);
            // Find tier index (0 = none, 1-5 = bronze–diamond)
            let tier = 0;
            badge.thresholds.forEach((threshold, i) => {
                if (val >= threshold) tier = i + 1;
            });

            const nextThreshold = badge.thresholds[tier] ?? null;
            const prevThreshold = badge.thresholds[tier - 1] ?? 0;
            const progPct = nextThreshold
                ? Math.min(100, Math.round(((val - prevThreshold) / (nextThreshold - prevThreshold)) * 100))
                : 100;
            const tierName  = BADGE_TIER_LABELS[tier];
            const tierClass = BADGE_TIERS[tier];

            const card = document.createElement('div');
            card.className = `badge-card tier-${tierClass} ${tier > 0 ? 'earned' : ''}`;
            card.innerHTML = `
                <div class="badge-top">
                    <div class="badge-icon">
                        <i class="codicon ${badge.icon}"></i>
                    </div>
                    <div>
                        <div class="badge-name">${badge.name}</div>
                        <div class="badge-tier">${tierName}</div>
                    </div>
                </div>
                <div class="badge-prog-track">
                    <div class="badge-prog-fill" style="width:${tier < 5 ? progPct : 100}%"></div>
                </div>
                <div class="badge-prog-label">
                    ${tier < 5
                        ? `${val}${badge.unit} / ${nextThreshold}${badge.unit}`
                        : 'Max tier reached'}
                </div>
            `;
            grid.appendChild(card);
        });
    }

    // ── History chart ─────────────────────────────────────────────
    let selectedId;

    function renderHistory(history) {
        const chart = $('barChart');
        chart.innerHTML = '';
        if (!history.length) return;

        const recent = history.slice(-14);
        const maxVal = Math.max(...recent.map(s => s.activeTime), 1);
        const sel    = recent.find(s => s.id === selectedId);

        recent.forEach(session => {
            const pct     = Math.max((session.activeTime / maxVal) * 100, 2);
            const wrapper = document.createElement('div');
            wrapper.className = 'bar-wrapper';
            const bar     = document.createElement('div');
            bar.className = 'bar';
            bar.style.height = `${pct}%`;
            wrapper.appendChild(bar);
            wrapper.addEventListener('click', () => showDetail(session, true));
            chart.appendChild(wrapper);
        });

        showDetail(sel || history[history.length - 1]);
    }

    function showDetail(session, persist = false) {
        if (!session) return;
        const detail = $('selectionDetail');
        detail.classList.remove('hidden');
        const d = new Date(session.date);
        $('detailDate').textContent     = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        $('detailDuration').textContent = fmt(session.totalTime);
        $('detailActive').textContent   = fmt(session.activeTime);
        $('detailStreak').textContent   = fmt(session.maxStreak);
        const eff = session.totalTime > 0 ? Math.round((session.activeTime / session.totalTime) * 100) : 100;
        $('detailEff').textContent = `${eff}%`;
        if (persist) selectedId = session.id;
    }

    // ── Toast ─────────────────────────────────────────────────────
    let toastTimer;
    function showToast(name) {
        const toast = $('achToast');
        $('toastName').textContent = name;
        clearTimeout(toastTimer);
        toast.classList.remove('hidden');
        requestAnimationFrame(() => toast.classList.add('show'));
        toastTimer = setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.classList.add('hidden'), 350);
        }, 3500);
    }

    // ── Export ────────────────────────────────────────────────────
    function exportJson(history) {
        vscode.postMessage({ type: 'exportData', format: 'json', history });
    }

    function exportCsv(history) {
        vscode.postMessage({ type: 'exportData', format: 'csv', history });
    }

    // ════════════════════════════════════════════════════════════════
    // MASTER RENDER
    // ════════════════════════════════════════════════════════════════
    let lastHistory = [];
    let lastTracking = true;
    let lastEfficiency = 100;
    let lastSession = null;
    let lastIdle = false;

    function render(history, isTracking, efficiency, liveSession, isIdle) {
        lastHistory    = history;
        lastTracking   = isTracking;
        lastEfficiency = efficiency;
        lastSession    = liveSession;
        lastIdle       = isIdle;

        renderLiveStrip(isTracking, efficiency, liveSession, isIdle);
        renderToday(history);
        renderGoals(history, isTracking);
        renderAchievements(history);
        renderBadges(history);
        renderHistory(history);
    }

    // ════════════════════════════════════════════════════════════════
    // MESSAGE HANDLER
    // ════════════════════════════════════════════════════════════════
    window.addEventListener('message', event => {
        const msg = event.data;
        if (msg.type === 'history') {
            render(
                msg.history     || [],
                msg.isTracking  ?? true,
                msg.efficiency  ?? 100,
                msg.liveSession ?? null,
                msg.isIdle      ?? false
            );
        }
    });

    // ════════════════════════════════════════════════════════════════
    // BUTTON EVENTS
    // ════════════════════════════════════════════════════════════════

    function updateToggleBtn(isTracking) {
        const btn  = $('toggleTrackingBtn');
        const icon = btn.querySelector('.codicon');
        btn.classList.toggle('paused', !isTracking);
        btn.title  = isTracking ? 'Pause tracking' : 'Resume tracking';
        icon.className = `codicon ${isTracking ? 'codicon-debug-pause' : 'codicon-play'}`;
    }

    $('toggleTrackingBtn').addEventListener('click', () => {
        vscode.postMessage({ type: 'toggleTracking' });
    });

    $('clearHistoryBtn').addEventListener('click', () => {
        vscode.postMessage({ type: 'clearHistory' });
    });

    $('exportBtn').addEventListener('click', () => {
        activateTab('history');
    });

    $('exportJsonBtn').addEventListener('click', () => exportJson(lastHistory));
    $('exportCsvBtn').addEventListener('click', () => exportCsv(lastHistory));

    $('goalSaveBtn').addEventListener('click', () => {
        const val = parseInt($('goalInput').value, 10);
        if (val >= 15 && val <= 720) {
            uiState.goalMinutes = val;
            vscode.setState(uiState);
            renderGoals(lastHistory, lastTracking);
        }
    });

    // Keep toggle button in sync with external state changes
    window.addEventListener('message', event => {
        if (event.data.type === 'history') {
            updateToggleBtn(event.data.isTracking ?? true);
        }
    });

    // ── Initial request ───────────────────────────────────────────
    vscode.postMessage({ type: 'requestData' });
})();
