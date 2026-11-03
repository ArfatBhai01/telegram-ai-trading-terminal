
const tg = window.Telegram.WebApp;
tg.expand();

const API_BASE = "https://trading-terminal-backend-wxs8.onrender.com";

let chart = null;
let candleSeries = null;
let chartResizeObserver = null;
let chartRequestId = 0;
let currentSymbol = "BTC/USDT";

// ---------------- USER ----------------

function initUser() {
    const userInfo = document.getElementById('user-info');

    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        userInfo.innerText = tg.initDataUnsafe.user.first_name;
    } else {
        userInfo.innerText = "Dev User";
    }
}

// ---------------- NAVIGATION ----------------

function switchTab(tabId) {
    document.querySelectorAll('.view').forEach(el =>
        el.classList.remove('active')
    );

    document.querySelectorAll('.nav-btn').forEach(el =>
        el.classList.remove('active')
    );

    const view = document.getElementById(`view-${tabId}`);
    if (!view) return;

    view.classList.add('active');

    const tabs = ['dashboard', 'markets', 'trades'];
    const index = tabs.indexOf(tabId);

    if (index !== -1) {
        document.querySelectorAll('.nav-btn')[index]
            .classList.add('active');
    }

    if (tabId === 'dashboard') {
        loadDashboard();
    }

    if (tabId === 'markets') {
        loadMarkets();
    }

    if (tabId === 'trades') {
        loadTrades();
    }
}

// ---------------- API ----------------

async function fetchAPI(endpoint, options = {}) {
    const headers = { ...options.headers };

    if (tg.initData) {
        headers['X-Telegram-Init-Data'] = tg.initData;
    }

    if (options.method === 'POST') {
        headers['Content-Type'] = 'application/json';
    }

    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        return await res.json();

    } catch (err) {
        console.error("API Error:", err);
        return null;
    }
}

// ---------------- DASHBOARD ----------------

async function loadDashboard() {
    const balanceEl = document.getElementById('paper-balance');
    const signalEl = document.getElementById('latest-signal');
    const tradeActions = document.getElementById('trade-actions');

    balanceEl.innerText = "Loading...";
    signalEl.innerText = "Loading...";

    const account = await fetchAPI('/api/paper/account');

    if (account && Number.isFinite(Number(account.balance))) {
        balanceEl.innerText =
            `$${Number(account.balance).toFixed(2)}`;
    } else {
        balanceEl.innerText = "DATA UNAVAILABLE";
    }

    const signal = await fetchAPI(
        `/api/signals/analyze?symbol=${encodeURIComponent(currentSymbol)}&market=crypto&timeframe=1h`
    );

    if (signal && signal.action) {
        const color =
            signal.action === 'BUY' ? 'var(--accent-green)' :
            signal.action === 'SELL' ? 'var(--accent-red)' :
            'var(--text-muted)';

        const reasons = Array.isArray(signal.reasons)
            ? signal.reasons
            : [];

        signalEl.innerHTML = `
            <div style="
                font-size:24px;
                font-weight:bold;
                color:${color};
                margin-bottom:10px;
            ">${signal.action}</div>

            <div style="
                color:var(--text-muted);
                font-size:12px;
            ">${reasons.join("<br>• ")}</div>
        `;

        tradeActions.style.display =
            signal.action === 'BUY' || signal.action === 'SELL'
                ? 'flex'
                : 'none';

    } else {
        signalEl.innerHTML =
            '<span style="color:red">DATA UNAVAILABLE</span>';

        tradeActions.style.display = 'none';
    }

    await loadChart();
}

// ---------------- CHART ----------------

async function loadChart() {
    const container = document.getElementById('chart-container');

    if (typeof LightweightCharts === 'undefined') {
        container.innerHTML = 'Chart library unavailable';
        return;
    }

    const requestId = ++chartRequestId;
    const symbol = currentSymbol;

    // Create chart only once
    if (!chart) {
        container.innerHTML = '';

        chart = LightweightCharts.createChart(container, {
            width: Math.max(container.clientWidth, 300),
            height: 300,

            layout: {
                background: { color: '#1e2329' },
                textColor: '#848e9c'
            },

            grid: {
                vertLines: { color: '#2b3139' },
                horzLines: { color: '#2b3139' }
            },

            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderColor: '#2b3139'
            },

            rightPriceScale: {
                borderColor: '#2b3139'
            },

            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal
            },

            handleScroll: true,
            handleScale: true
        });

        candleSeries = chart.addCandlestickSeries({
            upColor: '#0ecb81',
            downColor: '#f6465d',
            borderVisible: false,
            wickUpColor: '#0ecb81',
            wickDownColor: '#f6465d'
        });

        // Automatic mobile resizing
        if (window.ResizeObserver) {
            chartResizeObserver = new ResizeObserver(() => {
                if (chart && container.clientWidth > 0) {
                    chart.resize(
                        container.clientWidth,
                        300
                    );
                }
            });

            chartResizeObserver.observe(container);
        }
    }

    try {
        const data = await fetchAPI(
            `/api/market/candles?symbol=${encodeURIComponent(symbol)}&market=crypto&timeframe=1h&limit=100`
        );

        // Ignore old market requests
        if (requestId !== chartRequestId) return;

        if (!data || !Array.isArray(data.candles)) {
            console.error("Invalid chart response:", data);
            return;
        }

        const formattedData = data.candles.map(c => {
            let time = c.time;

            if (typeof time === 'string') {
                if (/^\d+$/.test(time)) {
                    time = Number(time);
                } else {
                    time = Math.floor(
                        new Date(time).getTime() / 1000
                    );
                }
            }

            if (typeof time === 'number' && time > 1e12) {
                time = Math.floor(time / 1000);
            }

            return {
                time: time,
                open: Number(c.open),
                high: Number(c.high),
                low: Number(c.low),
                close: Number(c.close)
            };
        }).filter(c =>
            Number.isFinite(c.time) &&
            Number.isFinite(c.open) &&
            Number.isFinite(c.high) &&
            Number.isFinite(c.low) &&
            Number.isFinite(c.close)
        );

        formattedData.sort((a, b) => a.time - b.time);

        const uniqueData = formattedData.filter(
            (c, i, arr) =>
                i === 0 || c.time !== arr[i - 1].time
        );

        if (uniqueData.length === 0) {
            console.error("No valid candles received");
            return;
        }

        candleSeries.setData(uniqueData);

        requestAnimationFrame(() => {
            if (chart && container.clientWidth > 0) {
                chart.resize(container.clientWidth, 300);
                chart.timeScale().fitContent();
            }
        });

        console.log(
            `Chart loaded: ${symbol}, ${uniqueData.length} candles`
        );

    } catch (error) {
        console.error("Chart Error:", error);
    }
}

// ---------------- MARKETS ----------------

async function loadMarkets() {
    const container = document.getElementById('market-list');

    container.innerHTML = 'Loading markets...';

    const data = await fetchAPI('/api/market/symbols');

    if (data && Array.isArray(data.crypto)) {
        container.innerHTML = data.crypto.map(sym => `
            <div class="card"
                 onclick="selectMarket('${sym}')">
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
}

// ---------------- PAPER TRADES ----------------

async function loadTrades() {
    const container = document.getElementById('trades-list');

    container.innerHTML = 'Loading trades...';

    const trades = await fetchAPI('/api/paper/trades');

    if (Array.isArray(trades) && trades.length > 0) {
        container.innerHTML = trades.map(t => `
            <div class="card"
                 style="border-left:4px solid ${
                     t.side === 'BUY'
                         ? 'var(--accent-green)'
                         : 'var(--accent-red)'
                 }">

                <strong>${t.symbol} - ${t.side}</strong>
                <br>
                Entry: $${t.entry_price}
                | Qty: ${t.quantity}

            </div>
        `).join('');
    } else {
        container.innerHTML = 'No trades found.';
    }
}

// ---------------- OPEN TRADE ----------------

async function openTrade(side) {
    if (side !== 'BUY' && side !== 'SELL') return;

    const signal = await fetchAPI(
        `/api/signals/analyze?symbol=${encodeURIComponent(currentSymbol)}&market=crypto&timeframe=1h`
    );

    if (!signal || !signal.entry_zone) {
        alert("No valid entry zone. Please wait for a better signal.");
        return;
    }

    const entryPrice = Number(
        signal.entry_zone[1] || signal.indicators?.ema9
    );

    const qty = 0.01;

    if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
        alert("Invalid entry price.");
        return;
    }

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
        await loadDashboard();
    } else {
        alert("Failed to open trade. Please check backend.");
    }
}

// ---------------- START APP ----------------

document.addEventListener('DOMContentLoaded', () => {
    initUser();

    if (tg.ready) {
        tg.ready();
    }

    setTimeout(() => {
        loadDashboard();
    }, 1000);
});
