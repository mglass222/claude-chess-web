import { THEME_NAMES } from '../config.js';

export class SettingsDialog {
  constructor(container) {
    this.container = container;
    this.onThemeChange = null;
    this.onSoundToggle = null;
    this.onVolumeChange = null;
    this.onClose = null;
    this._currentThemeIndex = 0;
    this._build();
  }

  _build() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'settings-overlay';
    this.overlay.style.display = 'none';

    const panel = document.createElement('div');
    panel.className = 'settings-panel';

    // Title
    const title = document.createElement('h2');
    title.className = 'settings-title';
    title.textContent = 'Settings';
    panel.appendChild(title);

    // Sound toggle
    this.soundBtn = document.createElement('button');
    this.soundBtn.className = 'settings-btn';
    this.soundBtn.addEventListener('click', () => {
      if (this.onSoundToggle) this.onSoundToggle();
    });
    panel.appendChild(this.soundBtn);

    // Volume controls
    const volRow = document.createElement('div');
    volRow.className = 'settings-row';

    this.volLabel = document.createElement('span');
    this.volLabel.className = 'settings-vol-label';

    const volDown = document.createElement('button');
    volDown.className = 'settings-btn-small';
    volDown.textContent = '-';
    volDown.addEventListener('click', () => {
      if (this.onVolumeChange) this.onVolumeChange(-0.1);
    });

    const volUp = document.createElement('button');
    volUp.className = 'settings-btn-small';
    volUp.textContent = '+';
    volUp.addEventListener('click', () => {
      if (this.onVolumeChange) this.onVolumeChange(0.1);
    });

    volRow.appendChild(volDown);
    volRow.appendChild(this.volLabel);
    volRow.appendChild(volUp);
    panel.appendChild(volRow);

    // Theme button
    this.themeBtn = document.createElement('button');
    this.themeBtn.className = 'settings-btn';
    this.themeBtn.addEventListener('click', () => {
      this._currentThemeIndex = (this._currentThemeIndex + 1) % THEME_NAMES.length;
      if (this.onThemeChange) this.onThemeChange(THEME_NAMES[this._currentThemeIndex]);
      this._updateThemeLabel();
    });
    panel.appendChild(this.themeBtn);

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'settings-btn settings-close-btn';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => {
      this.hide();
      if (this.onClose) this.onClose();
    });
    panel.appendChild(closeBtn);

    this.overlay.appendChild(panel);
    this.container.appendChild(this.overlay);

    // Click overlay to close
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.hide();
        if (this.onClose) this.onClose();
      }
    });
  }

  show(settings) {
    this._currentThemeIndex = THEME_NAMES.indexOf(settings.theme) || 0;
    this._updateSoundLabel(settings.soundEnabled);
    this._updateVolumeLabel(settings.volume);
    this._updateThemeLabel();
    this.overlay.style.display = 'flex';
  }

  hide() {
    this.overlay.style.display = 'none';
  }

  _updateSoundLabel(enabled) {
    this.soundBtn.textContent = `Sound: ${enabled ? 'ON' : 'OFF'}`;
    this.soundBtn.classList.toggle('active', enabled);
  }

  _updateVolumeLabel(volume) {
    this.volLabel.textContent = `Volume: ${Math.round(volume * 100)}%`;
  }

  _updateThemeLabel() {
    const name = THEME_NAMES[this._currentThemeIndex];
    this.themeBtn.textContent = `Theme: ${name.charAt(0).toUpperCase() + name.slice(1)}`;
  }

  updateSettings(settings) {
    this._updateSoundLabel(settings.soundEnabled);
    this._updateVolumeLabel(settings.volume);
  }
}
