
"use strict";

/* =========================================
   TELEGRAM & CONFIGURATION
========================================= */

const tg = window.Telegram?.WebApp;

if (tg) {
    tg.ready();
    tg.expand();
}

const API_BASE = "https://trading-terminal-backend-wxs8.onrender.com";

let currentSymbol = "BTC/USDT";

let myChart = null;
let candleSeries = null;

let resizeObserver = null;
let chartRequestId = 0;
let dashboardRequestId = 0;

const CHART_HEIGHT = 320;


/* =========================================
   HELPERS
========================================= */

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function formatPrice(value) {
    return Number(value).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 8
    });
}

function formatNumber(value, decimals = 4) {
    return Number(value).toFixed(decimals);
}

function showChartLoading(message) {
    const overlay = document.getElementById("chart-loading");

    document.getElementById("chart-loading-text").textContent = message;

    overlay.classList.remove("hidden");
}

function hideChartLoading() {
    document.getElementById("chart-loading").classList.add("hidden");
}

function showChartError(message) {
    showChartLoading(message);
}


/* =========================================
   USER INITIALIZATION
========================================= */

function initUser() {
    const userElement = document.getElementById("user-info");

    if (tg?.initDataUnsafe?.user) {
        userElement.textContent =
            tg.initDataUnsafe.user.first_name || "Trader";
    } else {
        userElement.textContent = "Dev User";
    }
}


/* =========================================
   API REQUEST HANDLER
========================================= */

async function fetchAPI(endpoint, options = {}) {

    const headers = {
        ...(options.headers || {})
    };

    if (tg?.initData) {
        headers["X-Telegram-Init-Data"] = tg.initData;
    }

    if (options.method === "POST") {
        headers["Content-Type"] = "application/json";
    }

    try {

        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.detail || `HTTP Error ${response.status}`
            );
        }

        return data;

    } catch (error) {

        console.error("API Error:", endpoint, error);

        return null;
    }
}


/* =========================================
   TAB NAVIGATION
========================================= */

function switchTab(tabId) {

    document.querySelectorAll(".view").forEach(view => {
        view.classList.remove("active");
    });

    document.querySelectorAll(".nav-btn").forEach(button => {
        button.classList.remove("active");
    });

    const selectedView = document.getElementById(`view-${tabId}`);

    if (!selectedView) return;

    selectedView.classList.add("active");

    const selectedButton = document.querySelector(
        `.nav-btn[data-tab="${tabId}"]`
    );

    if (selectedButton) {
        selectedButton.classList.add("active");
    }

    if (tabId === "dashboard") {
        loadDashboard();

        // Important: resize chart after dashboard becomes visible.
        requestAnimationFrame(() => {
            resizeChart();
        });
    }

    if (tabId === "markets") {
        loadMarkets();
    }

    if (tabId === "trades") {
        loadTrades();
    }
}


/* =========================================
   DASHBOARD
========================================= */

async function loadDashboard() {

    const requestId = ++dashboardRequestId;

    document.getElementById("paper-balance").textContent = "Loading...";

    document.getElementById("latest-signal").textContent =
        "Loading signal...";

    document.getElementById("chart-title").textContent =
        `${currentSymbol} Chart`;

    const [account, signal] = await Promise.all([

        fetchAPI("/api/paper/account"),

        fetchAPI(
            `/api/signals/analyze?symbol=${encodeURIComponent(currentSymbol)}&market=crypto&timeframe=1h`
        )

    ]);

    if (requestId !== dashboardRequestId) return;

    // Balance
    if (account && Number.isFinite(Number(account.balance))) {

        document.getElementById("paper-balance").textContent =
            `$${formatPrice(account.balance)}`;

    } else {

        document.getElementById("paper-balance").textContent =
            "DATA UNAVAILABLE";
    }

    // Signal
    const signalElement = document.getElementById("latest-signal");

    const tradePanel = document.getElementById("trade-panel");

    if (signal && signal.action) {

        const action = String(signal.action).toUpperCase();

        const color =
            action === "BUY" ? "var(--green)" :
            action === "SELL" ? "var(--red)" :
            "var(--text-muted)";

        const reasons = Array.isArray(signal.reasons)
            ? signal.reasons
            : [];

        signalElement.innerHTML = `
            <div class="signal-action" style="color:${color}">
                ${escapeHTML(action)}
            </div>

            <div class="signal-reasons">
                ${reasons.map(reason =>
                    `• ${escapeHTML(reason)}`
                ).join("<br>")}
            </div>
        `;

        tradePanel.style.display =
            action === "BUY" || action === "SELL"
                ? "block"
                : "none";

    } else {

        signalElement.innerHTML =
            '<span class="error-text">Signal unavailable</span>';

        tradePanel.style.display = "none";
    }

    // Chart
    loadChart();
}


/* =========================================
   TRADINGVIEW CHART INITIALIZATION
========================================= */

function initializeChart() {

    const container = document.getElementById("tradingview-chart");

    if (!container) return false;

    if (typeof LightweightCharts === "undefined") {

        showChartError("TradingView library failed to load.");

        console.error("Lightweight Charts library not found.");

        return false;
    }

    const width = Math.floor(container.getBoundingClientRect().width);

    if (width <= 0) {
        return false;
    }

    if (myChart) {
        return true;
    }

    myChart = LightweightCharts.createChart(container, {

        width: width,

        height: CHART_HEIGHT,

        layout: {
            background: {
                type: "solid",
                color: "#181a20"
            },

            textColor: "#848e9c",

            fontSize: 11
        },

        grid: {
            vertLines: {
                color: "#222831"
            },

            horzLines: {
                color: "#222831"
            }
        },

        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal
        },

        rightPriceScale: {
            borderColor: "#2b3139",

            scaleMargins: {
                top: 0.12,
                bottom: 0.12
            }
        },

        timeScale: {
            borderColor: "#2b3139",

            timeVisible: true,

            secondsVisible: false,

            rightOffset: 5,

            barSpacing: 8,

            minBarSpacing: 2
        },

        handleScroll: {

            mouseWheel: true,

            pressedMouseMove: true,

            horzTouchDrag: true,

            vertTouchDrag: false
        },

        handleScale: {

            axisPressedMouseMove: true,

            mouseWheel: true,

            pinch: true
        }

    });

    // Candlestick series
    candleSeries = myChart.addCandlestickSeries({

        upColor: "#0ecb81",

        downColor: "#f6465d",

        borderUpColor: "#0ecb81",

        borderDownColor: "#f6465d",

        wickUpColor: "#0ecb81",

        wickDownColor: "#f6465d"

    });

    // Observe mobile width and orientation changes.
    if (typeof ResizeObserver !== "undefined") {

        resizeObserver = new ResizeObserver(() => {
            resizeChart();
        });

        resizeObserver.observe(container);
    }

    return true;
}


/* =========================================
   CHART RESIZING
========================================= */

function resizeChart() {

    if (!myChart) return;

    const container = document.getElementById("tradingview-chart");

    if (!container) return;

    const width = Math.floor(container.getBoundingClientRect().width);

    if (width <= 0) return;

    myChart.resize(width, CHART_HEIGHT);
}


/* =========================================
   CANDLE DATA NORMALIZATION
========================================= */

function normalizeCandles(candles) {

    if (!Array.isArray(candles)) {
        return [];
    }

    const normalized = [];

    for (const candle of candles) {

        let timeValue =
            candle.time ??
            candle.timestamp ??
            candle.open_time;

        let time;

        if (typeof timeValue === "string" &&
            !/^\d+(\.\d+)?$/.test(timeValue)) {

            time = Math.floor(Date.parse(timeValue) / 1000);

        } else {

            time = Number(timeValue);

            // Convert milliseconds to seconds.
            if (time > 1000000000000) {
                time = Math.floor(time / 1000);
            } else {
                time = Math.floor(time);
            }
        }

        const open = Number(candle.open);
        const high = Number(candle.high);
        const low = Number(candle.low);
        const close = Number(candle.close);

        if (
            !Number.isFinite(time) ||
            time <= 0 ||
            !Number.isFinite(open) ||
            !Number.isFinite(high) ||
            !Number.isFinite(low) ||
            !Number.isFinite(close) ||
            open <= 0 ||
            high <= 0 ||
            low <= 0 ||
            close <= 0
        ) {
            continue;
        }

        // Reject invalid OHLC relationships.
        if (
            high < Math.max(open, close, low) ||
            low > Math.min(open, close, high)
        ) {
            continue;
        }

        normalized.push({
            time,
            open,
            high,
            low,
            close
        });
    }

    // Oldest candle first; remove duplicate timestamps.
    const unique = new Map();

    normalized
        .sort((a, b) => a.time - b.time)
        .forEach(candle => {
            unique.set(candle.time, candle);
        });

    return Array.from(unique.values());
}


/* =========================================
   LOAD TRADINGVIEW CANDLES
========================================= */

async function loadChart() {

    const requestId = ++chartRequestId;

    showChartLoading("Loading candles...");

    document.getElementById("chart-title").textContent =
        `${currentSymbol} Chart`;

    // Ensure the chart is initialized when visible.
    if (!initializeChart()) {

        // Allow the browser to calculate layout first.
        requestAnimationFrame(() => {

            if (requestId === chartRequestId) {
                loadChart();
            }

        });

        return;
    }

    const symbol = currentSymbol;

    const data = await fetchAPI(
        `/api/market/candles?symbol=${encodeURIComponent(symbol)}&market=crypto&timeframe=1h&limit=100`
    );

    if (requestId !== chartRequestId) return;

    if (!data || !Array.isArray(data.candles)) {

        showChartError("Unable to load market candles.");

        return;
    }

    const candles = normalizeCandles(data.candles);

    if (candles.length === 0) {

        showChartError(
            "No valid OHLC candles. Check your API response."
        );

        console.error("Candle API response:", data);

        return;
    }

    // Update candlestick chart.
    candleSeries.setData(candles);

    // Wait until browser layout is complete.
    requestAnimationFrame(() => {

        if (requestId !== chartRequestId || !myChart) return;

        resizeChart();

        // Fit all available candles inside the chart.
        myChart.timeScale().fitContent();

        hideChartLoading();

    });

}


/* =========================================
   MARKETS
========================================= */

async function loadMarkets() {

    const container = document.getElementById("market-list");

    container.innerHTML = "Loading markets...";

    const data = await fetchAPI("/api/market/symbols");

    if (data && Array.isArray(data.crypto)) {

        container.innerHTML = data.crypto.map(symbol => `

            <button class="card market-item"
                data-symbol="${escapeHTML(symbol)}">

                <span>${escapeHTML(symbol)}</span>

                <span class="market-arrow">›</span>

            </button>

        `).join("");

    } else {

        container.innerHTML =
            '<div class="card">Failed to load markets.</div>';
    }
}


/* =========================================
   SELECT COIN
========================================= */

function selectMarket(symbol) {

    if (!symbol) return;

    currentSymbol = symbol;

    // Dashboard loading happens once through switchTab.
    switchTab("dashboard");
}


/* =========================================
   OPEN PAPER TRADE
========================================= */

async function openTrade(side) {

    const amountInput =
        document.getElementById("trade-amount").value;

    const amount = Number(amountInput);

    if (!Number.isFinite(amount) || amount < 10) {

        alert("Please enter a valid amount. Minimum: $10");

        return;
    }

    if (side !== "BUY" && side !== "SELL") return;

    const marketData = await fetchAPI(
        `/api/market/candles?symbol=${encodeURIComponent(currentSymbol)}&market=crypto&timeframe=1h&limit=1`
    );

    if (
        !marketData ||
        !marketData.candles ||
        marketData.candles.length === 0
    ) {

        alert("Failed to get current price.");

        return;
    }

    const entryPrice = Number(marketData.candles[0].close);

    if (!Number.isFinite(entryPrice) || entryPrice <= 0) {

        alert("Invalid market price.");

        return;
    }

    const quantity = amount / entryPrice;

    const trade = await fetchAPI("/api/paper/trade/open", {

        method: "POST",

        body: JSON.stringify({

            symbol: currentSymbol,

            side: side,

            entry_price: entryPrice,

            quantity: quantity

        })

    });

    if (trade) {

        alert(
            `${side} trade opened at $${formatPrice(entryPrice)}`
        );

        loadDashboard();

    } else {

        alert("Failed to open trade. Check your paper balance.");
    }
}


/* =========================================
   LOAD TRADES
========================================= */

async function loadTrades() {

    const container = document.getElementById("trades-list");

    container.innerHTML = "Loading trades...";

    const response = await fetchAPI("/api/paper/trades");

    const trades = Array.isArray(response)
        ? response
        : response?.trades;

    if (!Array.isArray(trades) || trades.length === 0) {

        container.innerHTML =
            '<div class="card">No trades found.</div>';

        return;
    }

    container.innerHTML = trades.map(trade => {

        const isOpen = trade.status === "OPEN";

        const sideColor =
            trade.side === "BUY"
                ? "var(--green)"
                : "var(--red)";

        const pnl = Number(trade.realized_pnl);

        const hasPnl =
            trade.realized_pnl !== null &&
            trade.realized_pnl !== undefined;

        const pnlColor =
            pnl >= 0 ? "var(--green)" : "var(--red)";

        return `

            <div class="card trade-card"
                 style="border-left:4px solid ${sideColor}">

                <div class="trade-top">

                    <strong>${escapeHTML(trade.symbol)}</strong>

                    <span style="color:${sideColor}">
                        ${escapeHTML(trade.side)}
                    </span>

                </div>

                <div class="trade-details">

                    Entry: $${formatPrice(trade.entry_price)}

                    | Qty: ${formatNumber(trade.quantity, 6)}

                    <br>

                    Status:
                    <strong>${escapeHTML(trade.status)}</strong>

                    ${
                        hasPnl && Number.isFinite(pnl)
                        ? `<br>Realized PnL:
                           <span style="color:${pnlColor}">
                           $${formatPrice(pnl)}
                           </span>`
                        : ""
                    }

                </div>

                ${
                    isOpen
                    ? `<button class="btn-close-trade"
                               data-close-id="${Number(trade.id)}"
                               data-symbol="${escapeHTML(trade.symbol)}">
                               CLOSE TRADE
                       </button>`
                    : ""
                }

            </div>

        `;

    }).join("");
}


/* =========================================
   CLOSE PAPER TRADE
========================================= */

async function closeTrade(tradeId, symbol) {

    if (!Number.isFinite(Number(tradeId))) return;

    const marketData = await fetchAPI(
        `/api/market/candles?symbol=${encodeURIComponent(symbol)}&market=crypto&timeframe=1h&limit=1`
    );

    if (
        !marketData ||
        !marketData.candles ||
        marketData.candles.length === 0
    ) {

        alert("Failed to get exit price.");

        return;
    }

    const currentPrice = Number(marketData.candles[0].close);

    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {

        alert("Invalid exit price.");

        return;
    }

    const result = await fetchAPI(
        `/api/paper/trade/close/${encodeURIComponent(tradeId)}`,
        {
            method: "POST",

            body: JSON.stringify({
                exit_price: currentPrice
            })
        }
    );

    if (result) {

        const pnl = Number(result.realized_pnl);

        alert(
            `Trade Closed!\nRealized PnL: $${formatPrice(pnl)}`
        );

        loadTrades();

        loadDashboard();

    } else {

        alert("Failed to close trade.");
    }
}


/* =========================================
   EVENT LISTENERS
========================================= */

document.addEventListener("DOMContentLoaded", () => {

    initUser();

    // Navigation
    document.querySelectorAll(".nav-btn").forEach(button => {

        button.addEventListener("click", () => {

            switchTab(button.dataset.tab);

        });

    });

    // Market selection
    document.getElementById("market-list")
        .addEventListener("click", event => {

            const button = event.target.closest("[data-symbol]");

            if (button) {
                selectMarket(button.dataset.symbol);
            }

        });

    // BUY / SELL
    document.querySelectorAll("[data-side]").forEach(button => {

        button.addEventListener("click", () => {

            openTrade(button.dataset.side);

        });

    });

    // Close trade
    document.getElementById("trades-list")
        .addEventListener("click", event => {

            const button = event.target.closest("[data-close-id]");

            if (button) {

                closeTrade(
                    Number(button.dataset.closeId),
                    button.dataset.symbol
                );

            }

        });

    // Initial dashboard
    loadDashboard();

    // Browser resize / orientation
    window.addEventListener("resize", resizeChart);

    window.addEventListener("orientationchange", () => {

        setTimeout(resizeChart, 250);

    });

});
