import os, sqlite3, time, math
from datetime import datetime, timezone
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import requests

BASE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("DB_PATH", os.path.join(BASE, "tradingai.db"))
BINANCE = "https://api.binance.com"
app = Flask(__name__, static_folder="static")
CORS(app, resources={r"/api/*": {"origins": os.environ.get("CORS_ORIGINS", "*")}})

def db():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con

def init_db():
    with db() as con:
        con.execute("""CREATE TABLE IF NOT EXISTS paper_trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL, side TEXT NOT NULL, entry REAL NOT NULL,
            quantity REAL NOT NULL, status TEXT NOT NULL DEFAULT 'OPEN',
            opened_at TEXT NOT NULL, closed_at TEXT, exit_price REAL, pnl REAL
        )""")

def binance_get(path, params=None):
    r = requests.get(BINANCE + path, params=params or {}, timeout=12,
                     headers={"User-Agent": "TradingAI-Terminal/1.0"})
    r.raise_for_status()
    return r.json()

@app.get("/")
def home():
    return send_from_directory("static", "index.html")

@app.get("/api/health")
def health():
    return jsonify({"ok": True, "service": "TradingAI Terminal", "time": datetime.now(timezone.utc).isoformat()})

@app.get("/api/ticker")
def ticker():
    try:
        data = binance_get("/api/v3/ticker/24hr")
        # Return only liquid USDT pairs; prices are live exchange data.
        rows = [x for x in data if x["symbol"].endswith("USDT")]
        rows.sort(key=lambda x: float(x.get("quoteVolume", 0)), reverse=True)
        return jsonify([{
            "symbol": x["symbol"], "price": float(x["lastPrice"]),
            "change24h": float(x["priceChangePercent"]),
            "high24h": float(x["highPrice"]), "low24h": float(x["lowPrice"]),
            "volume": float(x["quoteVolume"])
        } for x in rows[:100]])
    except requests.RequestException as e:
        return jsonify({"error": "Live market feed unavailable", "detail": str(e)}), 502

@app.get("/api/klines")
def klines():
    symbol = request.args.get("symbol", "BTCUSDT").upper()
    interval = request.args.get("interval", "15m")
    allowed = {"1m","3m","5m","15m","30m","1h","2h","4h","1d","1w"}
    if interval not in allowed or not symbol.endswith("USDT") or not symbol.isalnum():
        return jsonify({"error": "Invalid symbol or timeframe"}), 400
    try:
        raw = binance_get("/api/v3/klines", {"symbol": symbol, "interval": interval, "limit": 500})
        return jsonify([{
            "time": int(k[0] / 1000), "open": float(k[1]), "high": float(k[2]),
            "low": float(k[3]), "close": float(k[4]), "volume": float(k[5])
        } for k in raw])
    except requests.RequestException as e:
        return jsonify({"error": "Chart feed unavailable", "detail": str(e)}), 502

@app.get("/api/signal")
def signal():
    symbol = request.args.get("symbol", "BTCUSDT").upper()
    try:
        candles = binance_get("/api/v3/klines", {"symbol": symbol, "interval": "15m", "limit": 200})
        closes = [float(x[4]) for x in candles]
        highs = [float(x[2]) for x in candles]
        lows = [float(x[3]) for x in candles]
        volumes = [float(x[5]) for x in candles]
        def ema(vals, period):
            a = 2 / (period + 1)
            out = vals[0]
            for v in vals[1:]: out = v * a + out * (1-a)
            return out
        if len(closes) < 60:
            return jsonify({"symbol": symbol, "signal": "WAIT", "reason": "Not enough candle data"})
        e9, e21, e50 = ema(closes[-100:],9), ema(closes[-100:],21), ema(closes[-100:],50)
        changes = [closes[i] - closes[i-1] for i in range(1, len(closes))]
        gains = sum(max(x,0) for x in changes[-14:]) / 14
        losses = sum(max(-x,0) for x in changes[-14:]) / 14
        rsi = 100 if losses == 0 else 100 - (100/(1 + gains/losses))
        last = closes[-1]
        avg_vol = sum(volumes[-21:-1]) / 20
        vol_ok = volumes[-1] >= avg_vol
        score = (1 if e9 > e21 else -1) + (1 if e21 > e50 else -1) + (1 if last > e9 else -1)
        if score >= 2 and rsi < 72:
            side = "BUY"
        elif score <= -2 and rsi > 28:
            side = "SELL"
        else:
            side = "WAIT"
        recent_low, recent_high = min(lows[-20:]), max(highs[-20:])
        risk = max(last * 0.005, last - recent_low if side == "BUY" else recent_high - last)
        if side == "BUY":
            sl, tp = last-risk, last+risk*2
        elif side == "SELL":
            sl, tp = last+risk, last-risk*2
        else:
            sl = tp = None
        confidence = min(85, 50 + abs(score)*9 + (5 if vol_ok else 0))
        reasons = [f"EMA 9/21/50 trend: {'bullish' if score > 0 else 'bearish' if score < 0 else 'mixed'}",
                   f"RSI(14): {rsi:.1f}", f"Volume: {'above' if vol_ok else 'below'} 20-candle average"]
        return jsonify({"symbol": symbol, "signal": side, "price": last,
                        "entry": last if side != "WAIT" else None,
                        "stopLoss": sl, "takeProfit": tp, "riskReward": "1:2" if side != "WAIT" else None,
                        "confidence": confidence, "rsi": round(rsi,1), "reasons": reasons,
                        "time": datetime.now(timezone.utc).isoformat(),
                        "disclaimer": "Technical indicator estimate only; not financial advice."})
    except requests.RequestException as e:
        return jsonify({"error": "Signal data unavailable", "detail": str(e)}), 502

@app.get("/api/trades")
def trades():
    with db() as con:
        rows = con.execute("SELECT * FROM paper_trades ORDER BY id DESC LIMIT 100").fetchall()
    return jsonify([dict(x) for x in rows])

@app.post("/api/trades")
def open_trade():
    data = request.get_json(silent=True) or {}
    symbol = str(data.get("symbol","BTCUSDT")).upper()
    side = str(data.get("side","BUY")).upper()
    try:
        qty = float(data.get("quantity", 0))
        price = float(data.get("price", 0))
    except (TypeError, ValueError):
        return jsonify({"error":"Invalid quantity or price"}), 400
    if side not in ("BUY","SELL") or qty <= 0 or price <= 0 or not symbol.endswith("USDT"):
        return jsonify({"error":"Valid symbol, side, quantity and price required"}), 400
    with db() as con:
        cur = con.execute("INSERT INTO paper_trades(symbol,side,entry,quantity,opened_at) VALUES(?,?,?,?,?)",
                          (symbol,side,price,qty,datetime.now(timezone.utc).isoformat()))
        trade_id = cur.lastrowid
    return jsonify({"ok":True,"id":trade_id,"mode":"PAPER"}), 201

@app.post("/api/trades/<int:trade_id>/close")
def close_trade(trade_id):
    data = request.get_json(silent=True) or {}
    try: exit_price = float(data.get("price",0))
    except (TypeError,ValueError): exit_price = 0
    if exit_price <= 0: return jsonify({"error":"Valid exit price required"}),400
    with db() as con:
        row = con.execute("SELECT * FROM paper_trades WHERE id=? AND status='OPEN'",(trade_id,)).fetchone()
        if not row: return jsonify({"error":"Open trade not found"}),404
        direction = 1 if row["side"] == "BUY" else -1
        pnl = (exit_price-row["entry"])*row["quantity"]*direction
        con.execute("UPDATE paper_trades SET status='CLOSED',closed_at=?,exit_price=?,pnl=? WHERE id=?",
                    (datetime.now(timezone.utc).isoformat(),exit_price,pnl,trade_id))
    return jsonify({"ok":True,"pnl":pnl})

@app.get("/api/balance")
def balance():
    with db() as con:
        rows = con.execute("SELECT pnl FROM paper_trades WHERE status='CLOSED'").fetchall()
    realized = sum(float(x["pnl"] or 0) for x in rows)
    return jsonify({"mode":"PAPER","startingBalance":10000,"realizedPnl":realized,"equity":10000+realized,"currency":"USDT"})

if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
else:
    init_db()
