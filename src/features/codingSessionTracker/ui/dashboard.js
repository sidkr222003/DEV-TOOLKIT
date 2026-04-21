(() => {
    const vscode = acquireVsCodeApi();
    const barChart = document.getElementById('barChart');
    const toggleTrackingBtn = document.getElementById('toggleTrackingBtn');
    const bestStreak = document.getElementById('bestStreak');
    const maxActiveTime = document.getElementById('maxActiveTime');
    const selectionDetail = document.getElementById('selectionDetail');
    const detailDate = document.getElementById('detailDate');
    const detailDuration = document.getElementById('detailDuration');
    const detailActive = document.getElementById('detailActive');
    const detailStreak = document.getElementById('detailStreak');
    const emptyState = document.getElementById('emptyState');
    const trackerContent = document.getElementById('trackerContent');
    let selectedSessionId;

    const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m ${s}s`;
    };

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'history':
                renderDashboard(message.history, message.isTracking);
                break;
        }
    });

    function renderDashboard(history, isTracking) {
        updateTrackingButton(Boolean(isTracking));

        if (!history || history.length === 0) {
            emptyState.classList.remove('hidden');
            trackerContent.classList.add('hidden');
            selectedSessionId = undefined;
            return;
        }

        emptyState.classList.add('hidden');
        trackerContent.classList.remove('hidden');

        // Calculate Bests
        const best = history.reduce((acc, curr) => ({
            maxStreak: Math.max(acc.maxStreak, curr.maxStreak),
            maxActive: Math.max(acc.maxActive, curr.activeTime)
        }), { maxStreak: 0, maxActive: 0 });

        bestStreak.textContent = formatTime(best.maxStreak);
        maxActiveTime.textContent = formatTime(best.maxActive);

        // Render Chart
        barChart.innerHTML = '';
        
        // Take last 14 sessions for the chart
        const recentHistory = history.slice(-14);
        const maxVal = Math.max(...recentHistory.map(s => s.activeTime), 1);
        const selected = recentHistory.find(session => session.id === selectedSessionId);

        recentHistory.forEach((session, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'bar-wrapper';
            
            const height = (session.activeTime / maxVal) * 100;
            const bar = document.createElement('div');
            bar.className = 'bar ' + (index % 2 === 0 ? 'primary' : 'secondary');
            bar.style.height = `${Math.max(height, 5)}%`;
            
            wrapper.appendChild(bar);
            wrapper.addEventListener('click', () => showDetail(session, true));
            barChart.appendChild(wrapper);
        });

        // Keep selected session visible; fallback to latest session.
        showDetail(selected || history[history.length - 1]);
    }

    function showDetail(session, persistSelection = false) {
        selectionDetail.classList.remove('hidden');
        const date = new Date(session.date);
        detailDate.textContent = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        detailDuration.textContent = formatTime(session.totalTime);
        detailActive.textContent = formatTime(session.activeTime);
        detailStreak.textContent = formatTime(session.maxStreak);
        if (persistSelection) {
            selectedSessionId = session.id;
        }
    }

    function updateTrackingButton(isTracking) {
        const icon = toggleTrackingBtn.querySelector('.codicon');
        toggleTrackingBtn.classList.toggle('paused', !isTracking);
        toggleTrackingBtn.title = isTracking ? 'Pause Session' : 'Resume Session';
        icon.className = `codicon ${isTracking ? 'codicon-debug-pause' : 'codicon-play'}`;
    }

    document.getElementById('refreshBtn').addEventListener('click', () => {
        vscode.postMessage({ type: 'requestData' });
    });

    toggleTrackingBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'toggleTracking' });
    });

    // Initial data request
    vscode.postMessage({ type: 'requestData' });
})();
