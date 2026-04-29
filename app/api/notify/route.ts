import { NextRequest, NextResponse } from 'next/server';
import {
  getUser, setUser, getUserIdByChatId, setChatIdIndex,
  addToWatchlist, removeFromWatchlist, UserStore
} from '@/lib/redis';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

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

// POST /api/notify
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, marketId, marketQuestion, action } = body;

    if (action === 'check') {
      const store = userId ? await getUser(userId) : null;
      return NextResponse.json({
        connected: !!store?.chat_id,
        watchlistCount: store?.watchlist?.length || 0,
      });
    }

    if (action === 'watchlist') {
      const store = userId ? await getUser(userId) : null;
      return NextResponse.json({
        watchlist: store?.watchlist || [],
        count: store?.watchlist?.length || 0,
      });
    }

    if (action === 'add') {
      if (!userId) {
        return NextResponse.json({ error: 'No userId' }, { status: 400 });
      }

      let store = await getUser(userId);

      if (!store) {
        // User hasn't connected Telegram yet — create placeholder
        const placeholder: UserStore = {
          userId,
          chat_id: 0,
          username: '',
          subscribed: false,
          watchlist: [],
          addedAt: new Date().toISOString(),
          subscription: { plan: 'free', status: 'inactive' },
        };
        await setUser(userId, placeholder);
        store = placeholder;
      }

      const newWatchlist = await addToWatchlist(userId, marketId);

      // If Telegram is connected, send confirmation
      if ((store.chat_id ?? 0) > 0) {
        const q = (marketQuestion || '').slice(0, 60);
        await sendMessage(store.chat_id,
          `✅ <b>Добавлено в watchlist:</b>\n\n${q}...\n\n` +
          `ID: ${marketId.slice(0, 20)}...\n\n` +
          `/watchlist — все рынки | /remove ${marketId} — убрать`
        );
      }

      return NextResponse.json({ success: true, watchlistCount: newWatchlist.length });
    }

    if (action === 'remove') {
      if (!userId) {
        return NextResponse.json({ error: 'No userId' }, { status: 400 });
      }
      const store = await getUser(userId);
      if (!store) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      const newWatchlist = await removeFromWatchlist(userId, marketId);
      if ((store.chat_id ?? 0) > 0) {
        await sendMessage(store.chat_id, `🗑 <b>Удалено из watchlist.</b>\n\nID: ${marketId.slice(0, 20)}...`);
      }
      return NextResponse.json({ success: true, watchlistCount: newWatchlist.length });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    console.error('Notify error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// GET /api/notify
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'No userId' }, { status: 400 });
  }
  const store = await getUser(userId);
  return NextResponse.json({
    watchlist: store?.watchlist || [],
    connected: !!store?.chat_id,
    count: store?.watchlist?.length || 0,
  });
}
