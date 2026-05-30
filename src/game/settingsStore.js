import { DEFAULTS } from '../config.js';

const STORAGE_KEY = 'claude-chess-settings';

/**
 * Load persisted settings merged over DEFAULTS, migrating legacy saves.
 * Returns a fresh copy of DEFAULTS if nothing is stored or the data is corrupt.
 * @returns {object}
 */
export function loadSettings() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const settings = { ...DEFAULTS, ...JSON.parse(raw) };
      // Migrate old settings to the difficulty/time-control system
      if (!('timeControl' in settings)) {
        settings.difficulty = DEFAULTS.difficulty;
        settings.timeControl = 0;
      }
      return settings;
    } catch {
      // ignore corrupt data
    }
  }
  return { ...DEFAULTS };
}

/**
 * Persist the subset of settings the app restores on load.
 * @param {object} settings
 */
export function saveSettings(settings) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        theme: settings.theme,
        volume: settings.volume,
        soundEnabled: settings.soundEnabled,
        playerColor: settings.playerColor,
        difficulty: settings.difficulty,
        timeControl: settings.timeControl || 0,
        moveTime: settings.moveTime ?? null,
        pieceSet: settings.pieceSet,
      })
    );
  } catch {
    // Storage unavailable (private mode) or over quota — settings simply won't
    // persist; not worth interrupting the user over.
  }
}
