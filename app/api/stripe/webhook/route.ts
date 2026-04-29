import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { setUser, getUser } from '@/lib/redis';
import type Stripe from 'stripe';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature')!;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const plan = session.metadata?.plan;

        if (userId && plan) {
          const user = await getUser(userId);
          if (user) {
            user.subscription = {
              plan: plan as 'free' | 'pro' | 'trader',
              status: 'active',
              stripeSessionId: session.id,
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            };
            await setUser(userId, user);
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;

        if (userId) {
          const user = await getUser(userId);
          if (user) {
            user.subscription = { plan: 'free', status: 'canceled' };
            await setUser(userId, user);
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;
        const plan = subscription.metadata?.plan;
        const subData = subscription as any;

        if (userId) {
          const user = await getUser(userId);
          if (user) {
            user.subscription = {
              plan: (plan as 'free' | 'pro' | 'trader') || 'free',
              status: subscription.status === 'active' ? 'active' : 'inactive',
              stripeSessionId: subscription.id,
              currentPeriodEnd: subData.current_period_end
                ? new Date(subData.current_period_end * 1000).toISOString()
                : undefined,
            };
            await setUser(userId, user);
          }
        }
        break;
      }
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
