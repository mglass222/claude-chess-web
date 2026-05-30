import { MOVE_TIME_OPTIONS, getDifficultyLabel } from '../config.js';

/**
 * The two player-info banners: opponent (above the board) and player (below).
 * Builds the elements; placement into the layout stays with the controller.
 */
export class PlayerInfoView {
  constructor() {
    this.opponentEl = this._build('opponent');
    this.playerEl = this._build('player');
  }

  _build(role) {
    const el = document.createElement('div');
    el.className = `player-info ${role}`;
    el.style.display = 'none';

    const avatar = document.createElement('div');
    avatar.className = 'player-avatar';

    const name = document.createElement('span');
    name.className = 'player-name';

    el.appendChild(avatar);
    el.appendChild(name);
    return el;
  }

  update(state) {
    const isWhite = state.playerColor === 'w';

    const playerAvatar = this.playerEl.querySelector('.player-avatar');
    const playerName = this.playerEl.querySelector('.player-name');
    playerAvatar.textContent = isWhite ? 'W' : 'B';
    playerAvatar.className = `player-avatar ${isWhite ? 'white-piece' : 'black-piece'}`;
    playerName.textContent = 'You';

    const opponentAvatar = this.opponentEl.querySelector('.player-avatar');
    const opponentName = this.opponentEl.querySelector('.player-name');
    opponentAvatar.textContent = isWhite ? 'B' : 'W';
    opponentAvatar.className = `player-avatar ${isWhite ? 'black-piece' : 'white-piece'}`;
    if (state.moveTime != null) {
      const mtOpt = MOVE_TIME_OPTIONS.find((o) => o.seconds === state.moveTime);
      const mtLabel = mtOpt ? mtOpt.label : `${state.moveTime}s`;
      opponentName.textContent = `Stockfish (${mtLabel}/move)`;
    } else {
      opponentName.textContent = `Stockfish (${getDifficultyLabel(state.difficulty)})`;
    }

    this.playerEl.style.display = 'flex';
    this.opponentEl.style.display = 'flex';
  }
}
