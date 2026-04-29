import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { setPayment, getPayment } from '@/lib/redis';
import { PLANS, type PlanKey } from '@/lib/crypto';

const MERCHANT_WALLET = '0x341bACc53cc14EecF2cE5bd294826eB0740b100F';
const PAYMENT_DURATION = 30 * 60 * 1000; // 30 minutes

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { plan, chain } = await req.json();

    if (!plan || !PLANS[plan as PlanKey]) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }
    if (!['ethereum', 'base', 'polygon', 'arbitrum'].includes(chain)) {
      return NextResponse.json({ error: 'Invalid chain' }, { status: 400 });
    }

    const planData = PLANS[plan as PlanKey];
    if (planData.priceUsdt === 0) {
      return NextResponse.json({ error: 'Free plan does not need payment' }, { status: 400 });
    }

    // Generate unique payment reference
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    const ref = `rc_${session.user.userId.replace('u:', '')}_${plan}_${timestamp}_${random}`;

    // Amount in USDT units (6 decimals)
    const amountSmallest = (planData.priceUsdt * 1_000_000).toString();

    const payment = {
      ref,
      userId: session.user.userId,
      plan: plan as PlanKey,
      chain,
      address: MERCHANT_WALLET,
      amount: amountSmallest,
      currency: 'USDT',
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(timestamp + PAYMENT_DURATION).toISOString(),
    };

    await setPayment(ref, payment);

    return NextResponse.json({
      ref,
      address: MERCHANT_WALLET,
      amount: planData.priceUsdt,
      amountSmallest,
      chain,
      expiresAt: payment.expiresAt,
      merchantAddress: MERCHANT_WALLET,
    });
  } catch (err: any) {
    console.error('Crypto create error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
