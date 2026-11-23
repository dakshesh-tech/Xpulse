import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, Check, Clock, MessageSquarePlus, Mic, MicOff, RefreshCw, Send, Sparkles, X } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { GM_AVATAR_URL } from '../../data/initialGameState';
import {
  evaluateExperienceWithGM,
  fetchPendingAITasks,
  GM_SAMPLE_EXPERIENCES,
  PendingAITask,
  retryPendingAITask,
} from '../../services/gameMasterService';
import { GMEvaluationProposal, GMMessage } from '../../types/rpg';
import { DIFFICULTY_TEXT_COLORS, formatDelta, getLevelFromExp } from '../../utils/leveling';
import { SafeImage } from '../common/RpgIcon';

export const GameMasterModal: React.FC = () => {
  const {
    state,
    isGMModalOpen,
    closeGMModal,
    gmPrefillPrompt,
    applyGMProposal,
  } = useGame();

  const [messages, setMessages] = useState<GMMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failedSubmission, setFailedSubmission] = useState<{
    text: string;
    clarificationContext?: string;
  } | null>(null);
  const [reviewingTitle, setReviewingTitle] = useState<string | null>(null);
  const [queuedTask, setQueuedTask] = useState<PendingAITask | null>(null);
  const [pendingClarificationSource, setPendingClarificationSource] = useState<
    string | undefined
  >(undefined);
  const [isListeningVisual, setIsListeningVisual] = useState(false);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (isGMModalOpen) {
      setMessages([
        {
          id: 'gm_welcome',
          sender: 'gm',
          text: `Greetings, ${state.player.name}. Tell me what you experienced today in the real world—whether a breakthrough, a quiet step, or a missed commitment—and I will evaluate it fairly against your character.`,
          timestamp: 'Game Master',
        },
      ]);
      setInputText(gmPrefillPrompt || '');
      setPendingClarificationSource(undefined);
      setReviewingTitle(null);
      setFailedSubmission(null);
      setQueuedTask(null);
      setIsListeningVisual(false);
      setErrorMessage(null);
    }
  }, [isGMModalOpen, gmPrefillPrompt, state.player.name]);

  // Poll queued Chronicle evaluation while modal is open so resolved tasks appear automatically
  useEffect(() => {
    if (!isGMModalOpen || !queuedTask) return;
    const interval = window.setInterval(async () => {
      try {
        const tasks = await fetchPendingAITasks();
        const match = tasks.find((t) => t.id === queuedTask.id);
        if (!match) return;
        if (match.status === 'Completed' && match.result) {
          const res = match.result as {
            type?: string;
            message?: string;
            proposal?: GMEvaluationProposal;
          };
          if (res.proposal) {
            const currentLevel = getLevelFromExp(state.player.totalExp);
            const projectedLevel = getLevelFromExp(
              Math.max(0, state.player.totalExp + res.proposal.expEarned)
            );
            const enrichedProposal: GMEvaluationProposal = {
              ...res.proposal,
              wouldLevelUpTo: projectedLevel > currentLevel ? projectedLevel : undefined,
            };
            setMessages((prev) => [
              ...prev,
              {
                id: `gm_${Date.now()}`,
                sender: 'gm',
                text: res.message || 'Queued Chronicle evaluated.',
                timestamp: 'Game Master · Chronicle Analysis',
                proposal: enrichedProposal,
              },
            ]);
            setQueuedTask(null);
          }
        } else if (match.status === 'Awaiting user input' && match.result) {
          const res = match.result as { message?: string };
          setMessages((prev) => [
            ...prev,
            {
              id: `gm_${Date.now()}`,
              sender: 'gm',
              text: res.message || 'Please clarify your Chronicle entry.',
              timestamp: 'Game Master · Inquiry',
              isClarifyingQuestion: true,
            },
          ]);
          setQueuedTask(null);
        } else {
          setQueuedTask(match);
        }
      } catch {
        // Ignore transient poll errors
      }
    }, 10000);
    return () => window.clearInterval(interval);
  }, [isGMModalOpen, queuedTask, state.player.totalExp]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isEvaluating, errorMessage, queuedTask]);

  if (!isGMModalOpen) return null;

  const runEvaluation = async (
    textToEvaluate: string,
    clarificationCtx?: string,
    appendPlayerBubble = true
  ) => {
    const trimmed = textToEvaluate.trim();
    if (!trimmed || isEvaluating) return;

    if (appendPlayerBubble) {
      const playerMsg: GMMessage = {
        id: `p_${Date.now()}`,
        sender: 'player',
        text: trimmed,
        timestamp: 'You',
      };
      setMessages((prev) => [...prev, playerMsg]);
    }

    setIsListeningVisual(false);
    setErrorMessage(null);
    setFailedSubmission(null);
    setIsEvaluating(true);

    try {
      const today = new Date().toISOString().slice(0, 10);
      const recentSameDay = state.activities.filter((a) => a.date === today);

      const response = await evaluateExperienceWithGM(
        trimmed,
        state.player.name,
        recentSameDay,
        clarificationCtx
      );

      // Clear input only once the evaluation is accepted/queued
      setInputText('');
      setReviewingTitle(null);

      if (response.type === 'queued' && response.task) {
        setQueuedTask(response.task);
        setMessages((prev) => [
          ...prev,
          {
            id: `gm_q_${Date.now()}`,
            sender: 'gm',
            text:
              response.message ||
              'AI services are currently unavailable. Your Chronicle has been safely saved and is waiting for evaluation. No progression changes have been applied.',
            timestamp: 'Game Master · Saved in Pending Queue',
          },
        ]);
      } else if (response.type === 'clarification') {
        setPendingClarificationSource(trimmed);
        setMessages((prev) => [
          ...prev,
          {
            id: `gm_${Date.now()}`,
            sender: 'gm',
            text: response.message,
            timestamp: 'Game Master · Inquiry',
            isClarifyingQuestion: true,
          },
        ]);
      } else if (response.proposal) {
        setPendingClarificationSource(undefined);
        const currentLevel = getLevelFromExp(state.player.totalExp);
        const projectedLevel = getLevelFromExp(
          Math.max(0, state.player.totalExp + response.proposal.expEarned)
        );
        const enrichedProposal: GMEvaluationProposal = {
          ...response.proposal,
          wouldLevelUpTo: projectedLevel > currentLevel ? projectedLevel : undefined,
        };

        setMessages((prev) => [
          ...prev,
          {
            id: `gm_${Date.now()}`,
            sender: 'gm',
            text: response.message,
            timestamp: 'Game Master · Chronicle Analysis',
            proposal: enrichedProposal,
          },
        ]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to evaluate experience right now.';
      setErrorMessage(msg);
      setFailedSubmission({ text: trimmed, clarificationContext: clarificationCtx });
      // Preserve user's Chronicle text in the composer if they haven't replaced it
      setInputText((prev) => (prev.trim() ? prev : trimmed));
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleRetryQueuedTask = async () => {
    if (!queuedTask || isEvaluating) return;
    setIsEvaluating(true);
    try {
      const updated = await retryPendingAITask(queuedTask.id);
      if (updated?.status === 'Completed' && updated.result) {
        const res = updated.result as { message?: string; proposal?: GMEvaluationProposal };
        if (res.proposal) {
          const currentLevel = getLevelFromExp(state.player.totalExp);
          const projectedLevel = getLevelFromExp(
            Math.max(0, state.player.totalExp + res.proposal.expEarned)
          );
          const enrichedProposal: GMEvaluationProposal = {
            ...res.proposal,
            wouldLevelUpTo: projectedLevel > currentLevel ? projectedLevel : undefined,
          };
          setMessages((prev) => [
            ...prev,
            {
              id: `gm_${Date.now()}`,
              sender: 'gm',
              text: res.message || 'Queued Chronicle evaluated.',
              timestamp: 'Game Master · Chronicle Analysis',
              proposal: enrichedProposal,
            },
          ]);
          setQueuedTask(null);
        }
      } else if (updated) {
        setQueuedTask(updated);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Retry failed.');
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || isEvaluating) return;
    const isSameFailedRetry = failedSubmission && failedSubmission.text === trimmed;
    await runEvaluation(
      trimmed,
      pendingClarificationSource,
      !isSameFailedRetry
    );
  };

  const handleRetryFailed = async () => {
    if (!failedSubmission || isEvaluating) return;
    await runEvaluation(
      failedSubmission.text,
      failedSubmission.clarificationContext,
      false
    );
  };

  const handleApproveProposal = (messageId: string, proposal: GMEvaluationProposal) => {
    if (proposal.status !== 'pending') return;
    applyGMProposal(proposal);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId && m.proposal
          ? { ...m, proposal: { ...m.proposal, status: 'approved' } }
          : m
      )
    );
  };

  const handleDiscardProposal = (messageId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId && m.proposal
          ? { ...m, proposal: { ...m.proposal, status: 'discarded' } }
          : m
      )
    );
  };

  const handleReviewProposal = (messageId: string, proposal: GMEvaluationProposal) => {
    if (proposal.status !== 'pending') return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId && m.proposal
          ? { ...m, proposal: { ...m.proposal, status: 'discarded' } }
          : m
      )
    );
    setPendingClarificationSource(proposal.rawInput);
    setReviewingTitle(proposal.summaryTitle);
    setErrorMessage(null);
    setTimeout(() => textareaRef.current?.focus(), 40);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm"
      onClick={closeGMModal}
    >
      <motion.div
        initial={state.settings.reducedMotion ? { opacity: 1 } : { opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-3xl h-[88vh] max-h-[800px] bg-[#0F1118] border border-white/[0.09] rounded-xl flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.07] bg-[#121520] flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-lg overflow-hidden ring-1 ring-violet-400/50 shrink-0">
              <SafeImage
                src={GM_AVATAR_URL}
                alt="AI Game Master Oracle"
                className="w-full h-full object-cover"
                fallbackIcon="Compass"
              />
            </div>
            <div>
              <h2 className="font-[var(--font-display)] text-base sm:text-lg font-semibold text-[#EDEFF5]">
                AI Game Master
              </h2>
              <p className="text-xs text-slate-400">
                Strict attribute validation · Long-term balanced economy
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeGMModal}
            aria-label="Close Game Master"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conversation History */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className={`flex gap-3 ${
                  msg.sender === 'player' ? 'justify-end' : 'justify-start'
                }`}
              >
                {msg.sender === 'gm' && (
                  <div className="w-8 h-8 rounded-lg overflow-hidden ring-1 ring-violet-400/35 shrink-0 mt-0.5">
                    <SafeImage
                      src={GM_AVATAR_URL}
                      alt="Game Master"
                      className="w-full h-full object-cover"
                      fallbackIcon="Compass"
                    />
                  </div>
                )}

                <div
                  className={`max-w-[88%] space-y-3 ${
                    msg.sender === 'player' ? 'items-end flex flex-col' : ''
                  }`}
                >
                  <div
                    className={`px-4 py-3 rounded-xl text-sm leading-relaxed ${
                      msg.sender === 'player'
                        ? 'bg-violet-600/25 border border-violet-400/30 text-[#EDEFF5]'
                        : 'bg-[#161923] border border-white/[0.07] text-slate-200'
                    }`}
                  >
                    <div className="text-[11px] font-mono text-slate-400 mb-1">
                      {msg.timestamp}
                    </div>
                    <p>{msg.text}</p>
                  </div>

                  {/* Structured Experience Analysis Approval Panel */}
                  {msg.proposal && (
                    <div
                      className={`w-full bg-[#131622] border rounded-xl p-4 sm:p-5 space-y-4 ${
                        msg.proposal.sentiment === 'negative'
                          ? 'border-rose-500/35'
                          : msg.proposal.sentiment === 'neutral'
                            ? 'border-slate-500/35'
                            : msg.proposal.sentiment === 'mixed'
                              ? 'border-amber-400/40'
                              : 'border-amber-400/30'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-white/[0.06]">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                            <span className="text-violet-300 font-semibold">
                              Chronicle Analysis
                            </span>
                            <span className="text-slate-600" aria-hidden="true">·</span>
                            <span
                              className={
                                msg.proposal.sentiment === 'negative'
                                  ? 'text-rose-300'
                                  : msg.proposal.sentiment === 'neutral'
                                    ? 'text-slate-400'
                                    : msg.proposal.sentiment === 'mixed'
                                      ? 'text-amber-300'
                                      : 'text-emerald-300'
                              }
                            >
                              {msg.proposal.sentiment.toUpperCase()}
                            </span>
                            <span className="text-slate-600" aria-hidden="true">·</span>
                            <span className={DIFFICULTY_TEXT_COLORS[msg.proposal.difficulty]}>
                              {msg.proposal.difficulty}
                            </span>
                            <span className="text-slate-600" aria-hidden="true">·</span>
                            <span className="text-slate-400">{msg.proposal.category}</span>
                            <span className="text-slate-600" aria-hidden="true">·</span>
                            <span className="text-slate-400 tabular-nums">
                              Confidence {Math.round(msg.proposal.confidence * 100)}%
                            </span>
                          </div>
                          <div className="text-sm font-semibold text-[#EDEFF5]">
                            {msg.proposal.summaryTitle}
                          </div>
                          <div className="text-xs text-slate-400">
                            Interpretation: {msg.proposal.interpretation}
                          </div>
                        </div>

                        <div className="text-right font-mono tabular-nums shrink-0">
                          <span className="text-xs text-slate-400 mr-1.5">EXP</span>
                          <span
                            className={`text-base font-semibold ${
                              msg.proposal.expEarned > 0 ? 'text-amber-300' : 'text-slate-400'
                            }`}
                          >
                            {msg.proposal.expEarned > 0
                              ? `+${msg.proposal.expEarned}`
                              : '0'}
                          </span>
                        </div>
                      </div>

                      {/* Attribute Deltas with per-trait reasoning */}
                      {msg.proposal.attributeDeltas.length > 0 ? (
                        <div className="space-y-2">
                          {msg.proposal.attributeDeltas.map((attr) => (
                            <div
                              key={attr.key}
                              className="px-3 py-2.5 rounded-lg bg-[#0B0D14] border border-white/[0.06] flex items-start justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <div className="text-xs font-medium text-slate-200">
                                  {attr.name}
                                </div>
                                {attr.reason && (
                                  <div className="text-[11px] text-slate-400 mt-0.5">
                                    {attr.reason}
                                  </div>
                                )}
                              </div>
                              <span
                                className={`text-xs font-mono font-semibold tabular-nums shrink-0 ${
                                  attr.delta < 0 ? 'text-rose-400' : 'text-emerald-400'
                                }`}
                              >
                                {formatDelta(attr.delta)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="px-3 py-2.5 rounded-lg bg-[#0B0D14] border border-white/[0.06] text-xs text-slate-400">
                          {msg.proposal.expEarned === 0
                            ? 'No EXP or attribute changes for this experience.'
                            : 'No attribute progression assigned for this entry.'}
                        </div>
                      )}

                      {/* Reasoning */}
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {msg.proposal.reasoning}
                      </p>

                      {msg.proposal.diminishingFactorApplied && (
                        <div className="text-[11px] text-amber-300/90 font-mono">
                          Diminishing returns applied for repeated trivial activity today.
                        </div>
                      )}

                      {/* Rare Collectible Drop Notice */}
                      {msg.proposal.collectibleEligible && (
                        <div className="p-3 rounded-lg border border-amber-400/35 bg-amber-500/10 text-xs text-amber-200 flex items-center gap-2">
                          <Sparkles className="w-4 h-4 shrink-0 text-amber-300" />
                          <span>
                            Rare {msg.proposal.collectibleType || 'Relic'} unlocked! Approving will forge bespoke artwork for your collection.
                          </span>
                        </div>
                      )}

                      {msg.proposal.wouldLevelUpTo && (
                        <div className="text-xs font-medium text-amber-300 flex items-center gap-2">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>
                            Approving this entry advances {state.player.name} to Level{' '}
                            {msg.proposal.wouldLevelUpTo}.
                          </span>
                        </div>
                      )}

                      {/* Approval Controls */}
                      {msg.proposal.status === 'pending' ? (
                        <div className="flex flex-wrap items-center gap-2.5 pt-1">
                          <button
                            type="button"
                            onClick={() => handleApproveProposal(msg.id, msg.proposal!)}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs sm:text-sm font-medium transition-colors cursor-pointer"
                          >
                            <Check className="w-4 h-4" />
                            <span>
                              {msg.proposal.sentiment === 'negative'
                                ? 'Accept Adjustments'
                                : msg.proposal.sentiment === 'neutral'
                                  ? 'Accept Entry'
                                  : 'Accept Rewards'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReviewProposal(msg.id, msg.proposal!)}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-200 text-xs sm:text-sm font-medium transition-colors cursor-pointer"
                          >
                            <MessageSquarePlus className="w-3.5 h-3.5" />
                            <span>Review</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDiscardProposal(msg.id)}
                            className="px-4 py-2 rounded-lg bg-white/[0.04] hover:bg-rose-500/15 text-slate-300 hover:text-rose-200 text-xs sm:text-sm font-medium transition-colors cursor-pointer"
                          >
                            Reject
                          </button>
                        </div>
                      ) : msg.proposal.status === 'approved' ? (
                        <div className="text-xs font-medium text-emerald-400 flex items-center gap-1.5 pt-1">
                          <Check className="w-4 h-4" />
                          <span>Recorded to your character chronicle.</span>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 pt-1">
                          Proposal rejected without altering character stats.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {isEvaluating && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg overflow-hidden ring-1 ring-violet-400/35 shrink-0">
                <SafeImage
                  src={GM_AVATAR_URL}
                  alt="Game Master thinking"
                  className="w-full h-full object-cover"
                  fallbackIcon="Compass"
                />
              </div>
              <div className="px-4 py-3 rounded-xl bg-[#161923] border border-white/[0.07] flex items-center gap-2 text-xs text-slate-300">
                <span>Game Master is analyzing context and validating rewards</span>
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:-0.2s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:-0.1s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" />
                </span>
              </div>
            </div>
          )}

          {queuedTask && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-400/35 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                <Clock className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-semibold">
                    Chronicle Saved in Pending Queue ({queuedTask.status})
                  </div>
                  <div className="text-amber-200/80">
                    Waiting for free AI capacity. Attempts: {queuedTask.attemptCount}/{queuedTask.maxAttempts}. No stats were modified.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRetryQueuedTask}
                disabled={isEvaluating}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-100 font-medium transition-colors cursor-pointer shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Now</span>
              </button>
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/35 text-xs text-rose-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMessage}</span>
              </div>
              {failedSubmission && (
                <button
                  type="button"
                  onClick={handleRetryFailed}
                  disabled={isEvaluating}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 text-rose-100 font-medium transition-colors cursor-pointer shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry</span>
                </button>
              )}
            </div>
          )}

          <div ref={scrollEndRef} />
        </div>

        {/* Sample Prompts Bar */}
        <div className="px-5 py-2.5 border-t border-white/[0.05] bg-[#0B0D13] flex items-center gap-2 overflow-x-auto shrink-0">
          <span className="text-[11px] text-slate-500 whitespace-nowrap shrink-0">
            Examples:
          </span>
          {GM_SAMPLE_EXPERIENCES.map((sample, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setInputText(sample)}
              className="text-xs text-slate-300 hover:text-amber-200 bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.07] rounded-md px-2.5 py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              {sample.slice(0, 44)}...
            </button>
          ))}
        </div>

        {/* Input Composer */}
        <form
          onSubmit={handleSubmit}
          className="p-4 border-t border-white/[0.07] bg-[#121520] shrink-0"
        >
          {reviewingTitle && (
            <div className="mb-2.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-400/30 flex items-center justify-between text-xs text-amber-200">
              <span>
                Reviewing &ldquo;{reviewingTitle}&rdquo; — add clarification or extra context below to re-evaluate
              </span>
              <button
                type="button"
                onClick={() => {
                  setReviewingTitle(null);
                  setPendingClarificationSource(undefined);
                }}
                className="text-amber-300 hover:text-white underline cursor-pointer ml-2 shrink-0"
              >
                Cancel Review
              </button>
            </div>
          )}

          {isListeningVisual && (
            <div className="mb-2.5 px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-400/25 flex items-center justify-between text-xs text-violet-200">
              <span>Voice capture visual preview active — speak or type below</span>
              <button
                type="button"
                onClick={() => setIsListeningVisual(false)}
                className="text-violet-300 hover:text-white underline cursor-pointer"
              >
                Stop
              </button>
            </div>
          )}

          <div className="flex items-end gap-2.5">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              placeholder={
                reviewingTitle
                  ? 'Add context, duration, or clarification for the Game Master...'
                  : 'Describe what you did, learned, built, or skipped today...'
              }
              className="flex-1 resize-none rounded-xl bg-[#0A0B0F] border border-white/10 px-4 py-3 text-sm text-[#EDEFF5] placeholder:text-slate-500 focus:outline-none focus:border-violet-400/70"
            />

            <div className="flex flex-col gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsListeningVisual((p) => !p)}
                aria-label="Toggle voice input preview"
                title="Voice input (visual preview)"
                className={`p-3 rounded-xl border transition-colors cursor-pointer ${
                  isListeningVisual
                    ? 'bg-rose-500/20 border-rose-400/50 text-rose-300'
                    : 'bg-[#0A0B0F] border-white/10 text-slate-400 hover:text-white hover:border-white/20'
                }`}
              >
                {isListeningVisual ? (
                  <MicOff className="w-4 h-4" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>

              <button
                type="submit"
                disabled={!inputText.trim() || isEvaluating}
                aria-label="Send experience to Game Master"
                className="p-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
