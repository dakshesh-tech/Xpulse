import React from 'react';
import { X, TrendingUp } from 'lucide-react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useGame } from '../../context/GameContext';
import { formatDelta, getAttributeTierLabel } from '../../utils/leveling';
import { RpgIcon } from '../common/RpgIcon';

export const AttributeDetailModal: React.FC = () => {
  const { state, selectedAttributeKey, setSelectedAttributeKey } = useGame();

  if (!selectedAttributeKey) return null;
  const attribute = state.attributes[selectedAttributeKey];
  if (!attribute) return null;

  const fractionalProgress = Math.round((attribute.progress - attribute.value) * 100);

  const chartData = attribute.history.map((entry) => ({
    date: new Date(entry.date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
    value: entry.valueAfter,
    label: entry.label,
    delta: entry.delta,
  }));

  const relatedActivities = state.activities.filter(
    (act) => !act.isReversalRecord && act.attributesAffected.some((a) => a.key === attribute.key)
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      onClick={() => setSelectedAttributeKey(null)}
    >
      <div
        className="w-full max-w-2xl bg-[#11131A] border border-white/[0.09] rounded-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/[0.06] flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className="w-11 h-11 rounded-lg flex items-center justify-center border border-white/10"
              style={{
                backgroundColor: `${attribute.accentHex}18`,
                color: attribute.accentHex,
              }}
            >
              <RpgIcon name={attribute.iconName} className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="font-[var(--font-display)] text-xl font-semibold text-[#EDEFF5]">
                  {attribute.name}
                </h2>
                <span className="text-xs font-mono text-slate-400">
                  {getAttributeTierLabel(attribute.value)}
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-0.5">{attribute.description}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSelectedAttributeKey(null)}
            aria-label="Close attribute details"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Stat Summary Row */}
          <div className="grid grid-cols-3 gap-4 pb-5 border-b border-white/[0.06]">
            <div>
              <div className="text-xs text-slate-400">Current Score</div>
              <div className="mt-1 text-2xl font-mono font-semibold text-[#EDEFF5] tabular-nums">
                {attribute.value}
                <span className="text-sm text-slate-500 font-normal">
                  /{attribute.maxRankScale}
                </span>
              </div>
              <div className="mt-1 text-[11px] font-mono text-slate-400 tabular-nums">
                {fractionalProgress}% toward {attribute.value + 1}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Latest Adjustment</div>
              <div
                className={`mt-1 text-2xl font-mono font-semibold tabular-nums ${
                  attribute.recentDelta < 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {formatDelta(attribute.recentDelta)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Recorded Updates</div>
              <div className="mt-1 text-2xl font-mono font-semibold text-[#EDEFF5] tabular-nums">
                {attribute.history.length}
              </div>
            </div>
          </div>

          {/* Progression Chart */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
                <TrendingUp className="w-4 h-4 text-violet-400" />
                <span>Attribute Progression Curve</span>
              </div>
              <span className="text-xs text-slate-500 font-mono">
                Last {chartData.length} updates
              </span>
            </div>

            <div className="h-44 w-full bg-[#0C0E14] border border-white/[0.05] rounded-lg p-3">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id={`grad-${attribute.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={attribute.accentHex} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={attribute.accentHex} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
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
                    domain={['dataMin - 1', 'dataMax + 1']}
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
                    dataKey="value"
                    stroke={attribute.accentHex}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill={`url(#grad-${attribute.key})`}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Progression History */}
          <div>
            <h3 className="text-sm font-medium text-slate-200 mb-3">
              Progression History
            </h3>
            <div className="divide-y divide-white/[0.05] border border-white/[0.06] rounded-lg bg-[#0C0E14]">
              {[...attribute.history].reverse().map((item) => (
                <div
                  key={item.id}
                  className="px-4 py-3 flex items-center justify-between gap-4 text-sm"
                >
                  <div className="min-w-0">
                    <div className="text-slate-200 truncate">{item.label}</div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">
                      {item.date}
                    </div>
                  </div>
                  <div className="text-right shrink-0 font-mono tabular-nums">
                    <span
                      className={`font-medium ${
                        item.delta < 0 ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {formatDelta(item.delta)}
                    </span>
                    <span className="text-xs text-slate-500 ml-2">
                      → {item.valueAfter.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {relatedActivities.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-200 mb-2">
                Recent Real-World Sources
              </h3>
              <div className="space-y-2">
                {relatedActivities.slice(0, 3).map((act) => (
                  <div
                    key={act.id}
                    className="text-xs text-slate-400 flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-b-0"
                  >
                    <span className="truncate pr-3">{act.title}</span>
                    <span className="font-mono text-slate-500 shrink-0">{act.date}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
