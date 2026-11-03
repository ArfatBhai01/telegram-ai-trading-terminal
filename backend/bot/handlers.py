"""
Telegram Bot handlers.
"""
from telegram import Update, WebAppInfo, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes
from backend.config import get_settings

_settings = get_settings()

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send a message with a button to open the Mini App."""
    user = update.effective_user
    
    # Aapka frontend URL
    # Agar aap local laptop par test kar rahe hain, toh aapko ngrok ya similar tool use karna padega.
    # Abhi ke liye hum aapke Render URL ya local URL ka use karenge.
    miniapp_url = _settings.telegram_miniapp_url or "http://127.0.0.1:5500"
    
    keyboard = [
        [InlineKeyboardButton("Open Trading App 📈", web_app=WebAppInfo(url=miniapp_url))]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    welcome_text = (
        f"Welcome {user.first_name}!\n\n"
        "This is a professional AI Trading Terminal.\n"
        "⚠️ *Paper trading only. No real-money orders.*\n\n"
        "Click the button below to start analyzing markets, view signals, and practice trading."
    )

    await update.message.reply_text(
        welcome_text,
        reply_markup=reply_markup,
        parse_mode="Markdown"
    )

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send a help message."""
    help_text = (
        "*Available Commands:*\n"
        "/start - Open the trading app\n"
        "/help - Show this help message\n\n"
        "*Disclaimer:*\n"
        "This bot is for educational purposes only. Signals are not financial advice. We do not promise profits."
    )
    await update.message.reply_text(help_text, parse_mode="Markdown")