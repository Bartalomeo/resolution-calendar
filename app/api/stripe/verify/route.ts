import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getUser, setUser } from '@/lib/redis';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('session_id');
  const plan = searchParams.get('plan');

  if (!sessionId) {
    return NextResponse.json({ error: 'No session_id' }, { status: 400 });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid' || session.status === 'complete') {
      // Update user subscription in Redis
      const userId = session.metadata?.userId || session.client_reference_id;

      if (userId && userId !== 'anonymous') {
        const user = await getUser(userId);
        if (user) {
          user.subscription = {
            plan: (plan as 'pro' | 'trader') || 'pro',
            status: 'active',
            stripeSessionId: sessionId,
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          };
          await setUser(userId, user);
        }
      }

      return NextResponse.json({
        success: true,
        plan,
        customerId: session.customer,
      });
    }

    return NextResponse.json({ success: false, status: session.status });
  } catch (err: any) {
    console.error('Verify session error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
