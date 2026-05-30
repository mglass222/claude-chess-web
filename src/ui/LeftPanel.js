/**
 * The left control panel: primary buttons, Copy PGN/FEN, Settings, Analyze, and
 * the inline analysis time-picker. Hosts the new-game-setup and settings-dialog
 * elements. Communicates outward through the `actions` callback map; the
 * controller drives visibility/labels through the intent methods below.
 */
export class LeftPanel {
  constructor(container, { actions, newGameSetupEl, settingsDialogEl }) {
    this._actions = actions;
    this._selectedTime = 3000;
    this._timeBtns = [];

    this.el = document.createElement('div');
    this.el.className = 'left-panel-buttons';
    this.el.style.display = 'none';

    this._buttonsContainer = document.createElement('div');
    this._buttonsContainer.className = 'left-panel-buttons-inner';

    this._buildPrimaryButtons();
    this._buildSecondaryButtons();
    this._buildAnalyzeControls();

    this.el.appendChild(this._buttonsContainer);
    this.el.appendChild(newGameSetupEl);
    this.el.appendChild(settingsDialogEl);
    container.appendChild(this.el);
  }

  _buildPrimaryButtons() {
    const a = this._actions;
    const buttons = [
      { id: 'new-game', label: 'New Game', action: a.onNewGame },
      { id: 'take-back', label: 'Take Back', action: a.onTakeBack },
      { id: 'save', label: 'Save', action: a.onSave },
      { id: 'load', label: 'Load', action: a.onLoad },
      { id: 'hint', label: 'Hint', action: a.onToggleHint },
      { id: 'resign', label: 'Resign', action: a.onResign },
    ];
    const secondaryIds = new Set(['save', 'load']);
    for (const { id, label, action } of buttons) {
      const btn = document.createElement('button');
      btn.className = 'panel-btn';
      if (secondaryIds.has(id)) btn.classList.add('panel-btn-secondary');
      btn.id = `btn-${id}`;
      btn.textContent = label;
      btn.addEventListener('click', action);
      this._buttonsContainer.appendChild(btn);
      if (id === 'hint') {
        this._hintBtn = btn;
        btn.style.display = 'none';
      } else if (id === 'take-back') {
        this._takeBackBtn = btn;
        btn.style.display = 'none';
      } else if (id === 'resign') {
        this._resignBtn = btn;
        btn.classList.add('panel-btn-danger');
        btn.style.display = 'none';
      } else if (id === 'save') {
        this._saveBtn = btn;
      } else if (id === 'load') {
        this._loadBtn = btn;
      }
    }
  }

  _buildSecondaryButtons() {
    const a = this._actions;
    this._pgnBtn = this._makeButton('panel-btn pgn-btn', 'Copy PGN', () =>
      this._copyToClipboard(a.onCopyPgn(), this._pgnBtn)
    );
    this._fenBtn = this._makeButton('panel-btn fen-btn', 'Copy FEN', () =>
      this._copyToClipboard(a.onCopyFen(), this._fenBtn)
    );
    const settingsBtn = this._makeButton(
      'panel-btn panel-btn-secondary settings-btn',
      'Settings',
      a.onOpenSettings
    );
    settingsBtn.id = 'btn-settings';
    this._buttonsContainer.append(this._pgnBtn, this._fenBtn, settingsBtn);
  }

  _buildAnalyzeControls() {
    const a = this._actions;
    this._analyzeBtn = this._makeButton('panel-btn', 'Analyze Game', a.onToggleAnalyze);
    this._analyzeBtn.id = 'btn-analyze';
    this._analyzeBtn.style.display = 'none';
    this._buttonsContainer.appendChild(this._analyzeBtn);

    this._timePicker = document.createElement('div');
    this._timePicker.className = 'analysis-time-picker';
    this._timePicker.style.display = 'none';

    const tpLabel = document.createElement('div');
    tpLabel.className = 'depth-label';
    tpLabel.textContent = 'Seconds per move:';

    const tpOptions = document.createElement('div');
    tpOptions.className = 'analysis-time-options';
    for (const { label, ms } of [
      { label: '1s', ms: 1000 },
      { label: '3s', ms: 3000 },
      { label: '5s', ms: 5000 },
      { label: '10s', ms: 10000 },
    ]) {
      const btn = document.createElement('button');
      btn.className = 'analysis-time-btn';
      if (ms === 3000) btn.classList.add('selected');
      btn.textContent = label;
      btn.addEventListener('click', () => {
        this._selectedTime = ms;
        for (const b of this._timeBtns) b.classList.remove('selected');
        btn.classList.add('selected');
      });
      tpOptions.appendChild(btn);
      this._timeBtns.push(btn);
    }

    const startBtn = this._makeButton('panel-btn', 'Start Analysis', () => {
      this.hideTimePicker();
      a.onStartAnalysis(this._selectedTime);
    });

    this._timePicker.append(tpLabel, tpOptions, startBtn);
    this._buttonsContainer.appendChild(this._timePicker);
  }

  _makeButton(className, label, onClick) {
    const btn = document.createElement('button');
    btn.className = className;
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  _copyToClipboard(text, btn) {
    navigator.clipboard
      .writeText(text)
      .then(() => this._flashEl(btn, 'Copied!'))
      .catch(() => this._flashEl(btn, 'Failed!'));
  }

  _flashEl(btn, message) {
    const original = btn.textContent;
    btn.textContent = message;
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove('copied');
    }, 1500);
  }

  // --- Intent methods (driven by the controller) ---

  setPanelVisible(visible) {
    this.el.style.display = visible ? 'flex' : 'none';
  }

  setButtonsVisible(visible) {
    this._buttonsContainer.style.display = visible ? 'flex' : 'none';
  }

  setInGameControlsVisible(visible) {
    const d = visible ? 'block' : 'none';
    this._hintBtn.style.display = d;
    this._takeBackBtn.style.display = d;
    this._resignBtn.style.display = d;
  }

  setHintLabel(text) {
    this._hintBtn.textContent = text;
  }

  setTakeBackEnabled(enabled) {
    this._takeBackBtn.disabled = !enabled;
  }

  showAnalyzeButton(hasResults) {
    this._analyzeBtn.style.display = 'block';
    this._analyzeBtn.textContent = hasResults ? 'Best Move' : 'Analyze Game';
    this._analyzeBtn.classList.toggle('best-move-btn', hasResults);
  }

  hideAnalyzeButton() {
    this._analyzeBtn.style.display = 'none';
    this._analyzeBtn.classList.remove('best-move-btn');
  }

  setAnalyzeLabel(text, isBestMove = null) {
    this._analyzeBtn.textContent = text;
    if (isBestMove !== null) this._analyzeBtn.classList.toggle('best-move-btn', isBestMove);
  }

  isTimePickerVisible() {
    return this._timePicker.style.display !== 'none';
  }

  toggleTimePicker() {
    if (this.isTimePickerVisible()) {
      this.hideTimePicker();
    } else {
      this._selectedTime = 3000;
      for (const b of this._timeBtns) b.classList.toggle('selected', b.textContent === '3s');
      this._timePicker.style.display = 'flex';
    }
  }

  hideTimePicker() {
    this._timePicker.style.display = 'none';
  }

  getSelectedAnalysisTime() {
    return this._selectedTime;
  }

  flash(which, message) {
    this._flashEl(which === 'save' ? this._saveBtn : this._loadBtn, message);
  }
}
