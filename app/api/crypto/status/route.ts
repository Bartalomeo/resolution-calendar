import { NextRequest, NextResponse } from 'next/server';
import { getPayment } from '@/lib/redis';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ref = searchParams.get('ref');

    if (!ref) {
      return NextResponse.json({ error: 'No ref' }, { status: 400 });
    }

    const payment = await getPayment(ref);
    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    // Already confirmed
    if (payment.status === 'confirmed') {
      return NextResponse.json({ status: 'confirmed' });
    }

    // Expired (either marked expired or past expiration time)
    if (payment.status === 'expired' || new Date(payment.expiresAt) < new Date()) {
      return NextResponse.json({ status: 'expired' });
    }

    // Still pending
    return NextResponse.json({ status: 'pending' });
  } catch (err: any) {
    console.error('Crypto status error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
