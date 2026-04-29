'use client';

import { useState, useEffect, useCallback } from 'react';
import { Market } from '@/lib/types';
import {
  getActiveMarkets,
  formatVolume,
  formatPrice,
  getHoursUntilResolution,
  isResolvingSoon,
  detectCategory,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
} from '@/lib/polymarket';

type ViewMode = 'calendar' | 'list';

export default function Home() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  const [telegramConnected, setTelegramConnected] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('calendar');

  // Calendar navigation
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  useEffect(() => {
    let uid = localStorage.getItem('rc_user_id');
    if (!uid) {
      uid = 'rc_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('rc_user_id', uid);
    }
    setUserId(uid);
    checkTelegramConnection(uid);
  }, []);

  const checkTelegramConnection = async (uid: string) => {
    try {
      const res = await fetch(`/api/notify?userId=${encodeURIComponent(uid)}`);
      const data = await res.json();
      setTelegramConnected(data.connected);
      if (data.watchlist) {
        setWatchlist(new Set(data.watchlist));
      }
    } catch (e) {
      console.error('Failed to check connection:', e);
    }
  };

  const loadMarkets = useCallback(async () => {
    try {
      const active = await getActiveMarkets(200);
      const withCategory = active.map(m => ({
        ...m,
        _category: detectCategory(m),
      }));
      setMarkets(withCategory);
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

  const handleNotify = async (market: Market) => {
    if (!userId) return;
    const action = watchlist.has(market.id) ? 'remove' : 'add';
    try {
      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          marketId: market.id,
          marketQuestion: market.question,
          action,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const newWatchlist = new Set(watchlist);
        if (action === 'add') {
          newWatchlist.add(market.id);
          if (!telegramConnected) setShowConnectModal(true);
        } else {
          newWatchlist.delete(market.id);
        }
        setWatchlist(newWatchlist);
      }
    } catch (e) {
      console.error('Notify error:', e);
    }
  };

  // --- Calendar Logic ---
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysCount = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const days: { date: Date; currentMonth: boolean; dateStr: string }[] = [];

    // Prev month days
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthDays - i);
      days.push({ date: d, currentMonth: false, dateStr: d.toISOString().slice(0, 10) });
    }
    // Current month
    for (let i = 1; i <= daysCount; i++) {
      const d = new Date(year, month, i);
      days.push({ date: d, currentMonth: true, dateStr: d.toISOString().slice(0, 10) });
    }
    // Next month fill to 42 cells
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      days.push({ date: d, currentMonth: false, dateStr: d.toISOString().slice(0, 10) });
    }
    return days;
  };

  const getMarketsForDate = (dateStr: string) => {
    return markets.filter(m => {
      const end = m.endDate?.slice(0, 10);
      return end === dateStr;
    });
  };

  const getSoonMarketsForDate = (dateStr: string) => {
    // Show markets that resolve ON or BEFORE this date but haven't resolved yet
    const target = new Date(dateStr).getTime();
    return markets.filter(m => {
      const end = new Date(m.endDate).getTime();
      const now = Date.now();
      const diff = end - now;
      if (diff <= 0) return false; // already resolved
      // Show if resolving within 24h of this date
      return end <= target + 86400000 && end > now;
    });
  };

  const marketsByDate: Record<string, Market[]> = {};
  for (const m of markets) {
    const d = m.endDate?.slice(0, 10);
    if (d) {
      if (!marketsByDate[d]) marketsByDate[d] = [];
      marketsByDate[d].push(m);
    }
  }

  const days = getDaysInMonth(currentMonth);
  const today = new Date().toISOString().slice(0, 10);
  const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

  const selectedDayMarkets = selectedDate ? (marketsByDate[selectedDate] || getSoonMarketsForDate(selectedDate)) : [];
  const upcomingDates = Object.keys(marketsByDate).filter(d => d >= today).sort().slice(0, 7);

  const monthLabel = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 sticky top-0 bg-gray-950 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                📅 Resolution Calendar
              </h1>
              <p className="text-xs text-gray-500">
                Polymarket • {markets.length} active
                {lastUpdate && ` • Updated ${lastUpdate.toLocaleTimeString()}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex bg-gray-800 rounded-lg p-1">
                <button
                  onClick={() => setView('calendar')}
                  className={`px-3 py-1 rounded text-sm ${view === 'calendar' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}
                >
                  Calendar
                </button>
                <button
                  onClick={() => setView('list')}
                  className={`px-3 py-1 rounded text-sm ${view === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}
                >
                  List
                </button>
              </div>
              <a href="/v1" className="px-3 py-1.5 rounded text-sm bg-gray-800 text-gray-400 hover:bg-gray-700">
                v1
              </a>
              <a href="https://t.me/ResolutionCalBot" target="_blank" rel="noopener noreferrer"
                className="px-3 py-1.5 rounded text-sm bg-gray-800 text-gray-300 hover:bg-gray-700">
                🔔 Telegram
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-500">Loading markets...</p>
            </div>
          </div>
        ) : view === 'calendar' ? (
          <div>
            {/* Calendar Navigation */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevMonth} className="px-3 py-2 rounded bg-gray-800 hover:bg-gray-700 text-white text-lg">◀</button>
              <h2 className="text-xl font-bold text-white">{monthLabel}</h2>
              <button onClick={nextMonth} className="px-3 py-2 rounded bg-gray-800 hover:bg-gray-700 text-white text-lg">▶</button>
            </div>

            {/* Calendar Grid */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              {/* Week day headers */}
              <div className="grid grid-cols-7 border-b border-gray-800">
                {weekDays.map(d => (
                  <div key={d} className="py-2 text-center text-xs font-medium text-gray-500">{d}</div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7">
                {days.map(({ date, currentMonth, dateStr }, idx) => {
                  const dayMarkets = marketsByDate[dateStr] || [];
                  const isToday = dateStr === today;
                  const isSelected = dateStr === selectedDate;
                  const soonMarkets = !currentMonth ? [] : getSoonMarketsForDate(dateStr);
                  const hasSoon = soonMarkets.length > 0 && dayMarkets.length === 0;
                  const showCount = dayMarkets.length > 0 || (hasSoon && soonMarkets.length > 0);

                  return (
                    <div
                      key={idx}
                      onClick={() => currentMonth ? setSelectedDate(isSelected ? null : dateStr) : null}
                      className={`
                        min-h-24 p-2 border-b border-r border-gray-800 cursor-pointer transition
                        ${!currentMonth ? 'bg-gray-950 text-gray-600' : 'bg-gray-900 hover:bg-gray-800'}
                        ${isToday ? 'border-l-2 border-l-blue-500' : ''}
                        ${isSelected ? 'bg-blue-950 border border-blue-600' : ''}
                      `}
                    >
                      <div className={`text-sm font-medium mb-1 ${isToday ? 'text-blue-400' : currentMonth ? 'text-white' : 'text-gray-600'}`}>
                        {date.getDate()}
                      </div>
                      {showCount && (
                        <div className="space-y-0.5">
                          {dayMarkets.slice(0, 2).map(m => {
                            const cat = (m as any)._category || 'other';
                            return (
                              <div key={m.id} className="text-xs truncate" style={{ color: CATEGORY_COLORS[cat] }}>
                                {m.question?.slice(0, 25)}...
                              </div>
                            );
                          })}
                          {dayMarkets.length > 2 && (
                            <div className="text-xs text-gray-500">+{dayMarkets.length - 2} more</div>
                          )}
                          {hasSoon && dayMarkets.length === 0 && soonMarkets.slice(0, 2).map(m => (
                            <div key={m.id} className="text-xs text-red-400 truncate opacity-60">
                              ~{m.question?.slice(0, 20)}...
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Upcoming dates quick nav */}
            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-400 mb-2">📅 Upcoming Resolutions</h3>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {upcomingDates.map(d => {
                  const count = marketsByDate[d]?.length || 0;
                  const dateLabel = new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  return (
                    <button
                      key={d}
                      onClick={() => setSelectedDate(d)}
                      className={`flex-shrink-0 px-3 py-2 rounded-lg border text-sm transition ${
                        selectedDate === d
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-600'
                      }`}
                    >
                      <div className="text-xs text-gray-500">{dateLabel}</div>
                      <div className="font-medium">{count} market{count !== 1 ? 's' : ''}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected day detail */}
            {selectedDate && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white">
                    📅 {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </h3>
                  <button onClick={() => setSelectedDate(null)} className="text-gray-500 hover:text-white text-sm">✕</button>
                </div>
                {selectedDayMarkets.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p>No markets resolving exactly on this date.</p>
                    <p className="text-sm mt-1">Markets within ±1 day shown.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedDayMarkets.map(market => (
                      <MarketCard key={market.id} market={market} watchlist={watchlist} onNotify={handleNotify} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* List view */
          <div>
            <h2 className="text-lg font-bold text-white mb-4">All Active Markets</h2>
            <div className="space-y-3">
              {markets
                .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())
                .slice(0, 50)
                .map(market => (
                  <MarketCard key={market.id} market={market} watchlist={watchlist} onNotify={handleNotify} />
                ))}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-gray-800 mt-12">
        <div className="max-w-5xl mx-auto px-4 py-6 text-center text-gray-600 text-sm">
          <p>Resolution Calendar v2.0 • <a href="https://polymarket.com" target="_blank" rel="noopener noreferrer" className="hover:text-gray-400">polymarket.com</a> • <a href="/v1" className="hover:text-gray-400">v1.0</a></p>
        </div>
      </footer>

      {/* Connect Telegram Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-white mb-2">🔔 Подключи Telegram</h2>
            <p className="text-gray-400 text-sm mb-4">
              Чтобы получать уведомления о резолвах, привяжи Telegram к своему профилю.
            </p>
            <div className="bg-gray-800 rounded-lg p-3 mb-4">
              <p className="text-gray-400 text-xs mb-1">Твой ID:</p>
              <code className="text-green-400 text-sm break-all">{userId}</code>
            </div>
            <ol className="text-gray-300 text-sm space-y-2 mb-4">
              <li>1. Открой <a href="https://t.me/ResolutionCalBot" target="_blank" className="text-blue-400 underline">@ResolutionCalBot</a></li>
              <li>2. Напиши <code className="bg-gray-800 px-1 rounded">/start</code></li>
              <li>3. Напиши <code className="bg-gray-800 px-1 rounded">/connect {userId}</code></li>
            </ol>
            <div className="flex gap-2">
              <button onClick={() => setShowConnectModal(false)}
                className="flex-1 px-4 py-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 text-sm">
                Позже
              </button>
              <button onClick={() => { navigator.clipboard.writeText(`/connect ${userId}`); }}
                className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm">
                📋 Скопировать
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MarketCard({ market, watchlist, onNotify }: { market: Market; watchlist: Set<string>; onNotify: (m: Market) => void }) {
  const hours = getHoursUntilResolution(market.endDate);
  const soon = isResolvingSoon(market.endDate, 24);
  const category = (market as any)._category || 'other';
  const catColor = CATEGORY_COLORS[category] || CATEGORY_COLORS.other;
  const prices = market.outcomePrices || ['0.5', '0.5'];
  const outcomes = market.outcomes || ['Yes', 'No'];
  const endDate = market.endDate ? new Date(market.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';

  return (
    <div className={`bg-gray-900 rounded-lg p-4 border transition ${soon ? 'border-red-600/50 bg-red-950/20' : 'border-gray-800 hover:border-gray-700'}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: `${catColor}20`, color: catColor }}>
            {CATEGORY_LABELS[category]}
          </span>
          {soon && (
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-900/50 text-red-400">🔴 Soon</span>
          )}
        </div>
        <span className={`text-sm font-medium ${soon ? 'text-red-400' : 'text-gray-400'}`}>
          ⏰ {endDate}
        </span>
      </div>

      <a href={`https://polymarket.com/event/${market.slug}`} target="_blank" rel="noopener noreferrer" className="block">
        <h3 className="text-white font-medium hover:text-blue-400 transition">{market.question}</h3>
      </a>

      <div className="flex items-center gap-4 mt-3">
        <div className="flex gap-2">
          {outcomes.map((outcome, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="text-gray-400 text-sm">{outcome}:</span>
              <span className={`font-medium ${parseFloat(prices[i] || '0') > 0.5 ? 'text-green-400' : 'text-gray-300'}`}>
                {formatPrice(prices[i] || '0.5')}
              </span>
            </div>
          ))}
        </div>
        <div className="text-gray-500 text-sm">Vol: {formatVolume(market.volume || 0)}</div>
      </div>

      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-800">
        <button
          onClick={() => onNotify(market)}
          className={`px-3 py-1.5 rounded text-xs font-medium transition ${watchlist.has(market.id) ? 'bg-yellow-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
        >
          {watchlist.has(market.id) ? '★ In Watchlist' : '☆ Watch'}
        </button>
        <a href={`https://polymarket.com/event/${market.slug}`} target="_blank" rel="noopener noreferrer"
          className="ml-auto px-3 py-1.5 rounded text-xs font-medium bg-gray-800 text-gray-400 hover:bg-gray-700 transition">
          Trade →
        </a>
      </div>
    </div>
  );
}
