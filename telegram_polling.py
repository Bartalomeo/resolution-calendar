#!/usr/bin/env python3
"""
Resolution Calendar — Telegram Bot
Handles user subscriptions for market resolution alerts.
"""
import os
import json
import logging
from datetime import datetime
from typing import Optional

import urllib.request
import urllib.parse

# Telegram Bot Token
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "8730715372:AAGNrJPBZQTGUxbk7VE4KGhRZCFLo0sJzC8")
TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"

# Storage
DATA_DIR = os.path.expanduser("~/.hermes/resolution-calendar")
USERS_FILE = os.path.join(DATA_DIR, "users.json")
MARKETS_FILE = os.path.join(DATA_DIR, "monitored_markets.json")

# Polymarket API
GAMMA_API = "https://gamma-api.polymarket.com"

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO
)
logger = logging.getLogger(__name__)


def ensure_data_dir():
    os.makedirs(DATA_DIR, exist_ok=True)

def load_users() -> dict:
    ensure_data_dir()
    if os.path.exists(USERS_FILE):
        with open(USERS_FILE) as f:
            return json.load(f)
    return {}

def save_users(users: dict):
    ensure_data_dir()
    with open(USERS_FILE, 'w') as f:
        json.dump(users, f, indent=2)

def load_monitored_markets() -> dict:
    ensure_data_dir()
    if os.path.exists(MARKETS_FILE):
        with open(MARKETS_FILE) as f:
            return json.load(f)
    return {}

def save_monitored_markets(data: dict):
    ensure_data_dir()
    with open(MARKETS_FILE, 'w') as f:
        json.dump(data, f, indent=2)


def send_message(chat_id: int, text: str, parse_mode="HTML") -> bool:
    url = f"{TELEGRAM_API}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode,
        "disable_web_page_preview": True,
    }
    try:
        data = json.dumps(payload).encode()
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read()).get("ok", False)
    except Exception as e:
        logger.error(f"Failed to send message: {e}")
        return False

def get_updates(offset: int = 0) -> list:
    url = f"{TELEGRAM_API}/getUpdates?offset={offset}&timeout=30"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=35) as resp:
            data = json.loads(resp.read())
            return data.get("result", [])
    except Exception as e:
        logger.error(f"Failed to get updates: {e}")
        return []

def get_active_markets(limit=200):
    """Fetch active markets from Polymarket."""
    headers = {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36"
    }
    try:
        url = f"{GAMMA_API}/markets?closed=false&limit={limit}"
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except Exception as e:
        logger.error(f"Failed to fetch markets: {e}")
        return []

def format_market_alert(market: dict) -> str:
    """Format a market as Telegram alert message."""
    question = market.get("question", "Unknown")
    volume = float(market.get("volume", 0) or 0)
    slug = market.get("slug", "")
    
    # Format prices
    outcomes = market.get("outcomes", ["Yes", "No"])
    prices = market.get("outcomePrices", ["0.5", "0.5"])
    
    price_str = " | ".join([
        f"{outcomes[i]}: {(float(p) * 100):.0f}%"
        for i, p in enumerate(prices)
    ])
    
    # Format volume
    if volume >= 1_000_000:
        vol_str = f"${volume/1_000_000:.1f}M"
    elif volume >= 1_000:
        vol_str = f"${volume/1_000:.0f}K"
    else:
        vol_str = f"${volume:.0f}"
    
    # Calculate time remaining
    end_date = market.get("endDate", "")
    try:
        end = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
        now = datetime.now(end.tzinfo) if end.tzinfo else datetime.utcnow()
        remaining = end - now
        if remaining.total_seconds() < 0:
            time_str = "RESOLVED"
        elif remaining.total_seconds() < 3600:
            time_str = f"{int(remaining.total_seconds() // 60)}m"
        elif remaining.total_seconds() < 86400:
            time_str = f"{int(remaining.total_seconds() // 3600)}h"
        else:
            time_str = f"{int(remaining.total_seconds() // 86400)}d"
    except:
        time_str = end_date[:10] if end_date else "?"
    
    link = f"https://polymarket.com/event/{slug}" if slug else "https://polymarket.com"
    
    msg = (
        f"⏰ <b>Market Resolving Soon!</b>\n\n"
        f"📌 <b>{question}</b>\n\n"
        f"💰 {price_str}\n"
        f"📊 Volume: {vol_str} | ⏱ {time_str}\n"
        f"🔗 {link}"
    )
    return msg


def handle_start(chat_id: int, username: str):
    users = load_users()
    users[str(chat_id)] = {
        "username": username,
        "subscribed": True,
        "subscribed_at": datetime.now().isoformat(),
        "watchlist": [],  # list of market IDs
    }
    save_users(users)
    
    send_message(chat_id, 
        "📅 <b>Resolution Calendar Bot</b>\n\n"
        "Я буду присылать уведомления когда рынки в твоём watchlist близятся к resolution.\n\n"
        "Команды:\n"
        "/watchlist — показать твои рынки\n"
        "/add <market_id> — добавить рынок\n"
        "/remove <market_id> — убрать рынок\n"
        "/list — ближайшие резолвы\n"
        "/stop — отписаться\n\n"
        "Чтобы добавить рынок — найди его на сайте и нажми 'Notify'"
    )

def handle_watchlist(chat_id: int):
    users = load_users()
    user = users.get(str(chat_id))
    
    if not user:
        send_message(chat_id, "Ты не подписан. Напиши /start")
        return
    
    watchlist = user.get("watchlist", [])
    if not watchlist:
        send_message(chat_id, "📋 Твой watchlist пуст.\n\nДобавь рынки через /add <market_id>")
        return
    
    markets = get_active_markets(200)
    
    # Filter to user's watchlist
    user_markets = [m for m in markets if m.get("id") in watchlist]
    
    if not user_markets:
        send_message(chat_id, "Ни одного из твоих рынков сейчас не активно.")
        return
    
    # Sort by end date
    user_markets.sort(key=lambda m: m.get("endDate", ""))
    
    lines = ["📋 <b>Твой Watchlist:</b>\n"]
    for m in user_markets[:20]:
        question = m.get("question", "")[:50]
        end = m.get("endDate", "")[:10]
        prices = m.get("outcomePrices", ["0.5"])[0]
        price_pct = f"{(float(prices) * 100):.0f}%"
        lines.append(f"\n• {question}...\n  {price_pct} | {end}")
    
    send_message(chat_id, "\n".join(lines))

def handle_list(chat_id: int):
    """Show markets resolving soon."""
    markets = get_active_markets(200)
    
    now = datetime.utcnow()
    soon_markets = []
    
    for m in markets:
        end_date = m.get("endDate", "")
        try:
            end = datetime.fromisoformat(end_date.replace("Z", "+00:00")).replace(tzinfo=None)
            remaining = (end - now).total_seconds()
            if 0 < remaining < 7 * 86400:  # Within 7 days
                soon_markets.append((m, remaining))
        except:
            pass
    
    if not soon_markets:
        send_message(chat_id, "Нет рынков, резолвящихся в ближайшую неделю.")
        return
    
    # Sort by time remaining
    soon_markets.sort(key=lambda x: x[1])
    
    lines = ["🗓 <b>Резолвы на этой неделе:</b>\n"]
    for m, remaining in soon_markets[:15]:
        question = m.get("question", "")[:50]
        if remaining < 3600:
            time_str = f"{int(remaining // 60)}m"
        elif remaining < 86400:
            time_str = f"{int(remaining // 3600)}h"
        else:
            time_str = f"{int(remaining // 86400)}d"
        
        prices = m.get("outcomePrices", ["0.5"])[0]
        price_pct = f"{(float(prices) * 100):.0f}%"
        slug = m.get("slug", "")
        link = f"polymarket.com/event/{slug}"
        
        lines.append(f"\n⏰ {time_str} | {price_pct} | <a href='https://{link}'>{question[:40]}...</a>")
    
    send_message(chat_id, "\n".join(lines))

def handle_add(chat_id: int, market_id: str):
    users = load_users()
    user = users.get(str(chat_id))
    
    if not user:
        send_message(chat_id, "Ты не подписан. Напиши /start")
        return
    
    watchlist = user.get("watchlist", [])
    if market_id in watchlist:
        send_message(chat_id, f"Рынок уже в watchlist.")
        return
    
    watchlist.append(market_id)
    user["watchlist"] = watchlist
    save_users(users)
    
    send_message(chat_id, f"✅ Добавлено в watchlist.\n\nID: {market_id[:20]}...")

def handle_remove(chat_id: int, market_id: str):
    users = load_users()
    user = users.get(str(chat_id))
    
    if not user:
        send_message(chat_id, "Ты не подписан. Напиши /start")
        return
    
    watchlist = user.get("watchlist", [])
    if market_id not in watchlist:
        send_message(chat_id, "Рынок не найден в watchlist.")
        return
    
    watchlist.remove(market_id)
    user["watchlist"] = watchlist
    save_users(users)
    
    send_message(chat_id, "✅ Удалено из watchlist.")

def handle_stop(chat_id: int):
    users = load_users()
    if str(chat_id) in users:
        del users[str(chat_id)]
        save_users(users)
    send_message(chat_id, "✅ Отписан от уведомлений. Напиши /start чтобы подписаться снова.")

def handle_help(chat_id: int):
    send_message(chat_id,
        "📅 <b>Resolution Calendar Bot</b>\n\n"
        "/start — начать\n"
        "/list — резолвы на неделе\n"
        "/watchlist — твои рынки\n"
        "/add <id> — добавить рынок\n"
        "/remove <id> — убрать рынок\n"
        "/help — помощь"
    )

def process_update(update: dict):
    """Process a single Telegram update."""
    if "message" not in update:
        return
    
    msg = update["message"]
    chat_id = msg["chat"]["id"]
    text = msg.get("text", "")
    username = msg["chat"].get("username", "unknown")
    
    logger.info(f"Command from {chat_id}: {text[:50]}")
    
    if text.startswith("/start"):
        handle_start(chat_id, username)
    elif text.startswith("/help"):
        handle_help(chat_id)
    elif text.startswith("/watchlist"):
        handle_watchlist(chat_id)
    elif text.startswith("/list"):
        handle_list(chat_id)
    elif text.startswith("/stop"):
        handle_stop(chat_id)
    elif text.startswith("/add "):
        market_id = text[5:].strip()
        handle_add(chat_id, market_id)
    elif text.startswith("/remove "):
        market_id = text[8:].strip()
        handle_remove(chat_id, market_id)
    else:
        send_message(chat_id, "Используй /help для списка команд.")


def check_and_notify():
    """Check for markets resolving soon and notify users."""
    users = load_users()
    if not users:
        return
    
    markets = get_active_markets(200)
    if not markets:
        return
    
    now = datetime.utcnow()
    
    for user_id, user in users.items():
        if not user.get("subscribed"):
            continue
        
        watchlist = user.get("watchlist", [])
        if not watchlist:
            continue
        
        chat_id = int(user_id)
        
        # Find markets in watchlist resolving within 1 hour
        for m in markets:
            if m.get("id") not in watchlist:
                continue
            
            end_date = m.get("endDate", "")
            try:
                end = datetime.fromisoformat(end_date.replace("Z", "+00:00")).replace(tzinfo=None)
                remaining = (end - now).total_seconds()
                
                if 0 < remaining < 3600:  # Within 1 hour
                    msg = format_market_alert(m)
                    send_message(chat_id, msg)
                    logger.info(f"Sent alert for market {m.get('id')[:20]} to user {user_id}")
            except Exception as e:
                logger.error(f"Error checking market: {e}")


def polling_loop():
    """Main polling loop."""
    logger.info("Resolution Calendar Bot started!")
    offset = 0
    
    while True:
        try:
            updates = get_updates(offset)
            
            for update in updates:
                process_update(update)
                # Move offset forward
                update_id = update.get("update_id", 0)
                if update_id >= offset:
                    offset = update_id + 1
            
            # Check for resolution alerts every 5 minutes
            check_and_notify()
            
        except KeyboardInterrupt:
            logger.info("Bot stopped by user")
            break
        except Exception as e:
            logger.error(f"Polling error: {e}")
            import time
            time.sleep(5)


if __name__ == "__main__":
    polling_loop()
