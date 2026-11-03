// APP VERSION: v2 (agar dashboard par "v2" dikhe to naya code chal raha hai)
const APP_VERSION = "v2";

const tg = window.Telegram.WebApp;
tg.expand();

const API_BASE = "https://trading-terminal-backend-wxs8.onrender.com";

let chart = null;
let candleSeries = null;
let chartResizeObserver = null;
let chartRequestId = 0;
let dashboardRequestId = 0;
let currentSymbol = "BTC/USDT";
let lastPrice = null;
let lastApiError = "";

// ---------------- USER ----------------

function initUser() {
    const userInfo = document.getElementById('user-info');
    if (!userInfo) return;

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
        const btn = document.querySelectorAll('.nav-btn')[index];
        if (btn) btn.classList.add('active');
    }

    if (tabId === 'dashboard') loadDashboard();
    if (tabId === 'markets') loadMarkets();
    if (tabId === 'trades') loadTrades();
}

// ---------------- API ----------------

async function fetchAPI(endpoint, options = {}) {
    const headers = { ...options.headers };
    lastApiError = "";

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
            let detail = "";
            try {
                const body = await res.json();
                detail = typeof body.detail === 'string'
                    ? body.detail
                    : JSON.stringify(body.detail || body);
            } catch (e) { /* ignore */ }
            lastApiError = `HTTP ${res.status}${detail ? ': ' + detail : ''}`;
            throw new Error(lastApiError);
        }

        return await res.json();

    } catch (err) {
        if (!lastApiError) lastApiError = String(err.message || err);
        console.error("API Error:", err);
        return null;
    }
}

// ---------------- HELPERS ----------------

function pricePrecision(price) {
    if (!Number.isFinite(price)) return 2;
    if (price < 0.01) return 8;
    if (price < 1) return 5;
    if (price < 100) return 4;
    return 2;
}

function formatPrice(price) {
    if (!Number.isFinite(price)) return "--";
    return Number(price).toFixed(pricePrecision(price));
}

// Coin ki price ke hisaab se chart decimals set karta hai
function applyPriceFormat(price) {
    if (!candleSeries || !Number.isFinite(price)) return;
    const precision = pricePrecision(price);

    candleSeries.applyOptions({
        priceFormat: {
            type: 'price',
            precision: precision,
            minMove: 1 / Math.pow(10, precision)
        }
    });
}

function updateSelectedInfo(symbol, price) {
    const text = `${symbol} CHART (DRAG & ZOOM)`;

    // Chart title: pehle id se, nahi mile to text se dhoondho (chhote/bade akshar dono)
    let el = document.getElementById('chart-title');
    if (!el) {
        const nodes = document.querySelectorAll('#view-dashboard *');
        for (const node of nodes) {
            if (
                node.children.length === 0 &&
                node.textContent &&
                node.textContent.toLowerCase().includes('chart (drag')
            ) {
                el = node;
                el.id = 'chart-title';
                break;
            }
        }
    }
    if (el) el.innerText = text;

    const symEl = document.getElementById('selected-symbol');
    if (symEl) symEl.innerText = symbol;

    const priceEl = document.getElementById('selected-price');
    if (priceEl) {
        priceEl.innerText =
            Number.isFinite(price) ? `$${formatPrice(price)}` : "--";
    }

    const verEl = document.getElementById('app-version');
    if (verEl) verEl.innerText = APP_VERSION;
}

function getTradeAmount() {
    const input = document.getElementById('trade-amount');
    const value = input ? Number(input.value) : NaN;
    return value;
}

function setTradeAmount(value) {
    const input = document.getElementById('trade-amount');
    if (input) input.value = value;
}

// ---------------- DASHBOARD ----------------

async function loadDashboard() {
    const requestId = ++dashboardRequestId;
    const symbol = currentSymbol;

    const balanceEl = document.getElementById('paper-balance');
    const signalEl = document.getElementById('latest-signal');
    const tradeActions = document.getElementById('trade-actions');

    updateSelectedInfo(symbol, null);

    if (tradeActions) tradeActions.style.display = 'flex';
    if (balanceEl) balanceEl.innerText = "Loading...";
    if (signalEl) signalEl.innerText = "Loading...";

    // Chart, balance aur signal ek saath load hote hain
    const chartPromise = loadChart();

    const [account, signal] = await Promise.all([
        fetchAPI('/api/paper/account'),
        fetchAPI(
            `/api/signals/analyze?symbol=${encodeURIComponent(symbol)}&market=crypto&timeframe=1h`
        )
    ]);

    // Purana jawab ignore karo (coin badal gaya ho to)
    if (requestId !== dashboardRequestId) return;

    if (balanceEl) {
        if (account && Number.isFinite(Number(account.balance))) {
            balanceEl.innerText = `$${Number(account.balance).toFixed(2)}`;
        } else {
            balanceEl.innerText = "DATA UNAVAILABLE";
        }
    }

    if (signalEl) {
        if (signal && signal.action) {
            const color =
                signal.action === 'BUY' ? 'var(--accent-green)' :
                signal.action === 'SELL' ? 'var(--accent-red)' :
                'var(--text-muted)';

            const reasons = Array.isArray(signal.reasons)
                ? signal.reasons
                : [];

            signalEl.innerHTML = `
                <div style="font-size:24px;font-weight:bold;color:${color};margin-bottom:10px;">
                    ${signal.action}
                </div>
                <div style="color:var(--text-muted);font-size:12px;">
                    ${reasons.join("<br>• ")}
                </div>
            `;
        } else {
            // Asli wajah dikhao, taaki pata chale backend me kya problem hai
            signalEl.innerHTML = `
                <span style="color:var(--accent-red)">Signal unavailable</span>
                <div style="color:var(--text-muted);font-size:11px;margin-top:6px;">
                    ${lastApiError || "Backend se jawab nahi aaya"}
                </div>
            `;
        }
    }

    await chartPromise;
}

// ---------------- CHART ----------------

async function loadChart() {
    const container = document.getElementById('chart-container');
    if (!container) return;

    if (typeof LightweightCharts === 'undefined') {
        container.innerHTML = 'Chart library unavailable';
        return;
    }

    const requestId = ++chartRequestId;
    const symbol = currentSymbol;

    // Chart sirf ek baar banta hai
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

        if (window.ResizeObserver) {
            chartResizeObserver = new ResizeObserver(() => {
                if (chart && container.clientWidth > 0) {
                    chart.resize(container.clientWidth, 300);
                }
            });

            chartResizeObserver.observe(container);
        }
    }

    // Purane coin ka data hatao
    candleSeries.setData([]);
    lastPrice = null;

    try {
        const data = await fetchAPI(
            `/api/market/candles?symbol=${encodeURIComponent(symbol)}&market=crypto&timeframe=1h&limit=100`
        );

        // Purani request ignore karo
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
                    time = Math.floor(new Date(time).getTime() / 1000);
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
            (c, i, arr) => i === 0 || c.time !== arr[i - 1].time
        );

        if (uniqueData.length === 0) {
            console.error("No valid candles received");
            return;
        }

        lastPrice = uniqueData[uniqueData.length - 1].close;
        applyPriceFormat(lastPrice);
        updateSelectedInfo(symbol, lastPrice);

        candleSeries.setData(uniqueData);

        requestAnimationFrame(() => {
            if (chart && container.clientWidth > 0) {
                chart.resize(container.clientWidth, 300);
                chart.timeScale().fitContent();
            }
        });

        console.log(`Chart loaded: ${symbol}, ${uniqueData.length} candles`);

    } catch (error) {
        console.error("Chart Error:", error);
    }
}

// ---------------- MARKETS ----------------

async function loadMarkets() {
    const container = document.getElementById('market-list');
    if (!container) return;

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
    lastPrice = null;
    switchTab('dashboard');
}

// ---------------- PAPER TRADES ----------------

async function loadTrades() {
    const container = document.getElementById('trades-list');
    if (!container) return;

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

    const amount = getTradeAmount();

    if (!Number.isFinite(amount) || amount <= 0) {
        alert("Amount (USD) sahi daalein, jaise 100.");
        return;
    }

    if (!Number.isFinite(lastPrice) || lastPrice <= 0) {
        alert("Price load nahi hui. Thoda wait karke try karein.");
        return;
    }

    const entryPrice = lastPrice;
    const qty = Number((amount / entryPrice).toPrecision(6));

    const ok = confirm(
        `${side} ${currentSymbol}\nAmount: $${amount}\nPrice: $${formatPrice(entryPrice)}\nQty: ${qty}\n\n(Paper trade - asli paisa nahi)`
    );
    if (!ok) return;

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
        alert(`${side} ${currentSymbol} open hua: $${amount} @ $${formatPrice(entryPrice)}`);
        await loadDashboard();
    } else {
        alert(`Trade open nahi hua.\n${lastApiError || "Backend check karein."}`);
    }
}

// ---------------- START APP ----------------

document.addEventListener('DOMContentLoaded', () => {
    initUser();

    if (tg.ready) {
        tg.ready();
    }

    document.querySelectorAll('.amount-chip').forEach(btn => {
        btn.addEventListener('click', () => setTradeAmount(btn.dataset.amt));
    });

    setTimeout(() => {
        loadDashboard();
    }, 1000);
});