import { NextRequest, NextResponse } from 'next/server';
import { getUser, setUser, UserStore } from '@/lib/redis';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'No userId' }, { status: 400 });
  }

  const user = await getUser(userId);

  if (!user) {
    // Create new user (anonymous)
    const newUser: UserStore = {
      userId,
      subscribed: false,
      watchlist: [] as string[],
      addedAt: new Date().toISOString(),
      subscription: {
        plan: 'free' as const,
        status: 'inactive' as const,
      },
    };
    await setUser(userId, newUser);
    return NextResponse.json(newUser);
  }

  return NextResponse.json(user);
}
