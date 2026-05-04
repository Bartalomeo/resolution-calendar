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
import { motion, type Variants } from 'framer-motion';

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
};
const stagger: Variants = {
  visible: { transition: { staggerChildren: 0.08 } },
};
const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: 'backOut' as const } },
};

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
      <div className="min-h-screen bg-[#0A0A0A] text-white relative flex items-center justify-center">
        {/* Background glow */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div
            className="absolute w-[600px] h-[600px] rounded-full blur-[150px] opacity-10"
            style={{
              background: 'radial-gradient(circle, #7c3aed 0%, transparent 70%)',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          />
        </div>
        <div className="w-full max-w-sm relative px-4">
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="visible"
            className="text-center"
          >
            <motion.div variants={fadeUp} className="mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 mb-4 shadow-lg shadow-violet-500/30">
                <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              </div>
              <h2 className="text-2xl font-bold text-white">Resolution Calendar</h2>
              <p className="text-zinc-500 text-sm mt-1">Track Polymarket markets in real-time</p>
            </motion.div>

            <motion.div
              variants={fadeUp}
              className="glass-card rounded-2xl p-6 border border-zinc-800/60"
            >
              <h3 className="text-lg font-semibold text-white mb-2">Sign in to continue</h3>
              <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
                Save your watchlist and get Telegram alerts when markets resolve.
              </p>
              <a
                href="/auth/login"
                className="block w-full px-6 py-3.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 rounded-xl font-semibold text-center shadow-lg shadow-violet-500/20 transition-all"
              >
                Sign In / Register
              </a>
            </motion.div>

            <motion.p variants={fadeUp} className="text-zinc-600 text-xs mt-6">
              Free tier: browse markets · Pro: unlimited watchlist + alerts
            </motion.p>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white relative">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute w-[600px] h-[600px] rounded-full blur-[150px] opacity-10"
          style={{
            background: 'radial-gradient(circle, #7c3aed 0%, transparent 70%)',
            left: '50%',
            top: '0%',
            transform: 'translate(-50%, -20%)',
          }}
        />
      </div>

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
    return (
      <div className="text-center py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl p-8 border border-zinc-800/50 max-w-md mx-auto text-center"
        >
          <div className="text-4xl mb-4">📭</div>
          <p className="text-zinc-400 text-sm">No resolved markets yet</p>
          <p className="text-zinc-600 text-xs mt-2">Check back later for settlement results</p>
        </motion.div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <motion.h2
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-lg font-semibold text-zinc-300 mb-4"
      >
        Recently Resolved
      </motion.h2>
      {recent.map((market, idx) => {
        const prices = market.outcomePrices || [];
        const yesPct = parseFloat(prices[0] || '0.5') * 100;
        const noPct = 100 - yesPct;
        const resolvedDate = new Date(market.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

        return (
          <motion.div
            key={market.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.03 }}
            className="glass-card rounded-2xl p-5 border border-zinc-800/60 group hover:border-zinc-700/80 transition-all"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium line-clamp-2 mb-2 group-hover:text-zinc-200 transition-colors">
                  {market.question}
                </p>
                <p className="text-zinc-500 text-xs">{resolvedDate}</p>
              </div>
              <div className="text-right shrink-0">
                <div className="flex gap-1.5">
                  <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    YES {yesPct.toFixed(0)}%
                  </span>
                  <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-zinc-800/60 text-zinc-500 border border-zinc-700/40">
                    NO {noPct.toFixed(0)}%
                  </span>
                </div>
                <p className="text-zinc-600 text-xs mt-1.5">Vol: {formatVolume(market.volume || 0)}</p>
              </div>
            </div>
          </motion.div>
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
      <div className="text-center py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl p-8 border border-zinc-800/50 max-w-md mx-auto text-center"
        >
          <div className="text-4xl mb-4">🔍</div>
          <p className="text-zinc-400 text-sm">
            {watchlist.size === 0 ? 'No markets in this view' : 'No markets in your watchlist match this filter'}
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {markets.map((market, idx) => {
        const hours = getHoursUntilResolution(market.endDate);
        const soon = isResolvingSoon(market.endDate, 24);
        const category = (market as any)._category || 'other';
        const catColor = CATEGORY_COLORS[category] || CATEGORY_COLORS.other;
        const prices = market.outcomePrices || ['0.5', '0.5'];
        const yesPct = Math.round(parseFloat(prices[0] || '0.5') * 100);
        const noPct = 100 - yesPct;

        return (
          <motion.div
            key={market.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.04 }}
            className={`glass-card rounded-2xl p-5 border transition-all group cursor-default ${
              soon
                ? 'border-red-500/20 hover:border-red-500/40'
                : 'border-zinc-800/60 hover:border-zinc-700/80'
            }`}
          >
            {/* Top row: category + countdown */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                  style={{ backgroundColor: `${catColor}15`, color: catColor, border: `1px solid ${catColor}30` }}
                >
                  {CATEGORY_LABELS[category]}
                </span>
                {soon && (
                  <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse">
                    🔴 Resolving Soon
                  </span>
                )}
              </div>
              <div className={`flex items-center gap-1.5 text-xs font-medium ${soon ? 'text-red-400' : 'text-zinc-500'}`}>
                <span>⏰</span>
                <span>{getResolutionLabel(market.endDate)}</span>
              </div>
            </div>

            {/* Question */}
            <a
              href={`https://polymarket.com/event/${market.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <h3 className="text-white font-medium mb-3 group-hover:text-violet-300 transition-colors line-clamp-2">
                {market.question}
              </h3>
            </a>

            {/* Probability bar */}
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-emerald-400 font-semibold">YES {yesPct}%</span>
                <span className="text-rose-400 font-semibold">NO {noPct}%</span>
              </div>
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden flex">
                <motion.div
                  className="bg-gradient-to-r from-emerald-500 to-emerald-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${yesPct}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut', delay: idx * 0.04 + 0.1 }}
                />
                <motion.div
                  className="bg-gradient-to-r from-rose-500 to-rose-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${noPct}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut', delay: idx * 0.04 + 0.1 }}
                />
              </div>
            </div>

            {/* Footer: volume + actions */}
            <div className="flex items-center gap-2">
              <div className="text-zinc-500 text-xs font-mono">
                Vol: {formatVolume(market.volume || 0)}
              </div>
              <div className="flex-1" />
              <div className="flex items-center gap-1.5">
                <motion.button
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onToggleWatchlist(market.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    watchlist.has(market.id)
                      ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/20'
                      : 'bg-zinc-800/60 text-zinc-400 border border-zinc-700/40 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  {watchlist.has(market.id) ? '★ Watching' : '☆ Watch'}
                </motion.button>
                <motion.button
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onNotify(market)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/15 transition-all"
                >
                  🔔 Alert
                </motion.button>
                <a
                  href={`https://polymarket.com/event/${market.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <motion.button
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.95 }}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-zinc-800/60 text-zinc-400 border border-zinc-700/40 hover:text-white hover:bg-zinc-800 transition-all"
                  >
                    Trade →
                  </motion.button>
                </a>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center">
        <div className="text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full mx-auto mb-4"
          />
          <p className="text-zinc-500 text-sm">Loading...</p>
        </div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}
