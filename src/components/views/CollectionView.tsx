import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  Lock,
  RefreshCw,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import {
  CollectionDeleteMode,
  CollectionItemKind,
  useGame,
} from '../../context/GameContext';
import { RARITY_STYLES } from '../../utils/leveling';
import { RpgIcon, SafeImage } from '../common/RpgIcon';

interface DeleteModalState {
  kind: CollectionItemKind;
  id: string;
  name: string;
  hasLinkedTransaction: boolean;
}

export const CollectionView: React.FC = () => {
  const {
    state,
    equipTitle,
    equipCosmetic,
    equipPortrait,
    toggleShowcaseAchievement,
    deleteCollectionItem,
    retryPendingCollectible,
    dismissPendingCollectible,
  } = useGame();

  const [deleteTarget, setDeleteTarget] = useState<DeleteModalState | null>(null);

  const unlockedAchievements = state.achievements.filter((a) => a.unlocked);

  const handleConfirmDelete = (mode: CollectionDeleteMode) => {
    if (!deleteTarget) return;
    deleteCollectionItem({
      kind: deleteTarget.kind,
      id: deleteTarget.id,
      mode,
    });
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="pb-5 border-b border-white/[0.06]">
        <h1 className="font-[var(--font-display)] text-2xl font-bold text-[#EDEFF5]">
          Adventurer&apos;s Collection
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Equip earned titles, portraits, frames, and curated crests. Manage or remove collection items without corrupting activity logs.
        </p>
      </div>

      {/* Pending / Failed Collectible Asset Generation Queue */}
      {state.pendingCollectibles.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-mono text-amber-300 tracking-wider">
            PENDING COLLECTIBLE ARTWORK
          </h2>
          <div className="space-y-2.5">
            {state.pendingCollectibles.map((p) => (
              <div
                key={p.id}
                className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  p.status === 'failed'
                    ? 'bg-rose-500/10 border-rose-500/35'
                    : 'bg-amber-500/10 border-amber-400/30'
                }`}
              >
                <div className="space-y-1 text-xs">
                  <div className="font-semibold text-[#EDEFF5]">
                    {p.rarity} {p.suggestedType} · From &ldquo;{p.sourceLabel}&rdquo;
                  </div>
                  <div className="text-slate-300">
                    {p.status === 'generating'
                      ? 'Generating and saving bespoke artwork...'
                      : p.errorMessage || 'Awaiting artwork generation.'}
                  </div>
                </div>

                {p.status !== 'generating' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => retryPendingCollectible(p.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0A0B0F] text-xs font-semibold cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Retry Artwork</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => dismissPendingCollectible(p.id)}
                      aria-label="Discard pending collectible"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Earned Titles */}
      <section className="space-y-4">
        <div>
          <h2 className="font-[var(--font-display)] text-lg font-semibold text-[#EDEFF5]">
            Titles &amp; Epithets
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Equip any unlocked title to display beneath your character name.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {state.titles.map((title) => {
            const isEquipped = state.player.equippedTitleId === title.id;
            const rStyle = RARITY_STYLES[title.rarity];

            return (
              <div
                key={title.id}
                className={`p-4 sm:p-5 rounded-xl border transition-colors flex flex-col justify-between gap-4 ${
                  title.unlocked
                    ? isEquipped
                      ? `bg-[#151825] ${rStyle.borderColor} ${rStyle.glowClass}`
                      : 'bg-[#11131A] border-white/[0.07]'
                    : 'bg-[#0C0E14] border-white/[0.05] opacity-70'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs font-mono">
                    <span className={rStyle.textColor}>{title.rarity} Title</span>
                    <div className="flex items-center gap-2">
                      {title.earnedDate ? (
                        <span className="text-slate-500">{title.earnedDate}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-500">
                          <Lock className="w-3 h-3" /> Locked
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setDeleteTarget({
                            kind: 'title',
                            id: title.id,
                            name: title.name,
                            hasLinkedTransaction: false,
                          })
                        }
                        aria-label={`Delete title ${title.name}`}
                        className="p-1 rounded text-slate-500 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <h3 className="font-[var(--font-display)] text-base font-semibold text-[#EDEFF5]">
                    {title.name}
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {title.description}
                  </p>
                  <div className="text-[11px] text-slate-500">
                    Source: {title.unlockSource}
                  </div>
                </div>

                <div className="flex justify-end">
                  {title.unlocked ? (
                    <button
                      type="button"
                      onClick={() => equipTitle(title.id)}
                      disabled={isEquipped}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        isEquipped
                          ? 'bg-amber-400/15 text-amber-300 border border-amber-400/40 cursor-default'
                          : 'bg-white/[0.06] hover:bg-violet-600 text-slate-200 hover:text-white'
                      }`}
                    >
                      {isEquipped ? 'Equipped' : 'Equip Title'}
                    </button>
                  ) : (
                    <span className="text-xs text-slate-500 font-mono">
                      Unavailable
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Showcased Achievement Crests */}
      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-[var(--font-display)] text-lg font-semibold text-[#EDEFF5]">
              Profile Crest Showcase
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Select up to 3 unlocked achievements to display on your Character sanctuary banner.
            </p>
          </div>
          <span className="text-xs font-mono text-amber-300 tabular-nums shrink-0">
            {state.player.showcasedAchievementIds.length} / 3 Selected
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {unlockedAchievements.map((ach) => {
            const isSelected = state.player.showcasedAchievementIds.includes(ach.id);
            const rStyle = RARITY_STYLES[ach.rarity];
            return (
              <button
                key={ach.id}
                type="button"
                onClick={() => toggleShowcaseAchievement(ach.id)}
                className={`p-3.5 rounded-xl border text-left transition-all flex items-center justify-between gap-3 cursor-pointer ${
                  isSelected
                    ? `bg-[#161926] ${rStyle.borderColor}`
                    : 'bg-[#11131A] border-white/[0.07] hover:border-white/20'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center border border-white/10 shrink-0 ${rStyle.subtleBg}`}
                    style={{ color: rStyle.accentHex }}
                  >
                    <RpgIcon name={ach.iconName} className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#EDEFF5] truncate">
                      {ach.name}
                    </div>
                    <div className={`text-[11px] font-mono ${rStyle.textColor}`}>
                      {ach.rarity}
                    </div>
                  </div>
                </div>
                <span
                  className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                    isSelected
                      ? 'bg-violet-600 text-white'
                      : 'bg-white/[0.05] text-slate-500'
                  }`}
                >
                  {isSelected ? <Check className="w-3.5 h-3.5" /> : <Star className="w-3 h-3" />}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Relics & Collectibles */}
      <section className="space-y-4">
        <div>
          <h2 className="font-[var(--font-display)] text-lg font-semibold text-[#EDEFF5]">
            Relics &amp; Artifacts
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Rare keepsakes forged from significant real-life milestones, each with dedicated artwork.
          </p>
        </div>

        {state.collectibles.length === 0 ? (
          <div className="p-8 rounded-xl bg-[#11131A] border border-white/[0.07] text-center text-sm text-slate-400">
            No relics or artifacts currently in your vault. Significant Medium+ experiences may yield rare drops.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {state.collectibles.map((item) => {
              const rStyle = RARITY_STYLES[item.rarity];
              return (
                <div
                  key={item.id}
                  className={`rounded-xl bg-[#11131A] border overflow-hidden flex flex-col ${rStyle.borderColor} ${rStyle.glowClass}`}
                >
                  <div className="aspect-square w-full bg-[#0A0B0F] overflow-hidden border-b border-white/[0.06] relative">
                    <SafeImage
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      fallbackIcon={item.iconName}
                      fallbackLabel={item.name}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setDeleteTarget({
                          kind: 'collectible',
                          id: item.id,
                          name: item.name,
                          hasLinkedTransaction: Boolean(item.transactionId),
                        })
                      }
                      aria-label={`Delete collectible ${item.name}`}
                      className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-black/65 hover:bg-rose-600/80 text-slate-300 hover:text-white border border-white/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="p-4 space-y-2 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className={rStyle.textColor}>{item.rarity}</span>
                        <span className="text-slate-500">{item.category}</span>
                      </div>
                      <h3 className="mt-1 font-[var(--font-display)] text-base font-semibold text-[#EDEFF5]">
                        {item.name}
                      </h3>
                      <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                        {item.description}
                      </p>
                      {item.sourceLabel && (
                        <div className="mt-2 text-[11px] text-slate-500">
                          Earned from: {item.sourceLabel}
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-white/[0.05] text-[11px] text-slate-500 italic">
                      &ldquo;{item.lore}&rdquo;
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Profile Portraits */}
      <section className="space-y-4">
        <div>
          <h2 className="font-[var(--font-display)] text-lg font-semibold text-[#EDEFF5]">
            Character Portraits
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Rare portrait artwork earned through exceptional experiences.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {state.portraits.map((por) => {
            const isEquipped = state.player.equippedPortraitId === por.id;
            const rStyle = RARITY_STYLES[por.rarity];
            return (
              <div
                key={por.id}
                className="p-4 rounded-xl bg-[#11131A] border border-white/[0.08] flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-[#0A0B0F] shrink-0 border border-white/10">
                      <SafeImage
                        src={por.imageUrl}
                        alt={por.name}
                        className="w-full h-full object-cover"
                        fallbackIcon="User"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className={`text-[11px] font-mono ${rStyle.textColor}`}>
                        {por.rarity} Portrait
                      </div>
                      <div className="text-sm font-semibold text-[#EDEFF5] truncate">
                        {por.name}
                      </div>
                    </div>
                  </div>

                  {state.portraits.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setDeleteTarget({
                          kind: 'portrait',
                          id: por.id,
                          name: por.name,
                          hasLinkedTransaction: false,
                        })
                      }
                      aria-label={`Delete portrait ${por.name}`}
                      className="p-1 rounded text-slate-500 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <p className="text-xs text-slate-400">{por.description}</p>

                <button
                  type="button"
                  onClick={() => equipPortrait(por.id)}
                  disabled={isEquipped}
                  className={`w-full py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    isEquipped
                      ? 'bg-amber-400/15 text-amber-300 border border-amber-400/40 cursor-default'
                      : 'bg-white/[0.06] hover:bg-violet-600 text-slate-200 hover:text-white'
                  }`}
                >
                  {isEquipped ? 'Equipped' : 'Equip Portrait'}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Profile Frame Cosmetics */}
      <section className="space-y-4">
        <div>
          <h2 className="font-[var(--font-display)] text-lg font-semibold text-[#EDEFF5]">
            Portrait Frame Cosmetics
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Customize the border framing your character portrait across the Chronicle.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {state.cosmetics.map((cos) => {
            const isEquipped = state.player.equippedCosmeticId === cos.id;
            const rStyle = RARITY_STYLES[cos.rarity];
            return (
              <div
                key={cos.id}
                className={`p-4 rounded-xl border flex flex-col justify-between gap-4 ${
                  cos.unlocked
                    ? 'bg-[#11131A] border-white/[0.08]'
                    : 'bg-[#0C0E14] border-white/[0.05] opacity-70'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-11 h-11 rounded-lg overflow-hidden bg-[#0A0B0F] shrink-0 ${cos.borderClass}`}
                      >
                        <SafeImage
                          src={state.player.avatarUrl}
                          alt={cos.name}
                          className="w-full h-full object-cover"
                          fallbackIcon="User"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className={`text-[11px] font-mono ${rStyle.textColor}`}>
                          {cos.rarity}
                        </div>
                        <div className="text-sm font-semibold text-[#EDEFF5] truncate">
                          {cos.name}
                        </div>
                      </div>
                    </div>

                    {state.cosmetics.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setDeleteTarget({
                            kind: 'cosmetic',
                            id: cos.id,
                            name: cos.name,
                            hasLinkedTransaction: false,
                          })
                        }
                        aria-label={`Delete frame ${cos.name}`}
                        className="p-1 rounded text-slate-500 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">{cos.description}</p>
                </div>

                {cos.unlocked ? (
                  <button
                    type="button"
                    onClick={() => equipCosmetic(cos.id)}
                    disabled={isEquipped}
                    className={`w-full py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      isEquipped
                        ? 'bg-amber-400/15 text-amber-300 border border-amber-400/40 cursor-default'
                        : 'bg-white/[0.06] hover:bg-violet-600 text-slate-200 hover:text-white'
                    }`}
                  >
                    {isEquipped ? 'Equipped' : 'Equip Frame'}
                  </button>
                ) : (
                  <div className="text-center py-1.5 text-xs font-mono text-slate-500">
                    Locked
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Collection Item Deletion Confirmation Dialog */}
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
                  Historical activity records will be preserved. Choose how to remove this item from your collection:
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
                  Removes the item from your inventory while preserving all earned EXP and attributes.
                </div>
              </button>

              {deleteTarget.hasLinkedTransaction && (
                <button
                  type="button"
                  onClick={() => handleConfirmDelete('reverse_reward')}
                  className="w-full text-left p-3.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/35 transition-colors cursor-pointer"
                >
                  <div className="text-sm font-medium text-rose-200">
                    Remove &amp; reverse associated reward
                  </div>
                  <div className="text-xs text-rose-200/75 mt-0.5">
                    Removes the item and reverses the linked reward transaction in your progression ledger.
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
