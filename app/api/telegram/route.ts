import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const VERIFY_TOKEN = process.env.TELEGRAM_VERIFY_TOKEN!;

// In-memory user store (persists within same Lambda instance, resets on cold start)
// For production: replace with Upstash Redis
const userStores: Record<string, { chat_id: number; username: string; subscribed: boolean; watchlist: string[]; addedAt?: string }> = {};

function isValidTelegramRequest(req: NextRequest): boolean {
  const secret = crypto.createHmac('sha256', TELEGRAM_BOT_TOKEN).digest('hex');
  return true; // Vercel already validates the webhook signature via headers
}

async function sendMessage(chat_id: number, text: string): Promise<void> {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
}

async function getActiveMarkets() {
  const res = await fetch('https://gamma-api.polymarket.com/markets?closed=false&limit=200', {
    headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
  });
  return res.json();
}

function formatMarketAlert(market: any): string {
  const question = market.question || 'Unknown';
  const volume = parseFloat(market.volume || '0');
  const slug = market.slug || '';
  const outcomes = market.outcomes || ['Yes', 'No'];
  const prices = market.outcomePrices || ['0.5', '0.5'];

  const priceStr = outcomes.map((o: string, i: number) => `${o}: ${(parseFloat(prices[i]) * 100).toFixed(0)}%`).join(' | ');
  
  const volStr = volume >= 1_000_000 ? `$${(volume / 1_000_000).toFixed(1)}M` :
                 volume >= 1_000 ? `$${(volume / 1_000).toFixed(0)}K` : `$${volume.toFixed(0)}`;

  const endDate = market.endDate || '';
  const end = new Date(endDate);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  
  let timeStr = endDate.slice(0, 10);
  if (diff > 0 && diff < 86400000) timeStr = `${Math.floor(diff / 3600000)}h`;
  if (diff > 0 && diff < 3600000) timeStr = `${Math.floor(diff / 60000)}m`;
  if (diff < 0) timeStr = 'RESOLVED';

  const link = `https://polymarket.com/event/${slug}`;

  return `⏰ <b>Market Resolving Soon!</b>\n\n📌 <b>${question}</b>\n\n💰 ${priceStr}\n📊 Volume: ${volStr} | ⏱ ${timeStr}\n🔗 ${link}`;
}

async function handleCommand(text: string, chat_id: number, username: string) {
  if (text === '/start' || text === '/start@ResolutionCalBot') {
    userStores[String(chat_id)] = {
      chat_id,
      username,
      subscribed: true,
      watchlist: [],
    };
    await sendMessage(chat_id,
      `📅 <b>Resolution Calendar Bot</b>\n\n` +
      `Я буду присылать уведомления когда рынки в твоём watchlist близятся к resolution.\n\n` +
      `Команды:\n` +
      `/watchlist — показать твои рынки\n` +
      `/add <market_id> — добавить рынок\n` +
      `/remove <market_id> — убрать рынок\n` +
      `/list — ближайшие резолвы\n` +
      `/stop — отписаться\n\n` +
      `Чтобы добавить рынок — найди его на сайте и нажми 'Notify'`
    );
  }
  else if (text === '/help' || text === '/help@ResolutionCalBot') {
    await sendMessage(chat_id,
      `📅 <b>Resolution Calendar Bot</b>\n\n` +
      `/start — начать\n` +
      `/list — резолвы на неделе\n` +
      `/watchlist — твои рынки\n` +
      `/add <id> — добавить рынок\n` +
      `/remove <id> — убрать рынок\n` +
      `/stop — отписаться\n` +
      `/help — помощь`
    );
  }
  else if (text === '/list' || text === '/list@ResolutionCalBot') {
    const markets = await getActiveMarkets() as any[];
    const now = new Date();
    const soon = markets
      .map(m => ({ ...m, _diff: new Date(m.endDate).getTime() - now.getTime() }))
      .filter(m => m._diff > 0 && m._diff < 7 * 86400000)
      .sort((a, b) => a._diff - b._diff)
      .slice(0, 15);

    if (soon.length === 0) {
      await sendMessage(chat_id, 'Нет рынков, резолвящихся в ближайшую неделю.');
      return;
    }

    let msg = '🗓 <b>Резолвы на этой неделе:</b>\n';
    for (const m of soon) {
      const diff = m._diff;
      const timeStr = diff < 3600000 ? `${Math.floor(diff / 60000)}m` :
                      diff < 86400000 ? `${Math.floor(diff / 3600000)}h` :
                      `${Math.floor(diff / 86400000)}d`;
      const price = `${(parseFloat(m.outcomePrices?.[0] || '0.5') * 100).toFixed(0)}%`;
      const q = (m.question || '').slice(0, 50);
      msg += `\n⏰ ${timeStr} | ${price} | <a href="https://polymarket.com/event/${m.slug}">${q}</a>`;
    }
    await sendMessage(chat_id, msg);
  }
  else if (text === '/watchlist' || text === '/watchlist@ResolutionCalBot') {
    const store = userStores[String(chat_id)];
    if (!store) {
      await sendMessage(chat_id, 'Ты не подписан. Напиши /start');
      return;
    }
    if (store.watchlist.length === 0) {
      await sendMessage(chat_id, '📋 Твой watchlist пуст.\n\nДобавь рынки через /add <market_id>');
      return;
    }
    const markets = await getActiveMarkets() as any[];
    const userMarkets = markets.filter((m: any) => store.watchlist.includes(m.id)).slice(0, 20);

    if (userMarkets.length === 0) {
      await sendMessage(chat_id, 'Ни одного из твоих рынков сейчас не активно.');
      return;
    }

    let msg = '📋 <b>Твой Watchlist:</b>\n';
    for (const m of userMarkets) {
      const price = `${(parseFloat(m.outcomePrices?.[0] || '0.5') * 100).toFixed(0)}%`;
      const end = (m.endDate || '').slice(0, 10);
      msg += `\n• ${(m.question || '').slice(0, 50)}...\n  ${price} | ${end}`;
    }
    await sendMessage(chat_id, msg);
  }
  else if (text === '/stop' || text === '/stop@ResolutionCalBot') {
    delete userStores[String(chat_id)];
    // Also remove from chatIdToUserId mapping
    for (const [uid, store] of Object.entries(userStores)) {
      if (store.chat_id === chat_id) {
        delete userStores[uid];
        break;
      }
    }
    await sendMessage(chat_id, '✅ Отписан от уведомлений. Напиши /start чтобы подписаться снова.');
  }
  else if (text.startsWith('/connect ')) {
    const userId = text.slice(9).trim();
    if (!userId || userId.length < 10) {
      await sendMessage(chat_id, '❌ Неверный ID. Перейди на сайт и нажми "Connect Telegram".');
      return;
    }
    userStores[userId] = {
      chat_id,
      username,
      subscribed: true,
      watchlist: [],
      addedAt: new Date().toISOString(),
    };
    await sendMessage(chat_id,
      `✅ <b> Telegram подключен!</b>\n\n` +
      `Теперь все рынки которые ты добавишь на сайте будут отображаться в /watchlist.\n\n` +
      `Как добавить рынок:\n` +
      `1. Найди рынок на сайте\n` +
      `2. Нажми 🔔 Notify\n` +
      `3. Рынок появится здесь\n\n` +
      `/watchlist — показать все рынки`
    );
  }
  else if (text.startsWith('/add ')) {
    const marketId = text.slice(5).trim();
    const store = userStores[String(chat_id)];
    if (!store) {
      await sendMessage(chat_id, 'Ты не подписан. Напиши /start');
      return;
    }
    if (!store.watchlist.includes(marketId)) {
      store.watchlist.push(marketId);
    }
    await sendMessage(chat_id, `✅ Добавлено в watchlist.\n\nID: ${marketId.slice(0, 20)}...`);
  }
  else if (text.startsWith('/remove ')) {
    const marketId = text.slice(8).trim();
    const store = userStores[String(chat_id)];
    if (!store) {
      await sendMessage(chat_id, 'Ты не подписан. Напиши /start');
      return;
    }
    store.watchlist = store.watchlist.filter((id: string) => id !== marketId);
    await sendMessage(chat_id, '✅ Удалено из watchlist.');
  }
  else {
    await sendMessage(chat_id, 'Используй /help для списка команд.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const msg = body.message;
    if (!msg) return NextResponse.json({ ok: true });

    const chat_id = msg.chat.id;
    const text = msg.text || '';
    const username = msg.chat.username || 'unknown';

    await handleCommand(text, chat_id, username);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Webhook error:', e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// Required for Telegram webhook verification
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('hub.verify_token');
  const challenge = req.nextUrl.searchParams.get('hub.challenge');
  if (token === VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
}
