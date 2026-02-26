import { EVAL_BAR_ANIMATION_DURATION, EVAL_BAR_MIN_DEPTH } from '../config.js';

export class EvalBar {
  constructor(container) {
    this.container = container;
    this.playerColor = 'w';
    this._currentCp = 0;
    this._targetCp = 0;
    this._startCp = 0;
    this._isMate = false;
    this._mateIn = null;
    this._animStart = 0;
    this._animating = false;
    this._rafId = null;
    this._depthMet = false;
    this._maxDepthSeen = 0;
    this._settleTimer = null;
    this._pendingEval = null;

    this._build();
  }

  _build() {
    this.el = document.createElement('div');
    this.el.className = 'eval-bar';

    this.whiteSection = document.createElement('div');
    this.whiteSection.className = 'eval-white';

    this.blackSection = document.createElement('div');
    this.blackSection.className = 'eval-black';

    this.scoreLabel = document.createElement('div');
    this.scoreLabel.className = 'eval-score';

    // Tick marks
    this.tickContainer = document.createElement('div');
    this.tickContainer.className = 'eval-ticks';

    this.el.appendChild(this.blackSection);
    this.el.appendChild(this.whiteSection);
    this.el.appendChild(this.scoreLabel);
    this.el.appendChild(this.tickContainer);
    this.container.appendChild(this.el);

    this._renderTicks();
    this._updateBar(0);
  }

  _renderTicks() {
    this.tickContainer.innerHTML = '';
    for (let i = -10; i <= 10; i += 2) {
      if (i === 0) continue;
      const tick = document.createElement('div');
      tick.className = 'eval-tick';
      // Position: 0cp = 50%, +1000cp = 0% (top/white), -1000cp = 100% (bottom/black)
      const pct = 50 - (i * 5);
      tick.style.top = `${pct}%`;
      this.tickContainer.appendChild(tick);
    }
    // Center line
    const center = document.createElement('div');
    center.className = 'eval-center-line';
    this.tickContainer.appendChild(center);
  }

  setPlayerColor(color) {
    this.playerColor = color;
    this.el.classList.toggle('flipped', color === 'b');
  }

  update(evaluation) {
    if (!evaluation) {
      this._clearSettle();
      // Keep the last displayed value — don't clear the label or bar
      this._depthMet = false;
      this._maxDepthSeen = 0;
      this._pendingEval = null;
      return;
    }

    const { cp, mate, depth } = evaluation;

    // Filter out shallow, noisy evaluations after a new position
    // Keep the last displayed value frozen instead of showing "..."
    if (depth !== undefined && depth < EVAL_BAR_MIN_DEPTH && !this._depthMet) {
      return;
    }

    // Only accept monotonically increasing depths — ignore stale shallower lines
    if (depth !== undefined && depth < this._maxDepthSeen) {
      return;
    }
    this._maxDepthSeen = depth || this._maxDepthSeen;

    let newCp;
    if (mate !== null && mate !== undefined) {
      newCp = mate > 0 ? (10000 - Math.abs(mate) * 100) : (-10000 + Math.abs(mate) * 100);
    } else if (cp !== null && cp !== undefined) {
      newCp = cp;
    } else {
      return;
    }

    // Once depth threshold is met, only re-animate if the change is significant
    // or this is the first update past the threshold
    if (this._depthMet) {
      const delta = Math.abs(newCp - this._targetCp);
      if (delta < 30) return; // Skip fluctuations between depth iterations
    }

    // Debounce: wait 400ms for the eval to settle before applying
    this._pendingEval = { cp: newCp, mate, isMate: mate !== null && mate !== undefined };
    this._clearSettle();
    this._settleTimer = setTimeout(() => this._applyPending(), 400);
  }

  _applyPending() {
    if (!this._pendingEval) return;
    const { cp, isMate, mate } = this._pendingEval;
    this._pendingEval = null;
    this._depthMet = true;

    this._isMate = isMate;
    this._mateIn = isMate ? mate : null;
    this._setTarget(cp);
  }

  _clearSettle() {
    if (this._settleTimer) {
      clearTimeout(this._settleTimer);
      this._settleTimer = null;
    }
  }

  _setTarget(cp) {
    this._startCp = this._currentCp;
    this._targetCp = cp;
    this._animStart = performance.now();
    this._animating = true;
    if (!this._rafId) {
      this._animate();
    }
  }

  _animate() {
    if (!this._animating) {
      this._rafId = null;
      return;
    }

    const elapsed = performance.now() - this._animStart;
    const progress = Math.min(1, elapsed / EVAL_BAR_ANIMATION_DURATION);
    const eased = 1 - Math.pow(1 - progress, 2); // ease-out quad

    this._currentCp = this._startCp + (this._targetCp - this._startCp) * eased;

    if (progress >= 1) {
      this._currentCp = this._targetCp;
      this._animating = false;
    }

    this._updateBar(this._currentCp);
    this._updateLabel();

    this._rafId = requestAnimationFrame(() => this._animate());
  }

  _updateBar(cp) {
    // Clamp to +/- 1000 cp for display
    const clamped = Math.max(-1000, Math.min(1000, cp));
    // White percentage: 50% at 0, 100% at +1000, 0% at -1000
    const whitePct = 50 + (clamped / 1000) * 50;
    this.whiteSection.style.height = `${whitePct}%`;
    this.blackSection.style.height = `${100 - whitePct}%`;
  }

  _updateLabel() {
    if (this._isMate && this._mateIn !== null) {
      const text = `M${Math.abs(this._mateIn)}`;
      this.scoreLabel.textContent = text;
      // Position based on who has advantage
      if (this._mateIn > 0) {
        // White advantage
        this.scoreLabel.className = 'eval-score white-advantage';
      } else {
        this.scoreLabel.className = 'eval-score black-advantage';
      }
    } else {
      const pawns = Math.abs(this._currentCp / 100);
      this.scoreLabel.textContent = pawns.toFixed(1);
      if (this._currentCp >= 0) {
        this.scoreLabel.className = 'eval-score white-advantage';
      } else {
        this.scoreLabel.className = 'eval-score black-advantage';
      }
    }
  }

  _showCalculating() {
    this.scoreLabel.textContent = '...';
    this.scoreLabel.className = 'eval-score calculating';
  }

  reset() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this._clearSettle();
    this._pendingEval = null;
    // Freeze current bar position and label — don't reset to 0
    this._startCp = this._currentCp;
    this._targetCp = this._currentCp;
    this._animating = false;
    this._depthMet = false;
    this._maxDepthSeen = 0;
  }

  destroy() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this._clearSettle();
    this._animating = false;
  }
}
