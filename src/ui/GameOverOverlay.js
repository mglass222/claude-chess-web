export class GameOverOverlay {
  constructor(container) {
    this.container = container;
    this.onRestart = null;
    this.onNewGame = null;
    this.onAnalyze = null; // onAnalyze(movetimeMs)
    this._selectedTime = 3000;
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

    // Button row
    this.btnRow = document.createElement('div');
    this.btnRow.className = 'game-over-buttons';

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
      this.btnRow.style.display = 'none';
      this.timeSection.style.display = 'flex';
    });

    this.btnRow.appendChild(restartBtn);
    this.btnRow.appendChild(newGameBtn);
    this.btnRow.appendChild(analyzeBtn);

    // Time selection section (hidden by default)
    this.timeSection = document.createElement('div');
    this.timeSection.className = 'analysis-time-section';
    this.timeSection.style.display = 'none';

    const timeLabel = document.createElement('div');
    timeLabel.className = 'analysis-time-label';
    timeLabel.textContent = 'Seconds per move:';

    const timeOptions = document.createElement('div');
    timeOptions.className = 'analysis-time-options';

    const times = [
      { label: '1s', ms: 1000 },
      { label: '3s', ms: 3000 },
      { label: '5s', ms: 5000 },
      { label: '10s', ms: 10000 },
    ];

    this._timeBtns = [];
    for (const { label, ms } of times) {
      const btn = document.createElement('button');
      btn.className = 'analysis-time-btn';
      if (ms === this._selectedTime) btn.classList.add('selected');
      btn.textContent = label;
      btn.addEventListener('click', () => {
        this._selectedTime = ms;
        for (const b of this._timeBtns) b.classList.remove('selected');
        btn.classList.add('selected');
      });
      timeOptions.appendChild(btn);
      this._timeBtns.push(btn);
    }

    const startBtn = document.createElement('button');
    startBtn.className = 'go-btn';
    startBtn.textContent = 'Start Analysis';
    startBtn.addEventListener('click', () => {
      if (this.onAnalyze) this.onAnalyze(this._selectedTime);
    });

    this.timeSection.appendChild(timeLabel);
    this.timeSection.appendChild(timeOptions);
    this.timeSection.appendChild(startBtn);

    this.inner.appendChild(this.resultText);
    this.inner.appendChild(this.btnRow);
    this.inner.appendChild(this.timeSection);
    this.el.appendChild(this.inner);
    this.container.appendChild(this.el);
  }

  show(winner, hasCachedResults = false) {
    if (winner) {
      this.resultText.textContent = `${winner} wins!`;
    } else {
      this.resultText.textContent = 'Draw!';
    }

    // If cached results exist, call onAnalyze directly when "Analyze Game" is clicked
    if (hasCachedResults) {
      this._cachedResults = true;
    } else {
      this._cachedResults = false;
    }

    // Reset to button view
    this.btnRow.style.display = 'flex';
    this.timeSection.style.display = 'none';
    this._selectedTime = 3000;
    for (const btn of this._timeBtns) {
      btn.classList.toggle('selected', btn.textContent === '3s');
    }

    // Override analyze button behavior if cached
    const analyzeBtn = this.btnRow.querySelector('.go-btn-secondary');
    if (analyzeBtn) {
      const newBtn = analyzeBtn.cloneNode(true);
      analyzeBtn.parentNode.replaceChild(newBtn, analyzeBtn);
      newBtn.addEventListener('click', () => {
        if (this._cachedResults) {
          if (this.onAnalyze) this.onAnalyze(null);
        } else {
          this.btnRow.style.display = 'none';
          this.timeSection.style.display = 'flex';
        }
      });
    }

    this.el.style.display = 'flex';
  }

  hide() {
    this.el.style.display = 'none';
  }
}
