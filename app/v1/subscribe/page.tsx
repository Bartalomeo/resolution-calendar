import { PLANS } from '@/lib/stripe';

export default function SubscribePage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 sticky top-0 bg-gray-950 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <h1 className="text-xl font-bold text-white">Выбери план</h1>
          <p className="text-xs text-gray-500 mt-1">Resolution Calendar</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid md:grid-cols-3 gap-6">
          {(['free', 'pro', 'trader'] as const).map((key) => {
            const plan = PLANS[key];
            const isPro = key === 'pro';
            const isTrader = key === 'trader';

            return (
              <div
                key={key}
                className={`rounded-xl border ${
                  isPro
                    ? 'border-blue-500 bg-blue-950/30'
                    : isTrader
                    ? 'border-purple-500 bg-purple-950/30'
                    : 'border-gray-700 bg-gray-900'
                } p-6 flex flex-col`}
              >
                {isPro && (
                  <span className="text-xs font-medium text-blue-400 mb-2">ПОПУЛЯРНЫЙ</span>
                )}
                {isTrader && (
                  <span className="text-xs font-medium text-purple-400 mb-2">МАКСИМУМ</span>
                )}

                <h2 className="text-xl font-bold text-white">{plan.name}</h2>
                <div className="mt-2 mb-4">
                  <span className="text-3xl font-bold text-white">
                    ${key === 'free' ? '0' : (plan.price / 100).toFixed(2)}
                  </span>
                  {plan.interval && (
                    <span className="text-gray-400 text-sm">/{plan.interval}</span>
                  )}
                </div>

                <ul className="space-y-2 mb-6 flex-1">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                      <span className="text-green-400 mt-0.5">✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>

                <a
                  href={`/v1?subscribe=${key}`}
                  className={`block text-center px-4 py-3 rounded-lg font-medium transition ${
                    isPro
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : isTrader
                      ? 'bg-purple-600 hover:bg-purple-700 text-white'
                      : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                  }`}
                >
                  {key === 'free' ? 'Текущий план' : 'Выбрать'}
                </a>
              </div>
            );
          })}
        </div>

        <div className="mt-8 text-center text-gray-500 text-sm">
          <p>Все платежи через Stripe. Отмена в любой момент.</p>
          <p className="mt-1">Test mode — используй карту 4242 4242 4242 4242</p>
        </div>
      </main>
    </div>
  );
}
