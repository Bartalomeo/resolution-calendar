'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { PLANS, CHAIN_NAMES, CHAIN_CURRENCIES } from '@/lib/crypto';

function PaymentContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [step, setStep] = useState<'loading' | 'select' | 'pay' | 'verifying' | 'done' | 'error'>('loading');
  const [plan, setPlan] = useState<string>('');
  const [chain, setChain] = useState<string>('ethereum');
  const [ref, setRef] = useState<string>('');
  const [paymentData, setPaymentData] = useState<any>(null);
  const [txHash, setTxHash] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [txError, setTxError] = useState('');

  useEffect(() => {
    const refParam = searchParams.get('ref');
    const planParam = searchParams.get('plan');

    if (refParam && planParam) {
      setRef(refParam);
      setPlan(planParam);
      setStep('pay');
      startCountdown();
      const txParam = searchParams.get('txHash');
      if (txParam) {
        setTxHash(txParam);
        handleVerify(txParam);
      }
    } else {
      setStep('select');
    }
  }, [searchParams]);

  const startCountdown = () => {
    const expires = localStorage.getItem('rc_payment_expires');
    if (!expires) return;
    const tick = () => {
      const left = Math.max(0, Math.floor((new Date(expires).getTime() - Date.now()) / 1000));
      setCountdown(left);
      if (left === 0) setStep('error');
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  };

  const handleCreatePayment = async (selectedPlan: string, selectedChain: string) => {
    setPlan(selectedPlan);
    setChain(selectedChain);
    setStep('loading');

    try {
      const res = await fetch('/api/crypto/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selectedPlan, chain: selectedChain }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setPaymentData(data);
      setRef(data.ref);
      localStorage.setItem('rc_payment_expires', data.expiresAt);
      setStep('pay');
      startCountdown();
    } catch (err: any) {
      setError(err.message);
      setStep('error');
    }
  };

  const handleVerify = useCallback(async (hash?: string) => {
    const targetHash = hash || txHash.trim();
    if (!targetHash) {
      setTxError('Enter tx hash');
      return;
    }
    if (!targetHash.startsWith('0x') || targetHash.length < 66) {
      setTxError('Invalid tx hash format');
      return;
    }

    setVerifying(true);
    setTxError('');
    setStep('verifying');

    try {
      const res = await fetch(`/api/crypto/verify?ref=${encodeURIComponent(ref)}&txHash=${encodeURIComponent(targetHash)}`);
      const data = await res.json();

      if (data.status === 'confirmed') {
        setStep('done');
      } else if (data.status === 'expired') {
        setStep('error');
        setError('Payment expired');
      } else {
        setTxError(data.error || 'Transaction not found or not confirmed yet');
        setStep('pay');
      }
    } catch (err: any) {
      setTxError(err.message);
      setStep('pay');
    } finally {
      setVerifying(false);
    }
  }, [ref, txHash]);

  const planData = plan ? PLANS[plan as keyof typeof PLANS] : null;

  if (step === 'loading') {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Preparing payment...</p>
        </div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-xl font-bold mb-2">Error</h1>
          <p className="text-gray-400 mb-6">{error || 'Something went wrong'}</p>
          <button onClick={() => router.push('/v1')} className="px-6 py-3 bg-blue-600 rounded-lg font-medium">
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-2xl font-bold mb-2">Payment confirmed!</h1>
          <p className="text-gray-400 mb-2">
            Plan <strong>{planData?.name}</strong> activated.
          </p>
          <p className="text-gray-500 text-sm mb-6">Valid for 30 days</p>
          <button onClick={() => router.push('/v1')} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium">
            Open Resolution Calendar
          </button>
        </div>
      </div>
    );
  }

  if (step === 'select') {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        <header className="border-b border-gray-800 sticky top-0 bg-gray-950 z-10">
          <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
            <button onClick={() => router.push('/v1')} className="text-gray-500 hover:text-white text-xl">←</button>
            <h1 className="text-xl font-bold">Choose a plan</h1>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-8 space-y-4">
          <p className="text-gray-400 text-sm mb-6">Pay with USDT. Select a network:</p>

          {(['pro', 'trader'] as const).map((key) => {
            const p = PLANS[key];
            return (
              <div key={key} className={`rounded-xl border ${key === 'trader' ? 'border-purple-500 bg-purple-950/20' : 'border-blue-500 bg-blue-950/20'} p-5`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold">{p.name}</h3>
                  <span className={`text-sm font-medium px-2 py-0.5 rounded ${key === 'trader' ? 'bg-purple-600' : 'bg-blue-600'}`}>
                    ${p.priceUsdt}/mo
                  </span>
                </div>
                <ul className="space-y-1 mb-4">
                  {p.features.map((f, i) => (
                    <li key={i} className="text-sm text-gray-300 flex items-center gap-2">
                      <span className="text-green-400 text-xs">✓</span> {f}
                    </li>
                  ))}
                </ul>

                <p className="text-gray-500 text-xs mb-3">Select network:</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['ethereum', 'base', 'polygon', 'arbitrum'] as const).map((net) => (
                    <button
                      key={net}
                      onClick={() => handleCreatePayment(key, net)}
                      className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition"
                    >
                      {CHAIN_NAMES[net]}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </main>
      </div>
    );
  }

  if (step === 'verifying') {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Verifying transaction...</h1>
          <p className="text-gray-400 text-sm mb-4">
            Fetching data from blockchain ({CHAIN_NAMES[chain]})
          </p>
          <code className="text-green-400 text-xs break-all">{txHash}</code>
        </div>
      </div>
    );
  }

  // step === 'pay'
  const minutes = countdown !== null ? Math.floor(countdown / 60) : 0;
  const seconds = countdown !== null ? countdown % 60 : 0;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 sticky top-0 bg-gray-950 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={() => setStep('select')} className="text-gray-500 hover:text-white text-xl">←</button>
          <h1 className="text-xl font-bold">Pay {planData?.name}</h1>
          <div className="text-xs text-gray-600 w-8" />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8">
        <div className="text-center mb-6">
          <p className="text-gray-500 text-xs mb-1">Time to pay:</p>
          <p className={`text-2xl font-mono font-bold ${countdown !== null && countdown < 300 ? 'text-red-400' : 'text-white'}`}>
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-4 text-center">
          <p className="text-gray-400 text-sm mb-1">Amount to pay</p>
          <p className="text-3xl font-bold text-white">
            {planData?.priceUsdt} <span className="text-lg text-gray-400">USDT</span>
          </p>
          <p className="text-gray-500 text-xs mt-1">{CHAIN_CURRENCIES[chain]} · {CHAIN_NAMES[chain]}</p>
        </div>

        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-4">
          <p className="text-gray-400 text-sm mb-2">Payment address:</p>
          <code className="text-green-400 text-sm break-all block mb-3">
            {paymentData?.address}
          </code>
          <button
            onClick={() => navigator.clipboard.writeText(paymentData?.address || '')}
            className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition"
          >
            📋 Copy address
          </button>
        </div>

        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-4 text-center">
          <p className="text-gray-400 text-sm mb-3">QR Code</p>
          <div className="w-40 h-40 bg-gray-800 rounded-lg mx-auto flex items-center justify-center mb-3">
            <span className="text-gray-600 text-6xl">⬜</span>
          </div>
          <p className="text-gray-500 text-xs">
            Send {CHAIN_NAMES[chain]} USDT to the address above
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
          <p className="text-gray-400 text-sm mb-2">
            After sending — paste tx hash:
          </p>
          <textarea
            value={txHash}
            onChange={e => setTxHash(e.target.value)}
            placeholder="0x7a3f..."
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm font-mono resize-none focus:outline-none focus:border-blue-500"
            rows={3}
          />
          {txError && (
            <p className="text-red-400 text-xs mt-2">{txError}</p>
          )}
          <button
            onClick={() => handleVerify()}
            disabled={verifying || !txHash.trim()}
            className="w-full mt-3 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg font-medium transition"
          >
            {verifying ? 'Verifying...' : '✅ Verify Payment'}
          </button>
          <p className="text-gray-600 text-xs mt-3 text-center">
            Confirmation: 1-3 min (ETH/Base/Arb) or ~3 sec (Polygon)
          </p>
        </div>

        <button onClick={() => setStep('select')} className="w-full mt-4 text-center text-gray-500 text-sm hover:text-gray-400">
          ← Choose different network
        </button>
      </main>
    </div>
  );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <PaymentContent />
    </Suspense>
  );
}
