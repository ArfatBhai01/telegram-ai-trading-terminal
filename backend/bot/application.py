"""
Telegram Bot Application setup.
"""
import logging
from telegram.ext import ApplicationBuilder, CommandHandler
from backend.config import get_settings
from backend.bot.handlers import start, help_command

_settings = get_settings()
logger = logging.getLogger("telegram-bot")

def get_bot_application():
    """Create and configure the Telegram Bot Application."""
    if not _settings.telegram_bot_token:
        logger.warning("No TELEGRAM_BOT_TOKEN found in .env. Bot will not start.")
        return None

    application = ApplicationBuilder().token(_settings.telegram_bot_token).build()

    # Add handlers
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("help", help_command))

    return application