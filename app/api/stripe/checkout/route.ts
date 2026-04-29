import { NextRequest, NextResponse } from 'next/server';
import { stripe, PLANS } from '@/lib/stripe';

export async function POST(req: NextRequest) {
  try {
    const { plan, sessionId } = await req.json();

    if (!plan || !PLANS[plan as keyof typeof PLANS]) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    const planData = PLANS[plan as keyof typeof PLANS];

    // Create Stripe Checkout Session
    const baseUrl = req.headers.get('origin') || 'https://resolution-calendar.vercel.app';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Resolution Calendar — ${planData.name}`,
              description: planData.features.join(' • '),
            },
            unit_amount: planData.price * 100,
            recurring: {
              interval: planData.interval === 'month' ? 'month' : 'month',
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/v1/success?session_id={CHECKOUT_SESSION_ID}&plan=${plan}`,
      cancel_url: `${baseUrl}/v1?canceled=1`,
      metadata: {
        plan,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('Stripe checkout error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
