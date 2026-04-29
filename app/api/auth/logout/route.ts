import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const response = NextResponse.json({ ok: true });
  response.headers.set('Set-Cookie', clearSessionCookie());
  return response;
}
