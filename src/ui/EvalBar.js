import { EVAL_BAR_SMOOTHING, EVAL_BAR_MIN_DEPTH } from '../config.js';

export class EvalBar {
  constructor(container) {
    this.container = container;
    this.playerColor = 'w';
    this._currentCp = 0;
    this._targetCp = 0;
    this._isMate = false;
    this._mateIn = null;
    this._animating = false;
    this._rafId = null;
    this._depthMet = false;
    this._maxDepthSeen = 0;
    this._labelClass = ''; // last className written to the score label

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
      const pct = 50 - i * 5;
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
      // Keep the last displayed value — don't clear the label or bar
      this._depthMet = false;
      this._maxDepthSeen = 0;
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
      newCp = mate > 0 ? 10000 - Math.abs(mate) * 100 : -10000 + Math.abs(mate) * 100;
    } else if (cp !== null && cp !== undefined) {
      newCp = cp;
    } else {
      return;
    }

    // Once the first deep eval is shown, only re-animate if the change is
    // significant — skip jitter between depth iterations.
    if (this._depthMet) {
      const delta = Math.abs(newCp - this._targetCp);
      if (delta < 30) return;
    }

    // Apply directly. The MIN_DEPTH gate and the delta check above already
    // remove shallow noise and jitter, so the bar can react immediately; the
    // ease-out animation smooths the visual transition.
    this._depthMet = true;
    this._isMate = mate !== null && mate !== undefined;
    this._mateIn = this._isMate ? mate : null;
    this._setTarget(newCp);
  }

  _setTarget(cp) {
    this._targetCp = cp;
    // Keep easing toward the latest target. If a deeper eval updates the target
    // mid-flight, the loop simply redirects toward it — no restart, no jump.
    if (!this._animating) {
      this._animating = true;
      if (!this._rafId) {
        this._animate();
      }
    }
  }

  _animate() {
    if (!this._animating) {
      this._rafId = null;
      return;
    }

    const diff = this._targetCp - this._currentCp;

    // Snap and stop once close enough (within 0.01 pawn) to avoid an endless
    // asymptotic crawl.
    if (Math.abs(diff) < 1) {
      this._currentCp = this._targetCp;
      this._animating = false;
      this._updateBar(this._currentCp);
      this._updateLabel();
      this._rafId = null;
      return;
    }

    // Exponential smoothing: close a fixed fraction of the remaining distance
    // each frame. Successive deep-eval changes blend into one continuous glide.
    this._currentCp += diff * EVAL_BAR_SMOOTHING;

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
    let text;
    let advantage;
    if (this._isMate && this._mateIn !== null) {
      text = `M${Math.abs(this._mateIn)}`;
      advantage = this._mateIn > 0 ? 'white-advantage' : 'black-advantage';
    } else {
      text = Math.abs(this._currentCp / 100).toFixed(1);
      advantage = this._currentCp >= 0 ? 'white-advantage' : 'black-advantage';
    }

    // Per-frame the text changes but the advantage side rarely does; only write
    // className when it actually flips to avoid invalidating style every frame.
    if (this.scoreLabel.textContent !== text) this.scoreLabel.textContent = text;
    const cls = `eval-score ${advantage}`;
    if (this._labelClass !== cls) {
      this.scoreLabel.className = cls;
      this._labelClass = cls;
    }
  }

  /** Instantly set the eval bar to a known centipawn value (no depth gating). */
  setEvalCp(cp) {
    if (cp === null || cp === undefined) return;
    this._depthMet = true;
    this._isMate = false;
    this._mateIn = null;
    this._setTarget(cp);
  }

  reset() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    // Freeze current bar position and label — don't reset to 0
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
    this._animating = false;
  }
}
