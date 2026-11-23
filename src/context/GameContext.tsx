import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createFreshCharacterState, normalizeAndValidateGameState } from '../data/newCharacterTemplate';
import { difficultyToRarity, roundStatDelta } from '../../shared/rpgEconomy';
import {
  ApiHttpError,
  fetchCloudState,
  generateCollectibleAsset,
  saveCloudState,
} from '../services/gameMasterService';
import { useAuth } from './AuthContext';
import {
  Achievement,
  ActivityDifficulty,
  AppSettings,
  AttributeDelta,
  AttributeKey,
  Challenge,
  Collectible,
  ExperienceActivity,
  GameState,
  GeneratedQuestDraft,
  GMEvaluationProposal,
  NavSection,
  PendingCollectible,
  ProgressionTransaction,
  Quest,
  UndoToastItem,
} from '../types/rpg';
import { getLevelFromExp, playRpgSound } from '../utils/leveling';

const getUidStorageKey = (uid: string) => `chronicle_rpg_state_uid_${uid}`;
export type CloudSyncStatus = 'synced' | 'syncing' | 'offline' | 'conflict';

interface CelebrationEvent {
  id: string;
  levelUpTo?: number;
  unlockedAchievement?: Achievement;
  acquiredCollectible?: Collectible;
  expGained: number;
}

export type ActivityDeleteMode = 'record_only' | 'reverse_progression';
export type CollectionItemKind =
  | 'achievement'
  | 'collectible'
  | 'title'
  | 'portrait'
  | 'cosmetic';
export type CollectionDeleteMode = 'collection_only' | 'reverse_reward';

interface GameContextValue {
  state: GameState;
  isHydrated: boolean;
  activeNav: NavSection;
  setActiveNav: (nav: NavSection) => void;
  isGMModalOpen: boolean;
  openGMModal: (prefillPrompt?: string) => void;
  closeGMModal: () => void;
  gmPrefillPrompt: string;
  selectedAttributeKey: AttributeKey | null;
  setSelectedAttributeKey: (key: AttributeKey | null) => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  celebration: CelebrationEvent | null;
  dismissCelebration: () => void;
  undoToast: UndoToastItem | null;
  dismissUndoToast: () => void;
  undoTaskAction: (toast: UndoToastItem) => void;
  applyGMProposal: (proposal: GMEvaluationProposal) => void;
  toggleQuestMilestone: (questId: string, milestoneId: string) => void;
  reopenQuest: (questId: string) => void;
  createQuestFromDraft: (draft: GeneratedQuestDraft) => void;
  incrementChallengeProgress: (challengeId: string, amount: number) => void;
  reopenChallenge: (challengeId: string) => void;
  deleteActivities: (activityIds: string[], mode: ActivityDeleteMode) => void;
  deleteCollectionItem: (params: {
    kind: CollectionItemKind;
    id: string;
    mode: CollectionDeleteMode;
  }) => void;
  retryPendingCollectible: (pendingId: string) => Promise<void>;
  dismissPendingCollectible: (pendingId: string) => void;
  equipTitle: (titleId: string) => void;
  equipCosmetic: (cosmeticId: string) => void;
  equipPortrait: (portraitId: string) => void;
  toggleShowcaseAchievement: (achievementId: string) => void;
  updateSettings: (partial: Partial<AppSettings>) => void;
  updatePlayerName: (name: string) => void;
  resetDemoState: () => void;
  cloudSyncStatus: CloudSyncStatus;
  cloudRevision: number;
  lastSyncedAt: string | null;
  syncNow: () => Promise<void>;
  applyExternalCloudState: (nextState: GameState, nextRevision: number) => void;
}

const GameContext = createContext<GameContextValue | null>(null);

function loadUidCachedState(uid: string, fallbackName: string): GameState {
  if (typeof window === 'undefined') return createFreshCharacterState(fallbackName);
  try {
    const raw = window.localStorage.getItem(getUidStorageKey(uid));
    if (!raw) return createFreshCharacterState(fallbackName);
    return normalizeAndValidateGameState(JSON.parse(raw) as Partial<GameState>, fallbackName);
  } catch {
    return createFreshCharacterState(fallbackName);
  }
}

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, initializedProfile } = useAuth();
  const uid = user?.uid || 'anonymous';
  const fallbackName =
    initializedProfile?.state?.player?.name ||
    user?.displayName ||
    user?.email?.split('@')[0] ||
    'Adventurer';

  const [state, setState] = useState<GameState>(() =>
    initializedProfile?.state
      ? normalizeAndValidateGameState(initializedProfile.state, fallbackName)
      : loadUidCachedState(uid, fallbackName)
  );
  const [isHydrated, setIsHydrated] = useState(Boolean(initializedProfile?.state));
  const [cloudRevision, setCloudRevision] = useState<number>(initializedProfile?.revision ?? 1);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>('synced');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(
    initializedProfile?.state ? new Date().toISOString() : null
  );
  const [activeNav, setActiveNav] = useState<NavSection>('character');
  const [isGMModalOpen, setIsGMModalOpen] = useState(false);
  const [gmPrefillPrompt, setGmPrefillPrompt] = useState('');
  const [selectedAttributeKey, setSelectedAttributeKey] = useState<AttributeKey | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [celebration, setCelebration] = useState<CelebrationEvent | null>(null);
  const [undoToast, setUndoToast] = useState<UndoToastItem | null>(null);
  const undoTimerRef = useRef<number | null>(null);
  const revisionRef = useRef<number>(initializedProfile?.revision ?? 1);
  const skipNextSaveRef = useRef<boolean>(true);
  const isSavingRef = useRef<boolean>(false);

  const applyExternalCloudState = useCallback(
    (nextState: GameState, nextRevision: number) => {
      skipNextSaveRef.current = true;
      revisionRef.current = nextRevision;
      setCloudRevision(nextRevision);
      setState(normalizeAndValidateGameState(nextState, fallbackName));
      setLastSyncedAt(new Date().toISOString());
      setCloudSyncStatus('synced');
    },
    [fallbackName]
  );

  // Hydrate initial cloud state when authenticated profile changes
  useEffect(() => {
    if (!user) return;
    if (initializedProfile?.state) {
      applyExternalCloudState(initializedProfile.state, initializedProfile.revision);
      setIsHydrated(true);
      return;
    }

    let active = true;
    fetchCloudState()
      .then((res) => {
        if (!active) return;
        if (res.state) {
          applyExternalCloudState(res.state, res.revision || 1);
        }
      })
      .catch(() => {
        if (active) setCloudSyncStatus('offline');
      })
      .finally(() => {
        if (active) setIsHydrated(true);
      });

    return () => {
      active = false;
    };
  }, [user, initializedProfile, applyExternalCloudState]);

  const syncNow = useCallback(async () => {
    if (!user || isSavingRef.current) return;
    try {
      const remote = await fetchCloudState();
      if (remote.state && remote.revision > revisionRef.current) {
        applyExternalCloudState(remote.state, remote.revision);
      } else {
        setLastSyncedAt(new Date().toISOString());
        setCloudSyncStatus('synced');
      }
    } catch {
      setCloudSyncStatus('offline');
    }
  }, [user, applyExternalCloudState]);

  // Cross-device sync on window focus, visibility, and 15-second interval
  useEffect(() => {
    if (!user || !isHydrated) return;

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        void syncNow();
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    const intervalId = window.setInterval(() => {
      void syncNow();
    }, 15000);

    return () => {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.clearInterval(intervalId);
    };
  }, [user, isHydrated, syncNow]);

  // Persist to per-UID local cache and Cloud SQL PostgreSQL with optimistic concurrency
  useEffect(() => {
    if (!user) return;
    try {
      window.localStorage.setItem(getUidStorageKey(user.uid), JSON.stringify(state));
    } catch {
      // Ignore storage quota errors
    }

    if (!isHydrated) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (cancelled) return;
      isSavingRef.current = true;
      setCloudSyncStatus('syncing');
      try {
        const saved = await saveCloudState(state, revisionRef.current);
        if (cancelled) return;
        revisionRef.current = saved.revision;
        setCloudRevision(saved.revision);
        setLastSyncedAt(new Date().toISOString());
        setCloudSyncStatus('synced');
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiHttpError && err.status === 409) {
          const payload = err.payload as {
            currentState?: GameState;
            currentRevision?: number;
          };
          if (payload?.currentState && typeof payload.currentRevision === 'number') {
            applyExternalCloudState(payload.currentState, payload.currentRevision);
            setCloudSyncStatus('conflict');
            return;
          }
        }
        setCloudSyncStatus('offline');
      } finally {
        isSavingRef.current = false;
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [state, isHydrated, user, applyExternalCloudState]);

  const showUndoToast = (toast: UndoToastItem) => {
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
    }
    setUndoToast(toast);
    undoTimerRef.current = window.setTimeout(() => {
      setUndoToast(null);
    }, 9000);
  };

  const dismissUndoToast = () => {
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
    }
    setUndoToast(null);
  };

  const openGMModal = (prefillPrompt = '') => {
    setGmPrefillPrompt(prefillPrompt);
    setIsGMModalOpen(true);
  };

  const closeGMModal = () => {
    setIsGMModalOpen(false);
    setGmPrefillPrompt('');
  };

  const dismissCelebration = () => setCelebration(null);

  /**
   * Core helper: Applies an immutable transaction to player EXP, fractional attributes,
   * achievements, and daily history.
   */
  const commitTransactionToState = (
    prev: GameState,
    params: {
      txId: string;
      sourceType: ProgressionTransaction['sourceType'];
      sourceId: string;
      description: string;
      expDelta: number;
      attributeDeltas: AttributeDelta[];
      activityLabel: string;
      extraAchievement?: Achievement;
    }
  ): { nextState: GameState; leveledUpTo?: number; unlockedAch?: Achievement } => {
    const nowIso = new Date().toISOString();
    const today = nowIso.slice(0, 10);
    const todayLabel = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
    });

    const updatedAttributes = { ...prev.attributes };
    for (const d of params.attributeDeltas) {
      const attr = updatedAttributes[d.key];
      if (!attr || d.delta === 0) continue;
      const newProgress = Math.max(0, roundStatDelta(attr.progress + d.delta));
      const newValue = Math.max(0, Math.floor(newProgress));
      updatedAttributes[d.key] = {
        ...attr,
        progress: newProgress,
        value: newValue,
        recentDelta: roundStatDelta(d.delta),
        history: [
          ...attr.history,
          {
            id: `ah_${Date.now()}_${d.key}`,
            date: today,
            label: params.activityLabel,
            delta: roundStatDelta(d.delta),
            valueAfter: newProgress,
            transactionId: params.txId,
          },
        ],
      };
    }

    const txRecord: ProgressionTransaction = {
      id: params.txId,
      timestamp: nowIso,
      date: today,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      description: params.description,
      expDelta: params.expDelta,
      attributeDeltas: params.attributeDeltas,
      reversed: false,
    };

    let bonusAchExp = 0;
    let unlockedAch: Achievement | undefined = params.extraAchievement;
    let nextAchievements = [...prev.achievements];
    const extraTransactions: ProgressionTransaction[] = [txRecord];

    if (params.extraAchievement) {
      bonusAchExp += params.extraAchievement.expReward;
      nextAchievements = [params.extraAchievement, ...nextAchievements];
    }

    const nextTotalCheck = Math.max(0, prev.player.totalExp + params.expDelta + bonusAchExp);
    const highAttrsCount = Object.values(updatedAttributes).filter((a) => a.value >= 45).length;

    nextAchievements = nextAchievements.map((ach) => {
      if (ach.unlocked) return ach;

      if (ach.id === 'ach_polymath_threshold') {
        const unlockedNow = highAttrsCount >= 4;
        if (unlockedNow) {
          const achTxId = `tx_ach_${Date.now()}_poly`;
          bonusAchExp += ach.expReward;
          extraTransactions.push({
            id: achTxId,
            timestamp: nowIso,
            date: today,
            sourceType: 'achievement_bonus',
            sourceId: ach.id,
            description: `Achievement Unlocked: ${ach.name}`,
            expDelta: ach.expReward,
            attributeDeltas: [],
            reversed: false,
          });
          const updated = {
            ...ach,
            unlocked: true,
            unlockedDate: today,
            progressCurrent: highAttrsCount,
            transactionId: achTxId,
          };
          if (!unlockedAch) unlockedAch = updated;
          return updated;
        }
        return { ...ach, progressCurrent: highAttrsCount };
      }

      if (ach.id === 'ach_iron_monolith') {
        const strVal = updatedAttributes.strength.value;
        const unlockedNow = strVal >= 50;
        if (unlockedNow) {
          const achTxId = `tx_ach_${Date.now()}_iron`;
          bonusAchExp += ach.expReward;
          extraTransactions.push({
            id: achTxId,
            timestamp: nowIso,
            date: today,
            sourceType: 'achievement_bonus',
            sourceId: ach.id,
            description: `Achievement Unlocked: ${ach.name}`,
            expDelta: ach.expReward,
            attributeDeltas: [],
            reversed: false,
          });
          const updated = {
            ...ach,
            unlocked: true,
            unlockedDate: today,
            progressCurrent: strVal,
            transactionId: achTxId,
          };
          if (!unlockedAch) unlockedAch = updated;
          return updated;
        }
        return { ...ach, progressCurrent: strVal };
      }

      if (ach.id === 'ach_astral_chronicle') {
        const unlockedNow = nextTotalCheck >= 15000;
        if (unlockedNow) {
          const achTxId = `tx_ach_${Date.now()}_astral`;
          bonusAchExp += ach.expReward;
          extraTransactions.push({
            id: achTxId,
            timestamp: nowIso,
            date: today,
            sourceType: 'achievement_bonus',
            sourceId: ach.id,
            description: `Achievement Unlocked: ${ach.name}`,
            expDelta: ach.expReward,
            attributeDeltas: [],
            reversed: false,
          });
          const updated = {
            ...ach,
            unlocked: true,
            unlockedDate: today,
            progressCurrent: 15000,
            transactionId: achTxId,
          };
          if (!unlockedAch) unlockedAch = updated;
          return updated;
        }
        return { ...ach, progressCurrent: Math.min(15000, nextTotalCheck) };
      }

      return ach;
    });

    const totalAddedExp = params.expDelta + bonusAchExp;
    const nextTotalExp = Math.max(0, prev.player.totalExp + totalAddedExp);
    const oldLevel = prev.player.level;
    const newLevel = getLevelFromExp(nextTotalExp);
    const leveledUpTo = newLevel > oldLevel ? newLevel : undefined;

    const nextTitles = prev.titles.map((t) =>
      t.id === 'title_luminary' && newLevel >= 15 && !t.unlocked
        ? { ...t, unlocked: true, earnedDate: today }
        : t
    );

    let nextDaily = [...prev.dailyExpHistory];
    if (totalAddedExp !== 0) {
      const existingDayIdx = nextDaily.findIndex((p) => p.date === today);
      if (existingDayIdx >= 0) {
        nextDaily[existingDayIdx] = {
          ...nextDaily[existingDayIdx],
          exp: Math.max(0, nextDaily[existingDayIdx].exp + totalAddedExp),
          experiences: nextDaily[existingDayIdx].experiences + 1,
        };
      } else {
        nextDaily = [
          ...nextDaily,
          { date: today, label: todayLabel, exp: Math.max(0, totalAddedExp), experiences: 1 },
        ];
      }
    }

    return {
      nextState: {
        ...prev,
        player: {
          ...prev.player,
          level: newLevel,
          totalExp: nextTotalExp,
        },
        attributes: updatedAttributes,
        achievements: nextAchievements,
        titles: nextTitles,
        transactions: [...extraTransactions, ...prev.transactions],
        dailyExpHistory: nextDaily,
      },
      leveledUpTo,
      unlockedAch,
    };
  };

  /**
   * Reverses an active transaction safely: subtracts EXP and attribute deltas,
   * recalculates level, marks original transaction reversed, and appends an audit reversal record.
   */
  const reverseTransactionInState = (
    prev: GameState,
    transactionId: string,
    auditLabel?: string
  ): GameState => {
    const targetTx = prev.transactions.find((t) => t.id === transactionId);
    if (!targetTx || targetTx.reversed) return prev;

    const nowIso = new Date().toISOString();
    const today = nowIso.slice(0, 10);

    const updatedAttributes = { ...prev.attributes };
    for (const d of targetTx.attributeDeltas) {
      const attr = updatedAttributes[d.key];
      if (!attr || d.delta === 0) continue;
      const revertedProgress = Math.max(0, roundStatDelta(attr.progress - d.delta));
      updatedAttributes[d.key] = {
        ...attr,
        progress: revertedProgress,
        value: Math.max(0, Math.floor(revertedProgress)),
        history: [
          ...attr.history,
          {
            id: `ah_rev_${Date.now()}_${d.key}`,
            date: today,
            label: auditLabel || `Reversed: ${targetTx.description}`,
            delta: roundStatDelta(-d.delta),
            valueAfter: revertedProgress,
            transactionId: `tx_rev_${Date.now()}`,
          },
        ],
      };
    }

    const nextTotalExp = Math.max(0, prev.player.totalExp - targetTx.expDelta);
    const nextLevel = getLevelFromExp(nextTotalExp);

    const reversalTx: ProgressionTransaction = {
      id: `tx_rev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: nowIso,
      date: today,
      sourceType: 'reversal',
      sourceId: targetTx.sourceId,
      description: auditLabel || `Reversed: ${targetTx.description}`,
      expDelta: -targetTx.expDelta,
      attributeDeltas: targetTx.attributeDeltas.map((d) => ({
        ...d,
        delta: roundStatDelta(-d.delta),
      })),
      reversed: false,
      reversalOfTransactionId: targetTx.id,
    };

    const reversalActivity: ExperienceActivity = {
      id: `act_rev_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      title: `Reversed: ${targetTx.description}`,
      description: `Progression transaction reversed (${targetTx.expDelta >= 0 ? `-${targetTx.expDelta}` : `+${Math.abs(targetTx.expDelta)}`} EXP).`,
      date: today,
      timestamp: 'Just now · Reversal',
      category: 'Miscellaneous',
      difficulty: 'Tiny',
      sentiment: 'neutral',
      rarity: 'Common',
      expEarned: -targetTx.expDelta,
      attributesAffected: targetTx.attributeDeltas.map((d) => ({
        ...d,
        delta: roundStatDelta(-d.delta),
      })),
      isReversalRecord: true,
    };

    const nextTransactions = [
      reversalTx,
      ...prev.transactions.map((t) =>
        t.id === transactionId ? { ...t, reversed: true, reversedAt: nowIso } : t
      ),
    ];

    const nextDaily = prev.dailyExpHistory.map((p) =>
      p.date === targetTx.date
        ? { ...p, exp: Math.max(0, p.exp - targetTx.expDelta) }
        : p
    );

    return {
      ...prev,
      player: {
        ...prev.player,
        totalExp: nextTotalExp,
        level: nextLevel,
      },
      attributes: updatedAttributes,
      transactions: nextTransactions,
      activities: [reversalActivity, ...prev.activities],
      dailyExpHistory: nextDaily,
    };
  };

  /**
   * Executes collectible metadata + SVG asset generation pipeline on the server.
   * Preserves pending reward in state if generation fails so user can retry safely.
   */
  const runCollectiblePipeline = async (
    pending: PendingCollectible,
    sourceDescription: string,
    existingNames: string[],
    txId?: string
  ) => {
    setState((prev) => ({
      ...prev,
      pendingCollectibles: prev.pendingCollectibles.map((p) =>
        p.id === pending.id ? { ...p, status: 'generating', errorMessage: undefined } : p
      ),
    }));

    try {
      const result = await generateCollectibleAsset({
        collectibleId: pending.id,
        sourceLabel: pending.sourceLabel,
        sourceDescription,
        difficulty: pending.difficulty,
        suggestedType: pending.suggestedType,
        rarity: pending.rarity,
        existingNames,
      });

      if (result.status === 'pending_artwork' || !result.collectible) {
        setState((prev) => ({
          ...prev,
          pendingCollectibles: prev.pendingCollectibles.map((p) =>
            p.id === pending.id
              ? {
                  ...p,
                  status: 'pending',
                  errorMessage:
                    result.message ||
                    'Awaiting a free image-generation model. Your collectible reward is safely preserved.',
                }
              : p
          ),
        }));
        return;
      }

      const finalized: Collectible = {
        ...result.collectible,
        sourceActivityId: pending.sourceActivityId,
        sourceLabel: pending.sourceLabel,
        transactionId: txId,
      };

      setState((prev) => {
        // Prevent duplicate collectibles for the same ID
        if (prev.collectibles.some((c) => c.id === finalized.id)) {
          return {
            ...prev,
            pendingCollectibles: prev.pendingCollectibles.filter((p) => p.id !== pending.id),
          };
        }

        const nextPortraits =
          finalized.category === 'Portrait'
            ? [
                {
                  id: `por_${finalized.id}`,
                  name: finalized.name,
                  description: finalized.description,
                  rarity: finalized.rarity,
                  imageUrl: finalized.imageUrl,
                  unlocked: true,
                  sourceCollectibleId: finalized.id,
                  acquiredDate: finalized.acquiredDate,
                },
                ...prev.portraits,
              ]
            : prev.portraits;

        const nextCosmetics =
          finalized.category === 'Frame'
            ? [
                {
                  id: `frm_${finalized.id}`,
                  name: finalized.name,
                  description: finalized.description,
                  rarity: finalized.rarity,
                  unlocked: true,
                  borderClass:
                    'ring-2 ring-amber-400/70 shadow-[0_0_24px_-4px_rgba(212,168,83,0.45)]',
                  ringStyle: 'border-amber-400/60',
                  sourceCollectibleId: finalized.id,
                },
                ...prev.cosmetics,
              ]
            : prev.cosmetics;

        const nextActivities = prev.activities.map((a) =>
          a.id === pending.sourceActivityId
            ? { ...a, collectibleId: finalized.id, collectibleName: finalized.name }
            : a
        );

        return {
          ...prev,
          collectibles: [finalized, ...prev.collectibles],
          pendingCollectibles: prev.pendingCollectibles.filter((p) => p.id !== pending.id),
          portraits: nextPortraits,
          cosmetics: nextCosmetics,
          activities: nextActivities,
        };
      });

      playRpgSound('achievement', state.settings.soundEnabled);
      setCelebration({
        id: `cel_col_${Date.now()}`,
        acquiredCollectible: finalized,
        expGained: 0,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Artwork generation failed.';
      setState((prev) => ({
        ...prev,
        pendingCollectibles: prev.pendingCollectibles.map((p) =>
          p.id === pending.id ? { ...p, status: 'failed', errorMessage: msg } : p
        ),
      }));
    }
  };

  const retryPendingCollectible = async (pendingId: string) => {
    const pending = state.pendingCollectibles.find((p) => p.id === pendingId);
    if (!pending) return;
    const existingNames = state.collectibles.map((c) => c.name);
    await runCollectiblePipeline(
      pending,
      pending.sourceLabel,
      existingNames,
      pending.transactionId
    );
  };

  const dismissPendingCollectible = (pendingId: string) => {
    setState((prev) => ({
      ...prev,
      pendingCollectibles: prev.pendingCollectibles.filter((p) => p.id !== pendingId),
    }));
  };

  const applyGMProposal = (proposal: GMEvaluationProposal) => {
    const today = new Date().toISOString().slice(0, 10);
    const actId = `act_${Date.now()}`;
    const txId = `tx_${Date.now()}`;

    let levelUpResult: number | undefined;
    let achResult: Achievement | undefined;
    let pendingCollectible: PendingCollectible | null = null;
    const existingNames = state.collectibles.map((c) => c.name);

    if (proposal.collectibleEligible && proposal.sentiment === 'positive') {
      pendingCollectible = {
        id: `pcol_${Date.now()}`,
        sourceActivityId: actId,
        sourceLabel: proposal.summaryTitle,
        difficulty: proposal.difficulty,
        suggestedType: proposal.collectibleType || 'Relic',
        rarity: difficultyToRarity(proposal.difficulty),
        status: 'pending',
        createdAt: today,
        transactionId: txId,
      };
    }

    setState((prev) => {
      const newActivity: ExperienceActivity = {
        id: actId,
        title: proposal.summaryTitle,
        description: proposal.rawInput,
        date: today,
        timestamp: 'Just now',
        category: proposal.category,
        difficulty: proposal.difficulty,
        sentiment: proposal.sentiment,
        rarity: difficultyToRarity(proposal.difficulty),
        expEarned: proposal.expEarned,
        attributesAffected: proposal.attributeDeltas,
        transactionId: txId,
        gmNote: proposal.gmCommentary,
      };

      const { nextState, leveledUpTo, unlockedAch } = commitTransactionToState(prev, {
        txId,
        sourceType: 'activity',
        sourceId: actId,
        description: proposal.summaryTitle,
        expDelta: proposal.expEarned,
        attributeDeltas: proposal.attributeDeltas,
        activityLabel: proposal.summaryTitle,
      });

      levelUpResult = leveledUpTo;
      achResult = unlockedAch;

      return {
        ...nextState,
        activities: [newActivity, ...nextState.activities],
        pendingCollectibles: pendingCollectible
          ? [pendingCollectible, ...nextState.pendingCollectibles]
          : nextState.pendingCollectibles,
      };
    });

    if (levelUpResult) {
      playRpgSound('levelup', state.settings.soundEnabled);
    } else if (achResult) {
      playRpgSound('achievement', state.settings.soundEnabled);
    } else if (proposal.expEarned > 0) {
      playRpgSound('exp', state.settings.soundEnabled);
    } else {
      playRpgSound('click', state.settings.soundEnabled);
    }

    if (levelUpResult || achResult) {
      setCelebration({
        id: `cel_${Date.now()}`,
        levelUpTo: levelUpResult,
        unlockedAchievement: achResult,
        expGained: proposal.expEarned,
      });
    }

    if (pendingCollectible) {
      void runCollectiblePipeline(
        pendingCollectible,
        proposal.rawInput,
        existingNames,
        txId
      );
    }
  };

  const toggleQuestMilestone = (questId: string, milestoneId: string) => {
    const quest = state.quests.find((q) => q.id === questId);
    if (!quest) return;
    const ms = quest.milestones.find((m) => m.id === milestoneId);
    if (!ms) return;

    // Prevent duplicate completion if already completed: reversing uses explicit reopen/undo
    if (ms.completed) {
      if (ms.transactionId) {
        setState((prev) => {
          let working = reverseTransactionInState(
            prev,
            ms.transactionId!,
            `Undid milestone: ${ms.title}`
          );
          if (quest.status === 'completed' && quest.completionTransactionId) {
            working = reverseTransactionInState(
              working,
              quest.completionTransactionId,
              `Reopened quest: ${quest.title}`
            );
          }
          return {
            ...working,
            quests: working.quests.map((q) =>
              q.id === questId
                ? {
                    ...q,
                    status: 'active',
                    completedAt: undefined,
                    completionTransactionId: undefined,
                    milestones: q.milestones.map((m) =>
                      m.id === milestoneId
                        ? { ...m, completed: false, transactionId: undefined }
                        : m
                    ),
                  }
                : q
            ),
          };
        });
        playRpgSound('undo', state.settings.soundEnabled);
      } else {
        setState((prev) => ({
          ...prev,
          quests: prev.quests.map((q) =>
            q.id === questId
              ? {
                  ...q,
                  status: 'active',
                  completedAt: undefined,
                  milestones: q.milestones.map((m) =>
                    m.id === milestoneId ? { ...m, completed: false } : m
                  ),
                }
              : q
          ),
        }));
      }
      return;
    }

    const msTxId = `tx_ms_${Date.now()}`;
    const updatedMilestones = quest.milestones.map((m) =>
      m.id === milestoneId ? { ...m, completed: true, transactionId: msTxId } : m
    );
    const allDone = updatedMilestones.every((m) => m.completed);
    const completionTxId = allDone ? `tx_qdone_${Date.now()}` : undefined;
    const today = new Date().toISOString().slice(0, 10);

    let levelUpResult: number | undefined;
    let achResult: Achievement | undefined;
    let pendingCollectible: PendingCollectible | null = null;
    const existingNames = state.collectibles.map((c) => c.name);

    if (allDone && quest.collectibleRewardEligible && quest.difficulty !== 'Tiny' && quest.difficulty !== 'Easy') {
      // Moderate/high chance based on quest difficulty
      const shouldDrop =
        quest.difficulty === 'Exceptional' ||
        quest.difficulty === 'Very Hard' ||
        Math.random() < 0.45;
      if (shouldDrop) {
        pendingCollectible = {
          id: `pcol_q_${Date.now()}`,
          sourceLabel: quest.title,
          difficulty: quest.difficulty,
          suggestedType: 'Artifact',
          rarity: difficultyToRarity(quest.difficulty),
          status: 'pending',
          createdAt: today,
          transactionId: completionTxId,
        };
      }
    }

    setState((prev) => {
      // 1. Apply milestone transaction (small milestone bonus, never duplicates completion reward)
      let applied = commitTransactionToState(prev, {
        txId: msTxId,
        sourceType: 'quest_milestone',
        sourceId: `${questId}:${milestoneId}`,
        description: `Quest Milestone: ${ms.title}`,
        expDelta: ms.expBonus,
        attributeDeltas: [],
        activityLabel: `Quest Milestone: ${ms.title}`,
      });
      let working = applied.nextState;
      levelUpResult = applied.leveledUpTo;
      achResult = applied.unlockedAch;

      // 2. If all milestones complete, apply final Quest Completion transaction
      if (allDone && completionTxId) {
        const compApplied = commitTransactionToState(working, {
          txId: completionTxId,
          sourceType: 'quest_completion',
          sourceId: questId,
          description: `Quest Completed: ${quest.title}`,
          expDelta: quest.expReward,
          attributeDeltas: quest.attributeRewards,
          activityLabel: `Quest Completed: ${quest.title}`,
        });
        working = compApplied.nextState;
        if (compApplied.leveledUpTo) levelUpResult = compApplied.leveledUpTo;
        if (compApplied.unlockedAch) achResult = compApplied.unlockedAch;

        const act: ExperienceActivity = {
          id: `act_q_${Date.now()}`,
          title: `Completed Quest: ${quest.title}`,
          description: quest.loreDescription,
          date: today,
          timestamp: 'Just now',
          category: 'Craft',
          difficulty: quest.difficulty,
          sentiment: 'positive',
          rarity: difficultyToRarity(quest.difficulty),
          expEarned: quest.expReward,
          attributesAffected: quest.attributeRewards,
          transactionId: completionTxId,
        };
        working = {
          ...working,
          activities: [act, ...working.activities],
        };
      }

      return {
        ...working,
        quests: working.quests.map((q) =>
          q.id === questId
            ? {
                ...q,
                milestones: updatedMilestones,
                status: allDone ? 'completed' : 'active',
                completedAt: allDone ? today : undefined,
                completionTransactionId: completionTxId,
              }
            : q
        ),
        pendingCollectibles: pendingCollectible
          ? [pendingCollectible, ...working.pendingCollectibles]
          : working.pendingCollectibles,
      };
    });

    if (allDone && completionTxId) {
      showUndoToast({
        id: `undo_${Date.now()}`,
        label: `Quest completed (+${ms.expBonus + quest.expReward} EXP)`,
        transactionId: completionTxId,
        questId,
        milestoneId,
        type: 'quest',
      });
    } else {
      showUndoToast({
        id: `undo_${Date.now()}`,
        label: `Milestone completed (+${ms.expBonus} EXP)`,
        transactionId: msTxId,
        questId,
        milestoneId,
        type: 'milestone',
      });
    }

    if (levelUpResult) {
      playRpgSound('levelup', state.settings.soundEnabled);
    } else {
      playRpgSound('exp', state.settings.soundEnabled);
    }

    if (levelUpResult || achResult) {
      setCelebration({
        id: `cel_q_${Date.now()}`,
        levelUpTo: levelUpResult,
        unlockedAchievement: achResult,
        expGained: ms.expBonus + (allDone ? quest.expReward : 0),
      });
    }

    if (pendingCollectible) {
      void runCollectiblePipeline(
        pendingCollectible,
        quest.loreDescription,
        existingNames,
        completionTxId
      );
    }
  };

  const reopenQuest = (questId: string) => {
    const quest = state.quests.find((q) => q.id === questId);
    if (!quest || quest.status !== 'completed') return;

    setState((prev) => {
      let working = prev;
      if (quest.completionTransactionId) {
        working = reverseTransactionInState(
          working,
          quest.completionTransactionId,
          `Reopened quest: ${quest.title}`
        );
      }
      // Also reopen the final milestone so user can progress cleanly again without duplicate completion
      const lastMs = quest.milestones[quest.milestones.length - 1];
      if (lastMs?.transactionId) {
        working = reverseTransactionInState(
          working,
          lastMs.transactionId,
          `Reopened milestone: ${lastMs.title}`
        );
      }

      return {
        ...working,
        quests: working.quests.map((q) =>
          q.id === questId
            ? {
                ...q,
                status: 'active',
                completedAt: undefined,
                completionTransactionId: undefined,
                milestones: q.milestones.map((m, idx) =>
                  idx === q.milestones.length - 1
                    ? { ...m, completed: false, transactionId: undefined }
                    : m
                ),
              }
            : q
        ),
      };
    });
    playRpgSound('undo', state.settings.soundEnabled);
  };

  const createQuestFromDraft = (draft: GeneratedQuestDraft) => {
    const today = new Date().toISOString().slice(0, 10);
    const newQuest: Quest = {
      id: `q_${Date.now()}`,
      title: draft.title.trim(),
      loreDescription: draft.loreDescription.trim(),
      status: 'active',
      category: draft.category,
      difficulty: draft.difficulty,
      estimatedDuration: draft.estimatedDuration,
      mainObjectives: draft.mainObjectives,
      sideObjectives: draft.sideObjectives,
      completionCriteria: draft.completionCriteria,
      expReward: draft.expReward,
      attributeRewards: draft.attributeRewards,
      collectibleRewardEligible: draft.collectibleRewardEligible,
      createdAt: today,
      milestones: draft.milestones.map((m, idx) => ({
        id: `qm_${Date.now()}_${idx}`,
        title: m.title,
        completed: false,
        expBonus: m.expBonus,
      })),
    };

    setState((prev) => ({
      ...prev,
      quests: [newQuest, ...prev.quests],
    }));
    playRpgSound('click', state.settings.soundEnabled);
  };

  const incrementChallengeProgress = (challengeId: string, amount: number) => {
    const challenge = state.challenges.find((c) => c.id === challengeId);
    if (!challenge) return;

    const nextProgress = Math.min(
      challenge.progressTarget,
      Math.max(0, challenge.progressCurrent + amount)
    );
    const justCompleted =
      nextProgress >= challenge.progressTarget && challenge.status !== 'completed';
    const justReopened =
      nextProgress < challenge.progressTarget && challenge.status === 'completed';

    if (justReopened && challenge.completionTransactionId) {
      setState((prev) => {
        const working = reverseTransactionInState(
          prev,
          challenge.completionTransactionId!,
          `Reopened challenge: ${challenge.title}`
        );
        return {
          ...working,
          challenges: working.challenges.map((c) =>
            c.id === challengeId
              ? {
                  ...c,
                  progressCurrent: nextProgress,
                  status: 'active',
                  completionTransactionId: undefined,
                }
              : c
          ),
        };
      });
      playRpgSound('undo', state.settings.soundEnabled);
      return;
    }

    const compTxId = justCompleted ? `tx_chal_${Date.now()}` : challenge.completionTransactionId;
    let levelUpResult: number | undefined;
    let achResult: Achievement | undefined;

    setState((prev) => {
      const updatedChallenges: Challenge[] = prev.challenges.map((c) =>
        c.id === challengeId
          ? {
              ...c,
              progressCurrent: nextProgress,
              status: nextProgress >= c.progressTarget ? 'completed' : 'active',
              completionTransactionId: compTxId,
            }
          : c
      );

      let working: GameState = { ...prev, challenges: updatedChallenges };

      if (justCompleted && compTxId) {
        const applied = commitTransactionToState(working, {
          txId: compTxId,
          sourceType: 'challenge_completion',
          sourceId: challengeId,
          description: `Challenge Completed: ${challenge.title}`,
          expDelta: challenge.expReward,
          attributeDeltas: challenge.attributeRewards,
          activityLabel: `Challenge Completed: ${challenge.title}`,
        });
        working = applied.nextState;
        levelUpResult = applied.leveledUpTo;
        achResult = applied.unlockedAch;

        const today = new Date().toISOString().slice(0, 10);
        const mappedDifficulty: ActivityDifficulty =
          challenge.difficulty === 'Master'
            ? 'Very Hard'
            : challenge.difficulty === 'Veteran'
              ? 'Hard'
              : 'Medium';

        working = {
          ...working,
          activities: [
            {
              id: `act_c_${Date.now()}`,
              title: `Completed Challenge: ${challenge.title}`,
              description: challenge.description,
              date: today,
              timestamp: 'Just now',
              category: 'Craft',
              difficulty: mappedDifficulty,
              sentiment: 'positive',
              rarity: difficultyToRarity(mappedDifficulty),
              expEarned: challenge.expReward,
              attributesAffected: challenge.attributeRewards,
              transactionId: compTxId,
            },
            ...working.activities,
          ],
        };
      }

      return working;
    });

    if (justCompleted && compTxId) {
      showUndoToast({
        id: `undo_${Date.now()}`,
        label: `Challenge completed (+${challenge.expReward} EXP)`,
        transactionId: compTxId,
        challengeId,
        type: 'challenge',
      });
      if (levelUpResult) {
        playRpgSound('levelup', state.settings.soundEnabled);
      } else {
        playRpgSound('exp', state.settings.soundEnabled);
      }
      if (levelUpResult || achResult) {
        setCelebration({
          id: `cel_c_${Date.now()}`,
          levelUpTo: levelUpResult,
          unlockedAchievement: achResult,
          expGained: challenge.expReward,
        });
      }
    } else {
      playRpgSound('click', state.settings.soundEnabled);
    }
  };

  const reopenChallenge = (challengeId: string) => {
    const challenge = state.challenges.find((c) => c.id === challengeId);
    if (!challenge || challenge.status !== 'completed') return;
    incrementChallengeProgress(challengeId, -1);
  };

  const undoTaskAction = (toast: UndoToastItem) => {
    dismissUndoToast();
    if (toast.type === 'milestone' && toast.questId && toast.milestoneId) {
      toggleQuestMilestone(toast.questId, toast.milestoneId);
    } else if (toast.type === 'quest' && toast.questId) {
      reopenQuest(toast.questId);
    } else if (toast.type === 'challenge' && toast.challengeId) {
      reopenChallenge(toast.challengeId);
    }
  };

  const deleteActivities = (activityIds: string[], mode: ActivityDeleteMode) => {
    if (activityIds.length === 0) return;
    const idSet = new Set(activityIds);

    setState((prev) => {
      let working = prev;
      if (mode === 'reverse_progression') {
        const toReverse = prev.activities.filter((a) => idSet.has(a.id) && a.transactionId);
        for (const act of toReverse) {
          if (act.transactionId) {
            working = reverseTransactionInState(
              working,
              act.transactionId,
              `Deleted & reversed log: ${act.title}`
            );
          }
        }
      }

      return {
        ...working,
        activities: working.activities.filter((a) => !idSet.has(a.id)),
      };
    });

    playRpgSound('undo', state.settings.soundEnabled);
  };

  const deleteCollectionItem: GameContextValue['deleteCollectionItem'] = ({
    kind,
    id,
    mode,
  }) => {
    setState((prev) => {
      let working = prev;

      if (kind === 'achievement') {
        const target = prev.achievements.find((a) => a.id === id);
        if (mode === 'reverse_reward' && target?.transactionId) {
          working = reverseTransactionInState(
            working,
            target.transactionId,
            `Removed achievement: ${target.name}`
          );
        }
        return {
          ...working,
          achievements: working.achievements.filter((a) => a.id !== id),
          player: {
            ...working.player,
            showcasedAchievementIds: working.player.showcasedAchievementIds.filter(
              (sid) => sid !== id
            ),
          },
        };
      }

      if (kind === 'collectible') {
        const target = prev.collectibles.find((c) => c.id === id);
        if (mode === 'reverse_reward' && target?.transactionId) {
          working = reverseTransactionInState(
            working,
            target.transactionId,
            `Removed collectible: ${target.name}`
          );
        }
        // Do not delete historical activity records; keep them intact
        return {
          ...working,
          collectibles: working.collectibles.filter((c) => c.id !== id),
        };
      }

      if (kind === 'title') {
        const nextTitles = working.titles.filter((t) => t.id !== id);
        const fallbackTitle = nextTitles.find((t) => t.unlocked)?.id || '';
        return {
          ...working,
          titles: nextTitles,
          player: {
            ...working.player,
            equippedTitleId:
              working.player.equippedTitleId === id
                ? fallbackTitle
                : working.player.equippedTitleId,
          },
        };
      }

      if (kind === 'portrait') {
        const nextPortraits = working.portraits.filter((p) => p.id !== id);
        const fallbackPortrait = nextPortraits.find((p) => p.unlocked);
        return {
          ...working,
          portraits: nextPortraits,
          player: {
            ...working.player,
            equippedPortraitId:
              working.player.equippedPortraitId === id
                ? fallbackPortrait?.id || ''
                : working.player.equippedPortraitId,
            avatarUrl:
              working.player.equippedPortraitId === id
                ? fallbackPortrait?.imageUrl || working.player.avatarUrl
                : working.player.avatarUrl,
          },
        };
      }

      if (kind === 'cosmetic') {
        const nextCosmetics = working.cosmetics.filter((c) => c.id !== id);
        const fallbackCos = nextCosmetics.find((c) => c.unlocked)?.id || '';
        return {
          ...working,
          cosmetics: nextCosmetics,
          player: {
            ...working.player,
            equippedCosmeticId:
              working.player.equippedCosmeticId === id
                ? fallbackCos
                : working.player.equippedCosmeticId,
          },
        };
      }

      return working;
    });

    playRpgSound('undo', state.settings.soundEnabled);
  };

  const equipTitle = (titleId: string) => {
    setState((prev) => ({
      ...prev,
      player: { ...prev.player, equippedTitleId: titleId },
    }));
    playRpgSound('click', state.settings.soundEnabled);
  };

  const equipCosmetic = (cosmeticId: string) => {
    setState((prev) => ({
      ...prev,
      player: { ...prev.player, equippedCosmeticId: cosmeticId },
    }));
    playRpgSound('click', state.settings.soundEnabled);
  };

  const equipPortrait = (portraitId: string) => {
    const portrait = state.portraits.find((p) => p.id === portraitId && p.unlocked);
    if (!portrait) return;
    setState((prev) => ({
      ...prev,
      player: {
        ...prev.player,
        equippedPortraitId: portrait.id,
        avatarUrl: portrait.imageUrl,
      },
    }));
    playRpgSound('click', state.settings.soundEnabled);
  };

  const toggleShowcaseAchievement = (achievementId: string) => {
    setState((prev) => {
      const current = prev.player.showcasedAchievementIds;
      const exists = current.includes(achievementId);
      const next = exists
        ? current.filter((id) => id !== achievementId)
        : current.length >= 3
          ? [...current.slice(1), achievementId]
          : [...current, achievementId];
      return {
        ...prev,
        player: { ...prev.player, showcasedAchievementIds: next },
      };
    });
    playRpgSound('click', state.settings.soundEnabled);
  };

  const updateSettings = (partial: Partial<AppSettings>) => {
    setState((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...partial },
    }));
  };

  const updatePlayerName = (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setState((prev) => ({
      ...prev,
      player: { ...prev.player, name: clean },
    }));
  };

  const resetDemoState = () => {
    const fresh = createFreshCharacterState(state.player.name);
    setState(fresh);
    if (user) {
      try {
        window.localStorage.removeItem(getUidStorageKey(user.uid));
      } catch {
        // Ignore
      }
    }
    playRpgSound('click', state.settings.soundEnabled);
  };

  return (
    <GameContext.Provider
      value={{
        state,
        isHydrated,
        activeNav,
        setActiveNav,
        isGMModalOpen,
        openGMModal,
        closeGMModal,
        gmPrefillPrompt,
        selectedAttributeKey,
        setSelectedAttributeKey,
        isSettingsOpen,
        setIsSettingsOpen,
        celebration,
        dismissCelebration,
        undoToast,
        dismissUndoToast,
        undoTaskAction,
        applyGMProposal,
        toggleQuestMilestone,
        reopenQuest,
        createQuestFromDraft,
        incrementChallengeProgress,
        reopenChallenge,
        deleteActivities,
        deleteCollectionItem,
        retryPendingCollectible,
        dismissPendingCollectible,
        equipTitle,
        equipCosmetic,
        equipPortrait,
        toggleShowcaseAchievement,
        updateSettings,
        updatePlayerName,
        resetDemoState,
        cloudSyncStatus,
        cloudRevision,
        lastSyncedAt,
        syncNow,
        applyExternalCloudState,
      }}
    >
      {children}
    </GameContext.Provider>
  );
};

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside GameProvider');
  return ctx;
}
