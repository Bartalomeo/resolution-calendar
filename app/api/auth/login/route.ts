import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getUser } from '@/lib/redis';
import { createToken, makeSessionCookie } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
    }

    const userId = `u:${username.toLowerCase()}`;
    const user = await getUser(userId);

    if (!user) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    if (!(user as any).passwordHash) {
      return NextResponse.json({ error: 'Please register a new account' }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, (user as any).passwordHash);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    const token = createToken(userId);
    const cookie = makeSessionCookie(token);

    const response = NextResponse.json({
      ok: true,
      user: { userId: user.userId, username: user.username, subscription: user.subscription }
    });
    response.headers.set('Set-Cookie', cookie);
    return response;
  } catch (err: any) {
    console.error('Login error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
