import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getPayment, updatePaymentStatus, getUser, setUser } from '@/lib/redis';
import { verifyUsdtTx, PLANS } from '@/lib/crypto';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const ref = searchParams.get('ref');
    const txHash = searchParams.get('txHash');

    if (!ref) {
      return NextResponse.json({ error: 'No ref' }, { status: 400 });
    }

    const payment = await getPayment(ref);
    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    // Verify payment belongs to this user
    if (payment.userId !== session.user.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Already confirmed
    if (payment.status === 'confirmed') {
      return NextResponse.json({ status: 'confirmed', txHash: payment.txHash });
    }

    // Expired
    if (payment.status === 'expired' || new Date(payment.expiresAt) < new Date()) {
      await updatePaymentStatus(ref, 'expired');
      return NextResponse.json({ status: 'expired' });
    }

    // No txHash yet
    if (!txHash) {
      return NextResponse.json({ status: 'pending' });
    }

    // Verify the transaction
    const result = await verifyUsdtTx(
      payment.chain,
      txHash,
      payment.address,
      payment.amount
    );

    if (result.valid) {
      // Grant subscription
      await updatePaymentStatus(ref, 'confirmed', txHash);

      const user = await getUser(session.user.userId);
      if (user) {
        user.subscription = {
          plan: payment.plan,
          status: 'active',
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        };
        await setUser(session.user.userId, user);
      }

      return NextResponse.json({
        status: 'confirmed',
        txHash,
        plan: payment.plan,
      });
    }

    return NextResponse.json({
      status: 'pending',
      error: result.error,
    });
  } catch (err: any) {
    console.error('Crypto verify error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
