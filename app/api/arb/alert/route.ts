import { NextRequest, NextResponse } from 'next/server';
import { redis, UserStore } from '@/lib/redis';

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

interface ArbAlert {
  type: 'arb';
  market: string;
  polymarketPrice: number;   // 0-1 float, e.g. 0.38 = 38%
  kalshiPrice: number;      // 0-1 float
  arbPercent: number;        // profit % if you back both sides
  direction: string;        // e.g. "Back Yes on Polymarket, No on Kalshi"
  polymarketLink: string;
  kalshiLink: string;
  volume: string;            // formatted volume string
  expiresIn: string;         // e.g. "3d"
}

function formatArbAlert(alert: ArbAlert): string {
  const emoji = alert.arbPercent >= 5 ? '🔥' : '⚡';
  return [
    `${emoji} <b>ARB OPPORTUNITY</b>`,
    ``,
    `📌 <b>${alert.market}</b>`,
    ``,
    `💰 Arb: <b>+${alert.arbPercent.toFixed(1)}%</b>`,
    ``,
    `📊 Polymarket: <b>${(alert.polymarketPrice * 100).toFixed(0)}%</b>`,
    `📊 Kalshi: <b>${(alert.kalshiPrice * 100).toFixed(0)}%</b>`,
    ``,
    `🎯 ${alert.direction}`,
    ``,
    `📊 Volume: ${alert.volume} | ⏱ ${alert.expiresIn}`,
    ``,
    `🔗 <a href="${alert.polymarketLink}">Polymarket</a> | <a href="${alert.kalshiLink}">Kalshi</a>`,
  ].join('\n');
}

export async function POST(req: NextRequest) {
  try {
    const secret = req.nextUrl.searchParams.get('secret');
    if (secret !== process.env.ARB_ALERT_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const alert: ArbAlert = await req.json();

    // Get all user IDs
    const keys = await redis.keys('rc:user:*');
    const userIds = keys.map(k => k.replace('rc:user:', ''));

    let sent = 0;
    let errors = 0;

    for (const userId of userIds) {
      const store = await redis.get<UserStore>(`rc:user:${userId}`);

      // Must be Pro + active subscription + connected Telegram
      const isPro =
        store?.subscription?.plan === 'pro' &&
        store?.subscription?.status === 'active' &&
        (store?.chat_id ?? 0) > 0;

      if (!isPro) continue;

      try {
        await sendMessage(store.chat_id!, formatArbAlert(alert));
        sent++;
        await new Promise(r => setTimeout(r, 100));
      } catch (e) {
        errors++;
        console.error(`Failed to send to ${store.chat_id}:`, e);
      }
    }

    return NextResponse.json({ success: true, sent, errors });
  } catch (e) {
    console.error('Arb alert error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
