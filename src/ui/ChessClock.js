/**
 * ChessClock — manages two countdown timers for a timed chess game.
 *
 * Each clock is placed next to its corresponding player-info row
 * (white clock on white's side, black clock on black's side).
 * The active clock ticks down every 100ms for smooth display updates.
 * When a player's time hits zero the onTimeOut callback fires.
 */
export class ChessClock {
  /**
   * @param {HTMLElement} playerInfoEl  - The bottom player-info row (human)
   * @param {HTMLElement} opponentInfoEl - The top player-info row (engine)
   */
  constructor(playerInfoEl, opponentInfoEl) {
    this._playerInfoEl = playerInfoEl;
    this._opponentInfoEl = opponentInfoEl;

    // Time remaining in milliseconds for white / black
    this._timeWhite = 0;
    this._timeBlack = 0;

    // Which color's clock is running ('w', 'b', or null)
    this._running = null;

    // Interval handle
    this._interval = null;
    this._lastTick = 0;

    // DOM elements
    this._whiteClockEl = this._buildClockEl();
    this._blackClockEl = this._buildClockEl();

    // Callback when time expires: onTimeOut('w') or onTimeOut('b')
    this.onTimeOut = null;

    // Track which color the player is (for placing clocks correctly)
    this._playerColor = 'w';
  }

  _buildClockEl() {
    const el = document.createElement('div');
    el.className = 'chess-clock';

    const digits = document.createElement('span');
    digits.className = 'chess-clock-digits';
    digits.textContent = '0:00';

    el.appendChild(digits);
    return el;
  }

  /**
   * Initialize clocks for a new game.
   * @param {number} minutes - Time per side in minutes (0 = no clock)
   * @param {string} playerColor - 'w' or 'b'
   */
  init(minutes, playerColor) {
    this.stop();
    this._playerColor = playerColor;

    if (minutes <= 0) {
      this.hide();
      return;
    }

    const ms = minutes * 60 * 1000;
    this._timeWhite = ms;
    this._timeBlack = ms;
    this._running = null;

    // Place clock elements on the correct sides
    this._attachClocks();

    this._updateDisplay('w');
    this._updateDisplay('b');
    this._whiteClockEl.classList.remove('active', 'low-time', 'critical-time');
    this._blackClockEl.classList.remove('active', 'low-time', 'critical-time');

    this.show();
  }

  _attachClocks() {
    // Remove from any previous parent
    this._whiteClockEl.remove();
    this._blackClockEl.remove();

    // Player info is always at the bottom, opponent at the top.
    // White clock goes on white's side, black clock on black's side.
    if (this._playerColor === 'w') {
      this._playerInfoEl.appendChild(this._whiteClockEl);
      this._opponentInfoEl.appendChild(this._blackClockEl);
    } else {
      this._playerInfoEl.appendChild(this._blackClockEl);
      this._opponentInfoEl.appendChild(this._whiteClockEl);
    }
  }

  /**
   * Start the clock for the given color.
   * @param {string} color - 'w' or 'b'
   */
  startClock(color) {
    if (this._timeWhite <= 0 && this._timeBlack <= 0 && !this._running) return;

    this._running = color;
    this._lastTick = performance.now();
    this._moveStartTime = performance.now();
    this._moveElapsed = 0;

    // Update active states
    this._whiteClockEl.classList.toggle('active', color === 'w');
    this._blackClockEl.classList.toggle('active', color === 'b');

    if (!this._interval) {
      this._interval = setInterval(() => this._tick(), 100);
    }
  }

  /**
   * Stop both clocks (pause).
   */
  stop() {
    this._running = null;
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    this._whiteClockEl.classList.remove('active');
    this._blackClockEl.classList.remove('active');
  }

  /**
   * Switch the clock to the other side (after a move).
   * @param {string} newActiveColor - The color whose clock should now run
   */
  switchTo(newActiveColor) {
    if (this._running) {
      this._flushTick();

      // Enforce minimum 1 second deducted per move
      const minDeduction = 1000;
      if (this._moveElapsed < minDeduction) {
        const shortfall = minDeduction - this._moveElapsed;
        if (this._running === 'w') {
          this._timeWhite = Math.max(0, this._timeWhite - shortfall);
          this._updateDisplay('w');
        } else {
          this._timeBlack = Math.max(0, this._timeBlack - shortfall);
          this._updateDisplay('b');
        }
      }
    }
    this.startClock(newActiveColor);
  }

  _tick() {
    if (!this._running) return;

    this._flushTick();
  }

  _flushTick() {
    const now = performance.now();
    const elapsed = now - this._lastTick;
    this._lastTick = now;
    this._moveElapsed += elapsed;

    if (this._running === 'w') {
      this._timeWhite = Math.max(0, this._timeWhite - elapsed);
      this._updateDisplay('w');
      if (this._timeWhite <= 0) {
        this.stop();
        this._updateDisplay('w');
        if (this.onTimeOut) this.onTimeOut('w');
      }
    } else if (this._running === 'b') {
      this._timeBlack = Math.max(0, this._timeBlack - elapsed);
      this._updateDisplay('b');
      if (this._timeBlack <= 0) {
        this.stop();
        this._updateDisplay('b');
        if (this.onTimeOut) this.onTimeOut('b');
      }
    }
  }

  _updateDisplay(color) {
    const ms = color === 'w' ? this._timeWhite : this._timeBlack;
    const el = color === 'w' ? this._whiteClockEl : this._blackClockEl;
    const digits = el.querySelector('.chess-clock-digits');

    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    // Show tenths when under 10 seconds
    if (ms < 10000 && ms > 0) {
      const tenths = Math.floor((ms % 1000) / 100);
      digits.textContent = `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
    } else {
      digits.textContent = `${minutes}:${String(seconds).padStart(2, '0')}`;
    }

    // Urgency classes
    el.classList.toggle('low-time', ms > 0 && ms <= 30000);
    el.classList.toggle('critical-time', ms > 0 && ms <= 10000);
    el.classList.toggle('flagged', ms <= 0);
  }

  show() {
    this._whiteClockEl.style.display = '';
    this._blackClockEl.style.display = '';
  }

  hide() {
    this.stop();
    this._whiteClockEl.style.display = 'none';
    this._blackClockEl.style.display = 'none';
  }

  /** Is a timed game currently active? */
  get isActive() {
    return this._whiteClockEl.style.display !== 'none';
  }

  /** Get remaining time for a color in ms */
  getTime(color) {
    return color === 'w' ? this._timeWhite : this._timeBlack;
  }

  destroy() {
    this.stop();
    this._whiteClockEl.remove();
    this._blackClockEl.remove();
  }
}
