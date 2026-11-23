import React, { useState } from 'react';
import { Calendar, CheckCircle2, Flame, Minus, Plus, RotateCcw } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { Difficulty } from '../../types/rpg';
import { formatDelta } from '../../utils/leveling';

const DIFFICULTY_ACCENTS: Record<Difficulty, string> = {
  Apprentice: 'text-emerald-300',
  Adept: 'text-sky-300',
  Veteran: 'text-violet-300',
  Master: 'text-amber-300',
};

export const ChallengesView: React.FC = () => {
  const { state, incrementChallengeProgress, reopenChallenge } = useGame();
  const [reopenId, setReopenId] = useState<string | null>(null);

  const activeChallenges = state.challenges.filter((c) => c.status === 'active');
  const completedChallenges = state.challenges.filter((c) => c.status === 'completed');
  const reopenTarget = state.challenges.find((c) => c.id === reopenId);

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-white/[0.06]">
        <div>
          <h1 className="font-[var(--font-display)] text-2xl font-bold text-[#EDEFF5]">
            Optional Trials &amp; Challenges
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Focused, time-bounded adventures you choose to undertake. Rest days and pauses carry zero penalties.
          </p>
        </div>
        <div className="text-xs font-mono text-slate-400 tabular-nums">
          {activeChallenges.length} Active · {completedChallenges.length} Completed
        </div>
      </div>

      {/* Active Challenges */}
      <section className="space-y-4">
        <h2 className="text-xs font-mono text-violet-300 tracking-wider">
          ACTIVE TRIALS
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {activeChallenges.map((chal) => {
            const pct = Math.min(
              100,
              Math.round((chal.progressCurrent / chal.progressTarget) * 100)
            );
            return (
              <div
                key={chal.id}
                className="p-5 sm:p-6 rounded-xl bg-[#11131A] border border-white/[0.08] flex flex-col justify-between gap-5"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2 text-xs font-mono">
                    <span className={DIFFICULTY_ACCENTS[chal.difficulty]}>
                      {chal.difficulty} Trial
                    </span>
                    {chal.deadline && (
                      <span className="inline-flex items-center gap-1.5 text-slate-400 tabular-nums">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        Target: {chal.deadline}
                      </span>
                    )}
                  </div>

                  <h3 className="font-[var(--font-display)] text-lg font-semibold text-[#EDEFF5]">
                    {chal.title}
                  </h3>

                  <p className="text-sm text-slate-400 leading-relaxed">
                    {chal.description}
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between text-xs font-mono text-slate-300 mb-1.5 tabular-nums">
                      <span>
                        Progress: {chal.progressCurrent} / {chal.progressTarget}{' '}
                        {chal.unitLabel}
                      </span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-2 w-full bg-[#1B1F2E] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-violet-500 to-amber-300 rounded-full transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="pt-3 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs font-mono">
                      <span className="text-amber-300 font-semibold tabular-nums">
                        +{chal.expReward} EXP
                      </span>
                      <span className="text-slate-600 mx-2" aria-hidden="true">·</span>
                      <span className="text-slate-400">
                        {chal.attributeRewards
                          .map((a) => `${a.name} ${formatDelta(a.delta)}`)
                          .join(' · ')}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => incrementChallengeProgress(chal.id, -1)}
                        disabled={chal.progressCurrent <= 0}
                        aria-label="Decrease challenge progress"
                        className="p-2 rounded-lg bg-[#0A0B0F] border border-white/10 text-slate-400 hover:text-white disabled:opacity-35 cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => incrementChallengeProgress(chal.id, 1)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Record Progress</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Completed Challenges */}
      {completedChallenges.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xs font-mono text-emerald-300/90 tracking-wider">
            COMPLETED TRIALS
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {completedChallenges.map((chal) => (
              <div
                key={chal.id}
                className="p-5 rounded-xl bg-[#0F1219] border border-emerald-500/25 flex items-start justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-mono text-emerald-300">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Completed · {chal.difficulty}</span>
                  </div>
                  <h3 className="font-[var(--font-display)] text-base font-semibold text-[#EDEFF5]">
                    {chal.title}
                  </h3>
                  <p className="text-xs text-slate-400">{chal.description}</p>
                </div>

                <div className="text-right shrink-0 space-y-2">
                  <div className="text-xs font-mono text-amber-300 tabular-nums">
                    +{chal.expReward} EXP
                  </div>
                  <button
                    type="button"
                    onClick={() => setReopenId(chal.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/[0.05] hover:bg-amber-500/15 border border-white/10 text-[11px] text-slate-300 hover:text-amber-200 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reopen</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Non-punitive Philosophy Notice */}
      <div className="p-4 rounded-xl bg-[#0E1017] border border-white/[0.06] flex items-start gap-3 text-xs text-slate-400">
        <Flame className="w-4 h-4 text-amber-300/80 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          Honest rhythm over streak anxiety: skipping a day or letting a trial expire never deducts EXP or lowers your attributes. Real life ebbs and flows; your Chronicle honors genuine effort whenever it happens.
        </p>
      </div>

      {/* Reopen Completed Challenge Confirmation Dialog */}
      {reopenTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          onClick={() => setReopenId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#11131A] border border-white/[0.09] rounded-xl p-6 space-y-4 shadow-2xl"
          >
            <h3 className="font-[var(--font-display)] text-base font-semibold text-[#EDEFF5]">
              Reopen Completed Challenge?
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Reopening &ldquo;{reopenTarget.title}&rdquo; will step progress back by 1 {reopenTarget.unitLabel} and reverse its completion reward ({reopenTarget.expReward} EXP and attribute gains) in your ledger.
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setReopenId(null)}
                className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  reopenChallenge(reopenTarget.id);
                  setReopenId(null);
                }}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#0A0B0F] text-xs font-semibold cursor-pointer"
              >
                Reopen &amp; Reverse Reward
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
