import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useGame } from '../../context/GameContext';
import { RARITY_STYLES } from '../../utils/leveling';
import { RpgIcon } from '../common/RpgIcon';

const CATEGORY_COLORS: Record<string, string> = {
  Learning: '#60A5FA',
  Craft: '#A78BFA',
  Vitality: '#F59E0B',
  Reflection: '#34D399',
  Community: '#38BDF8',
  Exploration: '#F472B6',
  Miscellaneous: '#94A3B8',
};

export const StatisticsView: React.FC = () => {
  const { state } = useGame();
  const [dateRange, setDateRange] = useState<'7D' | '30D' | 'ALL'>('ALL');
  const [cadenceView, setCadenceView] = useState<'weekly' | 'monthly'>('weekly');

  const mostDevelopedAttr = useMemo(() => {
    const attrs = Object.values(state.attributes);
    return attrs.reduce((best, curr) => (curr.value > best.value ? curr : best), attrs[0]);
  }, [state.attributes]);

  const filteredDailySeries = useMemo(() => {
    const points = state.dailyExpHistory;
    if (dateRange === '7D') return points.slice(-5);
    if (dateRange === '30D') return points.slice(-10);
    return points;
  }, [state.dailyExpHistory, dateRange]);

  const attributeRadarData = useMemo(() => {
    return Object.values(state.attributes).map((attr) => ({
      attribute: attr.name,
      value: attr.value,
      fullMark: 100,
    }));
  }, [state.attributes]);

  const categoryDistribution = useMemo(() => {
    const counts: Record<string, { name: string; count: number; exp: number }> = {};
    for (const act of state.activities) {
      if (act.isReversalRecord || act.expEarned <= 0) continue;
      if (!counts[act.category]) {
        counts[act.category] = { name: act.category, count: 0, exp: 0 };
      }
      counts[act.category].count += 1;
      counts[act.category].exp += act.expEarned;
    }
    return Object.values(counts);
  }, [state.activities]);

  const cadenceData = useMemo(() => {
    if (cadenceView === 'weekly') {
      const recentExp = state.dailyExpHistory
        .slice(-4)
        .reduce((sum, p) => sum + p.exp, 0);
      return [
        { period: 'Week 1', exp: 78 },
        { period: 'Week 2', exp: 92 },
        { period: 'Week 3', exp: 118 },
        { period: 'This Week', exp: recentExp },
      ];
    }
    return [
      { period: 'August', exp: 310 },
      { period: 'September', exp: 420 },
      { period: 'October', exp: 485 },
      {
        period: 'November',
        exp: state.dailyExpHistory.reduce((sum, p) => sum + p.exp, 140),
      },
    ];
  }, [cadenceView, state.dailyExpHistory]);

  const unlockedAchievements = useMemo(
    () =>
      state.achievements
        .filter((a) => a.unlocked)
        .sort((a, b) => (b.unlockedDate ?? '').localeCompare(a.unlockedDate ?? '')),
    [state.achievements]
  );

  return (
    <div className="space-y-7">
      {/* Header + Date Filter */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-white/[0.06]">
        <div>
          <h1 className="font-[var(--font-display)] text-2xl font-bold text-[#EDEFF5]">
            Chronicle Analytics
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Quantitative progression across EXP, attributes, and real-world domains.
          </p>
        </div>

        <div className="inline-flex items-center gap-1 p-1 bg-[#11131A] border border-white/[0.07] rounded-lg self-start">
          {(['7D', '30D', 'ALL'] as const).map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => setDateRange(range)}
              className={`px-3 py-1 rounded-md text-xs font-mono transition-colors cursor-pointer ${
                dateRange === range
                  ? 'bg-violet-600/25 text-violet-200 border border-violet-500/35'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              {range === 'ALL' ? 'All Time' : range}
            </button>
          ))}
        </div>
      </div>

      {/* 4-Column KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 sm:p-5 rounded-xl bg-[#11131A] border border-white/[0.07]">
          <div className="text-xs text-slate-400">Total EXP Earned</div>
          <div className="mt-1.5 text-2xl font-mono font-semibold text-amber-300 tabular-nums">
            {state.player.totalExp.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Across all domains</div>
        </div>

        <div className="p-4 sm:p-5 rounded-xl bg-[#11131A] border border-white/[0.07]">
          <div className="text-xs text-slate-400">Current Level</div>
          <div className="mt-1.5 text-2xl font-mono font-semibold text-[#EDEFF5] tabular-nums">
            Level {state.player.level}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">{state.player.archetype}</div>
        </div>

        <div className="p-4 sm:p-5 rounded-xl bg-[#11131A] border border-white/[0.07]">
          <div className="text-xs text-slate-400">Experiences Recorded</div>
          <div className="mt-1.5 text-2xl font-mono font-semibold text-[#EDEFF5] tabular-nums">
            {state.activities.length}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Logged chronicles</div>
        </div>

        <div className="p-4 sm:p-5 rounded-xl bg-[#11131A] border border-white/[0.07]">
          <div className="text-xs text-slate-400">Most Developed Attribute</div>
          <div className="mt-1.5 text-2xl font-mono font-semibold text-violet-300 tabular-nums">
            {mostDevelopedAttr.name} ({mostDevelopedAttr.value})
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Highest trait rank</div>
        </div>
      </div>

      {/* Primary Charts Row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* EXP Earned Over Time */}
        <div className="xl:col-span-2 p-5 rounded-xl bg-[#11131A] border border-white/[0.07] space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#EDEFF5]">
                EXP Earned Over Time
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Experience points awarded per session
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500">
              {filteredDailySeries.length} checkpoints
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredDailySeries}>
                <defs>
                  <linearGradient id="expAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="#64748B"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#64748B"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={38}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#161923',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#EDEFF5',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="exp"
                  name="EXP Earned"
                  stroke="#A78BFA"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#expAreaGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Attribute Balance Radar */}
        <div className="p-5 rounded-xl bg-[#11131A] border border-white/[0.07] space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-[#EDEFF5]">
              Attribute Constellation
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Relative balance across all 8 core attributes
            </p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={attributeRadarData} outerRadius="72%">
                <PolarGrid stroke="rgba(255,255,255,0.08)" />
                <PolarAngleAxis
                  dataKey="attribute"
                  tick={{ fill: '#94A3B8', fontSize: 11 }}
                />
                <Radar
                  name="Score"
                  dataKey="value"
                  stroke="#D4A853"
                  fill="#8B5CF6"
                  fillOpacity={0.35}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#161923',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#EDEFF5',
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Secondary Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity Distribution */}
        <div className="p-5 rounded-xl bg-[#11131A] border border-white/[0.07] space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-[#EDEFF5]">
              Activity Domain Distribution
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Breakdown of EXP gained across real-life categories
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="h-52 w-full sm:w-56 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryDistribution}
                    dataKey="exp"
                    nameKey="name"
                    innerRadius={48}
                    outerRadius={76}
                    paddingAngle={3}
                  >
                    {categoryDistribution.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={CATEGORY_COLORS[entry.name] ?? '#8B5CF6'}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#161923',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: '#EDEFF5',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="flex-1 w-full space-y-2.5">
              {categoryDistribution.map((cat) => (
                <div
                  key={cat.name}
                  className="flex items-center justify-between text-xs border-b border-white/[0.04] pb-2 last:border-b-0"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-xs shrink-0"
                      style={{ backgroundColor: CATEGORY_COLORS[cat.name] ?? '#8B5CF6' }}
                    />
                    <span className="text-slate-200 font-medium">{cat.name}</span>
                    <span className="text-slate-500 font-mono">({cat.count})</span>
                  </div>
                  <span className="font-mono text-amber-300 tabular-nums">
                    +{cat.exp} EXP
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Weekly / Monthly Progress */}
        <div className="p-5 rounded-xl bg-[#11131A] border border-white/[0.07] space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[#EDEFF5]">
                Weekly &amp; Monthly Momentum
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Cumulative EXP rhythm across recent periods
              </p>
            </div>

            <div className="inline-flex items-center gap-1 p-1 bg-[#0C0E14] border border-white/[0.07] rounded-lg">
              <button
                type="button"
                onClick={() => setCadenceView('weekly')}
                className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
                  cadenceView === 'weekly'
                    ? 'bg-violet-600/25 text-violet-200'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Weekly
              </button>
              <button
                type="button"
                onClick={() => setCadenceView('monthly')}
                className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
                  cadenceView === 'monthly'
                    ? 'bg-violet-600/25 text-violet-200'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Monthly
              </button>
            </div>
          </div>

          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cadenceData}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="period"
                  stroke="#64748B"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#64748B"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={42}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#161923',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#EDEFF5',
                  }}
                />
                <Bar dataKey="exp" name="EXP" fill="#D4A853" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Achievement Unlock History */}
      <section className="p-5 rounded-xl bg-[#11131A] border border-white/[0.07] space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#EDEFF5]">
            Achievement Unlock History
          </h2>
          <span className="text-xs font-mono text-slate-500 tabular-nums">
            {unlockedAchievements.length} unlocked
          </span>
        </div>

        <div className="divide-y divide-white/[0.05]">
          {unlockedAchievements.map((ach) => {
            const style = RARITY_STYLES[ach.rarity];
            return (
              <div
                key={ach.id}
                className="py-3 flex items-center justify-between gap-4 text-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center border border-white/10 shrink-0 ${style.subtleBg}`}
                    style={{ color: style.accentHex }}
                  >
                    <RpgIcon name={ach.iconName} className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-[#EDEFF5] truncate">{ach.name}</div>
                    <div className="text-xs text-slate-500 truncate">{ach.description}</div>
                  </div>
                </div>

                <div className="text-right shrink-0 font-mono text-xs tabular-nums">
                  <div className={style.textColor}>{ach.rarity}</div>
                  <div className="text-slate-500 mt-0.5">{ach.unlockedDate}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
