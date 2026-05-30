// All constants, theme definitions, and default settings

export const THEMES = {
  classic: { light: '#e8dcc8', dark: '#a07850' },
  modern: { light: '#f0f0f0', dark: '#505050' },
  forest: { light: '#e6e6c8', dark: '#326432' },
  lichess: { light: '#f0d9b5', dark: '#b58863' },
  ocean: { light: '#add8e6', dark: '#006994' },
  volcanic: { light: '#ff6666', dark: '#323232' },
  desert: { light: '#edc9af', dark: '#bd9a7a' },
  space: { light: '#dcdcdc', dark: '#191970' },
  sunset: { light: '#ffcc99', dark: '#993366' },
  neon: { light: '#6414fe', dark: '#fe14ac' },
  coffee: { light: '#d2b48c', dark: '#654321' },
  ice: { light: '#c8e6ff', dark: '#325082' },
  midnight: { light: '#646496', dark: '#141428' },
  royal: { light: '#ffdfba', dark: '#4b0082' },
  pastel: { light: '#ffdab9', dark: '#ba55d3' },
  steampunk: { light: '#bdb76b', dark: '#581845' },
};

export const THEME_NAMES = Object.keys(THEMES);

export const PIECE_SETS = [
  'alpha',
  'caliente',
  'california',
  'cardinal',
  'cburnett',
  'celtic',
  'chess7',
  'chessnut',
  'companion',
  'cooke',
  'dubrovny',
  'fantasy',
  'fresca',
  'gioco',
  'governor',
  'icpieces',
  'kosal',
  'leipzig',
  'maestro',
  'merida',
  'mpchess',
  'pirouetti',
  'rhosgfx',
  'riohacha',
  'spatial',
  'staunty',
  'tatiana',
  'xkcd',
];

export const DIFFICULTY_LEVELS = [
  { id: 1, label: 'Novice', short: 'Nov', skillLevel: 0, depth: 3 },
  { id: 2, label: 'Beginner', short: 'Beg', skillLevel: 3, depth: 5 },
  { id: 3, label: 'Intermediate', short: 'Int', skillLevel: 6, depth: 7 },
  { id: 4, label: 'Advanced', short: 'Adv', skillLevel: 10, depth: 9 },
  { id: 5, label: 'Master', short: 'Mst', skillLevel: 14, depth: 11 },
  { id: 6, label: 'IM', short: 'IM', skillLevel: 17, depth: 13 },
  { id: 7, label: 'GM', short: 'GM', skillLevel: 19, depth: 14 },
  { id: 8, label: 'Super GM', short: 'SGM', skillLevel: 20, depth: 15 },
];

// Seconds-per-move options (0 = instant / no movetime limit, uses depth 15)
export const MOVE_TIME_OPTIONS = [
  { label: 'Instant', seconds: 0 },
  { label: '1s', seconds: 1 },
  { label: '3s', seconds: 3 },
  { label: '5s', seconds: 5 },
  { label: '10s', seconds: 10 },
];

// Map difficulty id to Stockfish Skill Level and depth limit
export function getDifficultyConfig(difficulty) {
  const level = DIFFICULTY_LEVELS.find((d) => d.id === difficulty);
  if (level) return { skillLevel: level.skillLevel, depth: level.depth };
  // Fallback for legacy saves
  const skillLevel = Math.round((difficulty - 1) * (20 / 9));
  const depth = Math.min(difficulty + 2, 15);
  return { skillLevel, depth };
}

export function getDifficultyLabel(difficulty) {
  const level = DIFFICULTY_LEVELS.find((d) => d.id === difficulty);
  return level ? level.label : `Level ${difficulty}`;
}

export const TIME_CONTROLS = [
  { label: '1 min', minutes: 1 },
  { label: '3 min', minutes: 3 },
  { label: '5 min', minutes: 5 },
  { label: '10 min', minutes: 10 },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: 'None', minutes: 0 },
];

export const DEFAULTS = {
  playerColor: 'w', // 'w' or 'b'
  difficulty: 1,
  theme: 'classic',
  pieceSet: 'cburnett',
  volume: 0.5,
  soundEnabled: true,
  analysisDepth: 22, // = ANALYSIS_DEPTH_MAX; also clamped at use-site in _startAnalysis
};

export const ANIMATION_DURATION = 300; // ms
// Per-frame fraction the bar closes toward the latest target. Lower = smoother
// and slower; higher = snappier. Continuous easing toward the most recent deep
// eval blends successive eval changes into one glide instead of discrete jumps.
export const EVAL_BAR_SMOOTHING = 0.12;
export const EVAL_BAR_MIN_DEPTH = 20;
export const ANALYSIS_DEPTH_MIN = 16;
export const ANALYSIS_DEPTH_MAX = 22;

// Convert evaluation (with cp/mate) to a centipawn value for graphing
export function evalToCp(evaluation) {
  if (!evaluation) return null;
  const { cp, mate } = evaluation;
  if (mate != null) {
    return mate > 0 ? 10000 - Math.abs(mate) * 100 : -10000 + Math.abs(mate) * 100;
  }
  if (cp != null) {
    return cp;
  }
  return null;
}

export const ANNOTATION_COLORS = {
  orange: 'rgba(235, 137, 33, 0.6)',
  red: 'rgba(220, 50, 50, 0.6)',
  blue: 'rgba(50, 100, 220, 0.6)',
  yellow: 'rgba(220, 200, 50, 0.6)',
};
