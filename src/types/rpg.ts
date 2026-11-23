export type NavSection =
  | 'character'
  | 'quests'
  | 'achievements'
  | 'statistics'
  | 'challenges'
  | 'collection';

export type AttributeKey =
  | 'intelligence'
  | 'knowledge'
  | 'wisdom'
  | 'strength'
  | 'discipline'
  | 'creativity'
  | 'social'
  | 'courage'
  | 'miscellaneous';

export type Rarity =
  | 'Common'
  | 'Uncommon'
  | 'Rare'
  | 'Epic'
  | 'Legendary'
  | 'Mythical';

export type ActivityDifficulty =
  | 'Tiny'
  | 'Easy'
  | 'Medium'
  | 'Hard'
  | 'Very Hard'
  | 'Exceptional';

export type ExperienceSentiment = 'positive' | 'neutral' | 'negative' | 'mixed';

export type Difficulty = 'Apprentice' | 'Adept' | 'Veteran' | 'Master';

export type CollectibleType = 'Relic' | 'Artifact' | 'Portrait' | 'Frame' | 'Token';

export interface AttributeHistoryEntry {
  id: string;
  date: string;
  label: string;
  delta: number;
  valueAfter: number;
  transactionId?: string;
}

export interface Attribute {
  key: AttributeKey;
  name: string;
  /** Displayed rounded integer score */
  value: number;
  /** Internal fractional progression for long-term sustainability */
  progress: number;
  maxRankScale: number;
  recentDelta: number;
  description: string;
  iconName: string;
  accentHex: string;
  history: AttributeHistoryEntry[];
}

export interface AttributeDelta {
  key: AttributeKey;
  name: string;
  delta: number;
  reason?: string;
}

export interface ProgressionTransaction {
  id: string;
  timestamp: string;
  date: string;
  sourceType:
    | 'activity'
    | 'quest_milestone'
    | 'quest_completion'
    | 'challenge_completion'
    | 'achievement_bonus'
    | 'collectible_reward'
    | 'reversal';
  sourceId: string;
  description: string;
  expDelta: number;
  attributeDeltas: AttributeDelta[];
  reversed: boolean;
  reversedAt?: string;
  reversalOfTransactionId?: string;
}

export interface ExperienceActivity {
  id: string;
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  timestamp: string;
  category:
    | 'Learning'
    | 'Craft'
    | 'Vitality'
    | 'Reflection'
    | 'Community'
    | 'Exploration'
    | 'Miscellaneous';
  difficulty: ActivityDifficulty;
  sentiment: ExperienceSentiment;
  rarity: Rarity;
  expEarned: number;
  attributesAffected: AttributeDelta[];
  transactionId?: string;
  achievementUnlockedId?: string;
  achievementUnlockedName?: string;
  collectibleId?: string;
  collectibleName?: string;
  gmNote?: string;
  isReversalRecord?: boolean;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  rarity: Rarity;
  unlocked: boolean;
  unlockedDate?: string;
  condition: string;
  expReward: number;
  progressCurrent?: number;
  progressTarget?: number;
  iconName: string;
  featured?: boolean;
  dynamicallyGenerated?: boolean;
  transactionId?: string;
}

export interface QuestMilestone {
  id: string;
  title: string;
  completed: boolean;
  expBonus: number;
  transactionId?: string;
}

export interface Quest {
  id: string;
  title: string;
  loreDescription: string;
  status: 'active' | 'completed';
  category: string;
  difficulty: ActivityDifficulty;
  estimatedDuration: string;
  mainObjectives: string[];
  sideObjectives: string[];
  completionCriteria: string;
  milestones: QuestMilestone[];
  expReward: number;
  attributeRewards: AttributeDelta[];
  titleReward?: string;
  collectibleRewardEligible?: boolean;
  createdAt: string;
  completedAt?: string;
  completionTransactionId?: string;
}

export interface GeneratedQuestDraft {
  title: string;
  loreDescription: string;
  category: string;
  difficulty: ActivityDifficulty;
  estimatedDuration: string;
  mainObjectives: string[];
  sideObjectives: string[];
  milestones: { title: string; expBonus: number }[];
  completionCriteria: string;
  attributeRewards: AttributeDelta[];
  expReward: number;
  possibleCollectibleHint?: string;
  collectibleRewardEligible: boolean;
  aiReasoning: string;
}

export interface Challenge {
  id: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  progressCurrent: number;
  progressTarget: number;
  unitLabel: string;
  expReward: number;
  attributeRewards: AttributeDelta[];
  deadline?: string;
  status: 'active' | 'completed';
  completionTransactionId?: string;
}

export interface TitleItem {
  id: string;
  name: string;
  description: string;
  rarity: Rarity;
  unlocked: boolean;
  unlockSource: string;
  earnedDate?: string;
}

export interface Collectible {
  id: string;
  name: string;
  description: string;
  lore: string;
  rarity: Rarity;
  imageUrl: string;
  iconName: string;
  acquiredDate: string;
  category: CollectibleType;
  sourceActivityId?: string;
  sourceLabel?: string;
  transactionId?: string;
}

export interface PendingCollectible {
  id: string;
  sourceActivityId?: string;
  sourceLabel: string;
  difficulty: ActivityDifficulty;
  suggestedType: CollectibleType;
  rarity: Rarity;
  status: 'pending' | 'generating' | 'failed';
  errorMessage?: string;
  createdAt: string;
  transactionId?: string;
}

export interface ProfilePortrait {
  id: string;
  name: string;
  description: string;
  rarity: Rarity;
  imageUrl: string;
  unlocked: boolean;
  sourceCollectibleId?: string;
  acquiredDate?: string;
}

export interface ProfileCosmetic {
  id: string;
  name: string;
  description: string;
  rarity: Rarity;
  unlocked: boolean;
  borderClass: string;
  ringStyle: string;
  sourceCollectibleId?: string;
}

export interface PlayerProfile {
  name: string;
  level: number;
  totalExp: number;
  equippedTitleId: string;
  equippedCosmeticId: string;
  equippedPortraitId: string;
  showcasedAchievementIds: string[];
  avatarUrl: string;
  bannerUrl: string;
  archetype: string;
  joinedDate: string;
}

export interface GMEvaluationProposal {
  id: string;
  interpretation: string;
  summaryTitle: string;
  rawInput: string;
  gmCommentary: string;
  reasoning: string;
  sentiment: ExperienceSentiment;
  difficulty: ActivityDifficulty;
  confidence: number;
  category: ExperienceActivity['category'];
  expEarned: number;
  attributeDeltas: AttributeDelta[];
  collectibleEligible: boolean;
  collectibleType?: CollectibleType;
  collectibleReason?: string;
  proposedAchievement?: Omit<Achievement, 'id' | 'unlocked' | 'unlockedDate'>;
  wouldLevelUpTo?: number;
  diminishingFactorApplied?: boolean;
  status: 'pending' | 'approved' | 'discarded';
}

export interface GMMessage {
  id: string;
  sender: 'player' | 'gm';
  text: string;
  timestamp: string;
  isClarifyingQuestion?: boolean;
  proposal?: GMEvaluationProposal;
}

export interface DailyExpPoint {
  date: string;
  label: string;
  exp: number;
  experiences: number;
}

export interface AppSettings {
  soundEnabled: boolean;
  reducedMotion: boolean;
  gmVoiceHintEnabled: boolean;
}

export interface UndoToastItem {
  id: string;
  label: string;
  transactionId: string;
  questId?: string;
  milestoneId?: string;
  challengeId?: string;
  type: 'milestone' | 'quest' | 'challenge';
}

export interface GameState {
  player: PlayerProfile;
  attributes: Record<AttributeKey, Attribute>;
  activities: ExperienceActivity[];
  transactions: ProgressionTransaction[];
  achievements: Achievement[];
  quests: Quest[];
  challenges: Challenge[];
  titles: TitleItem[];
  collectibles: Collectible[];
  pendingCollectibles: PendingCollectible[];
  portraits: ProfilePortrait[];
  cosmetics: ProfileCosmetic[];
  dailyExpHistory: DailyExpPoint[];
  settings: AppSettings;
}
