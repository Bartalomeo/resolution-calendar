'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function SuccessContent() {
  const params = useSearchParams();
  const sessionId = params.get('session_id');
  const plan = params.get('plan');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    if (!sessionId) {
      setStatus('error');
      return;
    }
    fetch(`/api/stripe/verify?session_id=${sessionId}&plan=${plan}`)
      .then((res) => res.json())
      .then((data) => setStatus(data.success ? 'success' : 'error'))
      .catch(() => setStatus('error'));
  }, [sessionId, plan]);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="text-center max-w-md mx-auto px-4">
        {status === 'loading' && (
          <>
            <div className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h1 className="text-xl font-bold">Проверяем оплату...</h1>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="text-6xl mb-4">✅</div>
            <h1 className="text-2xl font-bold mb-2">Оплата прошла!</h1>
            <p className="text-gray-400 mb-6">
              План <strong>{plan === 'pro' ? 'Pro' : 'Trader'}</strong> активирован.
            </p>
            <a
              href="/v1"
              className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium"
            >
              Открыть Resolution Calendar
            </a>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="text-6xl mb-4">❌</div>
            <h1 className="text-xl font-bold mb-2">Что-то пошло не так</h1>
            <p className="text-gray-400 mb-6">Свяжитесь с поддержкой если сумма списана.</p>
            <a
              href="/v1/subscribe"
              className="inline-block px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-medium"
            >
              Попробовать снова
            </a>
          </>
        )}
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <SuccessContent />
    </Suspense>
  );
}
