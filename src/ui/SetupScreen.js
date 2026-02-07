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
    this.el = document.createElement('div');
    this.el.className = 'setup-screen';

    // Title
    const title = document.createElement('h1');
    title.className = 'setup-title';
    title.textContent = 'Chess Game Setup';
    this.el.appendChild(title);

    // Color selection
    const colorSection = document.createElement('div');
    colorSection.className = 'setup-section';

    const colorLabel = document.createElement('h2');
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
    this.el.appendChild(colorSection);

    // Difficulty selection
    const diffSection = document.createElement('div');
    diffSection.className = 'setup-section';

    const diffLabel = document.createElement('h2');
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
    this.el.appendChild(diffSection);

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
    this.el.appendChild(startBtn);

    this.container.appendChild(this.el);
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

  show() {
    this.el.style.display = 'flex';
  }

  hide() {
    this.el.style.display = 'none';
  }
}
