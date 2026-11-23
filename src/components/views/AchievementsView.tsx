import React, { useMemo, useState } from 'react';
import { AlertTriangle, Lock, Search, Sparkles, Trash2 } from 'lucide-react';
import { CollectionDeleteMode, useGame } from '../../context/GameContext';
import { Achievement, Rarity } from '../../types/rpg';
import { RARITY_STYLES } from '../../utils/leveling';
import { RpgIcon } from '../common/RpgIcon';

const RARITY_FILTERS: ('All' | Rarity)[] = [
  'All',
  'Common',
  'Uncommon',
  'Rare',
  'Epic',
  'Legendary',
  'Mythical',
];

export const AchievementsView: React.FC = () => {
  const { state, deleteCollectionItem } = useGame();
  const [searchQuery, setSearchQuery] = useState('');
  const [rarityFilter, setRarityFilter] = useState<'All' | Rarity>('All');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unlocked' | 'locked'>('all');
  const [deleteTarget, setDeleteTarget] = useState<Achievement | null>(null);

  const unlockedCount = state.achievements.filter((a) => a.unlocked).length;
  const featured = state.achievements.filter((a) => a.featured && a.unlocked).slice(0, 3);

  const filteredAchievements = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return state.achievements.filter((ach) => {
      if (rarityFilter !== 'All' && ach.rarity !== rarityFilter) return false;
      if (statusFilter === 'unlocked' && !ach.unlocked) return false;
      if (statusFilter === 'locked' && ach.unlocked) return false;
      if (
        q &&
        !ach.name.toLowerCase().includes(q) &&
        !ach.description.toLowerCase().includes(q) &&
        !ach.condition.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [state.achievements, searchQuery, rarityFilter, statusFilter]);

  const handleConfirmDelete = (mode: CollectionDeleteMode) => {
    if (!deleteTarget) return;
    deleteCollectionItem({ kind: 'achievement', id: deleteTarget.id, mode });
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-white/[0.06]">
        <div>
          <h1 className="font-[var(--font-display)] text-2xl font-bold text-[#EDEFF5]">
            Hall of Achievements
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Earned milestones and dynamically forged honors from your lived chronicle.
          </p>
        </div>
        <div className="text-sm font-mono text-slate-300 tabular-nums">
          {unlockedCount} / {state.achievements.length} Unlocked
        </div>
      </div>

      {/* Featured Achievements */}
      {featured.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-mono text-amber-300/90 tracking-wider">
            FEATURED HONORS
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {featured.map((ach) => {
              const rStyle = RARITY_STYLES[ach.rarity];
              return (
                <div
                  key={ach.id}
                  className={`p-5 rounded-xl bg-[#121520] border ${rStyle.borderColor} ${rStyle.glowClass}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center border border-white/10 ${rStyle.subtleBg}`}
                      style={{ color: rStyle.accentHex }}
                    >
                      <RpgIcon name={ach.iconName} className="w-5 h-5" />
                    </div>
                    <span className={`text-xs font-mono ${rStyle.textColor}`}>
                      {ach.rarity}
                    </span>
                  </div>
                  <h3 className="mt-3 font-[var(--font-display)] text-base font-semibold text-[#EDEFF5]">
                    {ach.name}
                  </h3>
                  <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                    {ach.description}
                  </p>
                  <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] font-mono text-slate-500">
                    <span>Unlocked {ach.unlockedDate}</span>
                    <span className="text-amber-300">+{ach.expReward} EXP</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Search & Filter Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search achievements or conditions..."
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-[#11131A] border border-white/10 text-sm text-[#EDEFF5] placeholder:text-slate-500 focus:outline-none focus:border-violet-400"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 p-1 bg-[#11131A] border border-white/[0.07] rounded-lg">
            {(['all', 'unlocked', 'locked'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors cursor-pointer ${
                  statusFilter === status
                    ? 'bg-violet-600/25 text-violet-200'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          <div className="inline-flex items-center gap-1 p-1 bg-[#11131A] border border-white/[0.07] rounded-lg overflow-x-auto max-w-full">
            {RARITY_FILTERS.map((rarity) => (
              <button
                key={rarity}
                type="button"
                onClick={() => setRarityFilter(rarity)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  rarityFilter === rarity
                    ? 'bg-white/10 text-[#EDEFF5]'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {rarity}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Achievements Grid */}
      {filteredAchievements.length === 0 ? (
        <div className="p-10 rounded-xl bg-[#11131A] border border-white/[0.07] text-center text-sm text-slate-400">
          No achievements match your current search or rarity filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredAchievements.map((ach) => {
            const rStyle = RARITY_STYLES[ach.rarity];
            const hasProgress =
              !ach.unlocked &&
              ach.progressCurrent !== undefined &&
              ach.progressTarget !== undefined &&
              ach.progressTarget > 0;
            const progressPct = hasProgress
              ? Math.min(
                  100,
                  Math.round((ach.progressCurrent! / ach.progressTarget!) * 100)
                )
              : 0;

            return (
              <div
                key={ach.id}
                className={`p-5 rounded-xl border transition-colors ${
                  ach.unlocked
                    ? `bg-[#11131A] ${rStyle.borderColor} ${rStyle.glowClass}`
                    : 'bg-[#0D0F15] border-white/[0.05] opacity-80'
                }`}
              >
                <div className="flex items-start gap-3.5">
                  <div
                    className={`w-11 h-11 rounded-lg flex items-center justify-center border shrink-0 ${
                      ach.unlocked
                        ? `border-white/10 ${rStyle.subtleBg}`
                        : 'border-white/[0.06] bg-white/[0.02] text-slate-500'
                    }`}
                    style={ach.unlocked ? { color: rStyle.accentHex } : undefined}
                  >
                    {ach.unlocked ? (
                      <RpgIcon name={ach.iconName} className="w-5 h-5" />
                    ) : (
                      <Lock className="w-4 h-4" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-[var(--font-display)] text-base font-semibold text-[#EDEFF5]">
                          {ach.name}
                        </h3>
                        <div className="flex flex-wrap items-center gap-2 text-xs font-mono mt-0.5">
                          <span className={rStyle.textColor}>{ach.rarity}</span>
                          <span className="text-slate-600" aria-hidden="true">·</span>
                          <span className="text-amber-300/90 tabular-nums">
                            +{ach.expReward} EXP
                          </span>
                          {ach.dynamicallyGenerated && (
                            <>
                              <span className="text-slate-600" aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1 text-violet-300">
                                <Sparkles className="w-3 h-3" />
                                GM Forged
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {ach.unlocked && ach.unlockedDate && (
                          <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                            {ach.unlockedDate}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(ach)}
                          aria-label={`Delete ${ach.name}`}
                          className="p-1 rounded-md text-slate-500 hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                      {ach.description}
                    </p>

                    <div className="text-xs text-slate-500">
                      Condition: {ach.condition}
                    </div>

                    {hasProgress && (
                      <div className="pt-1.5">
                        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1 tabular-nums">
                          <span>Progress</span>
                          <span>
                            {ach.progressCurrent?.toLocaleString()} /{' '}
                            {ach.progressTarget?.toLocaleString()} ({progressPct}%)
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-[#191C28] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${progressPct}%`,
                              backgroundColor: rStyle.accentHex,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Achievement Deletion Confirmation Dialog */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#11131A] border border-white/[0.09] rounded-xl p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-rose-500/15 border border-rose-500/35 flex items-center justify-center text-rose-300 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-[var(--font-display)] text-base font-semibold text-[#EDEFF5]">
                  Remove &ldquo;{deleteTarget.name}&rdquo;?
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Historical activity logs will remain untouched. Choose how to handle associated rewards:
                </p>
              </div>
            </div>

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={() => handleConfirmDelete('collection_only')}
                className="w-full text-left p-3.5 rounded-lg bg-[#0A0B0F] hover:bg-white/[0.04] border border-white/10 transition-colors cursor-pointer"
              >
                <div className="text-sm font-medium text-[#EDEFF5]">
                  Remove from collection only
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Deletes the achievement card while keeping any earned EXP intact.
                </div>
              </button>

              {deleteTarget.transactionId && (
                <button
                  type="button"
                  onClick={() => handleConfirmDelete('reverse_reward')}
                  className="w-full text-left p-3.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/35 transition-colors cursor-pointer"
                >
                  <div className="text-sm font-medium text-rose-200">
                    Remove &amp; reverse associated reward (-{deleteTarget.expReward} EXP)
                  </div>
                  <div className="text-xs text-rose-200/75 mt-0.5">
                    Removes the achievement and reverses its linked reward transaction cleanly.
                  </div>
                </button>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
