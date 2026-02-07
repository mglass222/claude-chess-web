export class PromotionDialog {
  constructor(container) {
    this.container = container;
    this._resolve = null;
    this._build();
  }

  _build() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'promotion-overlay';
    this.overlay.style.display = 'none';

    this.dialog = document.createElement('div');
    this.dialog.className = 'promotion-dialog';

    this.overlay.appendChild(this.dialog);
    this.container.appendChild(this.overlay);

    // Click outside to cancel
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.hide(null);
      }
    });
  }

  // Returns a promise that resolves with the chosen piece ('q','r','b','n') or null
  show(color, square) {
    return new Promise((resolve) => {
      this._resolve = resolve;
      this.dialog.innerHTML = '';

      const pieces = ['q', 'r', 'b', 'n'];
      for (const piece of pieces) {
        const btn = document.createElement('button');
        btn.className = 'promotion-piece';
        const img = document.createElement('img');
        const pieceCode = `${color}${piece.toUpperCase()}`;
        img.src = `${import.meta.env.BASE_URL}pieces/${pieceCode}.svg`;
        img.alt = pieceCode;
        btn.appendChild(img);
        btn.addEventListener('click', () => this.hide(piece));
        this.dialog.appendChild(btn);
      }

      // Position dialog over the promotion file
      this.overlay.style.display = 'flex';
    });
  }

  hide(piece) {
    this.overlay.style.display = 'none';
    if (this._resolve) {
      this._resolve(piece);
      this._resolve = null;
    }
  }
}
