import { DIFFICULTY_OPTIONS, DEFAULTS } from '../config.js';

export class SetupScreen {
  constructor(container) {
    this.container = container;
    this.selectedColor = DEFAULTS.playerColor;
    this.selectedDifficulty = DEFAULTS.difficulty;
    this.onStart = null; // callback({ color, difficulty })
    this._build();
  }

  _build() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'setup-overlay';
    this.overlay.style.display = 'none';

    // Click overlay to close (cancel)
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.hide();
      }
    });

    const panel = document.createElement('div');
    panel.className = 'setup-panel';

    // Title
    const title = document.createElement('h2');
    title.className = 'setup-title';
    title.textContent = 'New Game';
    panel.appendChild(title);

    // Color selection
    const colorSection = document.createElement('div');
    colorSection.className = 'setup-section';

    const colorLabel = document.createElement('h3');
    colorLabel.className = 'setup-label';
    colorLabel.textContent = 'Select Side';
    colorSection.appendChild(colorLabel);

    const colorRow = document.createElement('div');
    colorRow.className = 'color-selection';

    // White king
    this.whiteBtn = document.createElement('button');
    this.whiteBtn.className = 'color-btn selected';
    this.whiteBtn.innerHTML = `
      <img src="${import.meta.env.BASE_URL}pieces/wK.svg" alt="White King" class="color-king">
      <span>White</span>
    `;
    this.whiteBtn.addEventListener('click', () => this._selectColor('w'));

    // Black king
    this.blackBtn = document.createElement('button');
    this.blackBtn.className = 'color-btn';
    this.blackBtn.innerHTML = `
      <img src="${import.meta.env.BASE_URL}pieces/bK.svg" alt="Black King" class="color-king">
      <span>Black</span>
    `;
    this.blackBtn.addEventListener('click', () => this._selectColor('b'));

    colorRow.appendChild(this.whiteBtn);
    colorRow.appendChild(this.blackBtn);
    colorSection.appendChild(colorRow);
    panel.appendChild(colorSection);

    // Difficulty selection
    const diffSection = document.createElement('div');
    diffSection.className = 'setup-section';

    const diffLabel = document.createElement('h3');
    diffLabel.className = 'setup-label';
    diffLabel.textContent = 'Difficulty';
    diffSection.appendChild(diffLabel);

    const diffRow = document.createElement('div');
    diffRow.className = 'difficulty-selection';

    this.diffBtns = [];
    for (const d of DIFFICULTY_OPTIONS) {
      const btn = document.createElement('button');
      btn.className = 'diff-btn' + (d === this.selectedDifficulty ? ' selected' : '');
      btn.textContent = d;
      btn.addEventListener('click', () => this._selectDifficulty(d));
      diffRow.appendChild(btn);
      this.diffBtns.push(btn);
    }

    diffSection.appendChild(diffRow);
    panel.appendChild(diffSection);

    // Start button
    const startBtn = document.createElement('button');
    startBtn.className = 'start-btn';
    startBtn.textContent = 'Start Game';
    startBtn.addEventListener('click', () => {
      if (this.onStart) {
        this.onStart({
          color: this.selectedColor,
          difficulty: this.selectedDifficulty,
        });
      }
    });
    panel.appendChild(startBtn);

    this.overlay.appendChild(panel);
    this.container.appendChild(this.overlay);
  }

  _selectColor(color) {
    this.selectedColor = color;
    this.whiteBtn.classList.toggle('selected', color === 'w');
    this.blackBtn.classList.toggle('selected', color === 'b');
  }

  _selectDifficulty(d) {
    this.selectedDifficulty = d;
    this.diffBtns.forEach((btn, i) => {
      btn.classList.toggle('selected', DIFFICULTY_OPTIONS[i] === d);
    });
  }

  show(color, difficulty) {
    if (color) this._selectColor(color);
    if (difficulty) this._selectDifficulty(difficulty);
    this.overlay.style.display = 'flex';
  }

  hide() {
    this.overlay.style.display = 'none';
  }
}
