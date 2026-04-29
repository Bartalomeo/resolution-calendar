import { Market } from './types';

const GAMMA_API = 'https://gamma-api.polymarket.com';
const HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36',
};

// Simple in-memory cache
let cache: { data: Market[]; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getActiveMarkets(limit = 200): Promise<Market[]> {
  const now = Date.now();
  
  // Return cached data if fresh
  if (cache && now - cache.timestamp < CACHE_TTL) {
    return cache.data;
  }

  try {
    const url = `${GAMMA_API}/markets?closed=false&limit=${limit}`;
    const req = new Request(url, { headers: HEADERS });
    const resp = await fetch(req);
    
    if (!resp.ok) {
      throw new Error(`API error: ${resp.status}`);
    }
    
    const data: Market[] = await resp.json();
    
    // Parse string fields that come as JSON strings from API
    const active = data
      .filter(m =>
        m && !m.closed && m.active && m.acceptingOrders !== false
      )
      .map(m => ({
        ...m,
        outcomes: typeof m.outcomes === 'string' ? JSON.parse(m.outcomes) : (m.outcomes || ['Yes', 'No']),
        outcomePrices: typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : (m.outcomePrices || ['0.5', '0.5']),
        volume: typeof m.volume === 'string' ? parseFloat(m.volume) : (m.volume ?? 0),
        liquidity: typeof m.liquidity === 'string' ? parseFloat(m.liquidity) : (m.liquidity ?? 0),
      }));
    
    cache = { data: active, timestamp: now };
    return active;
  } catch (e) {
    console.error('Failed to fetch markets:', e);
    // Return stale cache if available
    if (cache) return cache.data;
    return [];
  }
}

export async function getResolvedMarkets(limit = 100): Promise<Market[]> {
  try {
    const url = `${GAMMA_API}/markets?closed=true&limit=${limit}`;
    const req = new Request(url, { headers: HEADERS });
    const resp = await fetch(req);
    
    if (!resp.ok) throw new Error(`API error: ${resp.status}`);
    
    const data: Market[] = await resp.json();
    const resolved = data
      .filter(m => m && m.closed)
      .map(m => ({
        ...m,
        outcomes: typeof m.outcomes === 'string' ? JSON.parse(m.outcomes) : (m.outcomes || ['Yes', 'No']),
        outcomePrices: typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : (m.outcomePrices || ['0.5', '0.5']),
        volume: typeof m.volume === 'string' ? parseFloat(m.volume) : (m.volume ?? 0),
      }));
    return resolved;
  } catch (e) {
    console.error('Failed to fetch resolved markets:', e);
    return [];
  }
}

export async function getMarketBySlug(slug: string): Promise<Market | null> {
  try {
    const url = `${GAMMA_API}/markets?slug=${encodeURIComponent(slug)}`;
    const req = new Request(url, { headers: HEADERS });
    const resp = await fetch(req);
    
    if (!resp.ok) throw new Error(`API error: ${resp.status}`);
    
    const data: Market[] = await resp.json();
    return data[0] || null;
  } catch (e) {
    console.error('Failed to fetch market:', e);
    return null;
  }
}

export function formatVolume(vol: number | string | undefined): string {
  const n = typeof vol === 'string' ? parseFloat(vol) : (vol ?? 0);
  if (isNaN(n)) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export function formatPrice(priceStr: string | number): string {
  try {
    const p = typeof priceStr === 'string' ? parseFloat(priceStr) : priceStr;
    return `${(p * 100).toFixed(0)}%`;
  } catch {
    return 'N/A';
  }
}

export function getDaysUntilResolution(endDate: string): number {
  const end = new Date(endDate).getTime();
  const now = Date.now();
  return Math.ceil((end - now) / (1000 * 60 * 60 * 24));
}

export function getHoursUntilResolution(endDate: string): number {
  const end = new Date(endDate).getTime();
  const now = Date.now();
  return Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60)));
}

export function getMinutesUntilResolution(endDate: string): number {
  const end = new Date(endDate).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((end - now) / (1000 * 60)));
}

export function isResolvingSoon(endDate: string, hoursThreshold = 24): boolean {
  return getHoursUntilResolution(endDate) <= hoursThreshold && getHoursUntilResolution(endDate) > 0;
}

export function isResolved(endDate: string): boolean {
  return new Date(endDate).getTime() < Date.now();
}

export function getResolutionLabel(endDate: string): string {
  const hours = getHoursUntilResolution(endDate);
  const days = getDaysUntilResolution(endDate);
  
  if (hours <= 0) return 'Resolved';
  if (hours < 1) return `${getMinutesUntilResolution(endDate)}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.ceil(days / 7)}w`;
  return new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function detectCategory(market: Market): string {
  const text = `${market.question} ${market.description} ${(market.tags || []).join(' ')}`.toLowerCase();
  
  if (/bitcoin|ethereum|crypto|defi|nft|wallet|blockchain|solana|bnb|ripple|cardano|polkadot|avalanche|matic/i.test(text)) {
    return 'crypto';
  }
  if (/trump|biden|election|president|congress|senate|vote|republican|democrat|nato|war|ukraine|russia|china|iran|korea|israel|palestine/i.test(text)) {
    return 'politics';
  }
  if (/nba|nfl|mlb|nhl|uefa|fifa|world cup|olympics|tennis|championship|league|match|game|score/i.test(text)) {
    return 'sports';
  }
  if (/fed|inflation|recession|gdp|interest rate|oil|gold|dollar|euro|unemployment|treasury|stock market|nasdaq|s&p/i.test(text)) {
    return 'economy';
  }
  if (/ai|openai|gpt|chatgpt|claude|gemini|anthropic|neural|robot|spacex|nasa|tech|apple|microsoft|google|meta|amazon|tesla/i.test(text)) {
    return 'tech';
  }
  
  return 'other';
}

export const CATEGORY_COLORS: Record<string, string> = {
  crypto: '#F7931A',
  politics: '#3B82F6',
  sports: '#10B981',
  economy: '#8B5CF6',
  tech: '#EC4899',
  other: '#6B7280',
};

export const CATEGORY_LABELS: Record<string, string> = {
  crypto: '₿ Crypto',
  politics: '🗳 Politics',
  sports: '⚽ Sports',
  economy: '📈 Economy',
  tech: '💻 Tech',
  other: '📌 Other',
};
