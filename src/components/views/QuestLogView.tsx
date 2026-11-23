import React, { useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Plus,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Sparkles,
  X,
} from 'lucide-react';
import { useGame } from '../../context/GameContext';
import {
  generateQuestFromDescription,
  QUEST_SAMPLE_GOALS,
} from '../../services/gameMasterService';
import { GeneratedQuestDraft } from '../../types/rpg';
import { DIFFICULTY_TEXT_COLORS, formatDelta } from '../../utils/leveling';

export const QuestLogView: React.FC = () => {
  const { state, toggleQuestMilestone, reopenQuest, createQuestFromDraft } = useGame();
  const [filterTab, setFilterTab] = useState<'active' | 'completed'>('active');
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);

  // AI Quest Forge State
  const [goalInput, setGoalInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [draft, setDraft] = useState<GeneratedQuestDraft | null>(null);

  // Reopen confirmation dialog
  const [reopenTargetId, setReopenTargetId] = useState<string | null>(null);

  const filteredQuests = state.quests.filter((q) => q.status === filterTab);
  const activeCount = state.quests.filter((q) => q.status === 'active').length;
  const completedCount = state.quests.filter((q) => q.status === 'completed').length;

  const reopenTargetQuest = state.quests.find((q) => q.id === reopenTargetId);

  const handleGenerateQuest = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!goalInput.trim() || isGenerating) return;
    setIsGenerating(true);
    setGenError(null);
    try {
      const response = await generateQuestFromDescription(goalInput.trim(), {
        playerLevel: state.player.level,
        existingQuestTitles: state.quests.map((q) => q.title),
      });
      if (response.status === 'queued') {
        setGenError(
          response.message ||
            'AI models are currently at free capacity. Your quest request has been saved in the pending queue.'
        );
      } else if (response.draft) {
        setDraft(response.draft);
      }
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Quest generation failed.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAcceptDraft = () => {
    if (!draft) return;
    createQuestFromDraft(draft);
    setDraft(null);
    setGoalInput('');
    setIsCreatorOpen(false);
    setFilterTab('active');
  };

  const handleCloseCreator = () => {
    setIsCreatorOpen(false);
    setDraft(null);
    setGenError(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/[0.06]">
        <div>
          <h1 className="font-[var(--font-display)] text-2xl font-bold text-[#EDEFF5]">
            Quest Log
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Describe any personal goal to forge an AI-designed RPG quest with balanced milestones and strictly relevant attributes.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreatorOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Forge New Quest</span>
        </button>
      </div>

      {/* Segmented Status Tabs */}
      <div className="inline-flex items-center gap-1 p-1 bg-[#11131A] border border-white/[0.07] rounded-lg">
        <button
          type="button"
          onClick={() => setFilterTab('active')}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
            filterTab === 'active'
              ? 'bg-violet-600/25 text-violet-200 border border-violet-500/35'
              : 'text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          Active Quests ({activeCount})
        </button>
        <button
          type="button"
          onClick={() => setFilterTab('completed')}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
            filterTab === 'completed'
              ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/30'
              : 'text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          Completed ({completedCount})
        </button>
      </div>

      {/* Quests List */}
      {filteredQuests.length === 0 ? (
        <div className="p-10 rounded-xl bg-[#11131A] border border-white/[0.07] text-center space-y-3">
          <ScrollText className="w-8 h-8 text-slate-500 mx-auto" />
          <div className="text-sm font-medium text-slate-300">
            No {filterTab} quests in your chronicle yet.
          </div>
          <button
            type="button"
            onClick={() => setIsCreatorOpen(true)}
            className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium cursor-pointer"
          >
            Forge a Quest
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredQuests.map((quest) => {
            const doneCount = quest.milestones.filter((m) => m.completed).length;
            const totalCount = quest.milestones.length;
            const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

            return (
              <div
                key={quest.id}
                className="p-5 sm:p-6 rounded-xl bg-[#11131A] border border-white/[0.07] space-y-4"
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="text-xs font-mono text-slate-400 flex flex-wrap items-center gap-2">
                      <span className="text-violet-300">{quest.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className={DIFFICULTY_TEXT_COLORS[quest.difficulty || 'Medium']}>
                        {quest.difficulty || 'Medium'}
                      </span>
                      {quest.estimatedDuration && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {quest.estimatedDuration}
                          </span>
                        </>
                      )}
                      {quest.completedAt && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-emerald-400">
                            Completed {quest.completedAt}
                          </span>
                        </>
                      )}
                    </div>
                    <h2 className="font-[var(--font-display)] text-lg sm:text-xl font-semibold text-[#EDEFF5]">
                      {quest.title}
                    </h2>
                    <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
                      {quest.loreDescription}
                    </p>
                  </div>

                  {/* Rewards & Reopen Controls */}
                  <div className="md:text-right shrink-0 space-y-1.5">
                    <div className="text-sm font-mono font-semibold text-amber-300 tabular-nums">
                      +{quest.expReward} EXP Completion
                    </div>
                    <div className="text-xs font-mono text-slate-400">
                      {quest.attributeRewards
                        .map((a) => `${a.name} ${formatDelta(a.delta)}`)
                        .join(' · ')}
                    </div>
                    {quest.status === 'completed' && (
                      <button
                        type="button"
                        onClick={() => setReopenTargetId(quest.id)}
                        className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-amber-500/15 border border-white/10 hover:border-amber-400/40 text-xs text-slate-300 hover:text-amber-200 transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reopen Quest</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Objectives & Criteria */}
                {(quest.mainObjectives?.length > 0 || quest.completionCriteria) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 text-xs">
                    {quest.mainObjectives?.length > 0 && (
                      <div className="p-3 rounded-lg bg-[#0B0D14] border border-white/[0.05] space-y-1">
                        <div className="font-mono text-slate-400">Main Objectives</div>
                        <ul className="space-y-1 text-slate-300 list-disc list-inside">
                          {quest.mainObjectives.map((obj, idx) => (
                            <li key={idx}>{obj}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="p-3 rounded-lg bg-[#0B0D14] border border-white/[0.05] space-y-1">
                      <div className="font-mono text-slate-400">Completion Criteria</div>
                      <p className="text-slate-300 leading-relaxed">
                        {quest.completionCriteria || 'Complete all milestones cleanly.'}
                      </p>
                      {quest.sideObjectives?.length > 0 && (
                        <div className="pt-1 text-slate-400">
                          Optional: {quest.sideObjectives.join(' · ')}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Progress Bar */}
                <div>
                  <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-1.5 tabular-nums">
                    <span>
                      Milestones: {doneCount} / {totalCount}
                    </span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-[#1B1F2E] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        quest.status === 'completed'
                          ? 'bg-emerald-400'
                          : 'bg-gradient-to-r from-violet-500 to-amber-300'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Interactive Milestones */}
                <div className="pt-2 divide-y divide-white/[0.05] border-t border-white/[0.05]">
                  {quest.milestones.map((ms) => (
                    <button
                      key={ms.id}
                      type="button"
                      onClick={() => toggleQuestMilestone(quest.id, ms.id)}
                      className="w-full py-2.5 flex items-center justify-between gap-3 text-left group cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {ms.completed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 text-slate-500 group-hover:text-violet-400 shrink-0 transition-colors" />
                        )}
                        <span
                          className={`text-sm transition-colors ${
                            ms.completed
                              ? 'text-slate-500 line-through'
                              : 'text-slate-200 group-hover:text-white'
                          }`}
                        >
                          {ms.title}
                        </span>
                      </div>
                      <span className="text-xs font-mono text-slate-500 tabular-nums shrink-0">
                        {ms.completed ? 'Undo' : `+${ms.expBonus} EXP`}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* AI Quest Generation Modal */}
      {isCreatorOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={handleCloseCreator}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-[#11131A] border border-white/[0.09] rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[88vh]"
          >
            <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between shrink-0">
              <div>
                <h2 className="font-[var(--font-display)] text-lg font-semibold text-[#EDEFF5]">
                  Forge New Quest with AI
                </h2>
                <p className="text-xs text-slate-400">
                  Describe any real-world goal—AI will structure objectives, milestones, and balanced rewards.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseCreator}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {/* Step 1: Natural Language Description */}
              <form onSubmit={handleGenerateQuest} className="space-y-3">
                <label className="block text-xs font-medium text-slate-300">
                  What do you want to accomplish?
                </label>
                <textarea
                  rows={3}
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  placeholder="e.g., Learn Python Pandas and complete a data analysis project."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0B0F] border border-white/10 text-sm text-[#EDEFF5] placeholder:text-slate-500 focus:outline-none focus:border-violet-400"
                />

                <div className="flex flex-wrap gap-1.5">
                  {QUEST_SAMPLE_GOALS.map((sample, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setGoalInput(sample)}
                      className="text-[11px] px-2.5 py-1 rounded-md bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.07] text-slate-300 hover:text-amber-200 transition-colors cursor-pointer"
                    >
                      {sample}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2.5 pt-1">
                  <button
                    type="submit"
                    disabled={!goalInput.trim() || isGenerating}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-45 text-white text-xs sm:text-sm font-medium transition-colors cursor-pointer"
                  >
                    {isGenerating ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    <span>
                      {isGenerating
                        ? 'Analyzing Goal...'
                        : draft
                          ? 'Regenerate Quest'
                          : 'Generate Quest Blueprint'}
                    </span>
                  </button>
                </div>
              </form>

              {genError && (
                <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/35 text-xs text-rose-200 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{genError}</span>
                </div>
              )}

              {/* Step 2: Editable Quest Blueprint Preview */}
              {draft && (
                <div className="p-5 rounded-xl bg-[#0C0E14] border border-amber-400/30 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/[0.06]">
                    <div className="text-xs font-mono text-amber-300">
                      QUEST BLUEPRINT PREVIEW (EDITABLE)
                    </div>
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span className={DIFFICULTY_TEXT_COLORS[draft.difficulty]}>
                        {draft.difficulty}
                      </span>
                      <span className="text-slate-600">·</span>
                      <span className="text-slate-300">{draft.estimatedDuration}</span>
                      <span className="text-slate-600">·</span>
                      <span className="text-amber-300 font-semibold">
                        +{draft.expReward} EXP
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-mono text-slate-400 mb-1">
                        Title
                      </label>
                      <input
                        type="text"
                        value={draft.title}
                        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-[#11131A] border border-white/10 text-sm font-medium text-[#EDEFF5]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-mono text-slate-400 mb-1">
                        Description
                      </label>
                      <textarea
                        rows={2}
                        value={draft.loreDescription}
                        onChange={(e) =>
                          setDraft({ ...draft, loreDescription: e.target.value })
                        }
                        className="w-full px-3 py-2 rounded-lg bg-[#11131A] border border-white/10 text-xs text-slate-200"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-mono text-slate-400 mb-1">
                          Category
                        </label>
                        <input
                          type="text"
                          value={draft.category}
                          onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                          className="w-full px-3 py-1.5 rounded-lg bg-[#11131A] border border-white/10 text-xs text-[#EDEFF5]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-mono text-slate-400 mb-1">
                          Estimated Duration
                        </label>
                        <input
                          type="text"
                          value={draft.estimatedDuration}
                          onChange={(e) =>
                            setDraft({ ...draft, estimatedDuration: e.target.value })
                          }
                          className="w-full px-3 py-1.5 rounded-lg bg-[#11131A] border border-white/10 text-xs text-[#EDEFF5]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-mono text-slate-400 mb-1">
                        Completion Criteria
                      </label>
                      <input
                        type="text"
                        value={draft.completionCriteria}
                        onChange={(e) =>
                          setDraft({ ...draft, completionCriteria: e.target.value })
                        }
                        className="w-full px-3 py-1.5 rounded-lg bg-[#11131A] border border-white/10 text-xs text-slate-200"
                      />
                    </div>

                    <div>
                      <div className="text-[11px] font-mono text-slate-400 mb-1.5">
                        Milestones (Editable)
                      </div>
                      <div className="space-y-2">
                        {draft.milestones.map((m, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={m.title}
                              onChange={(e) => {
                                const next = [...draft.milestones];
                                next[idx] = { ...next[idx], title: e.target.value };
                                setDraft({ ...draft, milestones: next });
                              }}
                              className="flex-1 px-3 py-1.5 rounded-lg bg-[#11131A] border border-white/10 text-xs text-[#EDEFF5]"
                            />
                            <span className="text-[11px] font-mono text-slate-400 shrink-0 tabular-nums">
                              +{m.expBonus} EXP
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Attribute Rewards & AI Reasoning */}
                    <div className="p-3 rounded-lg bg-[#11131A] border border-white/[0.06] space-y-1.5">
                      <div className="text-[11px] font-mono text-slate-400">
                        Selected Attribute Rewards
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs font-mono text-emerald-400">
                        {draft.attributeRewards.map((a) => (
                          <span key={a.key}>
                            {a.name} {formatDelta(a.delta)}
                          </span>
                        ))}
                      </div>
                      <p className="text-[11px] text-slate-400">{draft.aiReasoning}</p>
                      {draft.possibleCollectibleHint && (
                        <p className="text-[11px] text-amber-300/90">
                          Rare Drop Possibility: {draft.possibleCollectibleHint}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-white/[0.06] flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleCloseCreator}
                className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-sm font-medium cursor-pointer"
              >
                {draft ? 'Reject' : 'Cancel'}
              </button>
              {draft && (
                <button
                  type="button"
                  onClick={handleAcceptDraft}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Accept &amp; Add Quest</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reopen Completed Quest Confirmation Dialog */}
      {reopenTargetQuest && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          onClick={() => setReopenTargetId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#11131A] border border-white/[0.09] rounded-xl p-6 space-y-4 shadow-2xl"
          >
            <h3 className="font-[var(--font-display)] text-base font-semibold text-[#EDEFF5]">
              Reopen Completed Quest?
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Reopening &ldquo;{reopenTargetQuest.title}&rdquo; will restore it to Active status, uncheck the final milestone, and reverse its completion reward ({reopenTargetQuest.expReward} EXP and associated attribute changes) in your transaction ledger.
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setReopenTargetId(null)}
                className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium cursor-pointer"
              >
                Keep Completed
              </button>
              <button
                type="button"
                onClick={() => {
                  reopenQuest(reopenTargetQuest.id);
                  setReopenTargetId(null);
                  setFilterTab('active');
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
