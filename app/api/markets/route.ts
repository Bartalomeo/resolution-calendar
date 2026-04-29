import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const closed = searchParams.get('closed') ?? 'false';
    const limit = searchParams.get('limit') ?? '200';
    
    const res = await fetch(`https://gamma-api.polymarket.com/markets?closed=${closed}&limit=${limit}`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    });
    
    if (!res.ok) {
      return NextResponse.json({ error: 'Polymarket API error', status: res.status }, { status: 502 });
    }
    
    const data = await res.json();
    
    // Normalize string fields to arrays/numbers
    const normalized = (data as any[]).map(m => ({
      ...m,
      outcomes: typeof m.outcomes === 'string' ? JSON.parse(m.outcomes) : (m.outcomes || ['Yes', 'No']),
      outcomePrices: typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : (m.outcomePrices || ['0.5', '0.5']),
      volume: typeof m.volume === 'string' ? parseFloat(m.volume) : (m.volume ?? 0),
      liquidity: typeof m.liquidity === 'string' ? parseFloat(m.liquidity) : (m.liquidity ?? 0),
    }));
    
    return NextResponse.json(normalized);
  } catch (e) {
    console.error('Markets proxy error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
