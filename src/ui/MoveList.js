export class MoveList {
  constructor(container) {
    this.container = container;
    this.onMoveClick = null; // callback(moveIndex)
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

    this.el.appendChild(this.titleEl);
    this.el.appendChild(this.listEl);
    this.container.appendChild(this.el);
  }

  render(moveHistory) {
    this.listEl.innerHTML = '';
    const moves = moveHistory.getMoves();

    if (moves.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'move-list-empty';
      empty.textContent = 'No moves yet';
      this.listEl.appendChild(empty);
      return;
    }

    const currentViewIdx = moveHistory.getCurrentViewIndex();

    // Group moves into pairs (white, black)
    for (let i = 0; i < moves.length; i += 2) {
      const row = document.createElement('div');
      row.className = 'move-row';

      const num = document.createElement('span');
      num.className = 'move-number';
      num.textContent = `${Math.floor(i / 2) + 1}.`;
      row.appendChild(num);

      // White's move
      const whiteMove = document.createElement('span');
      whiteMove.className = 'move-san';
      whiteMove.textContent = moves[i].san;
      // moveIndex in the full moves array is i+1 (skipping initial position)
      const wIdx = i + 1;
      if (wIdx === currentViewIdx) {
        whiteMove.classList.add('active');
      }
      whiteMove.addEventListener('click', () => {
        if (this.onMoveClick) this.onMoveClick(wIdx);
      });
      row.appendChild(whiteMove);

      // Black's move
      if (i + 1 < moves.length) {
        const blackMove = document.createElement('span');
        blackMove.className = 'move-san';
        blackMove.textContent = moves[i + 1].san;
        const bIdx = i + 2;
        if (bIdx === currentViewIdx) {
          blackMove.classList.add('active');
        }
        blackMove.addEventListener('click', () => {
          if (this.onMoveClick) this.onMoveClick(bIdx);
        });
        row.appendChild(blackMove);
      }

      this.listEl.appendChild(row);
    }

    // Auto-scroll to bottom
    this.listEl.scrollTop = this.listEl.scrollHeight;
  }

  clear() {
    this.listEl.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'move-list-empty';
    empty.textContent = 'No moves yet';
    this.listEl.appendChild(empty);
  }
}
