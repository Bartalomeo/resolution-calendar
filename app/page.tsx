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
      router.push(`/payment?ref=${encodeURIComponent(data.ref)}&plan=${encodeURIComponent(plan)}&chain=${encodeURIComponent(selectedChain)}`);
    }
  };

  const todayCount = markets.filter(m => { const h = getHoursUntilResolution(m.endDate); return h <= 24 && h > 0; }).length;
  const weekCount = markets.filter(m => { const h = getHoursUntilResolution(m.endDate); return h > 0 && h <= 168; }).length;

  // --- Not logged in: show login prompt ---
  if (!user) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white">
        <header className="border-b border-zinc-800/50 sticky top-0 backdrop-blur-xl bg-[#0A0A0A]/80 z-10">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center text-sm">📅</div>
              <h1 className="text-xl font-bold text-white">Resolution Calendar</h1>
            </div>
          </div>
        </header>
        <main className="max-w-md mx-auto px-4 py-20 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 mb-6 shadow-lg shadow-violet-500/30">
            <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>
          <h2 className="text-2xl font-bold mb-3">Sign in to continue</h2>
          <p className="text-zinc-400 mb-8 leading-relaxed">
            Sign in to save your watchlist and get Telegram alerts when markets resolve.
          </p>
          <div className="space-y-3">
            <a
              href="/auth/login"
              className="block w-full px-6 py-3.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 rounded-xl font-semibold text-center shadow-lg shadow-violet-500/20 transition-all"
            >
              Sign In / Register
            </a>
          </div>
          <div className="mt-8 p-5 bg-zinc-900/50 rounded-2xl border border-zinc-800/60">
            <p className="text-zinc-500 text-xs mb-3">Without signing in:</p>
            <p className="text-zinc-400 text-sm">• Browse all markets</p>
            <p className="text-zinc-400 text-sm">• No watchlist</p>
            <p className="text-zinc-400 text-sm">• No alerts</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      {/* Success toast */}
      {showSuccessToast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-900/80 border border-emerald-700/50 backdrop-blur-xl text-white px-4 py-3 rounded-xl shadow-lg shadow-emerald-500/20 text-sm font-medium">
          ✅ Payment confirmed! {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)} activated.
        </div>
      )}

      {/* Header */}
      <header className="border-b border-zinc-800/50 sticky top-0 backdrop-blur-xl bg-[#0A0A0A]/80 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center text-sm">📅</div>
              <div>
                <h1 className="text-lg font-bold text-white">Resolution Calendar</h1>
                <p className="text-xs text-zinc-500">
                  {markets.length} markets · {lastUpdate && `Updated ${lastUpdate.toLocaleTimeString()}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Plan badge */}
              <button
                onClick={() => setShowUpgradeModal(true)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  isSubscribed
                    ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow'
                    : 'bg-zinc-800/60 text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-700/40'
                }`}
              >
                {isSubscribed ? 'PRO' : 'FREE'}
              </button>

              <button
                onClick={() => setShowWatchlist(!showWatchlist)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  showWatchlist
                    ? 'bg-violet-600 text-white'
                    : 'bg-zinc-800/60 text-zinc-400 hover:text-white border border-zinc-700/40'
                }`}
              >
                ★ {watchlist.size}{!isSubscribed && `/${WATCHLIST_LIMIT}`}
              </button>

              <a
                href="https://t.me/Prediction_all_markets_bot"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-xl text-xs bg-zinc-800/60 text-zinc-400 hover:text-white border border-zinc-700/40 transition-all"
              >
                🔔 Telegram
              </a>

              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="px-3 py-1.5 rounded-xl text-xs bg-zinc-800/60 text-zinc-500 hover:text-white border border-zinc-700/40 transition-all"
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
              { key: 'month' as View, label: 'All', color: 'text-zinc-400' },
              { key: 'resolved' as View, label: 'Resolved', color: 'text-zinc-400' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => { setView(tab.key); setShowWatchlist(false); }}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  view === tab.key ? 'bg-zinc-800/80 text-white border border-zinc-700/60' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50' }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Category filters */}
      <div className="border-b border-zinc-800/50">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex gap-2 flex-wrap">
            {[
              { key: 'all' as Category, label: 'All' },
              { key: 'crypto' as Category, label: '₿ Crypto' },
              { key: 'politics' as Category, label: '🗳 Politics' },
              { key: 'sports' as Category, label: '⚽ Sports' },
              { key: 'other' as Category, label: '📌 Other' },
            ].map(cat => (
              <button
                key={cat.key}
                onClick={() => setCategory(cat.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  category === cat.key
                    ? 'bg-zinc-800/80 text-white border border-zinc-700/60'
                    : 'bg-zinc-900/40 text-zinc-400 hover:text-zinc-300 hover:bg-zinc-900/70 border border-zinc-800/40'
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
        <div className="bg-gradient-to-r from-violet-900/30 to-fuchsia-900/30 border-b border-violet-800/30">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">
                💎 Unlimited watchlist + priority alerts
              </p>
              <p className="text-xs text-zinc-400">
                Free: {WATCHLIST_LIMIT} markets max. Pro $4.99/mo.
              </p>
            </div>
            <button
              onClick={() => setShowUpgradeModal(true)}
              className="px-4 py-1.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm font-medium rounded-xl shadow-lg shadow-violet-500/20 transition-all"
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
              <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-zinc-500">Loading markets...</p>
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
      <footer className="border-t border-zinc-800/50 mt-12">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="text-center text-zinc-600 text-sm">
            <p>Resolution Calendar · Powered by Polymarket</p>
          </div>
        </div>
      </footer>

      {/* Connect Telegram Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card rounded-2xl max-w-md w-full p-6 border border-zinc-800/60">
            <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <span>🔔</span> Connect Telegram
            </h2>
            <p className="text-zinc-400 text-sm mb-4">
              Link your Telegram to get alerts when markets resolve.
            </p>
            <div className="bg-zinc-900/60 rounded-xl p-3 mb-4 border border-zinc-800/50">
              <p className="text-zinc-400 text-xs mb-1">Your user ID:</p>
              <code className="text-emerald-400 text-sm break-all font-mono">{user?.userId}</code>
            </div>
            <ol className="text-zinc-300 text-sm space-y-2 mb-4">
              <li>1. Open <a href="https://t.me/Prediction_all_markets_bot" target="_blank" className="text-violet-400 underline hover:text-violet-300">@Prediction_all_markets_bot</a></li>
              <li>2. Send <code className="bg-zinc-800 px-1.5 py-0.5 rounded-lg text-xs font-mono">/start</code></li>
              <li>3. Send <code className="bg-zinc-800 px-1.5 py-0.5 rounded-lg text-xs font-mono">/connect {user?.userId}</code></li>
            </ol>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConnectModal(false)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-800/60 text-zinc-400 hover:text-white hover:bg-zinc-800 text-sm font-medium transition-all border border-zinc-700/40"
              >
                Later
              </button>
              <button
                onClick={() => navigator.clipboard.writeText(`/connect ${user?.userId}`)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-500 hover:to-fuchsia-500 text-sm font-medium shadow-lg shadow-violet-500/20 transition-all"
              >
                📋 Copy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card rounded-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto border border-zinc-800/60">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-white">Choose a plan</h2>
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="text-zinc-500 hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-800/50 transition-colors"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              {(['pro'] as const).map((key) => {
                const plan = CRYPTO_PLANS[key];
                return (
                  <div
                    key={key}
                    className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-900/20 to-fuchsia-900/20 p-5"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                        <p className="text-xs text-zinc-400">${plan.priceUsdt}/mo (USDT)</p>
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow">
                        PRO
                      </span>
                    </div>
                    <ul className="space-y-2 mb-4">
                      {plan.features.map((f, i) => (
                        <li key={i} className="text-sm text-zinc-300 flex items-center gap-2">
                          <span className="text-emerald-400 text-xs">✓</span> {f}
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => handleBuyPlan(key)}
                      className="w-full py-3 rounded-xl font-semibold transition-all bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white shadow-lg shadow-violet-500/20"
                    >
                      Buy for ${plan.priceUsdt} USDT
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 p-3.5 bg-zinc-900/50 rounded-xl border border-zinc-800/50">
              <p className="text-zinc-400 text-xs mb-2">Select network:</p>
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
                    className={`px-3 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                      selectedChain === net.key
                        ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow'
                        : 'bg-zinc-800/60 text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-700/40'
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
