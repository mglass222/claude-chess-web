import { THEMES, ANIMATION_DURATION, ANNOTATION_COLORS } from '../config.js';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'];

export class BoardView {
  constructor(container) {
    this.container = container;
    this.flipped = false; // true when playing black
    this.pieceSet = 'cburnett'; // current piece set name
    this.selectedSquare = null;
    this.legalMoves = []; // list of target square names like 'e4'
    this.lastMove = null; // { from, to }
    this.squares = {}; // map of 'e4' -> div element
    this.pieces = {}; // map of 'e4' -> img element
    this.hintArrow = null;
    this.annotations = []; // [{ type: 'arrow'|'square', from, to?, color }]
    this._rightClickFrom = null;
    this._rightClickColor = 'orange';
    this.onSquareClick = null; // callback(square)
    this.onPieceDragStart = null;
    this.onPieceDrop = null;

    // Drag state
    this._dragging = false;
    this._dragPiece = null;
    this._dragFrom = null;
    this._dragGhost = null;

    // Animation state
    this._animating = false;
    this._animationResolve = null;

    // Bound handlers for cleanup
    this._boundMouseMove = (e) => this._onMouseMove(e);
    this._boundMouseUp = (e) => this._onMouseUp(e);
    this._boundTouchMove = (e) => this._onTouchMove(e);
    this._boundTouchEnd = (e) => this._onTouchEnd(e);

    this._build();
  }

  _build() {
    // Board wrapper for aspect ratio
    this.boardEl = document.createElement('div');
    this.boardEl.className = 'board';

    // Create SVG overlay for arrows
    this.svgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svgOverlay.classList.add('board-svg-overlay');
    this.svgOverlay.setAttribute('viewBox', '0 0 800 800');

    // Create 64 squares
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const sq = document.createElement('div');
        const file = FILES[col];
        const rank = RANKS[7 - row]; // row 0 = rank 8
        const squareName = file + rank;
        const isLight = (row + col) % 2 === 0;

        sq.className = `square ${isLight ? 'light' : 'dark'}`;
        sq.dataset.square = squareName;

        // File labels on bottom row
        if (row === 7) {
          const label = document.createElement('span');
          label.className = `label file-label ${isLight ? 'on-light' : 'on-dark'}`;
          label.textContent = file;
          sq.appendChild(label);
        }
        // Rank labels on left column
        if (col === 0) {
          const label = document.createElement('span');
          label.className = `label rank-label ${isLight ? 'on-light' : 'on-dark'}`;
          label.textContent = rank;
          sq.appendChild(label);
        }

        // Click handler
        sq.addEventListener('mousedown', (e) => this._onMouseDown(e, squareName));

        // Hover handler for legal move highlighting
        sq.addEventListener('mouseenter', () => this._onSquareHover(squareName));
        sq.addEventListener('mouseleave', () => this._onSquareHoverEnd(squareName));

        this.boardEl.appendChild(sq);
        this.squares[squareName] = sq;
      }
    }

    // Prevent right-click context menu on the board
    this.boardEl.addEventListener('contextmenu', (e) => e.preventDefault());

    this.boardEl.appendChild(this.svgOverlay);
    this.container.appendChild(this.boardEl);

    // Global mouse events for drag
    document.addEventListener('mousemove', this._boundMouseMove);
    document.addEventListener('mouseup', this._boundMouseUp);

    // Touch support
    this.boardEl.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: false });
    document.addEventListener('touchmove', this._boundTouchMove, { passive: false });
    document.addEventListener('touchend', this._boundTouchEnd);
  }

  // Render pieces from chess.js board array
  renderPosition(board, playerColor) {
    // Clear existing pieces
    for (const sq in this.pieces) {
      if (this.pieces[sq]) {
        this.pieces[sq].remove();
        delete this.pieces[sq];
      }
    }

    this.flipped = playerColor === 'b';
    this.boardEl.classList.toggle('flipped', this.flipped);

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board[row][col];
        if (piece) {
          const file = FILES[col];
          const rank = RANKS[7 - row];
          const squareName = file + rank;
          this._placePiece(squareName, piece.color, piece.type);
        }
      }
    }
  }

  _placePiece(square, color, type) {
    const img = document.createElement('img');
    const pieceCode = `${color === 'w' ? 'w' : 'b'}${type.toUpperCase()}`;
    img.src = `${import.meta.env.BASE_URL}pieces/${this.pieceSet}/${pieceCode}.svg`;
    img.className = 'piece';
    img.draggable = false;
    img.alt = pieceCode;

    this.squares[square].appendChild(img);
    this.pieces[square] = img;
  }

  // Update the board to match a position, only changing squares that differ
  updatePosition(board) {
    // Build a map of what the new board looks like: square -> "wP", "bK", etc. or null
    const desired = {};
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const file = FILES[col];
        const rank = RANKS[7 - row];
        const squareName = file + rank;
        const piece = board[row][col];
        desired[squareName] = piece ? `${piece.color}${piece.type.toUpperCase()}` : null;
      }
    }

    // Build a map of current pieces on the board: square -> "wP", "bK", etc.
    const current = {};
    for (const sq in this.pieces) {
      if (this.pieces[sq]) {
        const alt = this.pieces[sq].alt; // stored as "wP", "bK", etc.
        current[sq] = alt;
      }
    }

    // Remove pieces that shouldn't be there or have changed
    for (const sq in current) {
      if (current[sq] !== desired[sq]) {
        this.pieces[sq].remove();
        delete this.pieces[sq];
      }
    }

    // Add pieces that are missing
    for (const sq in desired) {
      if (desired[sq] && !this.pieces[sq]) {
        const piece = desired[sq];
        const color = piece[0];
        const type = piece[1];
        this._placePiece(sq, color, type);
      }
    }
  }

  // Animate a piece from one square to another, returns a Promise
  animateMove(from, to, board) {
    return new Promise((resolve) => {
      this._animating = true;
      this._animationResolve = resolve;

      const pieceEl = this.pieces[from];
      if (!pieceEl) {
        this._animating = false;
        resolve();
        return;
      }

      const fromRect = this.squares[from].getBoundingClientRect();
      const toRect = this.squares[to].getBoundingClientRect();

      // getBoundingClientRect returns screen-space coords. When the board is
      // flipped (rotate 180deg), the piece's local coordinate axes are inverted
      // relative to the screen, so we negate the delta. We must also preserve
      // the piece's counter-rotation so it stays upright during animation.
      const sign = this.flipped ? -1 : 1;
      const dx = (toRect.left - fromRect.left) * sign;
      const dy = (toRect.top - fromRect.top) * sign;
      const rot = this.flipped ? ' rotate(180deg)' : '';

      // Remove captured piece if present
      if (this.pieces[to]) {
        this.pieces[to].remove();
        delete this.pieces[to];
      }

      // Start at source position
      pieceEl.style.transition = 'none';
      pieceEl.style.transform = `translate(0, 0)${rot}`;
      pieceEl.style.zIndex = '10';

      // Force reflow
      pieceEl.offsetHeight;

      // Animate to destination
      pieceEl.style.transition = `transform ${ANIMATION_DURATION}ms ease-out`;
      pieceEl.style.transform = `translate(${dx}px, ${dy}px)${rot}`;

      setTimeout(() => {
        // Animation done - restore CSS-driven transform and update DOM
        pieceEl.style.transition = 'none';
        pieceEl.style.transform = ''; // reverts to CSS class (rotate(180deg) if flipped)
        pieceEl.style.zIndex = '';

        // Move piece from source to target square in DOM
        if (this.pieces[from]) {
          this.pieces[from].remove();
          delete this.pieces[from];
        }

        // Re-render position from board state
        this.updatePosition(board);

        this._animating = false;
        resolve();
      }, ANIMATION_DURATION);
    });
  }

  setSelected(square) {
    // Clear previous selection
    if (this.selectedSquare) {
      this.squares[this.selectedSquare].classList.remove('selected');
    }
    this.clearLegalMoves();

    this.selectedSquare = square;
    if (square) {
      this.squares[square].classList.add('selected');
    }
  }

  showLegalMoves(moves) {
    this.clearLegalMoves();
    this.legalMoves = moves.map((m) => m.to);
    for (const m of moves) {
      this.squares[m.to].classList.add('legal-move');
      if (m.captured) {
        this.squares[m.to].classList.add('legal-capture');
      }
    }
  }

  clearLegalMoves() {
    for (const sq of this.legalMoves) {
      if (this.squares[sq]) {
        this.squares[sq].classList.remove('legal-move', 'legal-capture', 'legal-hover');
      }
    }
    this.legalMoves = [];
  }

  setLastMove(from, to) {
    // Clear previous last move highlights
    if (this.lastMove) {
      this.squares[this.lastMove.from]?.classList.remove('last-move');
      this.squares[this.lastMove.to]?.classList.remove('last-move');
    }
    this.lastMove = from && to ? { from, to } : null;
    if (this.lastMove) {
      this.squares[from]?.classList.add('last-move');
      this.squares[to]?.classList.add('last-move');
    }
  }

  setCheck(square) {
    // Clear any existing check
    for (const sq in this.squares) {
      this.squares[sq].classList.remove('check');
    }
    if (square) {
      this.squares[square]?.classList.add('check');
    }
  }

  showHintArrow(from, to) {
    this.clearHintArrow();
    if (!from || !to) return;

    // Highlight squares
    this.squares[from]?.classList.add('hint-from');
    this.squares[to]?.classList.add('hint-to');

    const arrow = this._createArrowPolygon(from, to, 'rgba(0, 220, 0, 0.65)', 10, 22);
    arrow.classList.add('hint-arrow');
    this.svgOverlay.appendChild(arrow);
    this.hintArrow = arrow;
  }

  clearHintArrow() {
    if (this.hintArrow) {
      this.hintArrow.remove();
      this.hintArrow = null;
    }
    for (const sq in this.squares) {
      this.squares[sq].classList.remove('hint-from', 'hint-to');
    }
  }

  _renderAnnotations() {
    // Remove all existing annotation elements
    for (const el of this.svgOverlay.querySelectorAll('.user-annotation')) {
      el.remove();
    }

    for (const ann of this.annotations) {
      const color = ANNOTATION_COLORS[ann.color];
      if (ann.type === 'square') {
        const { x, y } = this._squareToSvgCoords(ann.from);
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', x - 50);
        rect.setAttribute('y', y - 50);
        rect.setAttribute('width', '100');
        rect.setAttribute('height', '100');
        rect.setAttribute('fill', color);
        rect.setAttribute('opacity', '0.5');
        rect.classList.add('user-annotation');
        this.svgOverlay.appendChild(rect);
      } else if (ann.type === 'arrow') {
        const arrow = this._createArrowPolygon(ann.from, ann.to, color, 14, 28);
        arrow.classList.add('user-annotation');
        this.svgOverlay.appendChild(arrow);
      }
    }
  }

  _toggleAnnotation(type, from, to, color) {
    const idx = this.annotations.findIndex(
      (a) => a.type === type && a.from === from && a.to === to && a.color === color
    );
    if (idx !== -1) {
      this.annotations.splice(idx, 1);
    } else {
      this.annotations.push({ type, from, to, color });
    }
    this._renderAnnotations();
  }

  clearAnnotations() {
    if (this.annotations.length === 0) return;
    this.annotations = [];
    for (const el of this.svgOverlay.querySelectorAll('.user-annotation')) {
      el.remove();
    }
  }

  _squareToSvgCoords(square) {
    const file = FILES.indexOf(square[0]);
    const rank = parseInt(square[1]) - 1;
    // SVG viewBox is 800x800, each square is 100x100
    let x, y;
    if (this.flipped) {
      x = (7 - file) * 100 + 50;
      y = rank * 100 + 50;
    } else {
      x = file * 100 + 50;
      y = (7 - rank) * 100 + 50;
    }
    return { x, y };
  }

  // Build a single-polygon arrow from one square to another.
  // shaftWidth = half-width of the shaft, headWidth = half-width of the arrowhead.
  _createArrowPolygon(from, to, fill, shaftWidth, headWidth) {
    const f = this._squareToSvgCoords(from);
    const t = this._squareToSvgCoords(to);
    const dx = t.x - f.x;
    const dy = t.y - f.y;
    const len = Math.sqrt(dx * dx + dy * dy);

    // Unit vectors: along the arrow and perpendicular
    const ux = dx / len;
    const uy = dy / len;
    const px = -uy; // perpendicular
    const py = ux;

    const headLen = headWidth * 1.3; // length of the arrowhead triangle
    const neckX = t.x - ux * headLen; // where shaft meets head
    const neckY = t.y - uy * headLen;

    // 7 vertices: shaft left side, neck flare, tip, neck flare, shaft right side
    const points = [
      [f.x + px * shaftWidth, f.y + py * shaftWidth], // shaft start left
      [neckX + px * shaftWidth, neckY + py * shaftWidth], // shaft end left
      [neckX + px * headWidth, neckY + py * headWidth], // head flare left
      [t.x, t.y], // tip
      [neckX - px * headWidth, neckY - py * headWidth], // head flare right
      [neckX - px * shaftWidth, neckY - py * shaftWidth], // shaft end right
      [f.x - px * shaftWidth, f.y - py * shaftWidth], // shaft start right
    ]
      .map(([x, y]) => `${x},${y}`)
      .join(' ');

    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', points);
    polygon.setAttribute('fill', fill);
    return polygon;
  }

  get isAnimating() {
    return this._animating;
  }

  _onSquareHover(square) {
    if (this.legalMoves.includes(square)) {
      this.squares[square].classList.add('legal-hover');
    }
  }

  _onSquareHoverEnd(square) {
    this.squares[square].classList.remove('legal-hover');
  }

  _getAnnotationColor(e) {
    if (e.shiftKey) return 'red';
    if (e.ctrlKey || e.metaKey) return 'blue';
    if (e.altKey) return 'yellow';
    return 'orange';
  }

  // Mouse / touch input
  _onMouseDown(e, square) {
    if (this._animating) return;
    if (e.button === 2) {
      this._rightClickFrom = square;
      this._rightClickColor = this._getAnnotationColor(e);
      return;
    }
    if (e.button !== 0) return;
    this.clearAnnotations();
    e.preventDefault();

    const pieceEl = this.pieces[square];

    // If a piece can be dragged, prepare for drag but don't start yet.
    // Drag only begins once the mouse moves (to distinguish click from drag).
    if (pieceEl && this.onPieceDragStart) {
      const canDrag = this.onPieceDragStart(square);
      if (canDrag) {
        this._pendingDrag = { square, pieceEl, startX: e.clientX, startY: e.clientY };
        // Select the piece immediately so legal moves show
        if (this.onSquareClick) {
          this.onSquareClick(square);
        }
        return;
      }
    }

    if (this.onSquareClick) {
      this.onSquareClick(square);
    }
  }

  _startDrag(e, square, pieceEl) {
    this._dragging = true;
    this._dragFrom = square;
    this._dragPiece = pieceEl;

    // Create ghost
    this._dragGhost = pieceEl.cloneNode(true);
    this._dragGhost.className = 'piece drag-ghost';
    document.body.appendChild(this._dragGhost);

    const rect = pieceEl.getBoundingClientRect();
    this._dragGhost.style.width = rect.width + 'px';
    this._dragGhost.style.height = rect.height + 'px';
    this._positionGhost(e.clientX, e.clientY, rect.width);

    // Dim original
    pieceEl.style.opacity = '0.3';
  }

  _positionGhost(clientX, clientY, size) {
    if (!this._dragGhost) return;
    const s = size || parseInt(this._dragGhost.style.width);
    this._dragGhost.style.left = clientX - s / 2 + 'px';
    this._dragGhost.style.top = clientY - s / 2 + 'px';
  }

  _onMouseMove(e) {
    // If we have a pending drag and mouse moved enough, start the actual drag
    if (this._pendingDrag && !this._dragging) {
      const dx = e.clientX - this._pendingDrag.startX;
      const dy = e.clientY - this._pendingDrag.startY;
      if (dx * dx + dy * dy > 9) {
        // 3px threshold
        this._startDrag(e, this._pendingDrag.square, this._pendingDrag.pieceEl);
        this._pendingDrag = null;
      }
      return;
    }

    if (!this._dragging || !this._dragGhost) return;
    this._positionGhost(e.clientX, e.clientY);
  }

  _onMouseUp(e) {
    if (e.button === 2 && this._rightClickFrom) {
      const target = this._getSquareFromPoint(e.clientX, e.clientY);
      const from = this._rightClickFrom;
      const color = this._rightClickColor;
      this._rightClickFrom = null;
      if (!target) return;
      if (target === from) {
        this._toggleAnnotation('square', from, null, color);
      } else {
        this._toggleAnnotation('arrow', from, target, color);
      }
      return;
    }

    // If mouse released without dragging, it was a click — already handled in mousedown
    if (this._pendingDrag) {
      this._pendingDrag = null;
      return;
    }

    if (!this._dragging) return;

    // Find which square was dropped on
    const target = this._getSquareFromPoint(e.clientX, e.clientY);

    // Clean up drag
    this._cleanupDrag();

    if (target && target !== this._dragFrom && this.onSquareClick) {
      this.onSquareClick(target);
    }
  }

  _cleanupDrag() {
    if (this._dragGhost) {
      this._dragGhost.remove();
      this._dragGhost = null;
    }
    if (this._dragPiece) {
      this._dragPiece.style.opacity = '';
    }
    this._dragging = false;
    this._dragFrom = null;
    this._dragPiece = null;
  }

  _getSquareFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const sq = el.closest('.square');
    return sq ? sq.dataset.square : null;
  }

  // Touch handlers
  _onTouchStart(e) {
    if (this._animating) return;
    const touch = e.touches[0];
    const sq = this._getSquareFromPoint(touch.clientX, touch.clientY);
    if (!sq) return;

    e.preventDefault();
    const pieceEl = this.pieces[sq];

    if (pieceEl && this.onPieceDragStart) {
      const canDrag = this.onPieceDragStart(sq);
      if (canDrag) {
        this._dragging = true;
        this._dragFrom = sq;
        this._dragPiece = pieceEl;

        this._dragGhost = pieceEl.cloneNode(true);
        this._dragGhost.className = 'piece drag-ghost';
        document.body.appendChild(this._dragGhost);

        const rect = pieceEl.getBoundingClientRect();
        this._dragGhost.style.width = rect.width + 'px';
        this._dragGhost.style.height = rect.height + 'px';
        this._positionGhost(touch.clientX, touch.clientY, rect.width);

        pieceEl.style.opacity = '0.3';
      }
    }

    if (this.onSquareClick) {
      this.onSquareClick(sq);
    }
  }

  _onTouchMove(e) {
    if (!this._dragging) return;
    e.preventDefault();
    const touch = e.touches[0];
    this._positionGhost(touch.clientX, touch.clientY);
  }

  _onTouchEnd(e) {
    if (!this._dragging) return;
    const touch = e.changedTouches[0];
    const target = this._getSquareFromPoint(touch.clientX, touch.clientY);
    const fromSquare = this._dragFrom;
    this._cleanupDrag();

    // Only fire click if dragged to a different square (tap-on-same-square
    // is already handled by _onTouchStart, firing again would deselect)
    if (target && target !== fromSquare && this.onSquareClick) {
      this.onSquareClick(target);
    }
  }

  destroy() {
    document.removeEventListener('mousemove', this._boundMouseMove);
    document.removeEventListener('mouseup', this._boundMouseUp);
    document.removeEventListener('touchmove', this._boundTouchMove);
    document.removeEventListener('touchend', this._boundTouchEnd);
    this._cleanupDrag();
  }

  setPieceSet(name) {
    this.pieceSet = name;
    // Refresh all pieces on the board
    for (const sq in this.pieces) {
      if (this.pieces[sq]) {
        const alt = this.pieces[sq].alt; // e.g. "wP", "bK"
        this.pieces[sq].src = `${import.meta.env.BASE_URL}pieces/${this.pieceSet}/${alt}.svg`;
      }
    }
  }

  applyTheme(themeName) {
    const theme = THEMES[themeName];
    if (!theme) return;
    document.documentElement.style.setProperty('--light-square', theme.light);
    document.documentElement.style.setProperty('--dark-square', theme.dark);
  }
}
