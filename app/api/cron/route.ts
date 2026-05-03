import { NextResponse } from 'next/server';
import { getUser, getAllUserIds } from '@/lib/redis';

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

  const priceStr = outcomes.map((o: string, i: number) =>
    `${o}: ${(parseFloat(prices[i]) * 100).toFixed(0)}%`
  ).join(' | ');

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

export async function GET(req: Request) {
  try {
    const markets = await getActiveMarkets() as any[];
    const now = new Date();

    // Get ALL user IDs from Redis
    const allUserIds = await getAllUserIds();

    let notified = 0;
    let errors = 0;
    let usersChecked = 0;

    for (const userId of allUserIds) {
      const user = await getUser(userId);
      if (!user || !user.subscribed || !user.chat_id || user.watchlist.length === 0) {
        continue;
      }

      usersChecked++;
      const chatId = user.chat_id;

      for (const marketId of user.watchlist) {
        const market = markets.find((m: any) => m.id === marketId);
        if (!market) continue;

        const endDate = market.endDate || '';
        const end = new Date(endDate);
        const diff = end.getTime() - now.getTime();

        // Notify if resolving TODAY (the day of resolution)
        const today = new Date();
        const endDateStr = endDate.slice(0, 10);
        const todayStr = today.toISOString().slice(0, 10);
        const isToday = endDateStr === todayStr;

        if (isToday) {
          try {
            const msg = formatMarketAlert(market);
            await sendMessage(chatId, msg);
            notified++;
            await new Promise(r => setTimeout(r, 100));
          } catch (e) {
            errors++;
            console.error(`Failed to notify ${chatId}:`, e);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      marketsChecked: markets.length,
      usersChecked,
      notified,
      errors,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Cron error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
