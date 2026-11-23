import type { AttributeKey, GameState } from '../types/rpg.ts';
import { getLevelFromExp } from '../utils/leveling.ts';
import {
  INITIAL_GAME_STATE,
  PLAYER_AVATAR_URL,
  SANCTUARY_BANNER_URL,
} from './initialGameState.ts';

export const LEGACY_STORAGE_KEY = 'chronicle_rpg_state_v2';
export const LEGACY_MIGRATION_MARKER_KEY = 'chronicle_legacy_migrated_for';

export function sanitizeCharacterName(rawName: string): string {
  const cleaned = String(rawName || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 32);
  return cleaned.length >= 2 ? cleaned : 'Adventurer';
}

export function createFreshCharacterState(characterName: string): GameState {
  const today = new Date().toISOString().slice(0, 10);
  const safeName = sanitizeCharacterName(characterName);

  const freshAttributes = {} as GameState['attributes'];
  (Object.keys(INITIAL_GAME_STATE.attributes) as AttributeKey[]).forEach((key) => {
    const base = INITIAL_GAME_STATE.attributes[key];
    freshAttributes[key] = {
      ...base,
      value: 10,
      progress: 10,
      recentDelta: 0,
      history: [],
    };
  });

  return {
    player: {
      name: safeName,
      level: 1,
      totalExp: 0,
      equippedTitleId: 'title_initiate',
      equippedCosmeticId: 'frame_steel_vanguard',
      equippedPortraitId: 'portrait_explorer',
      showcasedAchievementIds: [],
      avatarUrl: PLAYER_AVATAR_URL,
      bannerUrl: SANCTUARY_BANNER_URL,
      archetype: 'Chronicle Initiate',
      joinedDate: today,
    },
    attributes: freshAttributes,
    activities: [],
    transactions: [],
    achievements: INITIAL_GAME_STATE.achievements.map((ach) => ({
      ...ach,
      unlocked: false,
      unlockedDate: undefined,
      progressCurrent: 0,
      featured: false,
      transactionId: undefined,
    })),
    quests: [],
    challenges: [],
    titles: [
      {
        id: 'title_initiate',
        name: 'Initiate of the Chronicle',
        description: 'Bestowed upon every adventurer beginning their lived record.',
        rarity: 'Common',
        unlocked: true,
        unlockSource: 'Account creation',
        earnedDate: today,
      },
      ...INITIAL_GAME_STATE.titles.map((t) => ({
        ...t,
        unlocked: false,
        earnedDate: undefined,
      })),
    ],
    collectibles: [],
    pendingCollectibles: [],
    portraits: [
      {
        id: 'portrait_explorer',
        name: 'Obsidian Scholar-Explorer',
        description: `Default portrait of ${safeName} in midnight travel attire.`,
        rarity: 'Common',
        imageUrl: PLAYER_AVATAR_URL,
        unlocked: true,
        acquiredDate: today,
      },
    ],
    cosmetics: INITIAL_GAME_STATE.cosmetics.map((c) => ({
      ...c,
      unlocked: c.id === 'frame_steel_vanguard',
    })),
    dailyExpHistory: [],
    settings: {
      soundEnabled: true,
      reducedMotion: false,
      gmVoiceHintEnabled: true,
    },
  };
}

export function normalizeAndValidateGameState(
  candidate: Partial<GameState> | null | undefined,
  fallbackCharacterName?: string
): GameState {
  const baseTemplate = createFreshCharacterState(
    fallbackCharacterName || candidate?.player?.name || 'Adventurer'
  );

  if (!candidate || typeof candidate !== 'object' || !candidate.player || !candidate.attributes) {
    return baseTemplate;
  }

  const totalExp = Math.max(
    0,
    Math.round(Number.isFinite(Number(candidate.player.totalExp)) ? Number(candidate.player.totalExp) : 0)
  );
  const recomputedLevel = getLevelFromExp(totalExp);

  const mergedAttributes = { ...baseTemplate.attributes };
  (Object.keys(mergedAttributes) as AttributeKey[]).forEach((key) => {
    const incoming = candidate.attributes?.[key];
    if (incoming && typeof incoming === 'object') {
      const rawProgress =
        typeof incoming.progress === 'number' && Number.isFinite(incoming.progress)
          ? incoming.progress
          : typeof incoming.value === 'number' && Number.isFinite(incoming.value)
            ? incoming.value
            : mergedAttributes[key].progress;
      const clampedProgress = Math.max(0, Math.round(rawProgress * 100) / 100);
      mergedAttributes[key] = {
        ...mergedAttributes[key],
        ...incoming,
        key,
        progress: clampedProgress,
        value: Math.max(0, Math.floor(clampedProgress)),
        recentDelta:
          typeof incoming.recentDelta === 'number' && Number.isFinite(incoming.recentDelta)
            ? incoming.recentDelta
            : 0,
        history: Array.isArray(incoming.history) ? incoming.history : [],
      };
    }
  });

  const cleanName = sanitizeCharacterName(
    candidate.player.name || fallbackCharacterName || baseTemplate.player.name
  );

  return {
    ...baseTemplate,
    ...candidate,
    player: {
      ...baseTemplate.player,
      ...candidate.player,
      name: cleanName,
      totalExp,
      level: recomputedLevel,
      equippedPortraitId:
        candidate.player.equippedPortraitId || baseTemplate.player.equippedPortraitId,
      equippedCosmeticId:
        candidate.player.equippedCosmeticId || baseTemplate.player.equippedCosmeticId,
      equippedTitleId:
        candidate.player.equippedTitleId || baseTemplate.player.equippedTitleId,
      showcasedAchievementIds: Array.isArray(candidate.player.showcasedAchievementIds)
        ? candidate.player.showcasedAchievementIds
        : [],
    },
    attributes: mergedAttributes,
    activities: Array.isArray(candidate.activities) ? candidate.activities : [],
    transactions: Array.isArray(candidate.transactions) ? candidate.transactions : [],
    achievements: Array.isArray(candidate.achievements)
      ? candidate.achievements
      : baseTemplate.achievements,
    quests: Array.isArray(candidate.quests) ? candidate.quests : [],
    challenges: Array.isArray(candidate.challenges) ? candidate.challenges : [],
    titles: Array.isArray(candidate.titles) ? candidate.titles : baseTemplate.titles,
    collectibles: Array.isArray(candidate.collectibles) ? candidate.collectibles : [],
    pendingCollectibles: Array.isArray(candidate.pendingCollectibles)
      ? candidate.pendingCollectibles
      : [],
    portraits:
      Array.isArray(candidate.portraits) && candidate.portraits.length > 0
        ? candidate.portraits
        : baseTemplate.portraits,
    cosmetics:
      Array.isArray(candidate.cosmetics) && candidate.cosmetics.length > 0
        ? candidate.cosmetics
        : baseTemplate.cosmetics,
    dailyExpHistory: Array.isArray(candidate.dailyExpHistory) ? candidate.dailyExpHistory : [],
    settings: {
      ...baseTemplate.settings,
      ...(candidate.settings || {}),
    },
  };
}

export function detectLocalLegacyProgress(): GameState | null {
  if (typeof window === 'undefined') return null;
  try {
    const alreadyMigratedFor = window.localStorage.getItem(LEGACY_MIGRATION_MARKER_KEY);
    if (alreadyMigratedFor) return null;
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GameState>;
    if (!parsed?.player || !parsed?.attributes) return null;
    const normalized = normalizeAndValidateGameState(parsed);
    if (
      normalized.player.totalExp > 0 ||
      normalized.activities.length > 0 ||
      normalized.quests.length > 0
    ) {
      return normalized;
    }
    return null;
  } catch {
    return null;
  }
}
