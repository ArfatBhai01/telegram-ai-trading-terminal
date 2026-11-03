const tg = window.Telegram.WebApp;
tg.expand();

// Aapka permanent Render Backend link
const API_BASE = "https://trading-terminal-backend-wxs8.onrender.com";

let chart = null;
let candleSeries = null;
let currentSymbol = "BTC/USDT";
let currentPrice = 0;

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
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
        return data;
    } catch (err) { 
        console.error("API Error:", err);
        return null; 
    }
}

async function loadDashboard() {
    document.getElementById('paper-balance').innerText = "Loading...";
    
    // 1. Load Balance
    const account = await fetchAPI('/api/paper/account');
    if (account) {
        document.getElementById('paper-balance').innerText = `$${account.balance.toFixed(2)}`;
    } else {
        document.getElementById('paper-balance').innerText = "DATA UNAVAILABLE";
    }

    // 2. Load Signal
    const signal = await fetchAPI(`/api/signals/analyze?symbol=${currentSymbol}&market=crypto&timeframe=1h`);
    const signalEl = document.getElementById('latest-signal');
    const tradePanel = document.getElementById('trade-panel');
    
    if (signal && signal.action) {
        let color = signal.action === 'BUY' ? 'var(--accent-green)' : signal.action === 'SELL' ? 'var(--accent-red)' : 'var(--text-muted)';
        signalEl.innerHTML = `<div style="font-size: 24px; font-weight: bold; color: ${color}; margin-bottom: 10px;">${signal.action}</div><div style="color: var(--text-muted); font-size: 12px;">${signal.reasons.join("<br>• ")}</div>`;
        
        if (signal.action === 'BUY' || signal.action === 'SELL') {
            tradePanel.style.display = 'block';
            if (signal.entry_zone) currentPrice = signal.entry_zone[1];
        } else {
            tradePanel.style.display = 'none';
        }
    } else { 
        signalEl.innerHTML = `<span style="color:red">DATA UNAVAILABLE</span>`; 
        tradePanel.style.display = 'none';
    }
    
    // 3. Load Chart
    loadChart();
}

async function loadChart() {
    if (typeof LightweightCharts === 'undefined') return;
    
    document.getElementById('chart-title').innerText = `${currentSymbol} Chart`;
    const chartContainer = document.getElementById('chart-container');
    
    chartContainer.innerHTML = '<div style="color: #848e9c; text-align: center; margin-top: 130px;">Loading Chart...</div>';

    const data = await fetchAPI(`/api/market/candles?symbol=${currentSymbol}&market=crypto&timeframe=1h&limit=100`);
    
    if (!data || !data.candles || data.candles.length === 0) {
        chartContainer.innerHTML = '<div style="color: #f6465d; text-align: center; margin-top: 130px;">Chart Data Unavailable</div>';
        return;
    }
    
    chartContainer.innerHTML = "";

    // Chart ko fix size dein taaki mobile par blank na dikhe
    const chartWidth = chartContainer.clientWidth > 0 ? chartContainer.clientWidth : window.innerWidth - 40;

    if (!chart) {
        chart = LightweightCharts.createChart(chartContainer, {
            width: chartWidth, 
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
    
    // Chart load hone ke baad fit karein
    setTimeout(() => { if (chart) chart.timeScale().fitContent(); }, 500);
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
    if (chart) { chart.remove(); chart = null; candleSeries = null; } // Purana chart delete karein
    switchTab('dashboard');
    setTimeout(loadDashboard, 100); 
}

async function openTrade(side) {
    const amountInput = document.getElementById('trade-amount').value;
    const amount = parseFloat(amountInput);
    
    if (!amount || amount < 10) {
        alert("Please enter a valid amount (Min $10)");
        return;
    }

    const marketData = await fetchAPI(`/api/market/candles?symbol=${currentSymbol}&market=crypto&timeframe=1h&limit=1`);
    if (!marketData || !marketData.candles || marketData.candles.length === 0) {
        alert("Failed to get current price. Try again.");
        return;
    }
    
    const entryPrice = marketData.candles[0].close;
    const quantity = amount / entryPrice;

    const trade = await fetchAPI('/api/paper/trade/open', {
        method: 'POST',
        body: JSON.stringify({
            symbol: currentSymbol,
            side: side,
            entry_price: entryPrice,
            quantity: quantity
        })
    });

    if (trade) {
        alert(`${side} Trade Opened at $${entryPrice.toFixed(2)}`);
        loadDashboard();
    } else {
        alert("Failed to open trade. Check balance.");
    }
}

async function loadTrades() {
    const container = document.getElementById('trades-list');
    container.innerHTML = 'Loading...';
    
    const trades = await fetchAPI('/api/paper/trades');
    
    if (!trades || trades.length === 0) {
        container.innerHTML = '<div class="card">No trades found.</div>';
        return;
    }

    container.innerHTML = trades.map(t => {
        const isOpen = t.status === "OPEN";
        const pnl = t.realized_pnl ? t.realized_pnl.toFixed(2) : null;
        const pnlColor = pnl > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
        
        let closeBtn = '';
        if (isOpen) {
            closeBtn = `<button class="btn-close-trade" onclick="closeTrade(${t.id})">CLOSE</button>`;
        }

        return `
            <div class="card" style="border-left: 4px solid ${t.side === 'BUY' ? 'var(--accent-green)' : 'var(--accent-red)'}">
                <div style="display: flex; justify-content: space-between;">
                    <strong>${t.symbol}</strong>
                    <span style="color: ${t.side === 'BUY' ? 'var(--accent-green)' : 'var(--accent-red)'}">${t.side}</span>
                </div>
                <div style="font-size: 12px; color: var(--text-muted); margin-top: 5px;">
                    Entry: $${t.entry_price.toFixed(2)} | Qty: ${t.quantity.toFixed(4)}<br>
                    Status: <strong>${t.status}</strong>
                    ${pnl ? `<br>Realized PnL: <span style="color:${pnlColor}">$${pnl}</span>` : ''}
                </div>
                ${closeBtn}
            </div>
        `;
    }).join('');
}

async function closeTrade(tradeId) {
    const marketData = await fetchAPI(`/api/market/candles?symbol=${currentSymbol}&market=crypto&timeframe=1h&limit=1`);
    const currentPrice = marketData.candles[0].close;

    const result = await fetchAPI(`/api/paper/trade/close/${tradeId}`, {
        method: 'POST',
        body: JSON.stringify({ exit_price: currentPrice })
    });

    if (result) {
        alert(`Trade Closed! PnL: $${result.realized_pnl.toFixed(2)}`);
        loadTrades();
    } else {
        alert("Failed to close trade.");
    }
}

document.addEventListener('DOMContentLoaded', () => { 
    initUser(); 
    setTimeout(loadDashboard, 1500); // 1.5 second wait taaki backend ready ho
});