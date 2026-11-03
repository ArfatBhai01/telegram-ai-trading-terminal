
/* =========================================
   AI TRADING TERMINAL V6
   Backend + Candlestick Chart + Indicators
   Technical Analysis + Drawing Tools
========================================= */

const API_BASE = "https://trading-terminal-backend-wxs8.onrender.com";

let currentSymbol = "BTC/USDT";
let currentTimeframe = "1h";
let latestCandles = [];
let latestPrice = 0;

let chart = null;
let candleSeries = null;
let chartInitialized = false;
let chartLoading = false;
let resizeObserver = null;

const indicatorSeries = {};
const enabledIndicators = new Set(["ema9", "ema21"]);

let drawings = [];
let activeDrawingTool = null;
let drawingStart = null;
let drawingPreview = null;

/* =========================================
   DOM HELPERS
========================================= */

const $ = (id) => document.getElementById(id);

function showMessage(message) {
    alert(message);
}

function setChartLoading(message) {
    const overlay = $("chart-loading");
    const text = $("chart-loading-text");

    if (text) text.textContent = message;
    if (overlay) overlay.classList.remove("hidden");
}

function hideChartLoading() {
    $("chart-loading")?.classList.add("hidden");
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function formatPrice(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) return "—";

    return number.toLocaleString("en-US", {
        maximumFractionDigits: number < 1 ? 6 : 2
    });
}

function getTelegramInitData() {
    return window.Telegram?.WebApp?.initData || "";
}

/* =========================================
   API HELPER
========================================= */

async function apiRequest(path, options = {}) {
    const headers = {
        ...(options.headers || {}),
        "X-Telegram-Init-Data": getTelegramInitData()
    };

    if (options.body) {
        headers["Content-Type"] = "application/json";
    }

    const response = await fetch(API_BASE + path, {
        ...options,
        headers
    });

    const raw = await response.text();

    let data = {};

    try {
        data = raw ? JSON.parse(raw) : {};
    } catch {
        throw new Error("Invalid response from server");
    }

    if (!response.ok) {
        throw new Error(
            data.detail || data.message || `Request failed (${response.status})`
        );
    }

    return data;
}

/* =========================================
   TELEGRAM INITIALIZATION
========================================= */

function initializeTelegram() {
    const tg = window.Telegram?.WebApp;

    if (!tg) {
        if ($("user-info")) {
            $("user-info").textContent = "Web Version";
        }
        return;
    }

    tg.ready();
    tg.expand();

    const user = tg.initDataUnsafe?.user;

    if (user && $("user-info")) {
        $("user-info").textContent =
            user.first_name || "Telegram User";
    } else if ($("user-info")) {
        $("user-info").textContent = "Telegram User";
    }

    tg.setHeaderColor?.("#0b0e11");
    tg.setBackgroundColor?.("#0b0e11");
}

/* =========================================
   NAVIGATION
========================================= */

function initializeNavigation() {
    document.querySelectorAll(".nav-btn").forEach(button => {
        button.addEventListener("click", () => {
            const tab = button.dataset.tab;

            document.querySelectorAll(".nav-btn").forEach(item => {
                item.classList.toggle("active", item === button);
            });

            document.querySelectorAll(".view").forEach(view => {
                view.classList.toggle(
                    "active",
                    view.id === `view-${tab}`
                );
            });

            if (tab === "dashboard") {
                setTimeout(() => {
                    resizeChart();
                    if (!latestCandles.length) loadChart();
                }, 100);
            }

            if (tab === "markets") loadMarkets();
            if (tab === "trades") loadTrades();
        });
    });
}

/* =========================================
   ACCOUNT BALANCE
========================================= */

async function loadAccount() {
    try {
        const data = await apiRequest("/api/paper/account");

        const balance = Number(data.balance);

        if ($("paper-balance")) {
            $("paper-balance").textContent =
                Number.isFinite(balance)
                    ? "$" + balance.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    })
                    : "Unavailable";
        }
    } catch (error) {
        console.error("Account error:", error);

        if ($("paper-balance")) {
            $("paper-balance").textContent = "Unavailable";
        }
    }
}

/* =========================================
   SIGNAL
========================================= */

async function loadSignal() {
    try {
        const query = new URLSearchParams({
            symbol: currentSymbol,
            market: "crypto",
            timeframe: currentTimeframe
        });

        const data = await apiRequest(
            `/api/signals/analyze?${query.toString()}`
        );

        const action = String(data.action || "WAIT").toUpperCase();

        const color = action === "BUY"
            ? "var(--green)"
            : action === "SELL"
                ? "var(--red)"
                : "var(--text-muted)";

        const reasons = Array.isArray(data.reasons)
            ? data.reasons
            : [];

        if ($("latest-signal")) {
            $("latest-signal").innerHTML = `
                <div class="signal-action" style="color:${color}">
                    ${escapeHTML(action)}
                </div>
                <div class="signal-reasons">
                    ${reasons.length
                        ? reasons.map(reason =>
                            `<div>• ${escapeHTML(reason)}</div>`
                        ).join("")
                        : "No additional reasons available."
                    }
                </div>
            `;
        }

        if ($("trade-panel")) {
            $("trade-panel").style.display =
                action === "BUY" || action === "SELL"
                    ? "block"
                    : "block";
        }

    } catch (error) {
        console.error("Signal error:", error);

        if ($("latest-signal")) {
            $("latest-signal").innerHTML =
                `<span class="error-text">Signal unavailable: ${escapeHTML(error.message)}</span>`;
        }

        if ($("trade-panel")) {
            $("trade-panel").style.display = "block";
        }
    }
}

/* =========================================
   CHART INITIALIZATION
========================================= */

function initializeChart() {
    const container = $("tradingview-chart");

    if (!container) return false;
    if (chartInitialized) return true;

    if (!window.LightweightCharts) {
        setChartLoading("Chart library could not load.");
        return false;
    }

    const width = container.clientWidth;

    if (width <= 0) return false;

    chart = LightweightCharts.createChart(container, {
        width,
        height: 320,

        layout: {
            background: {
                color: "#181a20"
            },
            textColor: "#848e9c",
            fontSize: 11
        },

        grid: {
            vertLines: {
                color: "#252b33"
            },
            horzLines: {
                color: "#252b33"
            }
        },

        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal
        },

        rightPriceScale: {
            borderColor: "#343a43",
            scaleMargins: {
                top: 0.12,
                bottom: 0.12
            }
        },

        timeScale: {
            borderColor: "#343a43",
            timeVisible: true,
            secondsVisible: false,
            rightOffset: 5
        },

        handleScroll: {
            mouseWheel: true,
            pressedMouseMove: true,
            horzTouchDrag: true,
            vertTouchDrag: false
        },

        handleScale: {
            mouseWheel: true,
            pinch: true,
            axisPressedMouseMove: true
        }
    });

    candleSeries = chart.addCandlestickSeries({
        upColor: "#0ecb81",
        downColor: "#f6465d",
        borderUpColor: "#0ecb81",
        borderDownColor: "#f6465d",
        wickUpColor: "#0ecb81",
        wickDownColor: "#f6465d"
    });

    chartInitialized = true;

    if (window.ResizeObserver) {
        resizeObserver = new ResizeObserver(() => resizeChart());
        resizeObserver.observe(container);
    } else {
        window.addEventListener("resize", resizeChart);
    }

    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
        renderDrawings();
    });

    chart.subscribeCrosshairMove(() => {
        renderDrawings();
    });

    return true;
}

function resizeChart() {
    if (!chart || !$("tradingview-chart")) return;

    const container = $("tradingview-chart");
    const width = container.clientWidth;

    if (width > 0) {
        chart.applyOptions({
            width,
            height: container.clientHeight || 320
        });

        renderDrawings();
    }
}

/* =========================================
   CANDLE NORMALIZATION
========================================= */

function normalizeCandles(input) {
    if (!Array.isArray(input)) return [];

    const output = [];

    for (const candle of input) {
        let time = candle.time ??
            candle.timestamp ??
            candle.open_time;

        if (typeof time === "string") {
            const parsed = Date.parse(time);

            if (Number.isFinite(parsed)) {
                time = Math.floor(parsed / 1000);
            } else {
                time = Number(time);
            }
        }

        time = Number(time);

        if (time > 1000000000000) {
            time = Math.floor(time / 1000);
        }

        const open = Number(candle.open);
        const high = Number(candle.high);
        const low = Number(candle.low);
        const close = Number(candle.close);

        if (
            !Number.isFinite(time) ||
            !Number.isFinite(open) ||
            !Number.isFinite(high) ||
            !Number.isFinite(low) ||
            !Number.isFinite(close)
        ) {
            continue;
        }

        output.push({
            time: Math.floor(time),
            open,
            high,
            low,
            close
        });
    }

    output.sort((a, b) => a.time - b.time);

    return output.filter((candle, index) =>
        index === 0 || candle.time !== output[index - 1].time
    );
}

/* =========================================
   LOAD CHART DATA
========================================= */

async function loadChart() {
    if (chartLoading) return;

    if (!initializeChart()) {
        setChartLoading("Waiting for chart area...");
        return;
    }

    chartLoading = true;
    setChartLoading("Loading candles...");

    try {
        const query = new URLSearchParams({
            symbol: currentSymbol,
            market: "crypto",
            timeframe: currentTimeframe,
            limit: "100"
        });

        const data = await apiRequest(
            `/api/market/candles?${query.toString()}`
        );

        const candles = normalizeCandles(data.candles);

        if (!candles.length) {
            throw new Error(
                "No valid OHLC candles received from the API."
            );
        }

        latestCandles = candles;
        latestPrice = candles[candles.length - 1].close;

        candleSeries.setData(candles);

        $("chart-title").textContent = `${currentSymbol} Chart`;

        if ($("analysis-symbol")) {
            $("analysis-symbol").textContent = currentSymbol;
        }

        chart.timeScale().fitContent();

        updateIndicators();
        calculateTechnicalAnalysis();
        renderDrawings();

        hideChartLoading();

    } catch (error) {
        console.error("Chart error:", error);

        setChartLoading(error.message);
    } finally {
        chartLoading = false;
    }
}

/* =========================================
   INDICATOR CALCULATIONS
========================================= */

function calculateEMA(values, period) {
    if (values.length < period) return [];

    const multiplier = 2 / (period + 1);
    let ema = values.slice(0, period)
        .reduce((sum, value) => sum + value, 0) / period;

    const result = [];

    for (let i = 0; i < values.length; i++) {
        if (i < period - 1) continue;

        if (i === period - 1) {
            result.push(ema);
        } else {
            ema = (values[i] - ema) * multiplier + ema;
            result.push(ema);
        }
    }

    return result;
}

function calculateSMA(values, period) {
    const result = [];

    for (let i = period - 1; i < values.length; i++) {
        const slice = values.slice(i - period + 1, i + 1);

        result.push(
            slice.reduce((sum, value) => sum + value, 0) / period
        );
    }

    return result;
}

function calculateBollinger(values, period = 20) {
    const middle = [];
    const upper = [];
    const lower = [];

    for (let i = period - 1; i < values.length; i++) {
        const slice = values.slice(i - period + 1, i + 1);

        const average = slice.reduce((a, b) => a + b, 0) / period;

        const variance = slice.reduce(
            (sum, value) => sum + Math.pow(value - average, 2),
            0
        ) / period;

        const deviation = Math.sqrt(variance);

        middle.push(average);
        upper.push(average + 2 * deviation);
        lower.push(average - 2 * deviation);
    }

    return { middle, upper, lower };
}

function makeLineSeries(key, color, lineWidth = 2) {
    if (indicatorSeries[key]) return indicatorSeries[key];

    const series = chart.addLineSeries({
        color,
        lineWidth,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false
    });

    indicatorSeries[key] = series;

    return series;
}

function updateIndicators() {
    if (!chart || !latestCandles.length) return;

    const closes = latestCandles.map(candle => candle.close);
    const times = latestCandles.map(candle => candle.time);

    const definitions = {
        ema9: { period: 9, color: "#f0b90b" },
        ema21: { period: 21, color: "#3861fb" },
        ema50: { period: 50, color: "#b084f5" },
        ema200: { period: 200, color: "#ff8c42" },
        sma20: { period: 20, color: "#36c5f0" }
    };

    for (const [key, definition] of Object.entries(definitions)) {
        if (!enabledIndicators.has(key)) {
            if (indicatorSeries[key]) {
                chart.removeSeries(indicatorSeries[key]);
                delete indicatorSeries[key];
            }
            continue;
        }

        const values = calculateEMA(closes, definition.period);

        if (values.length === 0) continue;

        const series = makeLineSeries(key, definition.color);

        const offset = closes.length - values.length;

        series.setData(values.map((value, index) => ({
            time: times[index + offset],
            value
        })));
    }

    if (!enabledIndicators.has("bb")) {
        ["bbMiddle", "bbUpper", "bbLower"].forEach(key => {
            if (indicatorSeries[key]) {
                chart.removeSeries(indicatorSeries[key]);
                delete indicatorSeries[key];
            }
        });
    } else {
        const bands = calculateBollinger(closes);
        const offset = closes.length - bands.middle.length;

        const bandDefinitions = [
            ["bbMiddle", bands.middle, "#8d9aa9"],
            ["bbUpper", bands.upper, "#9b8cff"],
            ["bbLower", bands.lower, "#9b8cff"]
        ];

        bandDefinitions.forEach(([key, values, color]) => {
            const series = makeLineSeries(key, color, 1);

            series.setData(values.map((value, index) => ({
                time: times[index + offset],
                value
            })));
        });
    }
}

/* =========================================
   RSI
========================================= */

function calculateRSI(values, period = 14) {
    if (values.length <= period) return null;

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
        const difference = values[i] - values[i - 1];

        if (difference >= 0) gains += difference;
        else losses -= difference;
    }

    let averageGain = gains / period;
    let averageLoss = losses / period;

    for (let i = period + 1; i < values.length; i++) {
        const difference = values[i] - values[i - 1];

        averageGain =
            (averageGain * (period - 1) + Math.max(difference, 0)) / period;

        averageLoss =
            (averageLoss * (period - 1) + Math.max(-difference, 0)) / period;
    }

    if (averageLoss === 0) return 100;

    return 100 - (100 / (1 + averageGain / averageLoss));
}

/* =========================================
   MACD
========================================= */

function calculateMACD(values) {
    const fast = calculateEMA(values, 12);
    const slow = calculateEMA(values, 26);

    if (!fast.length || !slow.length) return null;

    const difference = fast.length - slow.length;

    const macd = slow.map((value, index) =>
        fast[index + difference] - value
    );

    const signal = calculateEMA(macd, 9);

    if (!signal.length) return null;

    return {
        value: macd[macd.length - 1],
        signal: signal[signal.length - 1]
    };
}

/* =========================================
   TECHNICAL ANALYSIS PANEL
========================================= */

function calculateTechnicalAnalysis() {
    if (latestCandles.length < 26) return;

    const closes = latestCandles.map(candle => candle.close);
    const highs = latestCandles.map(candle => candle.high);
    const lows = latestCandles.map(candle => candle.low);

    const lastPrice = closes[closes.length - 1];

    const ema9 = calculateEMA(closes, 9).at(-1);
    const ema21 = calculateEMA(closes, 21).at(-1);
    const ema50 = calculateEMA(closes, 50).at(-1);

    const rsi = calculateRSI(closes);
    const macd = calculateMACD(closes);

    let trend = "SIDEWAYS";

    if (ema9 > ema21 && ema21 > ema50) {
        trend = "BULLISH";
    } else if (ema9 < ema21 && ema21 < ema50) {
        trend = "BEARISH";
    }

    let signal = "NEUTRAL";

    if (rsi !== null && macd) {
        if (rsi > 50 && macd.value > macd.signal) {
            signal = "BUY BIAS";
        } else if (rsi < 50 && macd.value < macd.signal) {
            signal = "SELL BIAS";
        }
    }

    const recentHighs = highs.slice(-20);
    const recentLows = lows.slice(-20);

    const resistance = Math.max(...recentHighs);
    const support = Math.min(...recentLows);

    const trendElement = $("analysis-trend");
    const rsiElement = $("analysis-rsi");
    const macdElement = $("analysis-macd");
    const signalElement = $("analysis-signal");
    const supportElement = $("analysis-support");
    const resistanceElement = $("analysis-resistance");

    if (trendElement) {
        trendElement.textContent = trend;
        trendElement.style.color =
            trend === "BULLISH" ? "var(--green)" :
            trend === "BEARISH" ? "var(--red)" :
            "var(--text-muted)";
    }

    if (rsiElement) {
        rsiElement.textContent = rsi === null ? "—" : rsi.toFixed(2);
    }

    if (macdElement) {
        macdElement.textContent = macd
            ? macd.value.toFixed(4)
            : "—";
    }

    if (signalElement) {
        signalElement.textContent = signal;
        signalElement.style.color =
            signal === "BUY BIAS" ? "var(--green)" :
            signal === "SELL BIAS" ? "var(--red)" :
            "var(--text-muted)";
    }

    if (supportElement) {
        supportElement.textContent = formatPrice(support);
    }

    if (resistanceElement) {
        resistanceElement.textContent = formatPrice(resistance);
    }
}

/* =========================================
   INDICATOR BUTTONS
========================================= */

function initializeIndicatorButtons() {
    document.querySelectorAll("[data-indicator]").forEach(button => {
        button.addEventListener("click", () => {
            const key = button.dataset.indicator;

            if (enabledIndicators.has(key)) {
                enabledIndicators.delete(key);
                button.classList.remove("active");
            } else {
                enabledIndicators.add(key);
                button.classList.add("active");
            }

            updateIndicators();
        });
    });
}

/* =========================================
   DRAWING TOOLS
========================================= */

function initializeDrawingTools() {
    document.querySelectorAll("[data-draw]").forEach(button => {
        button.addEventListener("click", () => {
            activeDrawingTool = button.dataset.draw;

            document.querySelectorAll("[data-draw]").forEach(item => {
                item.classList.toggle("active", item === button);
            });

            const layer = $("drawing-layer");

            if (layer) {
                layer.classList.toggle(
                    "is-drawing",
                    activeDrawingTool !== null
                );
            }

            const hints = {
                horizontal: "Tap the chart to place a horizontal line.",
                trend: "Drag from the first point to the second point.",
                ray: "Drag from the start point to set the ray direction.",
                rectangle: "Drag to create a rectangle.",
                fib: "Drag from swing low to swing high, or vice versa.",
                text: "Tap the chart to place a text label.",
                erase: "Tap a drawing to remove it."
            };

            if ($("drawing-hint")) {
                $("drawing-hint").textContent =
                    hints[activeDrawingTool] || "Select a drawing tool.";
            }
        });
    });

    $("clear-drawings")?.addEventListener("click", () => {
        drawings = [];
        drawingPreview = null;
        renderDrawings();
    });

    const layer = $("drawing-layer");

    if (!layer) return;

    layer.addEventListener("pointerdown", handleDrawingStart);
    layer.addEventListener("pointermove", handleDrawingMove);
    layer.addEventListener("pointerup", handleDrawingEnd);
    layer.addEventListener("pointercancel", handleDrawingEnd);
}

function getPointerPosition(event) {
    const layer = $("drawing-layer");
    const rect = layer.getBoundingClientRect();

    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        width: rect.width,
        height: rect.height
    };
}

function handleDrawingStart(event) {
    if (!activeDrawingTool) return;

    const position = getPointerPosition(event);

    if (activeDrawingTool === "erase") {
        eraseDrawing(position);
        return;
    }

    if (activeDrawingTool === "text") {
        const text = prompt("Enter chart label:");

        if (text) {
            drawings.push({
                type: "text",
                x1: position.x / position.width,
                y1: position.y / position.height,
                text: text.slice(0, 80)
            });

            renderDrawings();
        }

        return;
    }

    drawingStart = {
        x: position.x / position.width,
        y: position.y / position.height
    };

    drawingPreview = {
        type: activeDrawingTool,
        x1: drawingStart.x,
        y1: drawingStart.y,
        x2: drawingStart.x,
        y2: drawingStart.y
    };

    $("drawing-layer").setPointerCapture?.(event.pointerId);

    renderDrawings();
}

function handleDrawingMove(event) {
    if (!drawingStart || !drawingPreview) return;

    const position = getPointerPosition(event);

    drawingPreview.x2 = position.x / position.width;
    drawingPreview.y2 = position.y / position.height;

    renderDrawings();
}

function handleDrawingEnd() {
    if (!drawingStart || !drawingPreview) return;

    const drawing = { ...drawingPreview };

    drawings.push(drawing);

    drawingStart = null;
    drawingPreview = null;

    renderDrawings();
}

function eraseDrawing(position) {
    const layer = $("drawing-layer");
    const rect = layer.getBoundingClientRect();

    const x = position.x / rect.width;
    const y = position.y / rect.height;

    let nearestIndex = -1;
    let nearestDistance = Infinity;

    drawings.forEach((drawing, index) => {
        const distance = Math.hypot(
            (drawing.x1 - x) * rect.width,
            (drawing.y1 - y) * rect.height
        );

        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = index;
        }
    });

    if (nearestIndex >= 0 && nearestDistance < 35) {
        drawings.splice(nearestIndex, 1);
        renderDrawings();
    }
}

/* =========================================
   DRAWING SVG RENDERER
========================================= */

function svgElement(name, attributes = {}) {
    const element = document.createElementNS(
        "http://www.w3.org/2000/svg",
        name
    );

    Object.entries(attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
    });

    return element;
}

function renderDrawings() {
    const layer = $("drawing-layer");

    if (!layer) return;

    const rect = layer.getBoundingClientRect();

    const width = rect.width;
    const height = rect.height;

    if (!width || !height) return;

    layer.setAttribute("viewBox", `0 0 ${width} ${height}`);
    layer.innerHTML = "";

    const allDrawings = [...drawings];

    if (drawingPreview) {
        allDrawings.push(drawingPreview);
    }

    allDrawings.forEach(drawing => {
        const x1 = drawing.x1 * width;
        const y1 = drawing.y1 * height;
        const x2 = drawing.x2 * width;
        const y2 = drawing.y2 * height;

        if (drawing.type === "horizontal") {
            layer.appendChild(svgElement("line", {
                x1: 0,
                y1,
                x2: width,
                y2: y1,
                class: "user-drawing"
            }));
        }

        if (drawing.type === "trend") {
            layer.appendChild(svgElement("line", {
                x1, y1, x2, y2,
                class: "user-drawing"
            }));
        }

        if (drawing.type === "ray") {
            const dx = x2 - x1;
            const dy = y2 - y1;

            const scale = dx === 0 ? 0 : (width - x1) / dx;

            layer.appendChild(svgElement("line", {
                x1,
                y1,
                x2: dx === 0 ? x1 : width,
                y2: dx === 0 ? height : y1 + dy * scale,
                class: "user-drawing"
            }));
        }

        if (drawing.type === "rectangle") {
            layer.appendChild(svgElement("rect", {
                x: Math.min(x1, x2),
                y: Math.min(y1, y2),
                width: Math.abs(x2 - x1),
                height: Math.abs(y2 - y1),
                class: "user-drawing"
            }));
        }

        if (drawing.type === "fib") {
            const levels = [
                [0, "0%"],
                [0.236, "23.6%"],
                [0.382, "38.2%"],
                [0.5, "50%"],
                [0.618, "61.8%"],
                [0.786, "78.6%"],
                [1, "100%"]
            ];

            levels.forEach(([level, label]) => {
                const y = y1 + (y2 - y1) * level;

                layer.appendChild(svgElement("line", {
                    x1,
                    y1: y,
                    x2: width,
                    y2: y,
                    class: "fib-line"
                }));

                const text = svgElement("text", {
                    x: Math.min(x1 + 5, width - 45),
                    y: y - 4,
                    class: "drawing-label"
                });

                text.textContent = label;
                layer.appendChild(text);
            });
        }

        if (drawing.type === "text") {
            const text = svgElement("text", {
                x: x1,
                y: y1,
                class: "drawing-label"
            });

            text.textContent = drawing.text;
            layer.appendChild(text);
        }
    });
}

/* =========================================
   MARKETS
========================================= */

async function loadMarkets() {
    const container = $("market-list");

    if (!container) return;

    try {
        const data = await apiRequest("/api/market/symbols");

        const markets = Array.isArray(data.crypto)
            ? data.crypto
            : [];

        if (!markets.length) {
            container.textContent = "No markets available.";
            return;
        }

        container.innerHTML = "";

        markets.forEach(item => {
            const symbol = typeof item === "string"
                ? item
                : item.symbol || item.name;

            if (!symbol) return;

            const button = document.createElement("button");

            button.className = "card market-item";
            button.innerHTML = `
                <span>${escapeHTML(symbol)}</span>
                <span class="market-arrow">›</span>
            `;

            button.addEventListener("click", () => {
                selectMarket(symbol);
            });

            container.appendChild(button);
        });

    } catch (error) {
        console.error("Markets error:", error);
        container.textContent = "Markets unavailable: " + error.message;
    }
}

function selectMarket(symbol) {
    currentSymbol = symbol;

    $("chart-title").textContent = `${symbol} Chart`;

    latestCandles = [];
    latestPrice = 0;

    const dashboardButton = document.querySelector(
        '[data-tab="dashboard"]'
    );

    dashboardButton?.click();

    loadChart();
    loadSignal();
}

/* =========================================
   OPEN PAPER TRADE
========================================= */

async function openTrade(side) {
    const amount = Number($("trade-amount")?.value);

    if (!Number.isFinite(amount) || amount < 10) {
        showMessage("Please enter a valid amount of at least 10 USDT.");
        return;
    }

    if (!latestPrice || latestPrice <= 0) {
        showMessage("Latest market price is not available yet.");
        return;
    }

    const quantity = amount / latestPrice;

    try {
        await apiRequest("/api/paper/trade/open", {
            method: "POST",
            body: JSON.stringify({
                symbol: currentSymbol,
                side,
                entry_price: latestPrice,
                quantity
            })
        });

        showMessage(`${side} paper trade opened successfully.`);

        loadAccount();
        loadTrades();

    } catch (error) {
        console.error("Open trade error:", error);
        showMessage("Trade failed: " + error.message);
    }
}

function initializeTradeButtons() {
    document.querySelectorAll("[data-side]").forEach(button => {
        button.addEventListener("click", () => {
            openTrade(button.dataset.side);
        });
    });
}

/* =========================================
   TRADES HISTORY
========================================= */

async function loadTrades() {
    const container = $("trades-list");

    if (!container) return;

    try {
        const data = await apiRequest("/api/paper/trades");

        const trades = Array.isArray(data)
            ? data
            : data.trades || [];

        if (!trades.length) {
            container.innerHTML = `
                <div class="card">
                    No trades yet.
                </div>
            `;
            return;
        }

        container.innerHTML = "";

        trades.forEach(trade => {
            const side = String(trade.side || "").toUpperCase();

            const sideColor = side === "BUY"
                ? "var(--green)"
                : "var(--red)";

            const card = document.createElement("div");

            card.className = "card trade-card";

            const isOpen = String(trade.status || "").toLowerCase() === "open";

            card.innerHTML = `
                <div class="trade-top">
                    <strong>${escapeHTML(trade.symbol)}</strong>
                    <strong style="color:${sideColor}">
                        ${escapeHTML(side)}
                    </strong>
                </div>

                <div class="trade-details">
                    Entry: ${formatPrice(trade.entry_price)}<br>
                    Quantity: ${formatPrice(trade.quantity)}<br>
                    Status: ${escapeHTML(trade.status || "Unknown")}<br>
                    Realized P&L: ${formatPrice(trade.realized_pnl)}
                </div>

                ${isOpen ? `
                    <button class="btn-close-trade"
                            data-close-id="${escapeHTML(trade.id)}">
                        CLOSE TRADE
                    </button>
                ` : ""}
            `;

            container.appendChild(card);
        });

        container.querySelectorAll("[data-close-id]").forEach(button => {
            button.addEventListener("click", () => {
                closeTrade(button.dataset.closeId);
            });
        });

    } catch (error) {
        console.error("Trades error:", error);
        container.textContent = "Trades unavailable: " + error.message;
    }
}

/* =========================================
   CLOSE PAPER TRADE
========================================= */

async function closeTrade(tradeId) {
    if (!latestPrice || latestPrice <= 0) {
        showMessage("Latest market price is not available.");
        return;
    }

    if (!confirm("Are you sure you want to close this paper trade?")) {
        return;
    }

    try {
        await apiRequest(
            `/api/paper/trade/close/${encodeURIComponent(tradeId)}`,
            {
                method: "POST",
                body: JSON.stringify({
                    exit_price: latestPrice
                })
            }
        );

        showMessage("Paper trade closed successfully.");

        loadAccount();
        loadTrades();

    } catch (error) {
        console.error("Close trade error:", error);
        showMessage("Could not close trade: " + error.message);
    }
}

/* =========================================
   APPLICATION STARTUP
========================================= */

function initializeApp() {
    initializeTelegram();
    initializeNavigation();
    initializeIndicatorButtons();
    initializeDrawingTools();
    initializeTradeButtons();

    loadAccount();
    loadSignal();
    loadMarkets();
    loadTrades();

    // Wait briefly for the dashboard to get its layout width.
    setTimeout(() => {
        if (initializeChart()) {
            loadChart();
        } else {
            setChartLoading("Chart area is not ready. Open Dashboard to load it.");
        }
    }, 150);
}

document.addEventListener("DOMContentLoaded", initializeApp);
