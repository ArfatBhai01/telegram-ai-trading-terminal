const tg = window.Telegram.WebApp;
tg.expand();

const API_BASE = "https://trading-terminal-backend-wxs8.onrender.com";

let chart = null;
let candleSeries = null;
let currentSymbol = "BTC/USDT";

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

async function fetchAPI(endpoint, options = {}) {
    const headers = {};
    if (tg.initData) headers['X-Telegram-Init-Data'] = tg.initData;
    if (options.method === 'POST') headers['Content-Type'] = 'application/json';
    
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, { headers, ...options });
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

    const signal = await fetchAPI(`/api/signals/analyze?symbol=${currentSymbol}&market=crypto&timeframe=1h`);
    const signalEl = document.getElementById('latest-signal');
    const tradeActions = document.getElementById('trade-actions');
    
    if (signal && signal.action) {
        let color = signal.action === 'BUY' ? 'var(--accent-green)' : signal.action === 'SELL' ? 'var(--accent-red)' : 'var(--text-muted)';
        signalEl.innerHTML = `<div style="font-size: 24px; font-weight: bold; color: ${color}; margin-bottom: 10px;">${signal.action}</div><div style="color: var(--text-muted); font-size: 12px;">${signal.reasons.join("<br>• ")}</div>`;
        
        if (signal.action === 'BUY' || signal.action === 'SELL') {
            tradeActions.style.display = 'flex';
        } else {
            tradeActions.style.display = 'none';
        }
    } else { 
        signalEl.innerHTML = `<span style="color:red">DATA UNAVAILABLE</span>`; 
        tradeActions.style.display = 'none';
    }
    
    loadChart();
}

async function loadChart() {
    if (typeof LightweightCharts === 'undefined') return;
    
    const chartContainer = document.getElementById('chart-container');
    chartContainer.innerHTML = '<div style="color: #848e9c; text-align: center; margin-top: 130px;">Loading Chart...</div>';

    const data = await fetchAPI(`/api/market/candles?symbol=${currentSymbol}&market=crypto&timeframe=1h&limit=100`);
    
    if (!data || !data.candles || data.candles.length === 0) {
        chartContainer.innerHTML = '<div style="color: #f6465d; text-align: center; margin-top: 130px;">Chart Data Unavailable</div>';
        return;
    }
    
    chartContainer.innerHTML = "";

    if (!chart) {
        chart = LightweightCharts.createChart(chartContainer, {
            width: chartContainer.clientWidth || 350, 
            height: 300,
            layout: { background: { color: 'transparent' }, textColor: '#848e9c' },
            grid: { vertLines: { color: '#2b3139' }, horzLines: { color: '#2b3139' } },
            timeScale: { timeVisible: true },
            crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        });
        candleSeries = chart.addCandlestickSeries({ 
            upColor: '#0ecb81', downColor: '#f6465d', borderVisible: false, 
            wickUpColor: '#0ecb81', wickDownColor: '#f6465d' 
        });
    }
    
    const formattedData = data.candles.map(c => ({ 
        time: c.time, open: c.open, high: c.high, low: c.low, close: c.close 
    }));
    
    candleSeries.setData(formattedData);
    
    setTimeout(() => {
        if (chart) chart.timeScale().fitContent();
    }, 300);
}

async function loadMarkets() {
    const container = document.getElementById('market-list');
    container.innerHTML = 'Loading...';
    const data = await fetchAPI('/api/market/symbols');
    if (data && data.crypto) {
        container.innerHTML = data.crypto.map(sym => `
            <div class="card" onclick="selectMarket('${sym}')">
                <strong>${sym}</strong>
            </div>
        `).join('');
    } else {
        container.innerHTML = 'Failed to load markets.';
    }
}

function selectMarket(symbol) {
    currentSymbol = symbol;
    switchTab('dashboard');
    setTimeout(loadDashboard, 100); 
}

async function loadTrades() {
    const container = document.getElementById('trades-list');
    container.innerHTML = 'Loading...';
    const trades = await fetchAPI('/api/paper/trades');
    if (trades && trades.length > 0) {
        container.innerHTML = trades.map(t => `<div class="card" style="border-left: 4px solid ${t.side === 'BUY' ? 'var(--accent-green)' : 'var(--accent-red)'}"><strong>${t.symbol} - ${t.side}</strong><br>Entry: $${t.entry_price} | Qty: ${t.quantity}</div>`).join('');
    } else { 
        container.innerHTML = 'No trades found.'; 
    }
}

async function openTrade(side) {
    const signal = await fetchAPI(`/api/signals/analyze?symbol=${currentSymbol}&market=crypto&timeframe=1h`);
    if (!signal || !signal.entry_zone) {
        alert("No valid entry zone. Please wait for a better signal.");
        return;
    }

    const entryPrice = signal.entry_zone[1] || signal.indicators.ema9; 
    const qty = 0.01;

    const trade = await fetchAPI('/api/paper/trade/open', {
        method: 'POST',
        body: JSON.stringify({
            symbol: currentSymbol,
            side: side,
            entry_price: entryPrice,
            quantity: qty
        })
    });

    if (trade) {
        alert(`${side} Trade Opened at $${entryPrice.toFixed(2)}`);
        loadDashboard();
    } else {
        alert("Failed to open trade.");
    }
}

document.addEventListener('DOMContentLoaded', () => { 
    initUser(); 
    setTimeout(loadDashboard, 1000);
});