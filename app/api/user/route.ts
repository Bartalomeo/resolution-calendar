import { NextRequest, NextResponse } from 'next/server';
import { getUser, setUser } from '@/lib/redis';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'No userId' }, { status: 400 });
  }

  const user = await getUser(userId);

  if (!user) {
    // Create new user (anonymous)
    const newUser = {
      userId,
      subscribed: false,
      watchlist: [],
      addedAt: new Date().toISOString(),
      subscription: {
        plan: 'free',
        status: 'inactive',
      },
    };
    await setUser(userId, newUser);
    return NextResponse.json(newUser);
  }

  return NextResponse.json(user);
}
