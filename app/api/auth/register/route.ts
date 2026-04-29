import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getUser, setUser, UserStore } from '@/lib/redis';
import { createToken, makeSessionCookie } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
    }

    if (username.length < 3 || username.length > 32) {
      return NextResponse.json({ error: 'Username must be 3-32 chars' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 chars' }, { status: 400 });
    }

    // Check if username already exists
    const existing = await getUser(`u:${username.toLowerCase()}`);
    if (existing) {
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const userId = `u:${username.toLowerCase()}`;
    const user: UserStore = {
      userId,
      username: username.toLowerCase(),
      passwordHash,
      subscribed: false,
      watchlist: [],
      addedAt: new Date().toISOString(),
      subscription: { plan: 'free', status: 'inactive' },
    };

    await setUser(userId, user);

    // Create session token
    const token = createToken(userId);
    const cookie = makeSessionCookie(token);

    const response = NextResponse.json({
      ok: true,
      user: { userId, username: user.username, subscription: user.subscription }
    });
    response.headers.set('Set-Cookie', cookie);
    return response;
  } catch (err: any) {
    console.error('Register error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
