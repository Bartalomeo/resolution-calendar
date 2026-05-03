'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

const MERCHANT_WALLET = '0x341bACc53cc14EecF2cE5bd294826eB0740b100F';
const PLAN_PRICE = 4.99; // USDT
const PLAN_NAME = 'Pro';

function PaymentContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [step, setStep] = useState<'loading' | 'pay' | 'verifying' | 'done' | 'error'>('loading');
  const [ref, setRef] = useState('');
  const [plan, setPlan] = useState('');
  const [paymentData, setPaymentData] = useState<any>(null);
  const [txHash, setTxHash] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState<number>(0);
  const [txError, setTxError] = useState('');
  const [qrLoaded, setQrLoaded] = useState(false);

  // QR code element ref
  let qrCanvasRef: HTMLCanvasElement | null = null;
  const setQrRef = (el: HTMLCanvasElement | null) => { qrCanvasRef = el; };

  useEffect(() => {
    const refParam = searchParams.get('ref');
    const planParam = searchParams.get('plan');
    const txParam = searchParams.get('txHash');

    if (!refParam || !planParam) {
      setStep('error');
      setError('Missing payment parameters');
      return;
    }

    setRef(refParam);
    setPlan(planParam);
    setStep('pay');

    // Load QR code library
    if (typeof window !== 'undefined' && !(window as any).QRCode) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js';
      script.onload = () => setQrLoaded(true);
      document.head.appendChild(script);
    } else {
      setQrLoaded(true);
    }

    // Check existing countdown
    const expires = localStorage.getItem('rc_payment_expires');
    if (expires) {
      const left = Math.max(0, Math.floor((new Date(expires).getTime() - Date.now()) / 1000));
      if (left === 0) {
        setStep('error');
        setError('Payment link expired');
        return;
      }
      setCountdown(left);
    }

    // If txHash in URL — verify immediately
    if (txParam) {
      setTxHash(txParam);
      handleVerify(txParam);
    }
  }, [searchParams]);

  // Countdown timer
  useEffect(() => {
    if (step !== 'pay' || countdown <= 0) return;
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          setStep('error');
          setError('Payment link expired');
          return 0;
        }
        // Persist
        const expires = localStorage.getItem('rc_payment_expires');
        if (expires) {
          const newLeft = Math.floor((new Date(expires).getTime() - Date.now()) / 1000);
          if (newLeft <= 0) {
            setStep('error');
            setError('Payment link expired');
            return 0;
          }
          return newLeft;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [step]);

  // Render QR when data ready and library loaded
  useEffect(() => {
    if (!qrLoaded || step !== 'pay' || !qrCanvasRef || !MERCHANT_WALLET) return;
    const canvas = qrCanvasRef;
    const QRCode = (window as any).QRCode;
    if (!QRCode) return;

    QRCode.toCanvas(canvas, MERCHANT_WALLET, {
      width: 160,
      margin: 2,
      color: { dark: '#22c55e', light: '#1f2937' },
    });
  }, [qrLoaded, step]);

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

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;

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
          <h1 className="text-xl font-bold mb-2">Payment failed</h1>
          <p className="text-gray-400 mb-6">{error || 'Something went wrong'}</p>
          <button onClick={() => router.push('/v1')} className="px-6 py-3 bg-blue-600 rounded-lg font-medium">
            Back to Calendar
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
            Plan <strong>{PLAN_NAME}</strong> activated.
          </p>
          <p className="text-gray-500 text-sm mb-6">Valid for 30 days</p>
          <button onClick={() => router.push('/v1')} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium">
            Open Resolution Calendar
          </button>
        </div>
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
            Fetching from Ethereum blockchain
          </p>
          <code className="text-green-400 text-xs break-all">{txHash}</code>
        </div>
      </div>
    );
  }

  // step === 'pay'
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 sticky top-0 bg-gray-950 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => router.push('/v1')} className="text-gray-500 hover:text-white text-xl">←</button>
          <h1 className="text-xl font-bold">Pay for {PLAN_NAME}</h1>
          <div className="text-xs text-gray-600 w-8" />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8 space-y-4">

        {/* Timer */}
        <div className="text-center">
          <p className="text-gray-500 text-xs mb-1">Time to pay:</p>
          <p className={`text-2xl font-mono font-bold ${countdown < 300 ? 'text-red-400' : 'text-white'}`}>
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </p>
        </div>

        {/* Amount */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 text-center">
          <p className="text-gray-400 text-sm mb-1">Amount</p>
          <p className="text-3xl font-bold">
            {PLAN_PRICE} <span className="text-lg text-gray-400">USDT</span>
          </p>
          <p className="text-gray-500 text-xs mt-1">Ethereum (ERC-20)</p>
        </div>

        {/* QR Code */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 text-center">
          <p className="text-gray-400 text-sm mb-3">Scan with your wallet</p>
          <div className="w-40 h-40 mx-auto mb-3 bg-gray-800 rounded-lg overflow-hidden">
            <canvas ref={setQrRef} />
          </div>
          <p className="text-gray-500 text-xs">
            Send {PLAN_PRICE} USDT to the address below
          </p>
        </div>

        {/* Address */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
          <p className="text-gray-400 text-sm mb-2">Payment address:</p>
          <code className="text-green-400 text-sm break-all block mb-3">{MERCHANT_WALLET}</code>
          <button
            onClick={() => navigator.clipboard.writeText(MERCHANT_WALLET)}
            className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition"
          >
            📋 Copy address
          </button>
        </div>

        {/* TX Hash input */}
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
            Confirmation: 1-3 minutes on Ethereum
          </p>
        </div>

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
