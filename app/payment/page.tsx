'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, type Variants } from 'framer-motion';
import { CheckCircle2, XCircle, Loader2, Copy, ChevronLeft, Wallet, Clock } from 'lucide-react';

const MERCHANT_WALLET = '0x341bACc53cc14EecF2cE5bd294826eB0740b100F';
const PLAN_PRICE = 4.99;
const PLAN_NAME = 'Pro';
const PAYMENT_DURATION_SECONDS = 30 * 60;

const CHAINS: Record<string, { name: string; icon: string; color: string; currency: string }> = {
  ethereum: { name: 'Ethereum', icon: 'Ξ', color: '#627EEA', currency: 'USDT (ERC-20)' },
  base: { name: 'Base', icon: '◎', color: '#0052FF', currency: 'USDT (Base)' },
  polygon: { name: 'Polygon', icon: '⬡', color: '#8247E5', currency: 'USDT (Polygon)' },
  arbitrum: { name: 'Arbitrum', icon: '◆', color: '#28A0F0', currency: 'USDT (Arbitrum)' },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
};

function PaymentContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [step, setStep] = useState<'loading' | 'pay' | 'verifying' | 'done' | 'error'>('loading');
  const [ref, setRef] = useState('');
  const [plan, setPlan] = useState('');
  const [chain, setChain] = useState('ethereum');
  const [txHash, setTxHash] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState<number>(PAYMENT_DURATION_SECONDS);
  const [txError, setTxError] = useState('');
  const [qrLoaded, setQrLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const qrContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refParam = searchParams.get('ref');
    const planParam = searchParams.get('plan');
    const chainParam = searchParams.get('chain');
    const txParam = searchParams.get('txHash');

    if (!refParam || !planParam) {
      setStep('error');
      setError('Missing payment parameters');
      return;
    }

    setRef(refParam);
    setPlan(planParam);
    if (chainParam && CHAINS[chainParam]) setChain(chainParam);

    fetch(`/api/crypto/status?ref=${encodeURIComponent(refParam)}`)
      .then(res => res.json())
      .then(data => {
        if (data.status === 'confirmed') {
          setStep('done');
        } else if (data.status === 'expired') {
          setStep('error');
          setError('Payment expired. Please create a new one.');
        } else {
          setStep('pay');
          const created = localStorage.getItem('rc_payment_created');
          const createdMs = created ? parseInt(created, 10) : Date.now();
          const elapsed = Math.floor((Date.now() - createdMs) / 1000);
          const remaining = Math.max(0, PAYMENT_DURATION_SECONDS - elapsed);
          setCountdown(remaining);
          if (remaining === 0) {
            setStep('error');
            setError('Payment expired. Please create a new one.');
          }
        }
      })
      .catch(() => {
        setStep('pay');
        setCountdown(PAYMENT_DURATION_SECONDS);
      });

    if (typeof window !== 'undefined' && !(window as any).QRCode) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
      script.onload = () => setQrLoaded(true);
      document.head.appendChild(script);
    } else {
      setQrLoaded(true);
    }

    if (txParam) setTxHash(txParam);
  }, [searchParams]);

  useEffect(() => {
    if (step !== 'pay' || countdown <= 0) return;
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          setStep('error');
          setError('Payment expired. Please create a new one.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [step, countdown]);

  useEffect(() => {
    if (!qrLoaded || step !== 'pay' || !qrContainerRef.current) return;
    const QRCode = (window as any).QRCode;
    if (!QRCode) return;
    qrContainerRef.current.innerHTML = '';
    new QRCode(qrContainerRef.current, {
      text: MERCHANT_WALLET,
      width: 160,
      height: 160,
      colorDark: '#10b981',
      colorLight: '#18181b',
      correctLevel: QRCode.CorrectLevel.L,
    });
  }, [qrLoaded, step]);

  const handleVerify = async (hash?: string) => {
    const targetHash = hash || txHash.trim();
    if (!targetHash) { setTxError('Enter tx hash'); return; }
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
        setError('Payment expired. Please create a new one.');
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
  };

  const copyAddress = () => {
    navigator.clipboard.writeText(MERCHANT_WALLET);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;
  const chainInfo = CHAINS[chain] || CHAINS.ethereum;
  const urgent = countdown < 300;

  if (step === 'loading') {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-12 h-12 border-2 border-violet-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-sm"
        >
          <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-10 h-10 text-red-400" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Payment failed</h1>
          <p className="text-zinc-400 mb-6">{error}</p>
          <a
            href="/new"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white px-6 py-3 rounded-xl font-medium"
          >
            Back to Calendar
          </a>
        </motion.div>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-sm"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-6"
          >
            <CheckCircle2 className="w-10 h-10 text-emerald-400" />
          </motion.div>
          <h1 className="text-2xl font-bold mb-2">Payment confirmed!</h1>
          <p className="text-zinc-400 mb-2">Plan <strong className="text-white">{PLAN_NAME}</strong> activated.</p>
          <p className="text-zinc-600 text-sm mb-8">Valid for 30 days</p>
          <a
            href="/new"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white px-6 py-3 rounded-xl font-medium"
          >
            Open Resolution Calendar
          </a>
        </motion.div>
      </div>
    );
  }

  if (step === 'verifying') {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-sm"
        >
          <div className="w-16 h-16 border-[3px] border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
          <h1 className="text-xl font-bold mb-2">Verifying transaction...</h1>
          <p className="text-zinc-400 text-sm mb-4">Checking {chainInfo.name} blockchain</p>
          <code className="text-emerald-400 text-xs break-all px-3 py-2 bg-zinc-900/60 rounded-lg inline-block">{txHash}</code>
        </motion.div>
      </div>
    );
  }

  // step === 'pay'
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white relative">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute w-[500px] h-[500px] rounded-full blur-[150px] opacity-10"
          style={{
            background: `radial-gradient(circle, ${chainInfo.color} 0%, transparent 70%)`,
            left: '50%',
            top: '30%',
            transform: 'translate(-50%, -50%)',
          }}
        />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-800/50 backdrop-blur-xl bg-[#0A0A0A]/80">
        <div className="max-w-lg mx-auto px-4 h-16 flex items-center gap-3">
          <a href="/new" className="text-zinc-500 hover:text-white transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </a>
          <h1 className="text-lg font-semibold">Checkout</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8 space-y-4 relative">
        {/* Timer + Chain */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl p-5 border border-zinc-800/60"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-zinc-500" />
              <span className="text-sm text-zinc-400">Pay with</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: `${chainInfo.color}15`, border: `1px solid ${chainInfo.color}30` }}>
              <span className="text-sm font-medium" style={{ color: chainInfo.color }}>{chainInfo.icon} {chainInfo.name}</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-zinc-500" />
              <span className="text-sm text-zinc-400">Time left</span>
            </div>
            <span className={`text-xl font-mono font-bold ${urgent ? 'text-red-400' : 'text-white'}`}>
              {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </span>
          </div>
        </motion.div>

        {/* Amount */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="glass-card rounded-2xl p-6 text-center border border-zinc-800/60"
        >
          <p className="text-zinc-400 text-sm mb-2">Amount to pay</p>
          <p className="text-4xl font-bold">
            {PLAN_PRICE}{' '}
            <span className="text-lg text-zinc-400 font-normal">USDT</span>
          </p>
          <p className="text-zinc-600 text-xs mt-2">{chainInfo.currency}</p>
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-violet-500/10 border border-violet-500/20 rounded-full text-sm text-violet-300">
            <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
            {PLAN_NAME} Plan · 30 days
          </div>
        </motion.div>

        {/* QR Code */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card rounded-2xl p-5 text-center border border-zinc-800/60"
        >
          <p className="text-zinc-400 text-sm mb-4">Scan with your {chainInfo.name} wallet</p>
          <div
            className="w-40 h-40 mx-auto mb-4 rounded-xl overflow-hidden flex items-center justify-center"
            style={{ backgroundColor: '#18181b' }}
          >
            <div ref={qrContainerRef} />
          </div>
          <p className="text-zinc-500 text-xs">Send exactly <strong className="text-white">{PLAN_PRICE} USDT</strong> to:</p>
        </motion.div>

        {/* Address */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass-card rounded-2xl p-5 border border-zinc-800/60"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-zinc-400 text-sm">Payment address</p>
            <button
              onClick={copyAddress}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-zinc-800/50"
            >
              <Copy className="w-3 h-3" />
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <code className="text-emerald-400 text-sm break-all block font-mono">{MERCHANT_WALLET}</code>
        </motion.div>

        {/* TX Hash verify */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card rounded-2xl p-5 border border-zinc-800/60"
        >
          <p className="text-zinc-400 text-sm mb-3">After sending — paste tx hash to verify:</p>
          <textarea
            value={txHash}
            onChange={e => setTxHash(e.target.value)}
            placeholder="0x7a3f..."
            className="w-full bg-zinc-900/60 border border-zinc-800/80 rounded-xl px-3 py-2.5 text-white text-sm font-mono resize-none focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 transition-all"
            rows={3}
          />
          {txError && (
            <p className="text-red-400 text-xs mt-2">{txError}</p>
          )}
          <motion.button
            onClick={() => handleVerify()}
            disabled={verifying || !txHash.trim()}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            className="w-full mt-3 py-3.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 disabled:opacity-50 rounded-xl font-semibold text-white shadow-lg shadow-emerald-500/20 transition-all duration-200 flex items-center justify-center gap-2"
          >
            {verifying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Verify Payment
              </>
            )}
          </motion.button>
          <p className="text-zinc-600 text-xs mt-3 text-center">
            Confirmation: 1-3 min on {chainInfo.name}
          </p>
        </motion.div>
      </main>

      <style jsx global>{`
        .glass-card {
          background: rgba(17, 17, 22, 0.7);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }
      `}</style>
    </div>
  );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <PaymentContent />
    </Suspense>
  );
}
