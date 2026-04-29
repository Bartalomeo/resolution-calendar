import { Market } from './types';

const GAMMA_API = 'https://gamma-api.polymarket.com';
const MARKETS_PROXY = '/api/markets';
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
    // Use our own proxy to avoid CORS issues when calling from browser
    const proxyUrl = `${MARKETS_PROXY}?limit=${limit}`;
    const req = new Request(proxyUrl, { headers: HEADERS });
    const resp = await fetch(req);
    
    if (!resp.ok) {
      throw new Error(`Proxy error: ${resp.status}`);
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
    // Use our proxy
    const proxyUrl = `${MARKETS_PROXY}?limit=${limit}&closed=true`;
    const req = new Request(proxyUrl, { headers: HEADERS });
    const resp = await fetch(req);
    
    if (!resp.ok) throw new Error(`Proxy error: ${resp.status}`);
    
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
  const q = (market.question || '').toLowerCase();
  const d = (market.description || '').toLowerCase();
  const tags = (market.tags || []).map((t: string) => t.toLowerCase()).join(' ');
  const text = `${q} ${d} ${tags}`;

  // Use word boundaries to avoid false matches
  const has = (kw: string) => {
    // Match whole word only — \b doesn't work with punctuation, so use space/punctuation boundaries
    return new RegExp(`(?:^|[\\s,\\-\\(\\)\\/"'])${kw}(?:[\\s,\\-\\(\\)\\/"']|$)`, 'i').test(text);
  };

  // Crypto — explicit, no false matches
  if (/\b(bitcoin|ethereum|crypto|defi|nft\s|wallet|blockchain|solana|bnb|ripple|cardano|polkadot|avalanche|matic|binance)\b/i.test(text)) {
    return 'crypto';
  }

  // Politics — elections, wars, governments
  if (/\b(trump|biden|election\s|president\s|congress|senate|vote\s|voting|republican|democrat|nato|war\s|ukraine|russia|iran|korea|israel|palestine|china\s|taiwan|inflation|genocide)\b/i.test(text)) {
    return 'politics';
  }

  // Sports — teams, leagues, scores, tournaments
  if (/\b(nba|nfl|mlb|nhl|uefa|fifa|world cup|olympics|tennis|championship\s|league\s|match\s|score\s|win\s|the\s+\d|season\s|playoff|strike\s|mvp|cup\s|final\s)\b/i.test(text)) {
    return 'sports';
  }

  // Economy — monetary policy, macro, finance (but NOT sports teams)
  if (/\b(fed\s|federal reserve|interest rate|inflation\s|recession|gdp\s|treasury|bond\s|yield\s|nasdaq|s&p\s|dow jones|stock market|unemployment\s|jobs report|oil price|gold price|dollar index|monetary policy|banking crisis)\b/i.test(text)) {
    return 'economy';
  }

  // Tech — AI/ML, big tech companies, space, internet
  if (/\b(artificial intelligence|openai|gpt[ -]|chatgpt|claude\s|gemini\s|anthropic|neural network|spacex|nasa\s|cyberattack|quantum|internet outage)\b/i.test(text)) {
    return 'tech';
  }

  // Entertainment — music albums, movies, TV shows, gaming, celebrity
  if (/\b(gta\s|album\s|music\s|concert\s|tour\s|rapper|singer|band|movie\s|tv show|series\s|netflix|disney|hbo|streaming|video game|playstation|xbox|nintendo|steam|rockstar|trevor|franklin|lucia)\b/i.test(text)) {
    return 'entertainment';
  }

  // Science — medical, research, discovery
  if (/\b(vaccine\s|disease\s|cure\s|cancer\s|fda|approval|clinical trial|space launch|moon\s|mars\s|satellite|stem cell|genome|crispr)\b/i.test(text)) {
    return 'science';
  }

  // Legal — court cases, sentencing, charges
  if (/\b(sentenc|convict|arrest|indict|charge\s|plea|trial\s|court|lawsuit|verdict|jury|attorney|lawyer|harvey weinstein|felon|prison\s|jail\s)\b/i.test(text)) {
    return 'legal';
  }

  return 'other';
}

export const CATEGORY_COLORS: Record<string, string> = {
  crypto: '#F7931A',
  politics: '#3B82F6',
  sports: '#10B981',
  economy: '#8B5CF6',
  tech: '#EC4899',
  entertainment: '#F59E0B',
  science: '#06B6D4',
  legal: '#EF4444',
  other: '#6B7280',
};

export const CATEGORY_LABELS: Record<string, string> = {
  crypto: '₿ Crypto',
  politics: '🗳 Politics',
  sports: '⚽ Sports',
  economy: '📈 Economy',
  tech: '💻 Tech',
  entertainment: '🎬 Entertainment',
  science: '🔬 Science',
  legal: '⚖️ Legal',
  other: '📌 Other',
};
