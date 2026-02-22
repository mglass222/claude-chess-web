import { THEMES, ANIMATION_DURATION, COLORS } from '../config.js';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'];

export class BoardView {
  constructor(container) {
    this.container = container;
    this.flipped = false;       // true when playing black
    this.selectedSquare = null;
    this.legalMoves = [];       // list of target square names like 'e4'
    this.lastMove = null;       // { from, to }
    this.squares = {};          // map of 'e4' -> div element
    this.pieces = {};           // map of 'e4' -> img element
    this.hintArrow = null;
    this.onSquareClick = null;  // callback(square)
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

    // Arrow marker definition
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('refX', '10');
    marker.setAttribute('refY', '3.5');
    marker.setAttribute('orient', 'auto');
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
    polygon.setAttribute('fill', 'rgba(0, 220, 0, 0.85)');
    marker.appendChild(polygon);
    defs.appendChild(marker);
    this.svgOverlay.appendChild(defs);

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
    img.src = `${import.meta.env.BASE_URL}pieces/${pieceCode}.svg`;
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

      const dx = toRect.left - fromRect.left;
      const dy = toRect.top - fromRect.top;

      // Remove captured piece if present
      if (this.pieces[to]) {
        this.pieces[to].remove();
        delete this.pieces[to];
      }

      // Set initial transform
      pieceEl.style.transition = 'none';
      pieceEl.style.transform = `translate(${dx}px, ${dy}px)`;
      pieceEl.style.zIndex = '10';

      // Move the piece element to the source square first, then animate
      // Actually, start at source, animate to destination
      pieceEl.style.transform = 'translate(0, 0)';

      // Force reflow
      pieceEl.offsetHeight;

      // Animate
      pieceEl.style.transition = `transform ${ANIMATION_DURATION}ms ease-out`;
      pieceEl.style.transform = `translate(${dx}px, ${dy}px)`;

      setTimeout(() => {
        // Animation done - update DOM
        pieceEl.style.transition = 'none';
        pieceEl.style.transform = '';
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
    this.legalMoves = moves.map(m => m.to);
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
        this.squares[sq].classList.remove('legal-move', 'legal-capture');
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

    // Draw SVG arrow
    const fromCoords = this._squareToSvgCoords(from);
    const toCoords = this._squareToSvgCoords(to);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', fromCoords.x);
    line.setAttribute('y1', fromCoords.y);
    line.setAttribute('x2', toCoords.x);
    line.setAttribute('y2', toCoords.y);
    line.setAttribute('stroke', 'rgba(0, 220, 0, 0.85)');
    line.setAttribute('stroke-width', '8');
    line.setAttribute('marker-end', 'url(#arrowhead)');
    line.classList.add('hint-arrow');

    this.svgOverlay.appendChild(line);
    this.hintArrow = line;
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

  get isAnimating() {
    return this._animating;
  }

  // Mouse / touch input
  _onMouseDown(e, square) {
    if (this._animating) return;
    if (e.button !== 0) return; // only allow left-click
    e.preventDefault();

    const pieceEl = this.pieces[square];

    // Start drag if there's a piece
    if (pieceEl && this.onPieceDragStart) {
      const canDrag = this.onPieceDragStart(square);
      if (canDrag) {
        this._startDrag(e, square, pieceEl);
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

    // Show legal moves
    if (this.onSquareClick) {
      this.onSquareClick(square);
    }
  }

  _positionGhost(clientX, clientY, size) {
    if (!this._dragGhost) return;
    const s = size || parseInt(this._dragGhost.style.width);
    this._dragGhost.style.left = (clientX - s / 2) + 'px';
    this._dragGhost.style.top = (clientY - s / 2) + 'px';
  }

  _onMouseMove(e) {
    if (!this._dragging || !this._dragGhost) return;
    this._positionGhost(e.clientX, e.clientY);
  }

  _onMouseUp(e) {
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
    this._cleanupDrag();

    if (target && target !== this._dragFrom && this.onSquareClick) {
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

  applyTheme(themeName) {
    const theme = THEMES[themeName];
    if (!theme) return;
    document.documentElement.style.setProperty('--light-square', theme.light);
    document.documentElement.style.setProperty('--dark-square', theme.dark);
  }
}
