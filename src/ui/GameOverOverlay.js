export class GameOverOverlay {
  constructor(container) {
    this.container = container;
    this.onRestart = null;
    this.onNewGame = null;
    this.onAnalyze = null;
    this._build();
  }

  _build() {
    this.el = document.createElement('div');
    this.el.className = 'game-over-overlay';
    this.el.style.display = 'none';

    this.inner = document.createElement('div');
    this.inner.className = 'game-over-inner';

    this.resultText = document.createElement('h2');
    this.resultText.className = 'game-over-result';

    const btnRow = document.createElement('div');
    btnRow.className = 'game-over-buttons';

    const restartBtn = document.createElement('button');
    restartBtn.className = 'go-btn';
    restartBtn.textContent = 'Rematch';
    restartBtn.addEventListener('click', () => {
      this.hide();
      if (this.onRestart) this.onRestart();
    });

    const newGameBtn = document.createElement('button');
    newGameBtn.className = 'go-btn';
    newGameBtn.textContent = 'New Game';
    newGameBtn.addEventListener('click', () => {
      this.hide();
      if (this.onNewGame) this.onNewGame();
    });

    const analyzeBtn = document.createElement('button');
    analyzeBtn.className = 'go-btn go-btn-secondary';
    analyzeBtn.textContent = 'Analyze Game';
    analyzeBtn.addEventListener('click', () => {
      if (this.onAnalyze) this.onAnalyze();
    });

    btnRow.appendChild(restartBtn);
    btnRow.appendChild(newGameBtn);
    btnRow.appendChild(analyzeBtn);

    this.inner.appendChild(this.resultText);
    this.inner.appendChild(btnRow);
    this.el.appendChild(this.inner);
    this.container.appendChild(this.el);
  }

  show(winner) {
    if (winner) {
      this.resultText.textContent = `${winner} wins!`;
    } else {
      this.resultText.textContent = 'Draw!';
    }
    this.el.style.display = 'flex';
  }

  hide() {
    this.el.style.display = 'none';
  }
}
