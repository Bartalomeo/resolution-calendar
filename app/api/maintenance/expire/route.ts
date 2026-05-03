import { NextRequest, NextResponse } from 'next/server';
import { getAllUserIds, getUser, setUser } from '@/lib/redis';

const MAINTENANCE_SECRET = process.env.MAINTENANCE_SECRET || 'rc-maintenance-secret';

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const secret = searchParams.get('secret');

    if (secret !== MAINTENANCE_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userIds = await getAllUserIds();
    const now = new Date();
    let expired = 0;

    for (const userId of userIds) {
      const user = await getUser(userId);
      if (!user) continue;
      if (user.subscription.status === 'active' && user.subscription.currentPeriodEnd) {
        if (new Date(user.subscription.currentPeriodEnd) < now) {
          user.subscription = {
            plan: 'free',
            status: 'inactive',
          };
          await setUser(userId, user);
          expired++;
        }
      }
    }

    return NextResponse.json({ ok: true, usersChecked: userIds.length, expired });
  } catch (err: any) {
    console.error('Expire subscriptions error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
