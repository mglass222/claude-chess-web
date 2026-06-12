const PIECE_NAMES = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' };

export class PromotionDialog {
  constructor(container) {
    this.container = container;
    this.pieceSet = 'cburnett';
    this._resolve = null;
    this._prevFocus = null;
    this._build();
  }

  _build() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'promotion-overlay';
    this.overlay.style.display = 'none';

    this.dialog = document.createElement('div');
    this.dialog.className = 'promotion-dialog';
    this.dialog.setAttribute('role', 'dialog');
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.setAttribute('aria-label', 'Choose promotion piece');

    this.overlay.appendChild(this.dialog);
    this.container.appendChild(this.overlay);

    // Click outside to cancel
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.hide(null);
      }
    });

    // Escape cancels (focus is inside the dialog, so the event bubbles here)
    this.overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.hide(null);
      }
    });
  }

  // Returns a promise that resolves with the chosen piece ('q','r','b','n') or null
  show(color) {
    return new Promise((resolve) => {
      this._resolve = resolve;
      this.dialog.replaceChildren();

      const pieces = ['q', 'r', 'b', 'n'];
      for (const piece of pieces) {
        const btn = document.createElement('button');
        btn.className = 'promotion-piece';
        btn.setAttribute('aria-label', `Promote to ${PIECE_NAMES[piece]}`);
        const img = document.createElement('img');
        const pieceCode = `${color}${piece.toUpperCase()}`;
        img.src = `${import.meta.env.BASE_URL}pieces/${this.pieceSet}/${pieceCode}.svg`;
        img.alt = '';
        btn.appendChild(img);
        btn.addEventListener('click', () => this.hide(piece));
        this.dialog.appendChild(btn);
      }

      this._prevFocus = document.activeElement;
      this.overlay.style.display = 'flex';
      this.dialog.querySelector('button')?.focus();
    });
  }

  hide(piece) {
    this.overlay.style.display = 'none';
    if (this._prevFocus instanceof HTMLElement && document.contains(this._prevFocus)) {
      this._prevFocus.focus();
    }
    this._prevFocus = null;
    if (this._resolve) {
      this._resolve(piece);
      this._resolve = null;
    }
  }
}
