// All constants, theme definitions, and default settings

export const THEMES = {
  classic:    { light: '#d9d7c3', dark: '#658047' },
  modern:     { light: '#f0f0f0', dark: '#505050' },
  forest:     { light: '#e6e6c8', dark: '#326432' },
  lichess:    { light: '#f0d9b5', dark: '#b58863' },
  ocean:      { light: '#add8e6', dark: '#006994' },
  volcanic:   { light: '#ff6666', dark: '#323232' },
  desert:     { light: '#edc9af', dark: '#bd9a7a' },
  space:      { light: '#dcdcdc', dark: '#191970' },
  sunset:     { light: '#ffcc99', dark: '#993366' },
  neon:       { light: '#6414fe', dark: '#fe14ac' },
  coffee:     { light: '#d2b48c', dark: '#654321' },
  ice:        { light: '#c8e6ff', dark: '#325082' },
  midnight:   { light: '#646496', dark: '#141428' },
  royal:      { light: '#ffdfba', dark: '#4b0082' },
  pastel:     { light: '#ffdab9', dark: '#ba55d3' },
  steampunk:  { light: '#bdb76b', dark: '#581845' },
};

export const THEME_NAMES = Object.keys(THEMES);

export const DIFFICULTY_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// Map difficulty (1-10) to Stockfish Skill Level (0-20) and depth limit
export function getDifficultyConfig(difficulty) {
  const skillLevel = Math.round((difficulty - 1) * (20 / 9));
  const depth = Math.min(difficulty + 2, 15);
  return { skillLevel, depth };
}

export const DEFAULTS = {
  playerColor: 'w',   // 'w' or 'b'
  difficulty: 5,
  theme: 'classic',
  volume: 0.5,
  soundEnabled: true,
  analysisDepth: 18,
};

export const ANIMATION_DURATION = 300; // ms
export const EVAL_BAR_ANIMATION_DURATION = 300; // ms
export const ANALYSIS_DEPTH_MIN = 16;
export const ANALYSIS_DEPTH_MAX = 22;

export const COLORS = {
  darkBlue: '#4a7b9d',
  mutedGold: '#b58863',
  softOffWhite: '#b4b4b4',
  textWhite: '#ffffff',
  offWhite: '#e6e6e6',
  highlight: 'rgba(255, 255, 0, 0.6)',
  legalMoveDot: 'rgba(50, 200, 50, 0.6)',
  hintGreen: 'rgba(0, 220, 0, 0.7)',
};
