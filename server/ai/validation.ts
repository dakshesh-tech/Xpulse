import {
  ATTRIBUTE_LABELS,
  DIFFICULTY_ECONOMY,
  difficultyToRarity,
  validateChronicleEvaluation,
  validateQuestRewards,
} from '../../shared/rpgEconomy.ts';
import type {
  ActivityDifficulty,
  AttributeDelta,
  AttributeKey,
  CollectibleType,
  ExperienceActivity,
  ExperienceSentiment,
  Rarity,
} from '../../src/types/rpg.ts';

const VALID_ATTR_KEYS: AttributeKey[] = [
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

const VALID_DIFFICULTIES: ActivityDifficulty[] = [
  'Tiny',
  'Easy',
  'Medium',
  'Hard',
  'Very Hard',
  'Exceptional',
];

const VALID_CATEGORIES: ExperienceActivity['category'][] = [
  'Learning',
  'Craft',
  'Vitality',
  'Reflection',
  'Community',
  'Exploration',
  'Miscellaneous',
];

const VALID_COLLECTIBLE_TYPES: CollectibleType[] = [
  'Relic',
  'Artifact',
  'Portrait',
  'Frame',
  'Token',
];

const VALID_RARITIES: Rarity[] = [
  'Common',
  'Uncommon',
  'Rare',
  'Epic',
  'Legendary',
  'Mythical',
];

export function normalizeAttrKeyStrict(raw: string): AttributeKey | null {
  const lower = (raw || '').toLowerCase().trim() as AttributeKey;
  return VALID_ATTR_KEYS.includes(lower) ? lower : null;
}

export function normalizeDifficulty(raw: string): ActivityDifficulty {
  const match = VALID_DIFFICULTIES.find(
    (d) => d.toLowerCase() === (raw || '').toLowerCase().trim()
  );
  return match ?? 'Easy';
}

export function normalizeCategory(raw: string): ExperienceActivity['category'] {
  const match = VALID_CATEGORIES.find(
    (c) => c.toLowerCase() === (raw || '').toLowerCase().trim()
  );
  return match ?? 'Miscellaneous';
}

export function normalizeCollectibleType(raw: string): CollectibleType {
  const match = VALID_COLLECTIBLE_TYPES.find(
    (t) => t.toLowerCase() === (raw || '').toLowerCase().trim()
  );
  return match ?? 'Relic';
}

export function normalizeRarity(raw: string, fallback: Rarity): Rarity {
  const match = VALID_RARITIES.find(
    (r) => r.toLowerCase() === (raw || '').toLowerCase().trim()
  );
  return match ?? fallback;
}

/**
 * Mitigates prompt injection by stripping control directives and wrapping user input
 * in explicit untrusted-data boundaries before sending to models.
 */
export function sanitizeUserPromptText(input: string, maxLen = 2000): string {
  return String(input || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/<\/?(system|assistant|developer|instruction)[^>]*>/gi, '')
    .trim()
    .slice(0, maxLen);
}

/**
 * Extracts and parses a JSON object from model output, handling markdown fences
 * or brief preamble text safely. Throws descriptive error on incomplete/malformed JSON.
 */
export function parseStructuredJsonObject<T extends object = Record<string, unknown>>(
  rawText: string
): T {
  const trimmed = (rawText || '').trim();
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const tryParse = (candidate: string): T | null => {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as T;
      }
      return null;
    } catch {
      return null;
    }
  };

  const direct = tryParse(stripped);
  if (direct) return direct;

  // Fallback extraction if reasoning model wrapped JSON in prose
  const firstBrace = stripped.indexOf('{');
  const lastBrace = stripped.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const sliced = tryParse(stripped.slice(firstBrace, lastBrace + 1));
    if (sliced) return sliced;
  }

  throw new Error('Model returned malformed or incomplete JSON output.');
}

export interface ChronicleRawAIOutput {
  needsClarification?: boolean;
  clarifyingQuestion?: string;
  interpretation?: string;
  summaryTitle?: string;
  sentiment?: string;
  difficulty?: string;
  confidence?: number;
  category?: string;
  expDelta?: number;
  attributeChanges?: Array<{ key?: string; delta?: number; reason?: string }>;
  gmCommentary?: string;
  overallReasoning?: string;
  collectibleEligible?: boolean;
  collectibleType?: string;
  collectibleReason?: string;
}

export function validateAndBuildChronicleResult(params: {
  parsed: ChronicleRawAIOutput;
  combinedInput: string;
  hasClarificationContext: boolean;
  recentSameDayActivities: ExperienceActivity[];
}) {
  const { parsed, combinedInput, hasClarificationContext, recentSameDayActivities } = params;

  if (parsed.needsClarification && !hasClarificationContext && parsed.clarifyingQuestion) {
    return {
      type: 'clarification' as const,
      message: String(parsed.clarifyingQuestion).trim(),
    };
  }

  // Require essential fields so incomplete outputs from weak models are rejected
  if (
    typeof parsed.sentiment !== 'string' ||
    typeof parsed.summaryTitle !== 'string' ||
    !parsed.summaryTitle.trim()
  ) {
    throw new Error('Incomplete Chronicle evaluation payload: missing sentiment or summaryTitle.');
  }

  const sentimentLower = parsed.sentiment.toLowerCase().trim();
  if (!['positive', 'negative', 'neutral', 'mixed'].includes(sentimentLower)) {
    throw new Error(`Invalid sentiment classification "${parsed.sentiment}".`);
  }
  const sentiment = sentimentLower as ExperienceSentiment;
  const difficulty = normalizeDifficulty(parsed.difficulty || 'Easy');
  const category = normalizeCategory(parsed.category || 'Miscellaneous');

  // Strict attribute validation: reject unsupported/invented attributes & require evidence
  const rawAttrs: AttributeDelta[] = [];
  if (Array.isArray(parsed.attributeChanges)) {
    for (const item of parsed.attributeChanges) {
      const validKey = normalizeAttrKeyStrict(String(item?.key || ''));
      if (!validKey) {
        // Reject invented/unsupported attributes cleanly
        continue;
      }
      const delta = Number(item?.delta);
      const reason = String(item?.reason || '').trim();
      if (!Number.isFinite(delta) || delta === 0) continue;
      if (!reason) {
        // Require explicit evidence for every proposed attribute change
        continue;
      }
      rawAttrs.push({
        key: validKey,
        name: ATTRIBUTE_LABELS[validKey],
        delta,
        reason,
      });
    }
  }

  const rawConfidence = Number(parsed.confidence);
  const confidence = Number.isFinite(rawConfidence)
    ? Math.min(1, Math.max(0.1, rawConfidence))
    : 0.78;

  const validated = validateChronicleEvaluation({
    rawInput: combinedInput,
    sentiment,
    difficulty,
    proposedExp: Number(parsed.expDelta) || 0,
    proposedAttributes: rawAttrs,
    recentSameDayActivities,
    category,
    wantsCollectible: Boolean(parsed.collectibleEligible),
    collectibleType: parsed.collectibleType
      ? normalizeCollectibleType(parsed.collectibleType)
      : undefined,
  });

  let finalCollectibleEligible = false;
  if (validated.collectibleEligible) {
    const chance = DIFFICULTY_ECONOMY[difficulty].collectibleChance;
    finalCollectibleEligible = Math.random() <= chance;
  }

  return {
    type: 'evaluation' as const,
    message: String(parsed.gmCommentary || 'Chronicle weighed and recorded.').trim(),
    proposal: {
      id: `prop_${Date.now()}`,
      interpretation: String(parsed.interpretation || combinedInput).trim(),
      summaryTitle: parsed.summaryTitle.trim().slice(0, 72),
      rawInput: combinedInput,
      gmCommentary: String(parsed.gmCommentary || 'Your experience has been weighed.').trim(),
      reasoning:
        validated.warnings.length > 0
          ? `${parsed.overallReasoning || ''} (${validated.warnings.join(' ')})`.trim()
          : String(
              parsed.overallReasoning || 'Evaluated against real-world effort and evidence.'
            ).trim(),
      sentiment: validated.sentiment,
      difficulty,
      confidence,
      category,
      expEarned: validated.expEarned,
      attributeDeltas: validated.attributeDeltas,
      collectibleEligible: finalCollectibleEligible,
      collectibleType: finalCollectibleEligible ? validated.collectibleType : undefined,
      collectibleReason: finalCollectibleEligible
        ? String(parsed.collectibleReason || '').trim() || undefined
        : undefined,
      diminishingFactorApplied: validated.diminishingFactorApplied,
      status: 'pending' as const,
    },
  };
}

export interface QuestRawAIOutput {
  title?: string;
  loreDescription?: string;
  category?: string;
  difficulty?: string;
  estimatedDuration?: string;
  mainObjectives?: string[];
  sideObjectives?: string[];
  milestones?: Array<{ title?: string; expBonus?: number }>;
  completionCriteria?: string;
  attributeRewards?: Array<{ key?: string; delta?: number; reason?: string }>;
  expReward?: number;
  possibleCollectibleHint?: string;
  aiReasoning?: string;
}

export function validateAndBuildQuestDraft(params: {
  parsed: QuestRawAIOutput;
  goalDescription: string;
}) {
  const { parsed, goalDescription } = params;
  if (typeof parsed.title !== 'string' || !parsed.title.trim()) {
    throw new Error('Incomplete quest blueprint: missing quest title.');
  }

  const difficulty = normalizeDifficulty(parsed.difficulty || 'Medium');
  const rawAttrs: AttributeDelta[] = [];
  if (Array.isArray(parsed.attributeRewards)) {
    for (const a of parsed.attributeRewards) {
      const key = normalizeAttrKeyStrict(String(a?.key || ''));
      if (!key) continue;
      rawAttrs.push({
        key,
        name: ATTRIBUTE_LABELS[key],
        delta: Number(a?.delta) || 0.4,
        reason: String(a?.reason || 'Directly supports this quest goal.').trim(),
      });
    }
  }

  const milestones = Array.isArray(parsed.milestones) && parsed.milestones.length > 0
    ? parsed.milestones
        .filter((m) => typeof m?.title === 'string' && m.title.trim())
        .map((m) => ({
          title: String(m.title).trim(),
          expBonus: Number(m.expBonus) || 4,
        }))
    : [{ title: 'Complete primary goal milestone', expBonus: 4 }];

  const validated = validateQuestRewards(
    difficulty,
    Number(parsed.expReward) || 15,
    rawAttrs,
    milestones
  );

  return {
    title: parsed.title.trim().slice(0, 80),
    loreDescription: String(parsed.loreDescription || goalDescription).trim(),
    category: String(parsed.category || 'Exploration').trim(),
    difficulty,
    estimatedDuration: String(parsed.estimatedDuration || '2 weeks').trim(),
    mainObjectives: Array.isArray(parsed.mainObjectives)
      ? parsed.mainObjectives.map((s) => String(s).trim()).filter(Boolean).slice(0, 4)
      : [],
    sideObjectives: Array.isArray(parsed.sideObjectives)
      ? parsed.sideObjectives.map((s) => String(s).trim()).filter(Boolean).slice(0, 3)
      : [],
    milestones: validated.milestones,
    completionCriteria: String(
      parsed.completionCriteria || 'Complete all main objectives honestly.'
    ).trim(),
    attributeRewards: validated.attributeRewards,
    expReward: validated.expReward,
    possibleCollectibleHint: validated.collectibleRewardEligible
      ? String(
          parsed.possibleCollectibleHint || 'Eligible for a rare collectible upon completion'
        ).trim()
      : undefined,
    collectibleRewardEligible: validated.collectibleRewardEligible,
    aiReasoning: String(
      parsed.aiReasoning || 'Attributes and EXP calibrated to real-world effort.'
    ).trim(),
  };
}

export interface AchievementRawAIOutput {
  significantEnough?: boolean;
  name?: string;
  description?: string;
  lore?: string;
  rarity?: string;
  condition?: string;
  expReward?: number;
  titleSuggestion?: string;
  collectibleName?: string;
  collectibleDescription?: string;
  collectibleLore?: string;
  collectibleType?: string;
  artworkPrompt?: string;
}

export function validateAndBuildAchievementMetadata(params: {
  parsed: AchievementRawAIOutput;
  difficulty: ActivityDifficulty;
  existingAchievementNames: string[];
  existingCollectibleNames: string[];
}) {
  const { parsed, difficulty, existingAchievementNames, existingCollectibleNames } = params;

  if (parsed.significantEnough === false || difficulty === 'Tiny' || difficulty === 'Easy') {
    return { eligible: false as const, reason: 'Experience does not warrant a rare achievement or collectible.' };
  }

  if (typeof parsed.name !== 'string' || !parsed.name.trim()) {
    throw new Error('Incomplete achievement metadata: missing name.');
  }

  const normalizedExistingAch = new Set(
    existingAchievementNames.map((n) => n.toLowerCase().trim())
  );
  let achName = parsed.name.trim().slice(0, 64);
  if (normalizedExistingAch.has(achName.toLowerCase())) {
    achName = `${achName} II`;
  }

  const fallbackRarity = difficultyToRarity(difficulty);
  const rarity = normalizeRarity(parsed.rarity || fallbackRarity, fallbackRarity);

  const normalizedExistingCol = new Set(
    existingCollectibleNames.map((n) => n.toLowerCase().trim())
  );
  let colName = String(parsed.collectibleName || `Relic of ${achName}`).trim().slice(0, 64);
  if (normalizedExistingCol.has(colName.toLowerCase())) {
    colName = `${colName} (Forged)`;
  }

  const expCap = DIFFICULTY_ECONOMY[difficulty].maxExp;
  const conservativeExp = Math.max(5, Math.min(Math.round(Number(parsed.expReward) || 12), expCap));

  return {
    eligible: true as const,
    achievement: {
      name: achName,
      description: String(parsed.description || 'Earned through deliberate real-life effort.').trim(),
      rarity,
      condition: String(parsed.condition || 'Significant Chronicle milestone').trim(),
      expReward: conservativeExp,
      iconName: 'Award',
      dynamicallyGenerated: true,
    },
    titleSuggestion: parsed.titleSuggestion ? String(parsed.titleSuggestion).trim().slice(0, 48) : undefined,
    collectibleMetadata: {
      name: colName,
      description: String(parsed.collectibleDescription || parsed.description || colName).trim(),
      lore: String(parsed.collectibleLore || parsed.lore || 'Forged from real-world mastery.').trim(),
      rarity,
      category: normalizeCollectibleType(parsed.collectibleType || 'Relic'),
      artworkPrompt: String(
        parsed.artworkPrompt ||
          `Dark fantasy obsidian and gold RPG emblem artifact representing "${colName}", high detail, centered relic on deep charcoal background, no text.`
      ).trim(),
    },
  };
}
