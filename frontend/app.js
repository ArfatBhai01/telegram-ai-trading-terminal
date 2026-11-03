const tg = window.Telegram.WebApp;
tg.expand();

const API_BASE = "https://trading-terminal-backend-wxs8.onrender.com";
let currentSymbol = "BTC/USDT";
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
    
    const account = await fetchAPI('/api/paper/account');
    if (account) {
        document.getElementById('paper-balance').innerText = `$${account.balance.toFixed(2)}`;
    } else {
        document.getElementById('paper-balance').innerText = "DATA UNAVAILABLE";
    }

    const signal = await fetchAPI(`/api/signals/analyze?symbol=${currentSymbol}&market=crypto&timeframe=1h`);
    const signalEl = document.getElementById('latest-signal');
    const tradePanel = document.getElementById('trade-panel');
    
    if (signal && signal.action) {
        let color = signal.action === 'BUY' ? 'var(--green)' : signal.action === 'SELL' ? 'var(--red)' : 'var(--text-muted)';
        signalEl.innerHTML = `<div style="font-size: 24px; font-weight: bold; color: ${color}; margin-bottom: 10px;">${signal.action}</div><div style="color: var(--text-muted); font-size: 12px;">${signal.reasons.join("<br>• ")}</div>`;
        
        if (signal.action === 'BUY' || signal.action === 'SELL') {
            tradePanel.style.display = 'block';
        } else {
            tradePanel.style.display = 'none';
        }
    } else { 
        signalEl.innerHTML = `<span style="color:var(--red)">DATA UNAVAILABLE</span>`; 
        tradePanel.style.display = 'none';
    }
    
    loadChart();
}

async function loadChart() {
    document.getElementById('chart-title').innerText = `${currentSymbol} Chart`;
    const ctx = document.getElementById('myChartCanvas').getContext('2d');

    // Purana chart delete karein agar hai toh
    if (myChart) { myChart.destroy(); }

    const data = await fetchAPI(`/api/market/candles?symbol=${currentSymbol}&market=crypto&timeframe=1h&limit=50`);
    
    if (!data || !data.candles || data.candles.length === 0) {
        return;
    }
    
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
                label: 'Price',
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
        const pnlColor = pnl > 0 ? 'var(--green)' : 'var(--red)';
        
        let closeBtn = '';
        if (isOpen) {
            closeBtn = `<button class="btn-close-trade" onclick="closeTrade(${t.id})">CLOSE</button>`;
        }

        return `
            <div class="card" style="border-left: 4px solid ${t.side === 'BUY' ? 'var(--green)' : 'var(--red)'}">
                <div style="display: flex; justify-content: space-between;">
                    <strong>${t.symbol}</strong>
                    <span style="color: ${t.side === 'BUY' ? 'var(--green)' : 'var(--red)'}">${t.side}</span>
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
        loadDashboard();
    } else {
        alert("Failed to close trade.");
    }
}

document.addEventListener('DOMContentLoaded', () => { 
    initUser(); 
    setTimeout(loadDashboard, 1000);
});