// Initialize Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand(); // Make it full height

// Backend API Base URL
// Agar aap local laptop par test kar rahe hain toh 127.0.0.1 chalega.
const API_BASE = "http://127.0.0.1:8000";

let chart = null;
let candleSeries = null;

// Setup User Info from Telegram
function initUser() {
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        const user = tg.initDataUnsafe.user;
        document.getElementById('user-info').innerText = user.first_name || user.username;
    } else {
        // Fallback for browser testing
        document.getElementById('user-info').innerText = "Dev User";
    }
}

// Navigation logic
function switchTab(tabId) {
    // Hide all views
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    // Remove active from nav buttons
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

    // Show selected view
    document.getElementById(`view-${tabId}`).classList.add('active');
    // Highlight nav button
    event.currentTarget.classList.add('active');

    if (tabId === 'dashboard') {
        loadDashboard();
    } else if (tabId === 'markets') {
        loadMarkets();
    } else if (tabId === 'trades') {
        loadTrades();
    }
}

// Helper to make API calls with Telegram Auth Header
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

// --- Dashboard Logic ---
async function loadDashboard() {
    // 1. Fetch Balance
    const account = await fetchAPI('/api/paper/account');
    if (account) {
        document.getElementById('paper-balance').innerText = `$${account.balance.toFixed(2)}`;
    } else {
        document.getElementById('paper-balance').innerText = "DATA UNAVAILABLE";
    }

    // 2. Fetch Signal
    const signal = await fetchAPI('/api/signals/analyze?symbol=BTC/USDT&market=crypto&timeframe=1h');
    const signalEl = document.getElementById('latest-signal');
    
    if (signal) {
        let color = signal.action === 'BUY' ? 'var(--accent-green)' : 
                    signal.action === 'SELL' ? 'var(--accent-red)' : 'var(--text-muted)';
        
        signalEl.innerHTML = `
            <div style="font-size: 24px; font-weight: bold; color: ${color}; margin-bottom: 10px;">
                ${signal.action}
            </div>
            <div style="color: var(--text-muted); font-size: 12px; margin-bottom: 10px;">
                ${signal.reasons.join("<br>• ")}
            </div>
        `;
    } else {
        signalEl.innerHTML = `<span class="error">DATA UNAVAILABLE</span>`;
    }

    // 3. Load Chart
    loadChart();
}

async function loadChart() {
    if (typeof LightweightCharts === 'undefined') return; // Library not loaded

    const data = await fetchAPI('/api/market/candles?symbol=BTC/USDT&market=crypto&timeframe=1h&limit=50');
    
    if (!data || !data.candles) return;

    const chartContainer = document.getElementById('chart-container');
    
    // Create chart if it doesn't exist
    if (!chart) {
        chart = LightweightCharts.createChart(chartContainer, {
            width: chartContainer.clientWidth,
            height: 300,
            layout: { background: { color: 'transparent' }, textColor: '#848e9c' },
            grid: { vertLines: { color: '#2b3139' }, horzLines: { color: '#2b3139' } },
            timeScale: { timeVisible: true },
        });
        candleSeries = chart.addCandlestickSeries({
            upColor: '#0ecb81', downColor: '#f6465d', borderVisible: false,
            wickUpColor: '#0ecb81', wickDownColor: '#f6465d',
        });
    }
    
    // Format data for Lightweight Charts
    const formattedData = data.candles.map(c => ({
        time: c.time, open: c.open, high: c.high, low: c.low, close: c.close
    }));
    
    candleSeries.setData(formattedData);
    chart.timeScale().fitContent();
}

// --- Markets Logic ---
async function loadMarkets() {
    const container = document.getElementById('market-list');
    container.innerHTML = '<div class="loading">Loading markets...</div>';
    
    const data = await fetchAPI('/api/market/symbols');
    if (data && data.crypto) {
        container.innerHTML = data.crypto.map(sym => `
            <div class="card" onclick="alert('Chart for ${sym} coming soon!')">
                <div style="display: flex; justify-content: space-between;">
                    <strong>${sym}</strong>
                    <span style="color: var(--text-muted)">Crypto</span>
                </div>
            </div>
        `).join('');
    } else {
        container.innerHTML = '<div class="error">Failed to load markets.</div>';
    }
}

// --- Trades Logic ---
async function loadTrades() {
    const container = document.getElementById('trades-list');
    container.innerHTML = '<div class="loading">Loading trades...</div>';

    const trades = await fetchAPI('/api/paper/trades');
    if (trades && trades.length > 0) {
        container.innerHTML = trades.map(t => `
            <div class="card" style="border-left: 4px solid ${t.side === 'BUY' ? 'var(--accent-green)' : 'var(--accent-red)'}">
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <strong>${t.symbol}</strong>
                    <span style="color: ${t.side === 'BUY' ? 'var(--accent-green)' : 'var(--accent-red)'}">${t.side}</span>
                </div>
                <div style="font-size: 12px; color: var(--text-muted);">
                    Entry: $${t.entry_price} | Qty: ${t.quantity}<br>
                    Status: ${t.status}
                    ${t.realized_pnl ? `<br>PnL: <span style="color: ${t.realized_pnl > 0 ? 'var(--accent-green)' : 'var(--accent-red)'}">$${t.realized_pnl.toFixed(2)}</span>` : ''}
                </div>
            </div>
        `).join('');
    } else {
        container.innerHTML = '<div class="card">No paper trades found.</div>';
    }
}

// Initialize on Load
document.addEventListener('DOMContentLoaded', () => {
    initUser();
    loadDashboard(); // Load default tab
});