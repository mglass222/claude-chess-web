import { MOVE_TIME_OPTIONS, getDifficultyLabel } from '../config.js';

/**
 * Build a PGN string for the current game.
 * @param {import('./GameState.js').GameState} state
 * @param {import('./MoveHistory.js').MoveHistory} history
 * @returns {string}
 */
export function generatePgn(state, history) {
  const date = new Date();
  const dateStr = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  const isWhite = state.lastPlayerColor === 'w';

  let engineLabel;
  if (state.moveTime != null) {
    const mtOpt = MOVE_TIME_OPTIONS.find((o) => o.seconds === state.moveTime);
    engineLabel = `Stockfish (${mtOpt ? mtOpt.label : state.moveTime + 's'}/move)`;
  } else {
    engineLabel = `Stockfish (${getDifficultyLabel(state.lastDifficulty)})`;
  }
  const white = isWhite ? 'You' : engineLabel;
  const black = isWhite ? engineLabel : 'You';

  let result = '*';
  if (state.phase === 'over') {
    if (state.winner === 'White') result = '1-0';
    else if (state.winner === 'Black') result = '0-1';
    else result = '1/2-1/2';
  }

  let pgn = '';
  pgn += `[Event "Claude Chess"]\n`;
  pgn += `[Site "-"]\n`;
  pgn += `[Date "${dateStr}"]\n`;
  pgn += `[Round "-"]\n`;
  pgn += `[White "${white}"]\n`;
  pgn += `[Black "${black}"]\n`;
  pgn += `[Result "${result}"]\n\n`;

  // Build move text from history
  const moves = history.getMoves();
  for (let i = 0; i < moves.length; i++) {
    if (i % 2 === 0) pgn += `${Math.floor(i / 2) + 1}. `;
    pgn += moves[i].san + ' ';
  }
  pgn += result;

  return pgn.trim();
}
