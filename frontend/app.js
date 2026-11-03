const tg = window.Telegram.WebApp;
tg.expand();

const API_BASE = "https://trading-terminal-backend-wxs8.onrender.com";
let myChart = null;

function initUser() {
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        document.getElementById('user-info').innerText = tg.initDataUnsafe.user.first_name;
    } else {
        document.getElementById('user-info').innerText = "Dev User";
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${tabId}`).classList.add('active');
    event.currentTarget.classList.add('active');
    
    if (tabId === 'dashboard') loadDashboard();
    if (tabId === 'markets') loadMarkets();
    if (tabId === 'trades') loadTrades();
}

async function fetchAPI(endpoint) {
    const headers = {};
    if (tg.initData) {
        headers['X-Telegram-Init-Data'] = tg.initData;
    }
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) { 
        console.error("API Error:", err);
        return null; 
    }
}

async function loadDashboard() {
    document.getElementById('paper-balance').innerText = "Loading...";
    document.getElementById('latest-signal').innerText = "Loading...";

    const account = await fetchAPI('/api/paper/account');
    document.getElementById('paper-balance').innerText = account ? `$${account.balance.toFixed(2)}` : "DATA UNAVAILABLE";

    const signal = await fetchAPI('/api/signals/analyze?symbol=BTC/USDT&market=crypto&timeframe=1h');
    const signalEl = document.getElementById('latest-signal');
    
    if (signal && signal.action) {
        let color = signal.action === 'BUY' ? 'var(--accent-green)' : signal.action === 'SELL' ? 'var(--accent-red)' : 'var(--text-muted)';
        signalEl.innerHTML = `<div style="font-size: 24px; font-weight: bold; color: ${color}; margin-bottom: 10px;">${signal.action}</div><div style="color: var(--text-muted); font-size: 12px;">${signal.reasons.join("<br>• ")}</div>`;
    } else { 
        signalEl.innerHTML = `<span style="color:red">DATA UNAVAILABLE</span>`; 
    }
    
    loadChart();
}

async function loadChart() {
    const chartContainer = document.getElementById('chart-container');
    chartContainer.innerHTML = '<div style="color: #848e9c; text-align: center; margin-top: 130px;">Loading Chart...</div>';

    const data = await fetchAPI('/api/market/candles?symbol=BTC/USDT&market=crypto&timeframe=1h&limit=50');
    
    if (!data || !data.candles || data.candles.length === 0) {
        chartContainer.innerHTML = '<div style="color: #f6465d; text-align: center; margin-top: 130px;">Chart Data Unavailable</div>';
        return;
    }
    
    chartContainer.innerHTML = '<canvas id="myChartCanvas"></canvas>';
    const ctx = document.getElementById('myChartCanvas').getContext('2d');

    if (myChart) { myChart.destroy(); }

    const labels = data.candles.map(c => {
        const d = new Date(c.time * 1000);
        return d.getHours() + ":00";
    });
    const closePrices = data.candles.map(c => c.close);

    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'BTC Price',
                data: closePrices,
                borderColor: '#0ecb81',
                backgroundColor: 'rgba(14, 203, 129, 0.1)',
                borderWidth: 2,
                fill: true,
                pointRadius: 0,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { display: false },
                y: { 
                    grid: { color: '#2b3139' },
                    ticks: { color: '#848e9c' }
                }
            }
        }
    });
}

async function loadMarkets() {
    const container = document.getElementById('market-list');
    container.innerHTML = 'Loading...';
    const data = await fetchAPI('/api/market/symbols');
    if (data && data.crypto) {
        container.innerHTML = data.crypto.map(sym => `<div class="card"><strong>${sym}</strong></div>`).join('');
    } else {
        container.innerHTML = 'Failed to load markets.';
    }
}

async function loadTrades() {
    const container = document.getElementById('trades-list');
    container.innerHTML = 'Loading...';
    const trades = await fetchAPI('/api/paper/trades');
    if (trades && trades.length > 0) {
        container.innerHTML = trades.map(t => `<div class="card" style="border-left: 4px solid ${t.side === 'BUY' ? 'var(--accent-green)' : 'var(--accent-red)'}"><strong>${t.symbol} - ${t.side}</strong><br>Entry: $${t.entry_price}</div>`).join('');
    } else { 
        container.innerHTML = 'No trades found.'; 
    }
}

document.addEventListener('DOMContentLoaded', () => { 
    initUser(); 
    setTimeout(loadDashboard, 1000);
});