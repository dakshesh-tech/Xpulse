import type {
  ActivityDifficulty,
  AttributeDelta,
  AttributeKey,
  CollectibleType,
  ExperienceActivity,
  ExperienceSentiment,
  Rarity,
} from '../src/types/rpg.ts';

export interface DifficultyConfig {
  minExp: number;
  maxExp: number;
  maxAttrDeltaPerTrait: number;
  maxTotalAttrDelta: number;
  collectibleChance: number;
  rarityPool: Rarity[];
}

export const DIFFICULTY_ECONOMY: Record<ActivityDifficulty, DifficultyConfig> = {
  Tiny: {
    minExp: 1,
    maxExp: 3,
    maxAttrDeltaPerTrait: 0.15,
    maxTotalAttrDelta: 0.25,
    collectibleChance: 0,
    rarityPool: ['Common'],
  },
  Easy: {
    minExp: 4,
    maxExp: 8,
    maxAttrDeltaPerTrait: 0.35,
    maxTotalAttrDelta: 0.55,
    collectibleChance: 0,
    rarityPool: ['Common', 'Uncommon'],
  },
  Medium: {
    minExp: 9,
    maxExp: 20,
    maxAttrDeltaPerTrait: 0.65,
    maxTotalAttrDelta: 1.15,
    collectibleChance: 0.15,
    rarityPool: ['Uncommon', 'Rare'],
  },
  Hard: {
    minExp: 21,
    maxExp: 45,
    maxAttrDeltaPerTrait: 1.1,
    maxTotalAttrDelta: 2.1,
    collectibleChance: 0.38,
    rarityPool: ['Rare', 'Epic'],
  },
  'Very Hard': {
    minExp: 46,
    maxExp: 80,
    maxAttrDeltaPerTrait: 1.8,
    maxTotalAttrDelta: 3.4,
    collectibleChance: 0.72,
    rarityPool: ['Epic', 'Legendary'],
  },
  Exceptional: {
    minExp: 81,
    maxExp: 120,
    maxAttrDeltaPerTrait: 2.8,
    maxTotalAttrDelta: 5.0,
    collectibleChance: 0.92,
    rarityPool: ['Legendary', 'Mythical'],
  },
};

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  intelligence: 'Intelligence',
  knowledge: 'Knowledge',
  wisdom: 'Wisdom',
  strength: 'Strength',
  discipline: 'Discipline',
  creativity: 'Creativity',
  social: 'Social',
  courage: 'Courage',
  miscellaneous: 'Miscellaneous',
};

export function roundStatDelta(val: number): number {
  return Math.round(val * 100) / 100;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

export function difficultyToRarity(difficulty: ActivityDifficulty): Rarity {
  switch (difficulty) {
    case 'Tiny':
      return 'Common';
    case 'Easy':
      return 'Uncommon';
    case 'Medium':
      return 'Rare';
    case 'Hard':
      return 'Epic';
    case 'Very Hard':
      return 'Legendary';
    case 'Exceptional':
      return 'Mythical';
  }
}

/**
 * Diminishing returns multiplier when repeating trivial activities on the same day.
 */
export function computeDiminishingFactor(
  recentSameDayActivities: ExperienceActivity[],
  category: ExperienceActivity['category'],
  difficulty: ActivityDifficulty
): { factor: number; applied: boolean } {
  if (difficulty !== 'Tiny' && difficulty !== 'Easy') {
    return { factor: 1, applied: false };
  }
  const sameCategoryCount = recentSameDayActivities.filter(
    (a) =>
      a.category === category &&
      (a.difficulty === 'Tiny' || a.difficulty === 'Easy') &&
      !a.isReversalRecord
  ).length;

  if (sameCategoryCount === 0) return { factor: 1, applied: false };
  if (sameCategoryCount === 1) return { factor: 0.65, applied: true };
  if (sameCategoryCount === 2) return { factor: 0.35, applied: true };
  return { factor: 0.15, applied: true };
}

/**
 * Strict server-side validation for AI-proposed chronicle evaluations.
 * Supports positive, negative, neutral, and mixed sentiments.
 * Enforces attribute relevance, protects illness/rest days from penalties,
 * and caps EXP/attributes to the multi-year economy.
 */
export function validateChronicleEvaluation(params: {
  rawInput: string;
  sentiment: ExperienceSentiment;
  difficulty: ActivityDifficulty;
  proposedExp: number;
  proposedAttributes: AttributeDelta[];
  recentSameDayActivities: ExperienceActivity[];
  category: ExperienceActivity['category'];
  wantsCollectible: boolean;
  collectibleType?: CollectibleType;
}): {
  sentiment: ExperienceSentiment;
  expEarned: number;
  attributeDeltas: AttributeDelta[];
  collectibleEligible: boolean;
  collectibleType?: CollectibleType;
  diminishingFactorApplied: boolean;
  warnings: string[];
} {
  const lower = params.rawInput.toLowerCase();
  const cfg = DIFFICULTY_ECONOMY[params.difficulty] ?? DIFFICULTY_ECONOMY.Easy;
  const warnings: string[] = [];

  // Protect illness, injury, emergencies, and intentional recovery rest days from penalties
  const isProtectedRestOrIllness =
    /\b(sick|ill|illness|fever|flu|cold|injured|injury|hospital|doctor|migraine|emergency|rest day|recovery day|exhausted|burned out|burnout)\b/.test(
      lower
    );

  // 1. Neutral events: zero EXP and zero attribute shift
  if (params.sentiment === 'neutral') {
    return {
      sentiment: 'neutral',
      expEarned: 0,
      attributeDeltas: [],
      collectibleEligible: false,
      diminishingFactorApplied: false,
      warnings: [],
    };
  }

  // Semantic context checks (strict word boundaries)
  const hasPhysicalPositiveContext =
    /\b(gym|workout|run|running|ran|jog|jogging|lift|lifting|squat|deadlift|pushup|pullup|swim|hike|hiking|trek|climb|climbing|yoga|martial|sport|cycling|sprint|marathon|exercise|cardio|stretch|physical|training|walked \d+)\b/.test(
      lower
    ) && !/\b(skipped|missed|avoided|didn't go to|did not go to)\s+(the\s+|my\s+)?(planned\s+)?(gym|workout|run|training|exercise)\b/.test(lower);

  const hasLearningContext =
    /\b(learn|learned|learning|study|studied|studying|read|reading|book|course|lecture|workshop|seminar|research|exam|examination|math|mathematics|python|numpy|pandas|tutorial|paper|class|practice|ml|ai|coding|programming|project)\b/.test(
      lower
    );

  const hasSocialContext =
    /\b(talk|talked|talking|spoke|speak|friend|girl|boy|colleague|team|teammate|mentor|teach|taught|meetup|party|network|interview|pitch|host|hosted|collaborate|collaboration|conversation|family|stranger|community|social)\b/.test(
      lower
    );

  const hasCreativeContext =
    /\b(create|created|creating|build|built|building|design|designed|sketch|draw|paint|write|wrote|music|compose|prototype|app|application|project|invent|craft|video|story|deploy|deployed)\b/.test(
      lower
    );

  const filterPositiveAttrs = (attrs: AttributeDelta[]): AttributeDelta[] => {
    const filtered: AttributeDelta[] = [];
    for (const attr of attrs) {
      if (attr.delta <= 0) continue;
      if (attr.key === 'strength' && !hasPhysicalPositiveContext) {
        warnings.push('Stripped Strength because the experience lacked completed physical exertion.');
        continue;
      }
      if (attr.key === 'social' && !hasSocialContext && params.category !== 'Community') {
        continue;
      }
      if (
        attr.key === 'creativity' &&
        !hasCreativeContext &&
        !hasLearningContext &&
        params.category !== 'Craft'
      ) {
        continue;
      }

      filtered.push({
        key: attr.key,
        name: ATTRIBUTE_LABELS[attr.key],
        delta: roundStatDelta(clamp(attr.delta, 0.05, cfg.maxAttrDeltaPerTrait)),
        reason: attr.reason,
      });
    }

    let runningSum = 0;
    const bounded: AttributeDelta[] = [];
    for (const a of filtered.slice(0, 3)) {
      const remaining = roundStatDelta(cfg.maxTotalAttrDelta - runningSum);
      if (remaining <= 0) break;
      const clampedDelta = roundStatDelta(Math.min(a.delta, remaining));
      if (clampedDelta >= 0.05) {
        bounded.push({ ...a, delta: clampedDelta });
        runningSum += clampedDelta;
      }
    }
    return bounded;
  };

  const filterNegativeAttrs = (attrs: AttributeDelta[]): AttributeDelta[] => {
    if (isProtectedRestOrIllness) {
      warnings.push('Illness, unavoidable circumstances, and recovery rest are never penalized.');
      return [];
    }
    return attrs
      .filter((a) => a.delta < 0 && (a.key === 'discipline' || a.key === 'knowledge' || a.key === 'wisdom'))
      .map((a) => ({
        key: a.key,
        name: ATTRIBUTE_LABELS[a.key],
        delta: roundStatDelta(-clamp(Math.abs(a.delta), 0.1, 0.5)),
        reason: a.reason,
      }))
      .slice(0, 2);
  };

  // 2. Negative-only experiences
  if (params.sentiment === 'negative') {
    const safeNegatives = filterNegativeAttrs(params.proposedAttributes);
    if (safeNegatives.length === 0 && isProtectedRestOrIllness) {
      return {
        sentiment: 'neutral',
        expEarned: 0,
        attributeDeltas: [],
        collectibleEligible: false,
        diminishingFactorApplied: false,
        warnings,
      };
    }

    return {
      sentiment: 'negative',
      expEarned: 0,
      attributeDeltas: safeNegatives,
      collectibleEligible: false,
      diminishingFactorApplied: false,
      warnings,
    };
  }

  // 3. Mixed experiences (e.g. skipped workout BUT studied Python for 2 hours)
  if (params.sentiment === 'mixed') {
    const positives = filterPositiveAttrs(params.proposedAttributes);
    const negatives = filterNegativeAttrs(params.proposedAttributes);
    const combinedDeltas = [...positives, ...negatives];

    const { factor, applied } = computeDiminishingFactor(
      params.recentSameDayActivities,
      params.category,
      params.difficulty
    );
    const clampedBaseExp =
      positives.length > 0 || params.proposedExp > 0
        ? clamp(Math.round(params.proposedExp), cfg.minExp, cfg.maxExp)
        : 0;
    const finalExp = Math.max(0, Math.round(clampedBaseExp * factor));

    return {
      sentiment: 'mixed',
      expEarned: finalExp,
      attributeDeltas: combinedDeltas,
      collectibleEligible: false,
      diminishingFactorApplied: applied,
      warnings,
    };
  }

  // 4. Positive experiences
  const boundedAttrs = filterPositiveAttrs(params.proposedAttributes);
  const { factor, applied } = computeDiminishingFactor(
    params.recentSameDayActivities,
    params.category,
    params.difficulty
  );
  const clampedBaseExp =
    params.proposedExp <= 0 && boundedAttrs.length === 0
      ? 0
      : clamp(Math.round(params.proposedExp), cfg.minExp, cfg.maxExp);
  const finalExp = Math.max(0, Math.round(clampedBaseExp * factor));

  const collectibleAllowed =
    cfg.collectibleChance > 0 && params.wantsCollectible && finalExp >= 9;

  return {
    sentiment: 'positive',
    expEarned: finalExp,
    attributeDeltas: boundedAttrs,
    collectibleEligible: collectibleAllowed,
    collectibleType: collectibleAllowed ? params.collectibleType ?? 'Relic' : undefined,
    diminishingFactorApplied: applied,
    warnings,
  };
}

/**
 * Validates and clamps AI-generated quest rewards to the sustainable economy.
 */
export function validateQuestRewards(
  difficulty: ActivityDifficulty,
  rawExpReward: number,
  rawAttributes: AttributeDelta[],
  milestones: { title: string; expBonus: number }[]
): {
  expReward: number;
  attributeRewards: AttributeDelta[];
  milestones: { title: string; expBonus: number }[];
  collectibleRewardEligible: boolean;
} {
  const cfg = DIFFICULTY_ECONOMY[difficulty] ?? DIFFICULTY_ECONOMY.Medium;
  const clampedCompletionExp = clamp(Math.round(rawExpReward), cfg.minExp, cfg.maxExp);

  const safeMilestones = milestones.slice(0, 6).map((m) => ({
    title: m.title.trim(),
    expBonus: clamp(Math.round(m.expBonus || 3), 2, Math.max(3, Math.floor(cfg.minExp * 0.6))),
  }));

  const safeAttributes = rawAttributes
    .filter((a) => a.delta > 0)
    .slice(0, 3)
    .map((a) => ({
      key: a.key,
      name: ATTRIBUTE_LABELS[a.key],
      delta: roundStatDelta(clamp(a.delta, 0.25, cfg.maxAttrDeltaPerTrait * 1.35)),
      reason: a.reason,
    }));

  return {
    expReward: clampedCompletionExp,
    attributeRewards: safeAttributes,
    milestones: safeMilestones,
    collectibleRewardEligible: cfg.collectibleChance > 0,
  };
}

/**
 * Sanitizes AI-generated SVG artwork before saving to disk on the server.
 */
export function sanitizeGeneratedSvg(svgMarkup: string): string | null {
  if (!svgMarkup || typeof svgMarkup !== 'string') return null;
  const trimmed = svgMarkup.trim();
  const startIdx = trimmed.indexOf('<svg');
  const endIdx = trimmed.lastIndexOf('</svg>');
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return null;

  let svg = trimmed.slice(startIdx, endIdx + 6);

  const forbiddenPatterns = [
    /<script[\s>]/i,
    /<foreignObject[\s>]/i,
    /<iframe[\s>]/i,
    /<object[\s>]/i,
    /<embed[\s>]/i,
    /on[a-z]+\s*=/i,
    /javascript:/i,
    /data:text\/html/i,
    /xlink:href\s*=\s*["']https?:/i,
    /href\s*=\s*["']https?:/i,
  ];

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(svg)) {
      return null;
    }
  }

  if (!/xmlns=/.test(svg)) {
    svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  if (!/viewBox=/.test(svg)) {
    svg = svg.replace('<svg', '<svg viewBox="0 0 512 512"');
  }

  return svg;
}
