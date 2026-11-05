"""
Telegram Bot handlers.
"""
from telegram import Update, WebAppInfo, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes
from backend.config import get_settings

_settings = get_settings()

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send welcome message with the app button."""
    user = update.effective_user
    
    # Aapka frontend URL
    miniapp_url = _settings.telegram_miniapp_url or "https://trading-terminal-app.onrender.com"
    
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
    help_text = "Use /start to open the trading app."
    await update.message.reply_text(help_text)
