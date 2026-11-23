import type { ActivityDifficulty, Rarity } from '../types/rpg.ts';

/**
 * Long-term multi-year cumulative EXP curve.
 * Tuned so Dakshesh (8,450 EXP) sits at Level 12 (next level at 9,200 EXP),
 * and higher levels scale progressively so multi-year progression stays meaningful.
 */
export function getCumulativeExpForLevel(level: number): number {
  if (level <= 1) return 0;
  const table: Record<number, number> = {
    1: 0,
    2: 120,
    3: 320,
    4: 620,
    5: 1050,
    6: 1620,
    7: 2350,
    8: 3250,
    9: 4300,
    10: 5450,
    11: 6600,
    12: 7800,
    13: 9200,
    14: 10900,
    15: 12950,
  };
  if (table[level] !== undefined) return table[level];
  let exp = 12950;
  for (let l = 16; l <= level; l++) {
    exp += Math.round(2100 + (l - 15) * 450);
  }
  return exp;
}

export function getLevelFromExp(totalExp: number): number {
  const safeExp = Math.max(0, totalExp);
  let level = 1;
  while (safeExp >= getCumulativeExpForLevel(level + 1)) {
    level++;
    if (level > 99) break;
  }
  return level;
}

export function getLevelProgress(totalExp: number) {
  const safeExp = Math.max(0, totalExp);
  const level = getLevelFromExp(safeExp);
  const currentLevelFloor = getCumulativeExpForLevel(level);
  const nextLevelCeiling = getCumulativeExpForLevel(level + 1);
  const expIntoLevel = safeExp - currentLevelFloor;
  const expSpan = Math.max(1, nextLevelCeiling - currentLevelFloor);
  const percentage = Math.min(100, Math.max(0, Math.round((expIntoLevel / expSpan) * 100)));

  return {
    level,
    currentLevelFloor,
    nextLevelCeiling,
    expIntoLevel,
    expRemaining: Math.max(0, nextLevelCeiling - safeExp),
    expSpan,
    percentage,
  };
}

export interface RarityStyle {
  label: string;
  textColor: string;
  borderColor: string;
  subtleBg: string;
  glowClass: string;
  accentHex: string;
}

export const RARITY_STYLES: Record<Rarity, RarityStyle> = {
  Common: {
    label: 'Common',
    textColor: 'text-slate-300',
    borderColor: 'border-slate-600/40',
    subtleBg: 'bg-slate-500/10',
    glowClass: '',
    accentHex: '#94A3B8',
  },
  Uncommon: {
    label: 'Uncommon',
    textColor: 'text-emerald-300',
    borderColor: 'border-emerald-500/35',
    subtleBg: 'bg-emerald-500/10',
    glowClass: '',
    accentHex: '#34D399',
  },
  Rare: {
    label: 'Rare',
    textColor: 'text-sky-300',
    borderColor: 'border-sky-400/40',
    subtleBg: 'bg-sky-500/10',
    glowClass: 'rarity-glow-rare',
    accentHex: '#60A5FA',
  },
  Epic: {
    label: 'Epic',
    textColor: 'text-violet-300',
    borderColor: 'border-violet-400/45',
    subtleBg: 'bg-violet-500/12',
    glowClass: 'rarity-glow-epic',
    accentHex: '#A78BFA',
  },
  Legendary: {
    label: 'Legendary',
    textColor: 'text-amber-300',
    borderColor: 'border-amber-400/50',
    subtleBg: 'bg-amber-500/12',
    glowClass: 'rarity-glow-legendary',
    accentHex: '#D4A853',
  },
  Mythical: {
    label: 'Mythical',
    textColor: 'text-fuchsia-300',
    borderColor: 'border-fuchsia-400/50',
    subtleBg: 'bg-fuchsia-500/12',
    glowClass: 'rarity-glow-mythical',
    accentHex: '#E879F9',
  },
};

export const DIFFICULTY_TEXT_COLORS: Record<ActivityDifficulty, string> = {
  Tiny: 'text-slate-400',
  Easy: 'text-emerald-300',
  Medium: 'text-sky-300',
  Hard: 'text-violet-300',
  'Very Hard': 'text-amber-300',
  Exceptional: 'text-fuchsia-300',
};

export function getAttributeTierLabel(value: number): string {
  if (value >= 75) return 'Grandmaster';
  if (value >= 60) return 'Master';
  if (value >= 45) return 'Adept';
  if (value >= 30) return 'Practitioner';
  if (value >= 15) return 'Initiate';
  return 'Novice';
}

export function formatDelta(delta: number): string {
  const rounded = Math.round(delta * 100) / 100;
  const formatted = Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2).replace(/0$/, '');
  return rounded > 0 ? `+${formatted}` : formatted;
}

/**
 * Gentle Web Audio API synthesized chimes for tactile RPG feedback.
 */
export function playRpgSound(type: 'exp' | 'levelup' | 'achievement' | 'click' | 'undo', enabled: boolean) {
  if (!enabled || typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const playNote = (freq: number, startOffset: number, duration: number, gainPeak = 0.06) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(0.0001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(gainPeak, now + startOffset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.02);
    };

    if (type === 'click') {
      playNote(520, 0, 0.08, 0.03);
    } else if (type === 'undo') {
      playNote(440, 0, 0.14, 0.04);
      playNote(349.23, 0.08, 0.2, 0.04);
    } else if (type === 'exp') {
      playNote(440, 0, 0.22, 0.05);
      playNote(659.25, 0.09, 0.32, 0.05);
    } else if (type === 'achievement') {
      playNote(523.25, 0, 0.25, 0.05);
      playNote(659.25, 0.1, 0.25, 0.05);
      playNote(783.99, 0.2, 0.45, 0.06);
    } else if (type === 'levelup') {
      playNote(392.0, 0, 0.24, 0.06);
      playNote(493.88, 0.11, 0.24, 0.06);
      playNote(587.33, 0.22, 0.28, 0.06);
      playNote(783.99, 0.34, 0.6, 0.07);
    }
  } catch {
    // Ignore audio context restrictions
  }
}
