(() => {
    const vscode = acquireVsCodeApi();
    const barChart = document.getElementById('barChart');
    const bestStreak = document.getElementById('bestStreak');
    const maxActiveTime = document.getElementById('maxActiveTime');
    const selectionDetail = document.getElementById('selectionDetail');
    const detailDate = document.getElementById('detailDate');
    const detailDuration = document.getElementById('detailDuration');
    const detailActive = document.getElementById('detailActive');
    const detailStreak = document.getElementById('detailStreak');
    const emptyState = document.getElementById('emptyState');
    const trackerContent = document.getElementById('trackerContent');

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
                renderDashboard(message.history);
                break;
        }
    });

    function renderDashboard(history) {
        if (!history || history.length === 0) {
            emptyState.classList.remove('hidden');
            trackerContent.classList.add('hidden');
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
        const maxVal = Math.max(...history.map(s => s.activeTime), 1);
        
        // Take last 14 sessions for the chart
        const recentHistory = history.slice(-14);

        recentHistory.forEach((session, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'bar-wrapper';
            
            const height = (session.activeTime / maxVal) * 100;
            const bar = document.createElement('div');
            bar.className = 'bar ' + (index % 2 === 0 ? 'primary' : 'secondary');
            bar.style.height = `${Math.max(height, 5)}%`;
            
            wrapper.appendChild(bar);
            wrapper.addEventListener('click', () => showDetail(session));
            barChart.appendChild(wrapper);
        });

        // Show last session detail by default
        showDetail(history[history.length - 1]);
    }

    function showDetail(session) {
        selectionDetail.classList.remove('hidden');
        const date = new Date(session.date);
        detailDate.textContent = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        detailDuration.textContent = formatTime(session.totalTime);
        detailActive.textContent = formatTime(session.activeTime);
        detailStreak.textContent = formatTime(session.maxStreak);
    }

    document.getElementById('refreshBtn').addEventListener('click', () => {
        vscode.postMessage({ type: 'requestData' });
    });

    // Handle feature selector
    document.getElementById('featureSelector').addEventListener('change', (e) => {
        if (e.target.value === 'explainer') {
            // If they want to switch, but we are separate views, this is just a mockup
            // In a real unified view, we'd swap layouts here.
            console.log('Switch to explainer');
        }
    });

    // Initial data request
    vscode.postMessage({ type: 'requestData' });
})();
