import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  CheckSquare,
  ChevronRight,
  Filter,
  Plus,
  RefreshCw,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { ActivityDeleteMode, useGame } from '../../context/GameContext';
import {
  AttributeKey,
  ExperienceActivity,
  Rarity,
} from '../../types/rpg';
import {
  DIFFICULTY_TEXT_COLORS,
  formatDelta,
  getLevelProgress,
  RARITY_STYLES,
} from '../../utils/leveling';
import { RpgIcon, SafeImage } from '../common/RpgIcon';

const ATTRIBUTE_ORDER: AttributeKey[] = [
  'intelligence',
  'knowledge',
  'wisdom',
  'strength',
  'discipline',
  'creativity',
  'social',
  'courage',
  'miscellaneous',
];

type TimeFilter = 'all' | 'today' | '7d' | '30d' | '90d' | 'custom';

export const CharacterView: React.FC = () => {
  const {
    state,
    openGMModal,
    setSelectedAttributeKey,
    setActiveNav,
    deleteActivities,
    retryPendingCollectible,
    dismissPendingCollectible,
  } = useGame();

  // Activity Log Filtering & Bulk Deletion state
  const [showFilters, setShowFilters] = useState(false);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [rarityFilter, setRarityFilter] = useState<'All' | Rarity>('All');
  const [attributeFilter, setAttributeFilter] = useState<'All' | AttributeKey>('All');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    ids: string[];
    title: string;
  }>({ open: false, ids: [], title: '' });

  const levelInfo = getLevelProgress(state.player.totalExp);
  const equippedTitle = state.titles.find((t) => t.id === state.player.equippedTitleId);
  const equippedCosmetic = state.cosmetics.find(
    (c) => c.id === state.player.equippedCosmeticId
  );

  const showcasedAchievements = state.achievements.filter(
    (a) => a.unlocked && state.player.showcasedAchievementIds.includes(a.id)
  );

  const recentUnlocked = state.achievements
    .filter((a) => a.unlocked)
    .sort((a, b) => (b.unlockedDate ?? '').localeCompare(a.unlockedDate ?? ''))
    .slice(0, 4);

  const filteredActivities = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    const daysAgoStr = (days: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() - days);
      return d.toISOString().slice(0, 10);
    };

    return state.activities.filter((act: ExperienceActivity) => {
      if (timeFilter === 'today' && act.date !== todayStr) return false;
      if (timeFilter === '7d' && act.date < daysAgoStr(7)) return false;
      if (timeFilter === '30d' && act.date < daysAgoStr(30)) return false;
      if (timeFilter === '90d' && act.date < daysAgoStr(90)) return false;
      if (timeFilter === 'custom') {
        if (customStart && act.date < customStart) return false;
        if (customEnd && act.date > customEnd) return false;
      }

      if (categoryFilter !== 'All' && act.category !== categoryFilter) return false;
      if (rarityFilter !== 'All' && act.rarity !== rarityFilter) return false;
      if (
        attributeFilter !== 'All' &&
        !act.attributesAffected.some((a) => a.key === attributeFilter)
      ) {
        return false;
      }
      return true;
    });
  }, [
    state.activities,
    timeFilter,
    customStart,
    customEnd,
    categoryFilter,
    rarityFilter,
    attributeFilter,
  ]);

  const displayedActivities = showFilters
    ? filteredActivities
    : filteredActivities.slice(0, 6);

  const allFilteredSelected =
    filteredActivities.length > 0 &&
    filteredActivities.every((a) => selectedIds.includes(a.id));

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredActivities.map((a) => a.id));
    }
  };

  const confirmDelete = (mode: ActivityDeleteMode) => {
    deleteActivities(deleteDialog.ids, mode);
    setSelectedIds((prev) => prev.filter((id) => !deleteDialog.ids.includes(id)));
    setDeleteDialog({ open: false, ids: [], title: '' });
  };

  const pendingToDeleteSummary = useMemo(() => {
    const targets = state.activities.filter((a) => deleteDialog.ids.includes(a.id));
    const totalExp = targets.reduce((sum, a) => sum + (a.expEarned > 0 ? a.expEarned : 0), 0);
    return { count: targets.length, totalExp };
  }, [state.activities, deleteDialog.ids]);

  return (
    <div className="space-y-8">
      {/* Hero Character Sanctuary Banner */}
      <section className="relative rounded-2xl overflow-hidden border border-white/[0.08] bg-[#11131A]">
        <div className="absolute inset-0">
          <SafeImage
            src={state.player.bannerUrl}
            alt="Character Sanctuary Backdrop"
            className="w-full h-full object-cover opacity-35"
            fallbackIcon="Compass"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0A0B0F] via-[#0D0F16]/90 to-[#0A0B0F]/75" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#11131A] via-transparent to-transparent" />
        </div>

        <div className="relative p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-6 min-w-0">
            <div
              className={`w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden shrink-0 bg-[#0A0B0F] ${
                equippedCosmetic?.borderClass ?? 'ring-2 ring-amber-400/60'
              }`}
            >
              <SafeImage
                src={state.player.avatarUrl}
                alt={`${state.player.name} character portrait`}
                className="w-full h-full object-cover"
                fallbackIcon="User"
              />
            </div>

            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono text-amber-300/90">
                <span>LEVEL {levelInfo.level}</span>
                <span className="text-slate-600" aria-hidden="true">·</span>
                <span className="text-slate-300">{state.player.archetype}</span>
              </div>

              <h1 className="font-[var(--font-display)] text-2xl sm:text-3xl font-bold text-[#EDEFF5] tracking-wide text-balance">
                {state.player.name}
              </h1>

              <div className="text-sm text-amber-200/90 font-medium">
                {equippedTitle?.name ?? 'Adventurer'}
              </div>

              <div className="pt-1 max-w-md">
                <div className="flex items-center justify-between text-xs font-mono text-slate-300 mb-1.5 tabular-nums">
                  <span>{state.player.totalExp.toLocaleString()} EXP</span>
                  <span className="text-slate-400">
                    Next Level: {levelInfo.nextLevelCeiling.toLocaleString()} EXP
                  </span>
                </div>
                <div className="h-2 w-full bg-[#1B1F2E] rounded-full overflow-hidden border border-white/[0.06]">
                  <motion.div
                    initial={false}
                    animate={{ width: `${levelInfo.percentage}%` }}
                    transition={{ duration: 0.45, ease: 'easeOut' }}
                    className="h-full bg-gradient-to-r from-violet-500 via-violet-400 to-amber-300 rounded-full"
                  />
                </div>
                <div className="mt-1 text-[11px] text-slate-400 tabular-nums">
                  {levelInfo.expRemaining.toLocaleString()} EXP required for Level {levelInfo.level + 1}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-start lg:items-end justify-between gap-4 shrink-0">
            <button
              type="button"
              onClick={() => openGMModal()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white text-sm font-medium transition-colors shadow-[0_0_26px_-6px_rgba(139,92,246,0.7)] whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Log Experience</span>
            </button>

            {showcasedAchievements.length > 0 && (
              <div className="space-y-1.5 lg:text-right">
                <div className="text-[11px] text-slate-400 font-mono">
                  Showcased Crests
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {showcasedAchievements.map((ach) => {
                    const style = RARITY_STYLES[ach.rarity];
                    return (
                      <button
                        key={ach.id}
                        type="button"
                        onClick={() => setActiveNav('achievements')}
                        title={`${ach.name} (${ach.rarity})`}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${style.borderColor} ${style.subtleBg} hover:bg-white/[0.08]`}
                      >
                        <span style={{ color: style.accentHex }}>
                          <RpgIcon name={ach.iconName} className="w-3.5 h-3.5" />
                        </span>
                        <span className="text-slate-200 font-medium whitespace-nowrap">
                          {ach.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Pending / Failed Collectible Asset Generation Pipeline Banner */}
      {state.pendingCollectibles.length > 0 && (
        <section className="space-y-2">
          {state.pendingCollectibles.map((p) => (
            <div
              key={p.id}
              className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                p.status === 'failed'
                  ? 'bg-rose-500/10 border-rose-500/35'
                  : 'bg-amber-500/10 border-amber-400/30'
              }`}
            >
              <div className="space-y-0.5 text-xs">
                <div className="font-semibold text-[#EDEFF5]">
                  {p.status === 'generating'
                    ? `Forging ${p.rarity} ${p.suggestedType} artwork for "${p.sourceLabel}"...`
                    : `Pending ${p.rarity} ${p.suggestedType} reward for "${p.sourceLabel}"`}
                </div>
                {p.errorMessage && (
                  <div className="text-rose-200">{p.errorMessage}</div>
                )}
              </div>
              {p.status !== 'generating' && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => retryPendingCollectible(p.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0A0B0F] text-xs font-semibold cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry Generation</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => dismissPendingCollectible(p.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer"
                    aria-label="Dismiss pending collectible"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Attributes Matrix */}
      <section aria-labelledby="attributes-heading">
        <div className="flex items-end justify-between gap-4 mb-4">
          <div>
            <h2
              id="attributes-heading"
              className="font-[var(--font-display)] text-lg sm:text-xl font-semibold text-[#EDEFF5]"
            >
              Core Attributes
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Long-term fractional progression displayed as rounded scores. Click any trait for detailed history.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500 tabular-nums hidden sm:inline">
            9 Traits
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {ATTRIBUTE_ORDER.map((key) => {
            const attr = state.attributes[key];
            const pct = Math.min(100, Math.round((attr.progress / attr.maxRankScale) * 100));
            return (
              <button
                key={attr.key}
                type="button"
                onClick={() => setSelectedAttributeKey(attr.key)}
                className="group text-left p-4 rounded-xl bg-[#11131A] hover:bg-[#151823] border border-white/[0.07] hover:border-violet-400/35 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center border border-white/[0.08] shrink-0"
                      style={{
                        backgroundColor: `${attr.accentHex}16`,
                        color: attr.accentHex,
                      }}
                    >
                      <RpgIcon name={attr.iconName} className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[#EDEFF5] group-hover:text-amber-200 transition-colors truncate">
                        {attr.name}
                      </div>
                      <div
                        className={`text-[11px] font-mono tabular-nums ${
                          attr.recentDelta < 0 ? 'text-rose-400' : 'text-slate-500'
                        }`}
                      >
                        Recent {formatDelta(attr.recentDelta)}
                      </div>
                    </div>
                  </div>

                  <div className="text-xl font-mono font-semibold text-[#EDEFF5] tabular-nums shrink-0">
                    {attr.value}
                  </div>
                </div>

                <div className="mt-3.5 h-1.5 w-full bg-[#1C202E] rounded-full overflow-hidden">
                  <motion.div
                    initial={false}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.45, ease: 'easeOut' }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: attr.accentHex }}
                  />
                </div>

                <p className="mt-2.5 text-xs text-slate-400 line-clamp-2 leading-relaxed">
                  {attr.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Bottom Split: Recent Chronicles (with Advanced Filtering & Deletion) + Recent Achievements */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="xl:col-span-2 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-[var(--font-display)] text-lg font-semibold text-[#EDEFF5]">
              Chronicles &amp; Activity Log
            </h2>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowFilters((p) => !p)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                  showFilters
                    ? 'bg-violet-600/20 border-violet-400/40 text-violet-200'
                    : 'bg-[#11131A] border-white/10 text-slate-300 hover:text-white'
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                <span>{showFilters ? 'Hide Filters & Bulk Edit' : 'Filter & Manage Logs'}</span>
              </button>

              <button
                type="button"
                onClick={() => openGMModal()}
                className="text-xs text-violet-300 hover:text-violet-200 font-medium cursor-pointer px-2 py-1.5"
              >
                + Record
              </button>
            </div>
          </div>

          {/* Advanced Filter & Bulk Deletion Toolbar */}
          {showFilters && (
            <div className="p-4 rounded-xl bg-[#11131A] border border-white/[0.08] space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">
                    Time Period
                  </label>
                  <select
                    value={timeFilter}
                    onChange={(e) => setTimeFilter(e.target.value as TimeFilter)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#0A0B0F] border border-white/10 text-xs text-[#EDEFF5]"
                  >
                    <option value="all">All Time</option>
                    <option value="today">Today</option>
                    <option value="7d">Last 7 Days</option>
                    <option value="30d">Last 30 Days</option>
                    <option value="90d">Last 90 Days</option>
                    <option value="custom">Custom Range</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">
                    Category
                  </label>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#0A0B0F] border border-white/10 text-xs text-[#EDEFF5]"
                  >
                    <option value="All">All Categories</option>
                    <option value="Learning">Learning</option>
                    <option value="Craft">Craft</option>
                    <option value="Vitality">Vitality</option>
                    <option value="Reflection">Reflection</option>
                    <option value="Community">Community</option>
                    <option value="Exploration">Exploration</option>
                    <option value="Miscellaneous">Miscellaneous</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">
                    Rarity
                  </label>
                  <select
                    value={rarityFilter}
                    onChange={(e) => setRarityFilter(e.target.value as 'All' | Rarity)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#0A0B0F] border border-white/10 text-xs text-[#EDEFF5]"
                  >
                    <option value="All">All Rarities</option>
                    <option value="Common">Common</option>
                    <option value="Uncommon">Uncommon</option>
                    <option value="Rare">Rare</option>
                    <option value="Epic">Epic</option>
                    <option value="Legendary">Legendary</option>
                    <option value="Mythical">Mythical</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">
                    Attribute Affected
                  </label>
                  <select
                    value={attributeFilter}
                    onChange={(e) =>
                      setAttributeFilter(e.target.value as 'All' | AttributeKey)
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#0A0B0F] border border-white/10 text-xs text-[#EDEFF5]"
                  >
                    <option value="All">All Attributes</option>
                    {ATTRIBUTE_ORDER.map((k) => (
                      <option key={k} value={k}>
                        {state.attributes[k].name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {timeFilter === 'custom' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#0A0B0F] border border-white/10 text-xs text-[#EDEFF5]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#0A0B0F] border border-white/10 text-xs text-[#EDEFF5]"
                    />
                  </div>
                </div>
              )}

              {/* Bulk Selection & Deletion Controls */}
              <div className="pt-3 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={toggleSelectAllFiltered}
                    className="inline-flex items-center gap-1.5 text-slate-300 hover:text-white cursor-pointer"
                  >
                    {allFilteredSelected ? (
                      <CheckSquare className="w-4 h-4 text-violet-400" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-500" />
                    )}
                    <span>
                      Select All Filtered ({filteredActivities.length})
                    </span>
                  </button>

                  {selectedIds.length > 0 && (
                    <span className="font-mono text-violet-300">
                      {selectedIds.length} selected
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {selectedIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setDeleteDialog({
                          open: true,
                          ids: selectedIds,
                          title: `Delete ${selectedIds.length} selected chronicle log(s)`,
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-200 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Selected</span>
                    </button>
                  )}

                  {filteredActivities.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setDeleteDialog({
                          open: true,
                          ids: filteredActivities.map((a) => a.id),
                          title: `Delete all ${filteredActivities.length} logs matching current filter`,
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-rose-500/20 border border-white/10 hover:border-rose-500/30 text-slate-300 hover:text-rose-200 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Filtered Range</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Activities List */}
          {displayedActivities.length === 0 ? (
            <div className="p-8 rounded-xl bg-[#11131A] border border-white/[0.07] text-center text-sm text-slate-400">
              No chronicle logs match your active filters.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06] rounded-xl bg-[#11131A] border border-white/[0.07]">
              {displayedActivities.map((act) => {
                const isSelected = selectedIds.includes(act.id);
                const rStyle = RARITY_STYLES[act.rarity || 'Common'];
                return (
                  <div key={act.id} className="p-4 sm:p-5 flex items-start gap-3">
                    {showFilters && (
                      <button
                        type="button"
                        onClick={() => toggleSelectOne(act.id)}
                        aria-label={`Select ${act.title}`}
                        className="mt-0.5 text-slate-400 hover:text-violet-300 cursor-pointer shrink-0"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-violet-400" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    )}

                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-[#EDEFF5]">
                            {act.title}
                          </h3>
                          <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2">
                            <span>{act.timestamp}</span>
                            <span aria-hidden="true">·</span>
                            <span>{act.category}</span>
                            <span aria-hidden="true">·</span>
                            <span className={DIFFICULTY_TEXT_COLORS[act.difficulty || 'Easy']}>
                              {act.difficulty}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className={rStyle.textColor}>{act.rarity}</span>
                            {act.sentiment === 'mixed' && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-amber-300/90">Mixed</span>
                              </>
                            )}
                            {act.sentiment === 'negative' && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-rose-300/90">Adjustment</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div
                          className={`text-sm font-mono font-semibold tabular-nums shrink-0 ${
                            act.expEarned < 0
                              ? 'text-rose-400'
                              : act.expEarned === 0
                                ? 'text-slate-400'
                                : 'text-amber-300'
                          }`}
                        >
                          {act.expEarned > 0 ? `+${act.expEarned}` : act.expEarned} EXP
                        </div>
                      </div>

                      <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                        {act.description}
                      </p>

                      <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          {act.attributesAffected.length > 0 && (
                            <span className="text-slate-400 font-mono">
                              {act.attributesAffected
                                .map((a) => `${a.name} ${formatDelta(a.delta)}`)
                                .join(' · ')}
                            </span>
                          )}
                          {act.achievementUnlockedName && (
                            <span className="text-amber-300/90 font-medium">
                              Unlocked: {act.achievementUnlockedName}
                            </span>
                          )}
                          {act.collectibleName && (
                            <span className="text-violet-300 font-medium">
                              Collectible: {act.collectibleName}
                            </span>
                          )}
                        </div>

                        {showFilters && (
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteDialog({
                                open: true,
                                ids: [act.id],
                                title: `Delete "${act.title}"`,
                              })
                            }
                            className="text-slate-500 hover:text-rose-300 transition-colors cursor-pointer"
                            title="Delete activity log"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Recent Achievements (1 column) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-[var(--font-display)] text-lg font-semibold text-[#EDEFF5]">
              Recent Achievements
            </h2>
            <button
              type="button"
              onClick={() => setActiveNav('achievements')}
              className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-[#EDEFF5] cursor-pointer"
            >
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {recentUnlocked.map((ach) => {
              const rStyle = RARITY_STYLES[ach.rarity];
              return (
                <button
                  key={ach.id}
                  type="button"
                  onClick={() => setActiveNav('achievements')}
                  className={`w-full text-left p-4 rounded-xl bg-[#11131A] border transition-colors hover:bg-[#151823] cursor-pointer ${rStyle.borderColor} ${rStyle.glowClass}`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center border border-white/10 shrink-0 ${rStyle.subtleBg}`}
                      style={{ color: rStyle.accentHex }}
                    >
                      <RpgIcon name={ach.iconName} className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-[#EDEFF5] truncate">
                          {ach.name}
                        </span>
                        <span className={`text-[11px] font-mono shrink-0 ${rStyle.textColor}`}>
                          {ach.rarity}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                        {ach.description}
                      </p>
                      <div className="mt-2 text-[11px] font-mono text-slate-500 flex items-center gap-2">
                        <span>{ach.unlockedDate}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-amber-300/80">+{ach.expReward} EXP</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* Confirmation Modal for Activity Deletion */}
      {deleteDialog.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          onClick={() => setDeleteDialog({ open: false, ids: [], title: '' })}
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
                  {deleteDialog.title}
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Choose how removing {pendingToDeleteSummary.count} log record(s) ({pendingToDeleteSummary.totalExp} EXP total) should affect your character progression:
                </p>
              </div>
            </div>

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={() => confirmDelete('record_only')}
                className="w-full text-left p-3.5 rounded-lg bg-[#0A0B0F] hover:bg-white/[0.04] border border-white/10 transition-colors cursor-pointer"
              >
                <div className="text-sm font-medium text-[#EDEFF5]">
                  Delete log record only (preserve progression)
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Removes the activity entry from history while keeping all earned EXP, level, and attribute points.
                </div>
              </button>

              <button
                type="button"
                onClick={() => confirmDelete('reverse_progression')}
                className="w-full text-left p-3.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/35 transition-colors cursor-pointer"
              >
                <div className="text-sm font-medium text-rose-200">
                  Delete log &amp; reverse progression transactions
                </div>
                <div className="text-xs text-rose-200/75 mt-0.5">
                  Removes the activity entry and subtracts its associated EXP and attribute adjustments, recording a reversal in the audit ledger.
                </div>
              </button>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setDeleteDialog({ open: false, ids: [], title: '' })}
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
