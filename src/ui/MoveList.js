import { NOTABLE_TYPES, CLASSIFICATION_GLYPHS } from '../game/moveClassification.js';

export class MoveList {
  constructor(container) {
    this.container = container;
    this.onMoveClick = null; // callback(moveIndex)
    this._renderedCount = 0; // number of move spans currently in the DOM
    this._activeEl = null;
    this._classifications = null; // per-move quality, indexed by full-history idx
    this._build();
  }

  _build() {
    this.el = document.createElement('div');
    this.el.className = 'move-list';

    this.titleEl = document.createElement('h3');
    this.titleEl.className = 'move-list-title';
    this.titleEl.textContent = 'Move History';

    this.listEl = document.createElement('div');
    this.listEl.className = 'move-list-content';

    // One delegated click listener for the whole list, instead of two new
    // listeners per move on every render.
    this.listEl.addEventListener('click', (e) => {
      const span = e.target.closest('.move-san');
      if (!span || !this.listEl.contains(span)) return;
      const idx = Number(span.dataset.idx);
      if (this.onMoveClick && !Number.isNaN(idx)) this.onMoveClick(idx);
    });

    this.el.appendChild(this.titleEl);
    this.el.appendChild(this.listEl);
    this.container.appendChild(this.el);
  }

  /**
   * Incrementally reflect the current move history. On a normal move this just
   * appends the new move(s); on navigation it only moves the `active` highlight.
   * Assumes the moves are a prefix-compatible continuation of what's rendered
   * (true for play / take-back / navigation). Use `rebuild()` when switching to
   * a different game (load).
   */
  render(moveHistory) {
    const moves = moveHistory.getMoves();

    if (moves.length === 0) {
      this.clear();
      return;
    }

    // Take-back shrank the list — drop the stale tail.
    if (moves.length < this._renderedCount) {
      this._truncate(moves.length);
    }

    // Drop the "No moves yet" placeholder before the first real move.
    if (this._renderedCount === 0) {
      this.listEl.innerHTML = '';
    }

    // Append only moves not already in the DOM.
    for (let k = this._renderedCount; k < moves.length; k++) {
      this._appendMove(moves[k].san, k);
    }
    this._renderedCount = moves.length;

    this._setActive(moveHistory.getCurrentViewIndex());

    // Re-cover any freshly appended spans with their quality color (colors on
    // existing spans persist across incremental renders; this is defensive).
    if (this._classifications) this._applyClassifications();

    if (moveHistory.isAtCurrentPosition()) {
      this.listEl.scrollTop = this.listEl.scrollHeight;
    } else if (this._activeEl) {
      this._activeEl.scrollIntoView({ block: 'nearest' });
    }
  }

  /** Full rebuild — for switching games (load). */
  rebuild(moveHistory) {
    this.listEl.innerHTML = '';
    this._renderedCount = 0;
    this._activeEl = null;
    this._classifications = null;
    this.render(moveHistory);
  }

  /**
   * Tint moves by post-game quality so the list mirrors the analysis-graph dots.
   * `classifications` is the array from `classifyMoves` (or AnalysisGraph
   * `getClassifications()`), indexed by full-history position to match `data-idx`.
   */
  setClassifications(classifications) {
    this._classifications = classifications;
    this._applyClassifications();
  }

  _applyClassifications() {
    const spans = this.listEl.querySelectorAll('.move-san');
    for (const span of spans) {
      const cls = this._classifications?.[Number(span.dataset.idx)];
      // Drop any prior glyph first so reapplication (navigation, re-analysis)
      // never stacks duplicates.
      span.querySelector('.move-q-glyph')?.remove();
      if (cls && NOTABLE_TYPES.has(cls.type)) {
        span.dataset.quality = cls.type;
        span.style.setProperty('--q-color', cls.color);
        const glyph = CLASSIFICATION_GLYPHS[cls.type];
        if (glyph) {
          const g = document.createElement('span');
          g.className = 'move-q-glyph';
          g.textContent = glyph;
          span.appendChild(g); // inherits the move's --q-color (and active color)
        }
      } else if (span.dataset.quality) {
        delete span.dataset.quality;
        span.style.removeProperty('--q-color');
      }
    }
  }

  _appendMove(san, k) {
    let row;
    if (k % 2 === 0) {
      // White's move starts a new numbered row.
      row = document.createElement('div');
      row.className = 'move-row';
      const num = document.createElement('span');
      num.className = 'move-number';
      num.textContent = `${Math.floor(k / 2) + 1}.`;
      row.appendChild(num);
      this.listEl.appendChild(row);
    } else {
      // Black's move joins the last row.
      row = this.listEl.lastElementChild;
    }
    const span = document.createElement('span');
    span.className = 'move-san';
    // Full-history index: the initial position is 0, so move k is at index k+1.
    span.dataset.idx = String(k + 1);
    span.textContent = san;
    row.appendChild(span);
  }

  _setActive(viewIdx) {
    if (this._activeEl) {
      this._activeEl.classList.remove('active');
      this._activeEl = null;
    }
    const span = this.listEl.querySelector(`.move-san[data-idx="${viewIdx}"]`);
    if (span) {
      span.classList.add('active');
      this._activeEl = span;
    }
  }

  _truncate(count) {
    const spans = this.listEl.querySelectorAll('.move-san');
    for (let i = count; i < spans.length; i++) spans[i].remove();
    // Remove rows left with no moves (e.g. a number-only row).
    for (const row of [...this.listEl.querySelectorAll('.move-row')]) {
      if (!row.querySelector('.move-san')) row.remove();
    }
    this._renderedCount = count;
    this._activeEl = null;
  }

  clear() {
    this.listEl.innerHTML = '';
    this._renderedCount = 0;
    this._activeEl = null;
    this._classifications = null;
    const empty = document.createElement('div');
    empty.className = 'move-list-empty';
    empty.textContent = 'No moves yet';
    this.listEl.appendChild(empty);
  }
}
