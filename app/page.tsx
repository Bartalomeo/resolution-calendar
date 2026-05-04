'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Market } from '@/lib/types';
import {
  getActiveMarkets,
  formatVolume,
  getHoursUntilResolution,
  isResolvingSoon,
  detectCategory,
  CATEGORY_COLORS,
} from '@/lib/polymarket';
import { motion, type Variants } from 'framer-motion';
import {
  TrendingUp,
  Zap,
  BarChart3,
  ChevronRight,
  Search,
  X,
  Globe,
  Shield,
  Star,
  ArrowUpRight,
  Activity,
  Timer,
  Bookmark,
} from 'lucide-react';

// ─── Animations ─────────────────────────────────────────────────────────────

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
};

const stagger: Variants = {
  visible: { transition: { staggerChildren: 0.08 } },
};

const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: 'backOut' as const } },
};

const slideIn: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.4 } },
};

// ─── Types ─────────────────────────────────────────────────────────────────

type Category = 'all' | 'crypto' | 'politics' | 'sports' | 'other';

interface MarketCardProps {
  market: Market;
  index: number;
  onSave: (id: string) => void;
  saved: boolean;
}

interface CountdownProps {
  endDate: string;
}

// ─── Countdown Timer ────────────────────────────────────────────────────────

function Countdown({ endDate }: CountdownProps) {
  const [time, setTime] = useState({ h: 0, m: 0, s: 0, label: '' });

  useEffect(() => {
    const update = () => {
      const hours = getHoursUntilResolution(endDate);
      if (hours <= 0) {
        setTime({ h: 0, m: 0, s: 0, label: 'Resolved' });
        return;
      }
      if (hours < 1) {
        const mins = Math.floor((new Date(endDate).getTime() - Date.now()) / 60000);
        setTime({ h: 0, m: mins, s: 0, label: `${mins}m` });
        return;
      }
      if (hours < 24) {
        const mins = Math.floor((new Date(endDate).getTime() - Date.now()) / 60000) % 60;
        setTime({ h: hours, m: mins, s: 0, label: `${hours}h ${mins}m` });
        return;
      }
      const days = Math.floor(hours / 24);
      setTime({ h: hours, m: 0, s: 0, label: `${days}d ${hours % 24}h` });
    };
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, [endDate]);

  const urgent = time.label.includes('h') && !time.label.includes('d') && time.h < 24;

  return (
    <div className={`flex items-center gap-1 text-xs font-mono font-medium ${urgent ? 'text-red-400' : 'text-zinc-400'}`}>
      <Timer className="w-3 h-3" />
      <span>{time.label}</span>
    </div>
  );
}

// ─── Probability Bar ────────────────────────────────────────────────────────

function ProbabilityBar({ yesPrice, noPrice }: { yesPrice: string; noPrice: string }) {
  const yes = parseFloat(yesPrice);
  const no = parseFloat(noPrice);
  const yesPct = Math.round(yes * 100);
  const noPct = Math.round(no * 100);

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-emerald-400 font-medium">Yes {yesPct}%</span>
        <span className="text-rose-400 font-medium">No {noPct}%</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden flex">
        <motion.div
          className="bg-gradient-to-r from-emerald-500 to-emerald-400"
          initial={{ width: 0 }}
          animate={{ width: `${yesPct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
        />
        <motion.div
          className="bg-gradient-to-r from-rose-500 to-rose-400"
          initial={{ width: 0 }}
          animate={{ width: `${noPct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
        />
      </div>
    </div>
  );
}

// ─── Market Card ────────────────────────────────────────────────────────────

function MarketCard({ market, index, onSave, saved }: MarketCardProps) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const cat = detectCategory(market);
  const catColor = CATEGORY_COLORS[cat] || CATEGORY_COLORS.other;
  const yesPrice = market.outcomePrices?.[0] ?? '0.5';
  const noPrice = market.outcomePrices?.[1] ?? '0.5';
  const shortQ = market.question.length > 80 ? market.question.slice(0, 77) + '...' : market.question;
  const urgent = isResolvingSoon(market.endDate, 48);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={visible ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay: index * 0.05, ease: [0.25, 0.46, 0.45, 0.94] }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className="group relative"
    >
      {/* Glow on hover */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-violet-600/30 via-fuchsia-600/20 to-cyan-600/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition duration-500" />

      <div className="relative glass-card rounded-2xl p-5 border border-zinc-800/60 hover:border-zinc-700/80 transition-colors duration-300">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: catColor }}
            />
            <h3 className="text-sm font-medium text-zinc-100 leading-snug line-clamp-2">
              {shortQ}
            </h3>
          </div>
          <button
            onClick={() => onSave(market.id)}
            className={`flex-shrink-0 p-1.5 rounded-xl transition-all duration-200 ${saved ? 'text-violet-400 bg-violet-500/10' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'}`}
          >
            <Bookmark className="w-4 h-4" fill={saved ? 'currentColor' : 'none'} />
          </button>
        </div>

        {/* Probability bar */}
        <div className="mb-4">
          <ProbabilityBar yesPrice={yesPrice} noPrice={noPrice} />
        </div>

        {/* Footer row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">{formatVolume(market.volume)} vol</span>
            <span className="text-xs text-zinc-600">·</span>
            <span className="text-xs text-zinc-500">{formatVolume(market.liquidity)} liq</span>
          </div>
          <div className="flex items-center gap-2">
            {urgent && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="flex items-center gap-1 text-xs bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full"
              >
                <Zap className="w-3 h-3" />Soon
              </motion.span>
            )}
            <Countdown endDate={market.endDate} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Stats Bar ─────────────────────────────────────────────────────────────

function StatsBar({ marketCount, totalVol, resolvingSoon }: { marketCount: number; totalVol: string; resolvingSoon: number }) {
  const stats = [
    { icon: <Activity className="w-4 h-4" />, value: marketCount.toLocaleString(), label: 'Active Markets' },
    { icon: <BarChart3 className="w-4 h-4" />, value: totalVol, label: '24h Volume' },
    { icon: <Zap className="w-4 h-4" />, value: resolvingSoon.toString(), label: 'Resolving <48h' },
  ];

  return (
    <motion.div
      className="grid grid-cols-3 gap-3 mb-8"
      variants={stagger}
      initial="hidden"
      animate="visible"
    >
      {stats.map((s, i) => (
        <motion.div
          key={s.label}
          variants={scaleIn}
          className="glass-card rounded-2xl p-4 text-center border border-zinc-800/50"
        >
          <div className="flex justify-center mb-2 text-violet-400">{s.icon}</div>
          <div className="text-xl font-bold text-white font-mono">{s.value}</div>
          <div className="text-xs text-zinc-500 mt-1">{s.label}</div>
        </motion.div>
      ))}
    </motion.div>
  );
}

// ─── Category Filter ────────────────────────────────────────────────────────

const CATEGORIES: { key: Category; label: string; color: string }[] = [
  { key: 'all', label: 'All', color: '#6B7280' },
  { key: 'crypto', label: 'Crypto', color: '#F7931A' },
  { key: 'politics', label: 'Politics', color: '#3B82F6' },
  { key: 'sports', label: 'Sports', color: '#10B981' },
  { key: 'other', label: 'Other', color: '#8B5CF6' },
];

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function NewHomePage() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<Category>('all');
  const [search, setSearch] = useState('');
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [heroGradient, setHeroGradient] = useState({ x: 50, y: 50 });

  const totalVol = markets.reduce((s, m) => s + (typeof m.volume === 'number' ? m.volume : parseFloat(String(m.volume)) || 0), 0);
  const resolvingSoon = markets.filter(m => isResolvingSoon(m.endDate, 48)).length;

  const filtered = markets
    .filter(m => category === 'all' || detectCategory(m) === category)
    .filter(m => !search || m.question.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 50);

  const loadMarkets = useCallback(async () => {
    try {
      const [active] = await Promise.all([getActiveMarkets(200)]);
      setMarkets(active);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMarkets(); }, [loadMarkets]);

  // Mouse parallax for hero
  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHeroGradient({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  const toggleSave = (id: string) => {
    setSaved(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div
      className="min-h-screen bg-[#0A0A0A] text-white overflow-x-hidden"
      onMouseMove={handleMouseMove}
    >
      {/* ── Hero Background ── */}
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute w-[800px] h-[800px] rounded-full blur-[150px] opacity-20 transition-all duration-1000 ease-out"
          style={{
            background: `radial-gradient(circle at ${heroGradient.x}% ${heroGradient.y}%, #7c3aed 0%, transparent 60%)`,
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -60%)',
          }}
        />
        <div
          className="absolute w-[600px] h-[600px] rounded-full blur-[120px] opacity-10 transition-all duration-1000 ease-out"
          style={{
            background: `radial-gradient(circle at ${heroGradient.x + 20}% ${heroGradient.y - 10}%, #06b6d4 0%, transparent 60%)`,
            left: '30%',
            top: '40%',
          }}
        />
        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* ── Navigation ── */}
      <motion.nav
        className="sticky top-0 z-50 border-b border-zinc-800/50"
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between backdrop-blur-xl bg-[#0A0A0A]/80">
          {/* Logo */}
          <motion.a
            href="/new"
            className="flex items-center gap-3"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-white">Resolution</span>
              <span className="font-bold text-violet-400">Calendar</span>
            </div>
          </motion.a>

          {/* Nav links */}
          <div className="hidden md:flex items-center gap-1">
            {['Markets', 'Features', 'Pricing', 'Blog'].map(link => (
              <motion.a
                key={link}
                href="#"
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800/50 transition-all duration-200"
                whileHover={{ y: -1 }}
              >
                {link}
              </motion.a>
            ))}
          </div>

          {/* CTA */}
          <div className="flex items-center gap-3">
            <motion.a
              href="/auth/login"
              className="hidden sm:block text-sm text-zinc-400 hover:text-white px-4 py-2 rounded-xl hover:bg-zinc-800/50 transition-all"
              whileHover={{ y: -1 }}
            >
              Sign In
            </motion.a>
            <motion.a
              href="/auth/login"
              className="text-sm bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white px-5 py-2.5 rounded-xl font-medium shadow-lg shadow-violet-500/20 transition-all duration-200"
              whileHover={{ y: -2, scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              Get Started
            </motion.a>
          </div>
        </div>
      </motion.nav>

      {/* ── Hero Section ── */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-20 pb-16">
        <motion.div
          className="text-center max-w-3xl mx-auto"
          variants={stagger}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={fadeUp} className="mb-6 inline-flex">
            <div className="flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 rounded-full px-4 py-1.5 text-sm text-violet-300">
              <span className="flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-violet-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500" />
              </span>
              Live Polymarket Data · Updated every 5 min
            </div>
          </motion.div>

          <motion.h1 variants={fadeUp} className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
            <span className="text-white">Never Miss a </span>
            <br />
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
              Market Resolution
            </span>
          </motion.h1>

          <motion.p variants={fadeUp} className="text-lg text-zinc-400 mb-10 max-w-xl mx-auto leading-relaxed">
            Track thousands of prediction markets. Get real-time alerts before markets resolve. The ultimate tool for Polymarket traders.
          </motion.p>

          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <motion.a
              href="/auth/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white px-8 py-4 rounded-2xl font-semibold text-lg shadow-2xl shadow-violet-500/25 transition-all duration-300"
              whileHover={{ y: -3, scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              Start Tracking Free
              <ArrowUpRight className="w-5 h-5" />
            </motion.a>
            <motion.a
              href="#markets"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/50 text-white px-8 py-4 rounded-2xl font-semibold text-lg transition-all duration-300"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
            >
              View Markets
            </motion.a>
          </motion.div>
        </motion.div>

        {/* ── Stats ── */}
        <motion.div
          className="mt-16"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
        >
          <StatsBar
            marketCount={markets.length}
            totalVol={formatVolume(totalVol)}
            resolvingSoon={resolvingSoon}
          />
        </motion.div>
      </section>

      {/* ── Markets Section ── */}
      <section id="markets" className="relative max-w-7xl mx-auto px-4 sm:px-6 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          {/* Section header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Active Markets</h2>
              <p className="text-sm text-zinc-500">Real-time prediction market data</p>
            </div>
          </div>

          {/* Search + Filter row */}
          <div className="flex flex-col sm:flex-row gap-3 mb-8">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search markets..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-zinc-900/60 border border-zinc-800/80 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 transition-all"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Category pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              {CATEGORIES.map(cat => (
                <motion.button
                  key={cat.key}
                  onClick={() => setCategory(cat.key)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                    category === cat.key
                      ? 'bg-zinc-800/80 text-white border border-zinc-700/60'
                      : 'bg-zinc-900/40 text-zinc-500 border border-zinc-800/40 hover:text-zinc-300 hover:bg-zinc-900/70'
                  }`}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: cat.color }}
                  />
                  {cat.label}
                </motion.button>
              ))}
            </div>
          </div>

          {/* Market Grid */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="glass-card rounded-2xl p-5 animate-pulse">
                  <div className="h-4 bg-zinc-800 rounded-lg w-3/4 mb-4" />
                  <div className="h-1.5 bg-zinc-800 rounded-full mb-4" />
                  <div className="flex justify-between">
                    <div className="h-3 bg-zinc-800 rounded w-1/3" />
                    <div className="h-3 bg-zinc-800 rounded w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-5xl mb-4">🔍</div>
              <p className="text-zinc-400 text-lg">No markets found</p>
              <p className="text-zinc-600 text-sm mt-2">Try adjusting your search or filters</p>
            </div>
          ) : (
            <motion.div
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
              variants={stagger}
              initial="hidden"
              animate="visible"
              key={category + search}
            >
              {filtered.map((market, i) => (
                <MarketCard
                  key={market.id}
                  market={market}
                  index={i}
                  onSave={toggleSave}
                  saved={saved.has(market.id)}
                />
              ))}
            </motion.div>
          )}
        </motion.div>

        {/* ── Features Section ── */}
        <motion.div
          className="mt-24"
          initial={{ opacity: 0, y: 60 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7 }}
        >
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">
              Everything You Need to Stay Ahead
            </h2>
            <p className="text-zinc-400 max-w-lg mx-auto">
              Powerful features designed for serious prediction market traders
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                icon: <Timer className="w-6 h-6" />,
                title: 'Real-time Countdowns',
                desc: 'Live countdown timers for every market. Never miss a resolution again.',
                color: '#7c3aed',
                glow: 'rgba(124,58,237,0.15)',
              },
              {
                icon: <Bell className="w-6 h-6" />,
                title: 'Smart Alerts',
                desc: 'Get notified before markets resolve. Telegram & email notifications.',
                color: '#06b6d4',
                glow: 'rgba(6,182,212,0.15)',
              },
              {
                icon: <TrendingUp className="w-6 h-6" />,
                title: 'Volume Analytics',
                desc: 'Track liquidity and volume trends across all prediction markets.',
                color: '#10b981',
                glow: 'rgba(16,185,129,0.15)',
              },
            ].map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="group relative"
              >
                <div
                  className="absolute -inset-px rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{ background: `linear-gradient(135deg, ${f.color}30, transparent 50%)` }}
                />
                <div className="relative glass-card rounded-2xl p-6 border border-zinc-800/60 hover:border-zinc-700/60">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                    style={{ backgroundColor: f.glow, color: f.color }}
                  >
                    {f.icon}
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* ── CTA Section ── */}
        <motion.div
          className="mt-24"
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="relative glass-card rounded-3xl p-12 sm:p-16 text-center overflow-hidden border border-zinc-800/60">
            {/* Inner glow */}
            <div
              className="absolute inset-0 opacity-30"
              style={{
                background: 'radial-gradient(ellipse at center, rgba(124,58,237,0.3) 0%, transparent 70%)',
              }}
            />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                Ready to Never Miss a Resolution?
              </h2>
              <p className="text-zinc-400 mb-8 max-w-lg mx-auto">
                Join thousands of traders who use Resolution Calendar to track their Polymarket positions.
              </p>
              <motion.a
                href="/auth/login"
                className="inline-flex items-center gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white px-10 py-4 rounded-2xl font-semibold text-lg shadow-2xl shadow-violet-500/30 transition-all duration-300"
                whileHover={{ y: -3, scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                Get Started Free
                <ChevronRight className="w-5 h-5" />
              </motion.a>
            </div>
          </div>
        </motion.div>

        {/* ── Footer ── */}
        <footer className="mt-16 border-t border-zinc-800/50 pt-10 pb-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-zinc-500 text-sm">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center">
                <Calendar className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-medium text-white">Resolution Calendar</span>
              <span>· Powered by Polymarket</span>
            </div>
            <div className="flex items-center gap-6 text-xs text-zinc-600">
              <a href="#" className="hover:text-zinc-400 transition-colors">Privacy</a>
              <a href="#" className="hover:text-zinc-400 transition-colors">Terms</a>
              <a href="#" className="hover:text-zinc-400 transition-colors">Contact</a>
            </div>
          </div>
        </footer>
      </section>

      {/* ── Global Styles ── */}
      <style jsx global>{`
        .glass-card {
          background: rgba(17, 17, 22, 0.7);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}

// Missing import fix - Calendar icon
function Calendar({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function Bell({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
