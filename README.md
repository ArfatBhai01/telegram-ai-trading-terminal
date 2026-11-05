# TradingAI Terminal

## Run locally
```bash
python -m pip install -r requirements.txt
python server.py
```
Open http://localhost:5000

## Deploy on Render
1. Push these files to your GitHub repository.
2. In Render choose **New + → Blueprint**, select the repository, and deploy.
3. Render reads `render.yaml`. No API key is required for public Binance market data.

## Telegram Mini App
Set your Telegram bot's Web App URL to the HTTPS URL Render gives you. This starter is Telegram-WebApp compatible in the browser and loads `Telegram.WebApp` when available.

## Notes
- Market prices/candles come from Binance public market endpoints. If Binance is blocked or unavailable from the hosting region, the UI shows a feed error rather than fake prices.
- Signals are simple technical-indicator estimates, not guaranteed predictions or financial advice.
- Trading is PAPER ONLY. No exchange orders or real-money deposits are implemented.
- SQLite is suitable for a starter/single instance. For production multi-instance persistence, attach a persistent disk or move to PostgreSQL.
