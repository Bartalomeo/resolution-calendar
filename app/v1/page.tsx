'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Market } from '@/lib/types';
import {
  getActiveMarkets,
  getResolvedMarkets,
  formatVolume,
  formatPrice,
  getResolutionLabel,
  getHoursUntilResolution,
  isResolvingSoon,
  detectCategory,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
} from '@/lib/polymarket';
import { PLANS as CRYPTO_PLANS } from '@/lib/crypto';
import type { Subscription, UserStore } from '@/lib/redis';

type View = 'today' | 'week' | 'month' | 'resolved';
type Category = 'all' | 'crypto' | 'politics' | 'sports' | 'other';

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [resolved, setResolved] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [view, setView] = useState<View>('today');
  const [category, setCategory] = useState<Category>('all');
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  const [showWatchlist, setShowWatchlist] = useState(false);
  const [telegramConnected, setTelegramConnected] = useState(false);
  const [user, setUser] = useState<UserStore | null>(null);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [selectedChain, setSelectedChain] = useState<string>('ethereum');

  // Load session on mount
  const loadSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session');
      const data = await res.json();
      if (data.user) {
        setUser(data.user);
        setWatchlist(new Set(data.user.watchlist || []));
        if (data.user.chat_id) setTelegramConnected(true);
      } else {
        setUser(null);
      }
    } catch (e) {
      console.error('Session error:', e);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // Check URL params for payment success
  useEffect(() => {
    if (searchParams.get('payment') === 'success') {
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 5000);
    }
  }, [searchParams]);

  const loadMarkets = useCallback(async () => {
    try {
      const [active, resolvedData] = await Promise.all([
        getActiveMarkets(200),
        getResolvedMarkets(100),
      ]);
      const withCategory = active.map(m => ({
        ...m,
        _category: detectCategory(m),
      }));
      setMarkets(withCategory);
      setResolved(resolvedData);
      setLastUpdate(new Date());
    } catch (e) {
      console.error('Failed to load markets:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMarkets();
    const interval = setInterval(loadMarkets, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadMarkets]);

  const currentPlan = user?.subscription?.plan || 'free';
  const isSubscribed = user?.subscription?.status === 'active';
  const WATCHLIST_LIMIT = isSubscribed ? 999 : 5;
  const canAddToWatchlist = watchlist.size < WATCHLIST_LIMIT || isSubscribed;

  const filteredMarkets = markets
    .filter(m => {
      if (view === 'today') return getHoursUntilResolution(m.endDate) <= 24 && getHoursUntilResolution(m.endDate) > 0;
      if (view === 'week') { const h = getHoursUntilResolution(m.endDate); return h > 0 && h <= 168; }
      if (view === 'month') return getHoursUntilResolution(m.endDate) > 0;
      return false;
    })
    .filter(m => category === 'all' || (m as any)._category === category)
    .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime());

  const watchlistMarkets = markets.filter(m => watchlist.has(m.id));
  const displayedMarkets = showWatchlist ? watchlistMarkets : filteredMarkets;

  const handleLogout = async () => {
    setLoggingOut(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/auth/login');
  };

  const toggleWatchlist = async (id: string) => {
    if (!user) return;
    if (!canAddToWatchlist && !watchlist.has(id)) {
      setShowUpgradeModal(true);
      return;
    }
    const action = watchlist.has(id) ? 'remove' : 'add';
    const newWatchlist = new Set(watchlist);
    if (action === 'add') newWatchlist.add(id);
    else newWatchlist.delete(id);
    setWatchlist(newWatchlist);

    await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.userId, marketId: id, action }),
    });
  };

  const handleNotify = async (market: Market) => {
    if (!user) return;
    const action = watchlist.has(market.id) ? 'remove' : 'add';
    if (action === 'add' && !canAddToWatchlist) {
      setShowUpgradeModal(true);
      return;
    }
    await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.userId,
        marketId: market.id,
        marketQuestion: market.question,
        action,
      }),
    });
    await toggleWatchlist(market.id);
    if (action === 'add' && !telegramConnected) {
      setShowConnectModal(true);
    }
  };

  const handleBuyPlan = async (plan: 'pro') => {
    setShowUpgradeModal(false);
    // Create payment and redirect
    const res = await fetch('/api/crypto/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, chain: selectedChain }),
    });
    const data = await res.json();
    if (data.ref) {
      localStorage.setItem('rc_payment_expires', data.expiresAt);
      localStorage.setItem('rc_payment_created', Date.now().toString());
      router.push(`/v1/payment?ref=${encodeURIComponent(data.ref)}&plan=${encodeURIComponent(plan)}&chain=${encodeURIComponent(selectedChain)}`);
    }
  };

  const todayCount = markets.filter(m => { const h = getHoursUntilResolution(m.endDate); return h <= 24 && h > 0; }).length;
  const weekCount = markets.filter(m => { const h = getHoursUntilResolution(m.endDate); return h > 0 && h <= 168; }).length;

  // --- Not logged in: show login prompt ---
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        <header className="border-b border-gray-800 sticky top-0 bg-gray-950 z-10">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              📅 Resolution Calendar <span className="text-xs text-gray-600">(v1)</span>
            </h1>
          </div>
        </header>
        <main className="max-w-md mx-auto px-4 py-20 text-center">
          <h2 className="text-2xl font-bold mb-4">Sign in to continue</h2>
          <p className="text-gray-400 mb-8">
            Sign in to save your watchlist and get Telegram alerts when markets resolve.
          </p>
          <div className="space-y-3">
            <a
              href="/auth/login"
              className="block w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium text-center"
            >
              Sign In / Register
            </a>
          </div>
          <div className="mt-8 p-4 bg-gray-900 rounded-xl border border-gray-800">
            <p className="text-gray-500 text-xs mb-2">Without signing in:</p>
            <p className="text-gray-400 text-sm">• Browse all markets</p>
            <p className="text-gray-400 text-sm">• No watchlist</p>
            <p className="text-gray-400 text-sm">• No alerts</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Success toast */}
      {showSuccessToast && (
        <div className="fixed top-4 right-4 z-50 bg-green-900 border border-green-700 text-white px-4 py-3 rounded-lg shadow-lg text-sm">
          ✅ Payment confirmed! {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)} activated.
        </div>
      )}

      {/* Header */}
      <header className="border-b border-gray-800 sticky top-0 bg-gray-950 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                📅 Resolution Calendar <span className="text-xs text-gray-600">(v1)</span>
              </h1>
              <p className="text-xs text-gray-500">
                {markets.length} active markets{lastUpdate && ` • Updated ${lastUpdate.toLocaleTimeString()}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Plan badge */}
              <button
                onClick={() => setShowUpgradeModal(true)}
                className={`px-3 py-1.5 rounded text-sm font-medium ${
                  isSubscribed
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {isSubscribed ? 'PRO' : 'FREE'}
                {!isSubscribed && ' → UPGRADE'}
              </button>

              <button
                onClick={() => setShowWatchlist(!showWatchlist)}
                className={`px-3 py-1.5 rounded text-sm ${
                  showWatchlist
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                ★ Watchlist ({watchlist.size}{!isSubscribed && `/${WATCHLIST_LIMIT}`})
              </button>

              <a
                href="https://t.me/ResolutionCalBot"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded text-sm bg-gray-800 text-gray-300 hover:bg-gray-700"
              >
                🔔 Telegram
              </a>

              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="px-3 py-1.5 rounded text-sm bg-gray-800 text-gray-400 hover:bg-gray-700"
              >
                {loggingOut ? '...' : '🚪'}
              </button>
            </div>
          </div>

          {/* View tabs */}
          <div className="flex gap-2 mt-4">
            {[
              { key: 'today' as View, label: `Today (${todayCount})`, color: 'text-red-400' },
              { key: 'week' as View, label: `This Week (${weekCount})`, color: 'text-yellow-400' },
              { key: 'month' as View, label: 'All', color: 'text-gray-400' },
              { key: 'resolved' as View, label: 'Resolved', color: 'text-gray-400' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setView(tab.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  view === tab.key ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <span className={view === tab.key ? tab.color : ''}>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Category filters */}
      <div className="border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex gap-2 flex-wrap">
            {[
              { key: 'all' as Category, label: 'All' },
              { key: 'crypto' as Category, label: '₿ Crypto' },
              { key: 'politics' as Category, label: '🗳 Politics' },
              { key: 'sports' as Category, label: '⚽ Sports' },
            ].map(cat => (
              <button
                key={cat.key}
                onClick={() => setCategory(cat.key)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                  category === cat.key
                    ? 'bg-gray-700 text-white'
                    : 'bg-gray-900 text-gray-400 hover:bg-gray-800'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Free tier banner */}
      {!isSubscribed && (
        <div className="bg-gradient-to-r from-blue-900/50 to-purple-900/50 border-b border-blue-800/50">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">
                💎 Unlimited watchlist + priority alerts
              </p>
              <p className="text-xs text-gray-400">
                Free: {WATCHLIST_LIMIT} markets max. Pro $4.99/mo.
              </p>
            </div>
            <button
              onClick={() => setShowUpgradeModal(true)}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
            >
              UPGRADE →
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-500">Loading markets...</p>
            </div>
          </div>
        ) : view === 'resolved' ? (
          <ResolvedSection markets={resolved} />
        ) : (
          <MarketList
            markets={displayedMarkets}
            watchlist={watchlist}
            onToggleWatchlist={toggleWatchlist}
            onNotify={handleNotify}
            telegramConnected={telegramConnected}
            canAddToWatchlist={canAddToWatchlist}
            isSubscribed={isSubscribed}
            watchlistLimit={WATCHLIST_LIMIT}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-12">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="text-center text-gray-600 text-sm">
            <p>Resolution Calendar • Polymarket data</p>
            <p className="mt-1">
              <a href="https://polymarket.com" target="_blank" rel="noopener noreferrer" className="hover:text-gray-400">polymarket.com</a>
              {' • '}
              <a href="https://t.me/ResolutionCalBot" target="_blank" rel="noopener noreferrer" className="hover:text-gray-400">Telegram</a>
              {' • '}
              <a href="/" className="hover:text-gray-400">v2.0</a>
            </p>
          </div>
        </div>
      </footer>

      {/* Connect Telegram Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-white mb-2">🔔 Connect Telegram</h2>
            <p className="text-gray-400 text-sm mb-4">
              Link your Telegram to get alerts when markets resolve.
            </p>
            <div className="bg-gray-800 rounded-lg p-3 mb-4">
              <p className="text-gray-400 text-xs mb-1">Your user ID:</p>
              <code className="text-green-400 text-sm break-all">{user?.userId}</code>
            </div>
            <ol className="text-gray-300 text-sm space-y-2 mb-4">
              <li>1. Open <a href="https://t.me/ResolutionCalBot" target="_blank" className="text-blue-400 underline">@ResolutionCalBot</a></li>
              <li>2. Send <code className="bg-gray-800 px-1 rounded">/start</code></li>
              <li>3. Send <code className="bg-gray-800 px-1 rounded">/connect {user?.userId}</code></li>
            </ol>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConnectModal(false)}
                className="flex-1 px-4 py-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 text-sm"
              >
                Later
              </button>
              <button
                onClick={() => navigator.clipboard.writeText(`/connect ${user?.userId}`)}
                className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm"
              >
                📋 Copy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Choose a plan</h2>
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="text-gray-500 hover:text-white text-xl"
              >
                ×
              </button>
            </div>

            <div className="grid gap-4">
              {(['pro'] as const).map((key) => {
                const plan = CRYPTO_PLANS[key];
                return (
                  <div
                    key={key}
                    className="rounded-xl border border-blue-500 bg-blue-950/30 p-5"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                        <p className="text-xs text-gray-400">${plan.priceUsdt}/mo (USDT)</p>
                      </div>
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-blue-600 text-white">
                        PRO
                      </span>
                    </div>
                    <ul className="space-y-1 mb-4">
                      {plan.features.map((f, i) => (
                        <li key={i} className="text-sm text-gray-300 flex items-center gap-2">
                          <span className="text-green-400 text-xs">✓</span> {f}
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => handleBuyPlan(key)}
                      className="w-full py-2.5 rounded-lg font-medium transition bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      Buy for ${plan.priceUsdt} USDT
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 p-3 bg-gray-800 rounded-lg">
              <p className="text-gray-400 text-xs mb-2">Select network:</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'ethereum', label: 'Ethereum', icon: 'Ξ' },
                  { key: 'base', label: 'Base', icon: '◎' },
                  { key: 'polygon', label: 'Polygon', icon: '⬡' },
                  { key: 'arbitrum', label: 'Arbitrum', icon: '◆' },
                ].map(net => (
                  <button
                    key={net.key}
                    onClick={() => setSelectedChain(net.key)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
                      selectedChain === net.key
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <span>{net.icon}</span>
                    <span>{net.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResolvedSection({ markets }: { markets: Market[] }) {
  const recent = markets.slice(0, 50);
  if (recent.length === 0) {
    return <div className="text-center py-12 text-gray-500">No resolved markets yet</div>;
  }
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-gray-300 mb-4">Recently Resolved</h2>
      {recent.map(market => {
        const prices = market.outcomePrices || [];
        const winner = prices.indexOf('1');
        return (
          <div key={market.id} className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-white font-medium">{market.question}</p>
                <p className="text-gray-500 text-sm mt-1">
                  Resolved {new Date(market.endDate).toLocaleDateString()}
                </p>
              </div>
              <div className="text-right">
                <div className="flex gap-1">
                  {(market.outcomes || ['Yes', 'No']).map((outcome, i) => (
                    <span
                      key={i}
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        winner === i ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-500'
                      }`}
                    >
                      {outcome} {winner === i ? '✓' : ''}
                    </span>
                  ))}
                </div>
                <p className="text-gray-600 text-xs mt-1">Vol: {formatVolume(market.volume || 0)}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MarketList({
  markets,
  watchlist,
  onToggleWatchlist,
  onNotify,
  telegramConnected,
  canAddToWatchlist,
  isSubscribed,
  watchlistLimit,
}: {
  markets: Market[];
  watchlist: Set<string>;
  onToggleWatchlist: (id: string) => void;
  onNotify: (market: Market) => void;
  telegramConnected: boolean;
  canAddToWatchlist: boolean;
  isSubscribed: boolean;
  watchlistLimit: number;
}) {
  if (markets.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        {watchlist.size === 0 ? 'No markets in this view' : 'No markets in your watchlist match this filter'}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {markets.map(market => {
        const hours = getHoursUntilResolution(market.endDate);
        const soon = isResolvingSoon(market.endDate, 24);
        const category = (market as any)._category || 'other';
        const catColor = CATEGORY_COLORS[category] || CATEGORY_COLORS.other;
        const prices = market.outcomePrices || ['0.5', '0.5'];

        return (
          <div
            key={market.id}
            className={`bg-gray-900 rounded-lg p-4 border transition ${
              soon ? 'border-red-600/50 bg-red-950/20' : 'border-gray-800'
            } hover:border-gray-700`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span
                  className="px-2 py-0.5 rounded text-xs font-medium"
                  style={{ backgroundColor: `${catColor}20`, color: catColor }}
                >
                  {CATEGORY_LABELS[category]}
                </span>
                {soon && (
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-900/50 text-red-400">
                    🔴 Soon
                  </span>
                )}
              </div>
              <span className={`text-sm font-medium ${soon ? 'text-red-400' : 'text-gray-400'}`}>
                ⏰ {getResolutionLabel(market.endDate)}
              </span>
            </div>

            <a
              href={`https://polymarket.com/event/${market.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <h3 className="text-white font-medium hover:text-blue-400 transition">
                {market.question}
              </h3>
            </a>

            <div className="flex items-center gap-4 mt-3">
              <div className="flex gap-2">
                {(market.outcomes || ['Yes', 'No']).map((outcome, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <span className="text-gray-400 text-sm">{outcome}:</span>
                    <span className={`font-medium ${parseFloat(prices[i] || '0') > 0.5 ? 'text-green-400' : 'text-gray-300'}`}>
                      {formatPrice(prices[i] || '0.5')}
                    </span>
                  </div>
                ))}
              </div>
              <div className="text-gray-500 text-sm">
                Vol: {formatVolume(market.volume || 0)}
              </div>
            </div>

            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-800">
              <button
                onClick={() => onToggleWatchlist(market.id)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                  watchlist.has(market.id)
                    ? 'bg-yellow-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {watchlist.has(market.id) ? '★ In Watchlist' : `☆ Watchlist${!isSubscribed ? ` (${watchlist.size}/${watchlistLimit})` : ''}`}
              </button>
              <button
                onClick={() => onNotify(market)}
                className="px-3 py-1.5 rounded text-xs font-medium bg-blue-900/50 text-blue-400 hover:bg-blue-900 transition"
              >
                🔔 Alert
              </button>
              <a
                href={`https://polymarket.com/event/${market.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto px-3 py-1.5 rounded text-xs font-medium bg-gray-800 text-gray-400 hover:bg-gray-700 transition"
              >
                Trade →
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}
