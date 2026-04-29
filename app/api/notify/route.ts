import { NextRequest, NextResponse } from 'next/server';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// In-memory user store (persists within same Lambda instance, resets on cold start)
// For production: replace with Upstash Redis
interface UserStore {
  chat_id: number;
  username: string;
  subscribed: boolean;
  watchlist: string[];
  addedAt: string;
}

// Maps from site-generated anonymous ID to user's Telegram chat_id
// Key: anonymous_id (stored in localStorage on site), Value: UserStore
const userIdMap: Record<string, UserStore> = {};

// Maps from Telegram chat_id to anonymous_id
const chatIdToUserId: Record<string, string> = {};

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

// POST /api/notify — site calls this when user clicks "Notify"
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, marketId, marketQuestion, action } = body;

    if (action === 'check') {
      // Check if user has connected Telegram
      const store = userIdMap[userId];
      return NextResponse.json({
        connected: !!store,
        watchlistCount: store?.watchlist?.length || 0,
      });
    }

    if (action === 'watchlist') {
      // Return user's current watchlist
      const store = userIdMap[userId];
      return NextResponse.json({
        watchlist: store?.watchlist || [],
        count: store?.watchlist?.length || 0,
      });
    }

    if (action === 'add') {
      // Add market to watchlist
      if (!userId) {
        return NextResponse.json({ error: 'No userId' }, { status: 400 });
      }

      let store = userIdMap[userId];

      if (!store) {
        // User hasn't connected Telegram yet — store locally and prompt
        userIdMap[userId] = {
          chat_id: 0,
          username: '',
          subscribed: false,
          watchlist: [],
          addedAt: new Date().toISOString(),
        };
        store = userIdMap[userId];
      }

      if (!store.watchlist.includes(marketId)) {
        store.watchlist.push(marketId);
      }

      // If user has connected Telegram, send confirmation
      if (store.chat_id > 0) {
        const q = (marketQuestion || '').slice(0, 50);
        await sendMessage(store.chat_id,
          `✅ <b>Добавлено в watchlist:</b>\n\n${q}...\n\nID: ${marketId.slice(0, 20)}...\n\nИспользуй /watchlist чтобы увидеть все рынки или /remove ${marketId} чтобы убрать.`
        );
      }

      return NextResponse.json({ success: true, watchlistCount: store.watchlist.length });
    }

    if (action === 'remove') {
      if (!userId) {
        return NextResponse.json({ error: 'No userId' }, { status: 400 });
      }
      const store = userIdMap[userId];
      if (store) {
        store.watchlist = store.watchlist.filter(id => id !== marketId);
        if (store.chat_id > 0) {
          await sendMessage(store.chat_id, `🗑 <b>Удалено из watchlist.</b>\n\nID: ${marketId.slice(0, 20)}...`);
        }
        return NextResponse.json({ success: true, watchlistCount: store.watchlist.length });
      }
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    console.error('Notify error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// GET /api/notify — returns current watchlist for a userId
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'No userId' }, { status: 400 });
  }
  const store = userIdMap[userId];
  return NextResponse.json({
    watchlist: store?.watchlist || [],
    connected: !!store?.chat_id,
    count: store?.watchlist?.length || 0,
  });
}
