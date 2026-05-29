import { DIFFICULTY_LEVELS, MOVE_TIME_OPTIONS, TIME_CONTROLS } from '../config.js';

/**
 * Inline "New Game" setup panel that lives in the left panel. Lets the player
 * choose color, difficulty (or think-time-per-move), and time control.
 *
 * Callbacks:
 *   onStart({ color, difficulty, timeControl, moveTime })
 *   onCancel()
 */
export class NewGameSetup {
  constructor(pieceSet) {
    this.pieceSet = pieceSet;
    this.onStart = null;
    this.onCancel = null;

    // Current selection state.
    this._color = 'w';
    this._difficulty = 1;
    this._timeControl = 0;
    this._moveTime = null;
    this._engineMode = 'difficulty'; // 'difficulty' | 'movetime'

    this._build();
  }

  _build() {
    this.el = document.createElement('div');
    this.el.className = 'inline-new-game-setup';
    this.el.style.display = 'none';

    // --- Play As section ---
    const colorLabel = document.createElement('div');
    colorLabel.className = 'setup-section-label';
    colorLabel.textContent = 'Play As';

    const colorRow = document.createElement('div');
    colorRow.className = 'setup-color-row';

    this._whiteBtn = document.createElement('button');
    this._whiteBtn.className = 'setup-color-btn selected';
    this._whiteBtn.innerHTML = `<img src="${import.meta.env.BASE_URL}pieces/${this.pieceSet}/wK.svg" alt="White" class="setup-color-king"><span>White</span>`;
    this._whiteBtn.addEventListener('click', () => this._selectColor('w'));

    this._blackBtn = document.createElement('button');
    this._blackBtn.className = 'setup-color-btn';
    this._blackBtn.innerHTML = `<img src="${import.meta.env.BASE_URL}pieces/${this.pieceSet}/bK.svg" alt="Black" class="setup-color-king"><span>Black</span>`;
    this._blackBtn.addEventListener('click', () => this._selectColor('b'));

    colorRow.appendChild(this._whiteBtn);
    colorRow.appendChild(this._blackBtn);

    // --- Difficulty section ---
    const diffLabel = document.createElement('div');
    diffLabel.className = 'setup-section-label';
    diffLabel.textContent = 'Difficulty';

    this._diffSelect = document.createElement('select');
    this._diffSelect.className = 'setup-diff-select';
    for (const level of DIFFICULTY_LEVELS) {
      const opt = document.createElement('option');
      opt.value = level.id;
      opt.textContent = level.label;
      this._diffSelect.appendChild(opt);
    }
    this._diffSelect.addEventListener('change', () => {
      this._difficulty = parseInt(this._diffSelect.value);
      this._selectEngineMode('difficulty');
    });
    // Also switch mode when clicking the dropdown even if the value doesn't change.
    this._diffSelect.addEventListener('mousedown', () => {
      this._difficulty = parseInt(this._diffSelect.value);
      this._selectEngineMode('difficulty');
    });

    // --- Engine Think Time section (alternative to difficulty) ---
    const moveTimeLabel = document.createElement('div');
    moveTimeLabel.className = 'setup-section-label';
    moveTimeLabel.textContent = 'Or: Think Time Per Move';

    const moveTimeGrid = document.createElement('div');
    moveTimeGrid.className = 'setup-time-grid';

    this._moveTimeBtns = [];
    for (const mt of MOVE_TIME_OPTIONS) {
      const btn = document.createElement('button');
      btn.className = 'setup-time-btn';
      btn.dataset.seconds = mt.seconds;
      btn.textContent = mt.label;
      btn.addEventListener('click', () => {
        this._moveTime = mt.seconds;
        for (const b of this._moveTimeBtns)
          b.classList.toggle('selected', parseInt(b.dataset.seconds) === mt.seconds);
        this._selectEngineMode('movetime');
      });
      moveTimeGrid.appendChild(btn);
      this._moveTimeBtns.push(btn);
    }

    // --- Time Control section ---
    const timeLabel = document.createElement('div');
    timeLabel.className = 'setup-section-label';
    timeLabel.textContent = 'Time Control';

    const timeGrid = document.createElement('div');
    timeGrid.className = 'setup-time-grid';

    this._timeBtns = [];
    for (const tc of TIME_CONTROLS) {
      if (tc.minutes === 0) continue; // "None" handled separately below
      const btn = document.createElement('button');
      btn.className = 'setup-time-btn';
      btn.dataset.minutes = tc.minutes;
      btn.textContent = tc.label;
      btn.addEventListener('click', () => {
        this._timeControl = tc.minutes;
        for (const b of this._timeBtns)
          b.classList.toggle('selected', parseInt(b.dataset.minutes) === tc.minutes);
      });
      timeGrid.appendChild(btn);
      this._timeBtns.push(btn);
    }

    // No time limit button (infinity)
    const noTimeBtn = document.createElement('button');
    noTimeBtn.className = 'setup-time-btn setup-time-btn-infinite';
    noTimeBtn.dataset.minutes = 0;
    noTimeBtn.innerHTML = '&#8734;';
    noTimeBtn.addEventListener('click', () => {
      this._timeControl = 0;
      for (const b of this._timeBtns)
        b.classList.toggle('selected', parseInt(b.dataset.minutes) === 0);
    });
    this._timeBtns.push(noTimeBtn);

    // --- Action buttons ---
    const btnRow = document.createElement('div');
    btnRow.className = 'setup-action-row';

    const startBtn = document.createElement('button');
    startBtn.className = 'panel-btn';
    startBtn.textContent = 'Start Game';
    startBtn.addEventListener('click', () => {
      if (!this.onStart) return;
      this.onStart({
        color: this._color,
        difficulty: this._difficulty,
        timeControl: this._timeControl,
        moveTime: this._engineMode === 'movetime' ? this._moveTime : null,
      });
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'panel-btn panel-btn-secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      if (this.onCancel) this.onCancel();
    });

    btnRow.appendChild(startBtn);
    btnRow.appendChild(cancelBtn);

    const divider = () => {
      const d = document.createElement('div');
      d.className = 'setup-divider';
      return d;
    };

    this.el.appendChild(colorLabel);
    this.el.appendChild(colorRow);
    this.el.appendChild(divider());
    this.el.appendChild(diffLabel);
    this.el.appendChild(this._diffSelect);
    this.el.appendChild(moveTimeLabel);
    this.el.appendChild(moveTimeGrid);
    this.el.appendChild(divider());
    this.el.appendChild(timeLabel);
    this.el.appendChild(timeGrid);
    this.el.appendChild(noTimeBtn);
    this.el.appendChild(divider());
    this.el.appendChild(btnRow);
  }

  _selectColor(color) {
    this._color = color;
    this._whiteBtn.classList.toggle('selected', color === 'w');
    this._blackBtn.classList.toggle('selected', color === 'b');
  }

  _selectEngineMode(mode) {
    this._engineMode = mode;
    if (mode === 'difficulty') {
      this._moveTime = null;
      this._diffSelect.style.opacity = '1';
      for (const b of this._moveTimeBtns) b.classList.remove('selected');
    } else {
      this._diffSelect.style.opacity = '0.4';
    }
  }

  /** Sync the panel to the given settings, then display it. */
  show(settings) {
    this._color = settings.playerColor;
    this._difficulty = settings.difficulty;
    this._timeControl = settings.timeControl || 0;
    this._moveTime = settings.moveTime ?? null;

    this._selectColor(this._color);
    this._diffSelect.value = this._difficulty;
    for (const b of this._timeBtns)
      b.classList.toggle('selected', parseInt(b.dataset.minutes) === this._timeControl);

    this._engineMode = this._moveTime != null ? 'movetime' : 'difficulty';
    this._diffSelect.style.opacity = this._engineMode === 'difficulty' ? '1' : '0.4';
    for (const b of this._moveTimeBtns) {
      b.classList.toggle(
        'selected',
        this._engineMode === 'movetime' && parseInt(b.dataset.seconds) === this._moveTime
      );
    }

    this.el.style.display = 'flex';
  }

  hide() {
    this.el.style.display = 'none';
  }
}
