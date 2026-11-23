import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Award, Crown, Sparkles, X } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { RARITY_STYLES } from '../../utils/leveling';
import { RpgIcon, SafeImage } from '../common/RpgIcon';

export const RewardCelebration: React.FC = () => {
  const { celebration, dismissCelebration, state } = useGame();

  if (!celebration) return null;

  const { levelUpTo, unlockedAchievement, acquiredCollectible, expGained } = celebration;
  const achRarity = unlockedAchievement
    ? RARITY_STYLES[unlockedAchievement.rarity]
    : null;
  const colRarity = acquiredCollectible
    ? RARITY_STYLES[acquiredCollectible.rarity]
    : null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
        <motion.div
          initial={state.settings.reducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.25 }}
          className="relative w-full max-w-md bg-[#131520] border border-amber-400/40 rounded-xl p-6 text-center shadow-[0_0_50px_-10px_rgba(212,168,83,0.45)]"
        >
          <button
            type="button"
            onClick={dismissCelebration}
            aria-label="Close celebration"
            className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          {levelUpTo ? (
            <div className="space-y-3">
              <div className="mx-auto w-14 h-14 rounded-full bg-amber-400/15 border border-amber-400/40 flex items-center justify-center text-amber-300">
                <Crown className="w-7 h-7" />
              </div>
              <div className="text-xs font-mono text-amber-300/90 tracking-widest">
                LEVEL ASCENSION
              </div>
              <h2 className="font-[var(--font-display)] text-2xl font-bold text-[#EDEFF5]">
                Reached Level {levelUpTo}
              </h2>
              <p className="text-sm text-slate-300">
                Your lived experiences have elevated {state.player.name} to a new tier of mastery.
              </p>
            </div>
          ) : acquiredCollectible ? (
            <div className="space-y-2">
              <div className="mx-auto w-12 h-12 rounded-full bg-amber-400/15 border border-amber-400/40 flex items-center justify-center text-amber-300">
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="text-xs font-mono text-amber-300 tracking-wider">
                RARE COLLECTIBLE ACQUIRED
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="mx-auto w-12 h-12 rounded-full bg-violet-500/15 border border-violet-400/40 flex items-center justify-center text-violet-300">
                <Award className="w-6 h-6" />
              </div>
              <div className="text-xs font-mono text-violet-300">
                ACHIEVEMENT UNLOCKED
              </div>
            </div>
          )}

          {acquiredCollectible && colRarity && (
            <div
              className={`mt-5 rounded-xl border overflow-hidden text-left ${colRarity.borderColor} ${colRarity.subtleBg} ${colRarity.glowClass}`}
            >
              <div className="aspect-square max-h-52 w-full bg-[#0A0B0F] overflow-hidden border-b border-white/[0.08]">
                <SafeImage
                  src={acquiredCollectible.imageUrl}
                  alt={acquiredCollectible.name}
                  className="w-full h-full object-contain"
                  fallbackIcon={acquiredCollectible.iconName}
                  fallbackLabel={acquiredCollectible.name}
                />
              </div>
              <div className="p-4 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-[var(--font-display)] text-base font-semibold text-[#EDEFF5]">
                    {acquiredCollectible.name}
                  </span>
                  <span className={`text-[11px] font-mono ${colRarity.textColor}`}>
                    {acquiredCollectible.rarity} · {acquiredCollectible.category}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {acquiredCollectible.description}
                </p>
                <p className="text-[11px] text-slate-400 italic">
                  &ldquo;{acquiredCollectible.lore}&rdquo;
                </p>
              </div>
            </div>
          )}

          {unlockedAchievement && achRarity && (
            <div
              className={`mt-5 p-4 rounded-lg border text-left ${achRarity.borderColor} ${achRarity.subtleBg} ${achRarity.glowClass}`}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center border border-white/10 shrink-0"
                  style={{ color: achRarity.accentHex }}
                >
                  <RpgIcon name={unlockedAchievement.iconName} className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-[var(--font-display)] text-sm font-semibold text-[#EDEFF5]">
                      {unlockedAchievement.name}
                    </span>
                    <span className={`text-[11px] font-mono ${achRarity.textColor}`}>
                      {unlockedAchievement.rarity}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    {unlockedAchievement.description}
                  </p>
                </div>
              </div>
            </div>
          )}

          {expGained > 0 && (
            <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between text-xs font-mono text-slate-400">
              <span>Total Earned</span>
              <span className="text-amber-300 font-semibold tabular-nums">
                +{expGained} EXP
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={dismissCelebration}
            className="mt-5 w-full py-2.5 px-4 rounded-lg bg-amber-500/90 hover:bg-amber-400 text-[#0A0B0F] font-semibold text-sm transition-colors cursor-pointer"
          >
            Continue Chronicle
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
