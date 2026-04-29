'use client';

import { useState, useEffect, useCallback } from 'react';
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

type View = 'today' | 'week' | 'month' | 'resolved';
type Category = 'all' | 'crypto' | 'politics' | 'sports' | 'economy' | 'tech' | 'other';

export default function Home() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [resolved, setResolved] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [view, setView] = useState<View>('today');
  const [category, setCategory] = useState<Category>('all');
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  const [showWatchlist, setShowWatchlist] = useState(false);
  const [telegramConnected, setTelegramConnected] = useState(false);
  const [notifyMarket, setNotifyMarket] = useState<string | null>(null);

  const loadMarkets = useCallback(async () => {
    try {
      const [active, resolvedData] = await Promise.all([
        getActiveMarkets(200),
        getResolvedMarkets(100),
      ]);
      
      // Add category to each market
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

  const filteredMarkets = markets
    .filter(m => {
      if (view === 'today') {
        return getHoursUntilResolution(m.endDate) <= 24;
      }
      if (view === 'week') {
        const hours = getHoursUntilResolution(m.endDate);
        return hours > 0 && hours <= 168; // 7 days
      }
      if (view === 'month') {
        return getHoursUntilResolution(m.endDate) > 0;
      }
      return false;
    })
    .filter(m => {
      if (category === 'all') return true;
      return (m as any)._category === category;
    })
    .sort((a, b) => {
      const timeA = new Date(a.endDate).getTime();
      const timeB = new Date(b.endDate).getTime();
      return timeA - timeB; // Soonest first
    });

  const watchlistMarkets = markets.filter(m => watchlist.has(m.id));
  const displayedMarkets = showWatchlist ? watchlistMarkets : filteredMarkets;

  const toggleWatchlist = (id: string) => {
    const newWatchlist = new Set(watchlist);
    if (newWatchlist.has(id)) {
      newWatchlist.delete(id);
    } else {
      newWatchlist.add(id);
    }
    setWatchlist(newWatchlist);
    localStorage.setItem('watchlist', JSON.stringify([...newWatchlist]));
  };

  const handleNotify = async (market: Market) => {
    if (!telegramConnected) {
      setNotifyMarket(market.id);
      alert('Подключите Telegram для уведомлений. Команда: /start @ResolutionCalBot');
      return;
    }
    // TODO: Send to API to register notification
    alert(`Уведомление настроено для: ${market.question.slice(0, 50)}...`);
  };

  const todayCount = markets.filter(m => getHoursUntilResolution(m.endDate) <= 24 && getHoursUntilResolution(m.endDate) > 0).length;
  const weekCount = markets.filter(m => {
    const h = getHoursUntilResolution(m.endDate);
    return h > 0 && h <= 168;
  }).length;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 sticky top-0 bg-gray-950 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                📅 Resolution Calendar
              </h1>
              <p className="text-xs text-gray-500">
                Polymarket • {markets.length} active markets
                {lastUpdate && ` • Updated ${lastUpdate.toLocaleTimeString()}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowWatchlist(!showWatchlist)}
                className={`px-3 py-1.5 rounded text-sm ${
                  showWatchlist 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                ★ Watchlist ({watchlist.size})
              </button>
              <a
                href="https://t.me/ResolutionCalBot"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded text-sm bg-gray-800 text-gray-300 hover:bg-gray-700"
              >
                🔔 Telegram
              </a>
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
                  view === tab.key
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-500 hover:text-gray-300'
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
              { key: 'economy' as Category, label: '📈 Economy' },
              { key: 'tech' as Category, label: '💻 Tech' },
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
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-12">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="text-center text-gray-600 text-sm">
            <p>Resolution Calendar • Data from Polymarket CLOB API</p>
            <p className="mt-1">
              <a href="https://polymarket.com" target="_blank" rel="noopener noreferrer" className="hover:text-gray-400">
                polymarket.com
              </a>
              {' • '}
              <a href="https://t.me/ResolutionCalBot" target="_blank" rel="noopener noreferrer" className="hover:text-gray-400">
                Telegram Alerts
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ResolvedSection({ markets }: { markets: Market[] }) {
  const recent = markets.slice(0, 50);
  
  if (recent.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No resolved markets yet
      </div>
    );
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
                        winner === i
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-800 text-gray-500'
                      }`}
                    >
                      {outcome} {winner === i ? '✓' : ''}
                    </span>
                  ))}
                </div>
                <p className="text-gray-600 text-xs mt-1">
                  Vol: {formatVolume(market.volume || 0)}
                </p>
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
}: {
  markets: Market[];
  watchlist: Set<string>;
  onToggleWatchlist: (id: string) => void;
  onNotify: (market: Market) => void;
  telegramConnected: boolean;
}) {
  if (markets.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        {watchlist.size === 0 
          ? 'No markets in this view' 
          : 'No markets in your watchlist match this filter'}
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
        const primaryPrice = parseFloat(prices[0] || '0.5');

        return (
          <div
            key={market.id}
            className={`bg-gray-900 rounded-lg p-4 border transition ${
              soon ? 'border-red-600/50 bg-red-950/20' : 'border-gray-800'
            } hover:border-gray-700`}
          >
            {/* Category + Time badge */}
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

            {/* Question */}
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

            {/* Prices + Volume */}
            <div className="flex items-center gap-4 mt-3">
              <div className="flex gap-2">
                {(market.outcomes || ['Yes', 'No']).map((outcome, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <span className="text-gray-400 text-sm">{outcome}:</span>
                    <span className={`font-medium ${
                      parseFloat(prices[i] || '0') > 0.5 ? 'text-green-400' : 'text-gray-300'
                    }`}>
                      {formatPrice(prices[i] || '0.5')}
                    </span>
                  </div>
                ))}
              </div>
              <div className="text-gray-500 text-sm">
                Vol: {formatVolume(market.volume || 0)}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-800">
              <button
                onClick={() => onToggleWatchlist(market.id)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                  watchlist.has(market.id)
                    ? 'bg-yellow-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {watchlist.has(market.id) ? '★ In Watchlist' : '☆ Add to Watchlist'}
              </button>
              <button
                onClick={() => onNotify(market)}
                className="px-3 py-1.5 rounded text-xs font-medium bg-blue-900/50 text-blue-400 hover:bg-blue-900 transition"
              >
                🔔 Notify
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
