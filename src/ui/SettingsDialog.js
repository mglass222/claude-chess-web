import { THEME_NAMES, PIECE_SETS } from '../config.js';

export class SettingsDialog {
  constructor() {
    this.onThemeChange = null;
    this.onPieceSetChange = null;
    this.onSoundToggle = null;
    this.onVolumeChange = null;
    this.onClose = null;
    this._currentThemeIndex = 0;
    this._currentPieceSetIndex = 0;
    this.el = this._build();
  }

  _build() {
    const wrapper = document.createElement('div');
    wrapper.className = 'settings-inline';
    wrapper.style.display = 'none';

    // Title
    const title = document.createElement('div');
    title.className = 'settings-inline-title';
    title.textContent = 'Settings';
    wrapper.appendChild(title);

    // Theme button
    this.themeBtn = document.createElement('button');
    this.themeBtn.className = 'panel-btn panel-btn-secondary';
    this.themeBtn.addEventListener('click', () => {
      this._currentThemeIndex = (this._currentThemeIndex + 1) % THEME_NAMES.length;
      if (this.onThemeChange) this.onThemeChange(THEME_NAMES[this._currentThemeIndex]);
      this._updateThemeLabel();
    });
    wrapper.appendChild(this.themeBtn);

    // Piece set button
    this.pieceSetBtn = document.createElement('button');
    this.pieceSetBtn.className = 'panel-btn panel-btn-secondary';
    this.pieceSetBtn.addEventListener('click', () => {
      this._currentPieceSetIndex = (this._currentPieceSetIndex + 1) % PIECE_SETS.length;
      if (this.onPieceSetChange) this.onPieceSetChange(PIECE_SETS[this._currentPieceSetIndex]);
      this._updatePieceSetLabel();
    });
    wrapper.appendChild(this.pieceSetBtn);

    // Sound toggle
    this.soundBtn = document.createElement('button');
    this.soundBtn.className = 'panel-btn panel-btn-secondary';
    this.soundBtn.addEventListener('click', () => {
      if (this.onSoundToggle) this.onSoundToggle();
    });
    wrapper.appendChild(this.soundBtn);

    // Volume controls
    const volRow = document.createElement('div');
    volRow.className = 'settings-vol-row';

    const volDown = document.createElement('button');
    volDown.className = 'settings-btn-small';
    volDown.textContent = '-';
    volDown.addEventListener('click', () => {
      if (this.onVolumeChange) this.onVolumeChange(-0.1);
    });

    this.volLabel = document.createElement('span');
    this.volLabel.className = 'settings-vol-label';

    const volUp = document.createElement('button');
    volUp.className = 'settings-btn-small';
    volUp.textContent = '+';
    volUp.addEventListener('click', () => {
      if (this.onVolumeChange) this.onVolumeChange(0.1);
    });

    volRow.appendChild(volDown);
    volRow.appendChild(this.volLabel);
    volRow.appendChild(volUp);
    wrapper.appendChild(volRow);

    // Back button
    const backBtn = document.createElement('button');
    backBtn.className = 'panel-btn';
    backBtn.textContent = 'Back';
    backBtn.addEventListener('click', () => {
      this.hide();
      if (this.onClose) this.onClose();
    });
    wrapper.appendChild(backBtn);

    return wrapper;
  }

  show(settings) {
    this._currentThemeIndex = THEME_NAMES.indexOf(settings.theme) || 0;
    this._currentPieceSetIndex = PIECE_SETS.indexOf(settings.pieceSet) || 0;
    this._updateSoundLabel(settings.soundEnabled);
    this._updateVolumeLabel(settings.volume);
    this._updateThemeLabel();
    this._updatePieceSetLabel();
    this.el.style.display = '';
  }

  hide() {
    this.el.style.display = 'none';
  }

  _updateSoundLabel(enabled) {
    this.soundBtn.textContent = `Sound: ${enabled ? 'ON' : 'OFF'}`;
  }

  _updateVolumeLabel(volume) {
    this.volLabel.textContent = `Vol: ${Math.round(volume * 100)}%`;
  }

  _updateThemeLabel() {
    const name = THEME_NAMES[this._currentThemeIndex];
    this.themeBtn.textContent = `Theme: ${name.charAt(0).toUpperCase() + name.slice(1)}`;
  }

  _updatePieceSetLabel() {
    const name = PIECE_SETS[this._currentPieceSetIndex];
    this.pieceSetBtn.textContent = `Pieces: ${name.charAt(0).toUpperCase() + name.slice(1)}`;
  }

  updateSettings(settings) {
    this._updateSoundLabel(settings.soundEnabled);
    this._updateVolumeLabel(settings.volume);
  }
}
