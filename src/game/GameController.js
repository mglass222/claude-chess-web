import { Chess } from 'chess.js';
import { GameState } from './GameState.js';
import { MoveHistory } from './MoveHistory.js';
import { EngineManager } from '../engine/EngineManager.js';
import { BoardView } from '../ui/BoardView.js';
import { EvalBar } from '../ui/EvalBar.js';
import { MoveList } from '../ui/MoveList.js';
import { AnalysisGraph } from '../ui/AnalysisGraph.js';
import { PromotionDialog } from '../ui/PromotionDialog.js';
import { SetupScreen } from '../ui/SetupScreen.js';
import { GameOverOverlay } from '../ui/GameOverOverlay.js';
import { SettingsDialog } from '../ui/SettingsDialog.js';
import { SoundManager } from '../ui/SoundManager.js';
import { ChessClock } from '../ui/ChessClock.js';
import { DEFAULTS, DIFFICULTY_LEVELS, MOVE_TIME_OPTIONS, TIME_CONTROLS, evalToCp, getDifficultyLabel } from '../config.js';

export class GameController {
  constructor() {
    this.state = new GameState();
    this.history = new MoveHistory();
    this.engine = new EngineManager();
    this.sound = new SoundManager();

    // Settings (persisted to localStorage)
    this.settings = this._loadSettings();

    // UI components (created in init)
    this.boardView = null;
    this.evalBar = null;
    this.moveList = null;
    this.analysisGraph = null;
    this.promotionDialog = null;
    this.setupScreen = null;
    this.gameOverOverlay = null;
    this.settingsDialog = null;
    this.chessClock = null;

    // Left panel buttons
    this._leftPanelEl = null;

    // Depth slider
    this._depthSliderEl = null;
    this._depthValueEl = null;

    // Hint button
    this._hintBtnEl = null;

    // Take Back button
    this._takeBackBtnEl = null;

    // Replay controls
    this._replayEl = null;

    // Analysis cancel flag
    this._cancelAnalysis = false;

    // Bound handlers for cleanup
    this._boundKeyboard = (e) => this._handleKeyboard(e);

    // Tracked timeouts for cleanup
    this._pendingTimeouts = [];
  }

  async init() {
    // Apply saved settings
    this.sound.volume = this.settings.volume;
    this.sound.enabled = this.settings.soundEnabled;
    this.sound.load();

    // Get DOM containers
    const boardArea = document.getElementById('board-area');
    const leftPanel = document.getElementById('left-panel');
    const rightPanel = document.getElementById('right-panel');
    const appContainer = document.getElementById('app-container');
    const belowBoard = document.getElementById('below-board');

    // Create UI components
    this.boardView = new BoardView(boardArea);
    this.boardView.applyTheme(this.settings.theme);

    // Create a row wrapper for eval bar + board
    const boardColumn = document.getElementById('board-column');

    // Opponent info (above board)
    this._opponentInfo = this._buildPlayerInfo('opponent');
    boardColumn.insertBefore(this._opponentInfo, boardArea);

    const boardRow = document.createElement('div');
    boardRow.id = 'board-row';
    boardColumn.insertBefore(boardRow, boardArea);
    boardRow.appendChild(boardArea);

    this.evalBar = new EvalBar(boardRow);
    boardRow.insertBefore(this.evalBar.el, boardArea);

    // Player info (below board)
    this._playerInfo = this._buildPlayerInfo('player');
    boardColumn.insertBefore(this._playerInfo, document.getElementById('below-board'));

    // Chess clocks (each placed on its color's side of the board)
    this.chessClock = new ChessClock(this._playerInfo, this._opponentInfo);
    this.chessClock.onTimeOut = (color) => this._handleTimeOut(color);

    // Left panel buttons
    this._buildLeftPanel(leftPanel);

    this.moveList = new MoveList(rightPanel);

    // Game info section (FEN + PGN) is built in _buildLeftPanel

    this.analysisGraph = new AnalysisGraph(boardArea);
    this.promotionDialog = new PromotionDialog(boardArea);
    this.setupScreen = new SetupScreen(appContainer);
    this.gameOverOverlay = new GameOverOverlay(boardArea);
    this.settingsDialog = new SettingsDialog(appContainer);

    // Settings button (added to left panel in _buildLeftPanel)

    // Build below-board area (hint + replay)
    this._buildBelowBoard(belowBoard);

    // Wire up callbacks
    this._wireCallbacks();

    // Initialize engine
    try {
      await this.engine.init();
      console.log('Stockfish engine ready');
    } catch (e) {
      console.warn('Engine failed to initialize:', e);
    }

    // Auto-start game with saved/default settings
    this.state.playerColor = this.settings.playerColor;
    this.state.difficulty = this.settings.difficulty;
    this.state.moveTime = this.settings.moveTime ?? null;
    this._startGame();
  }

  _buildLeftPanel(container) {
    this._leftPanelEl = document.createElement('div');
    this._leftPanelEl.className = 'left-panel-buttons';
    this._leftPanelEl.style.display = 'none';

    const buttons = [
      { id: 'new-game', label: 'New Game', action: () => this._newGame() },
      { id: 'take-back', label: 'Take Back', action: () => this._takeBack() },
      { id: 'save', label: 'Save', action: () => this._saveGame() },
      { id: 'load', label: 'Load', action: () => this._loadGame() },
      { id: 'hint', label: 'Hint', action: () => this._toggleHint() },
      { id: 'resign', label: 'Resign', action: () => this._resign() },
    ];

    // Container for normal buttons (hidden when new game setup is shown)
    this._leftPanelButtonsContainer = document.createElement('div');
    this._leftPanelButtonsContainer.className = 'left-panel-buttons-inner';

    const secondaryIds = new Set(['settings', 'save', 'load']);
    for (const { id, label, action } of buttons) {
      const btn = document.createElement('button');
      btn.className = 'panel-btn';
      if (secondaryIds.has(id)) btn.classList.add('panel-btn-secondary');
      btn.id = `btn-${id}`;
      btn.textContent = label;
      btn.addEventListener('click', action);
      this._leftPanelButtonsContainer.appendChild(btn);
      if (id === 'hint') {
        this._hintBtnEl = btn;
        btn.style.display = 'none';
      }
      if (id === 'take-back') {
        this._takeBackBtnEl = btn;
        btn.style.display = 'none';
      }
      if (id === 'resign') {
        this._resignBtnEl = btn;
        btn.classList.add('panel-btn-danger');
        btn.style.display = 'none';
      }
    }

    // Settings button (below resign)
    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'panel-btn panel-btn-secondary';
    settingsBtn.id = 'btn-settings';
    settingsBtn.textContent = 'Settings';
    settingsBtn.addEventListener('click', () => this._openSettings());
    this._leftPanelButtonsContainer.appendChild(settingsBtn);

    // Game info section (FEN + PGN) below settings
    this._buildGameInfo(this._leftPanelButtonsContainer);

    // Analyze Game button (shown only after game over)
    this._analyzeBtnEl = document.createElement('button');
    this._analyzeBtnEl.className = 'panel-btn';
    this._analyzeBtnEl.id = 'btn-analyze';
    this._analyzeBtnEl.textContent = 'Analyze Game';
    this._analyzeBtnEl.style.display = 'none';
    this._analyzeBtnEl.addEventListener('click', () => this._handleAnalyzeClick());
    this._leftPanelButtonsContainer.appendChild(this._analyzeBtnEl);

    // Inline time picker for analysis (hidden by default, shown inside left panel)
    this._inlineTimePicker = document.createElement('div');
    this._inlineTimePicker.className = 'analysis-time-picker';
    this._inlineTimePicker.style.display = 'none';

    const tpLabel = document.createElement('div');
    tpLabel.className = 'depth-label';
    tpLabel.textContent = 'Seconds per move:';

    const tpOptions = document.createElement('div');
    tpOptions.className = 'analysis-time-options';

    this._inlineSelectedTime = 3000;
    this._inlineTimeBtns = [];
    for (const { label, ms } of [{ label: '1s', ms: 1000 }, { label: '3s', ms: 3000 }, { label: '5s', ms: 5000 }, { label: '10s', ms: 10000 }]) {
      const btn = document.createElement('button');
      btn.className = 'analysis-time-btn';
      if (ms === 3000) btn.classList.add('selected');
      btn.textContent = label;
      btn.addEventListener('click', () => {
        this._inlineSelectedTime = ms;
        for (const b of this._inlineTimeBtns) b.classList.remove('selected');
        btn.classList.add('selected');
      });
      tpOptions.appendChild(btn);
      this._inlineTimeBtns.push(btn);
    }

    const startBtn = document.createElement('button');
    startBtn.className = 'panel-btn';
    startBtn.textContent = 'Start Analysis';
    startBtn.addEventListener('click', () => {
      this._inlineTimePicker.style.display = 'none';
      this._runPostGameAnalysis(this._inlineSelectedTime);
    });

    this._inlineTimePicker.appendChild(tpLabel);
    this._inlineTimePicker.appendChild(tpOptions);
    this._inlineTimePicker.appendChild(startBtn);
    this._leftPanelButtonsContainer.appendChild(this._inlineTimePicker);
    this._leftPanelEl.appendChild(this._leftPanelButtonsContainer);

    // Inline new game setup (replaces popup overlay)
    this._newGameSetup = document.createElement('div');
    this._newGameSetup.className = 'inline-new-game-setup';
    this._newGameSetup.style.display = 'none';

    // --- Play As section ---
    const ngColorLabel = document.createElement('div');
    ngColorLabel.className = 'setup-section-label';
    ngColorLabel.textContent = 'Play As';

    const ngColorRow = document.createElement('div');
    ngColorRow.className = 'setup-color-row';

    this._ngWhiteBtn = document.createElement('button');
    this._ngWhiteBtn.className = 'setup-color-btn selected';
    this._ngWhiteBtn.innerHTML = `<img src="${import.meta.env.BASE_URL}pieces/wK.svg" alt="White" class="setup-color-king"><span>White</span>`;
    this._ngWhiteBtn.addEventListener('click', () => this._ngSelectColor('w'));

    this._ngBlackBtn = document.createElement('button');
    this._ngBlackBtn.className = 'setup-color-btn';
    this._ngBlackBtn.innerHTML = `<img src="${import.meta.env.BASE_URL}pieces/bK.svg" alt="Black" class="setup-color-king"><span>Black</span>`;
    this._ngBlackBtn.addEventListener('click', () => this._ngSelectColor('b'));

    ngColorRow.appendChild(this._ngWhiteBtn);
    ngColorRow.appendChild(this._ngBlackBtn);

    // --- Difficulty section ---
    const ngDiffLabel = document.createElement('div');
    ngDiffLabel.className = 'setup-section-label';
    ngDiffLabel.textContent = 'Opponent';

    this._ngSelectedColor = this.settings.playerColor;
    this._ngSelectedDifficulty = this.settings.difficulty;

    this._ngDiffSelect = document.createElement('select');
    this._ngDiffSelect.className = 'setup-diff-select';
    for (const level of DIFFICULTY_LEVELS) {
      const opt = document.createElement('option');
      opt.value = level.id;
      opt.textContent = level.label;
      if (level.id === this._ngSelectedDifficulty) opt.selected = true;
      this._ngDiffSelect.appendChild(opt);
    }
    this._ngDiffSelect.addEventListener('change', () => {
      this._ngSelectedDifficulty = parseInt(this._ngDiffSelect.value);
      this._ngSelectEngineMode('difficulty');
    });

    // --- Engine Think Time section (alternative to difficulty) ---
    const ngMoveTimeLabel = document.createElement('div');
    ngMoveTimeLabel.className = 'setup-section-label';
    ngMoveTimeLabel.textContent = 'Or: Think Time Per Move';

    const ngMoveTimeGrid = document.createElement('div');
    ngMoveTimeGrid.className = 'setup-time-grid';

    this._ngSelectedMoveTime = this.settings.moveTime ?? null;
    this._ngMoveTimeBtns = [];
    for (const mt of MOVE_TIME_OPTIONS) {
      const btn = document.createElement('button');
      btn.className = 'setup-time-btn' + (this._ngSelectedMoveTime === mt.seconds ? ' selected' : '');
      btn.dataset.seconds = mt.seconds;
      btn.textContent = mt.label;
      btn.addEventListener('click', () => {
        this._ngSelectedMoveTime = mt.seconds;
        for (const b of this._ngMoveTimeBtns) b.classList.toggle('selected', parseInt(b.dataset.seconds) === mt.seconds);
        this._ngSelectEngineMode('movetime');
      });
      ngMoveTimeGrid.appendChild(btn);
      this._ngMoveTimeBtns.push(btn);
    }

    // Apply initial visual state
    this._ngEngineMode = this.settings.moveTime != null ? 'movetime' : 'difficulty';
    this._ngDiffSelect.style.opacity = this._ngEngineMode === 'difficulty' ? '1' : '0.4';
    for (const b of this._ngMoveTimeBtns) {
      if (this._ngEngineMode !== 'movetime') b.classList.remove('selected');
    }

    // --- Time Control section ---
    const ngTimeLabel = document.createElement('div');
    ngTimeLabel.className = 'setup-section-label';
    ngTimeLabel.textContent = 'Time Control';

    const ngTimeGrid = document.createElement('div');
    ngTimeGrid.className = 'setup-time-grid';

    this._ngSelectedTime = this.settings.timeControl || 0;
    this._ngTimeBtns = [];
    for (const tc of TIME_CONTROLS) {
      if (tc.minutes === 0) continue; // "None" handled separately below
      const btn = document.createElement('button');
      btn.className = 'setup-time-btn' + (tc.minutes === this._ngSelectedTime ? ' selected' : '');
      btn.dataset.minutes = tc.minutes;
      btn.textContent = tc.label;
      btn.addEventListener('click', () => {
        this._ngSelectedTime = tc.minutes;
        for (const b of this._ngTimeBtns) b.classList.toggle('selected', parseInt(b.dataset.minutes) === tc.minutes);
      });
      ngTimeGrid.appendChild(btn);
      this._ngTimeBtns.push(btn);
    }

    // No time limit button (infinity)
    const ngNoTimeBtn = document.createElement('button');
    ngNoTimeBtn.className = 'setup-time-btn setup-time-btn-infinite' + (this._ngSelectedTime === 0 ? ' selected' : '');
    ngNoTimeBtn.dataset.minutes = 0;
    ngNoTimeBtn.innerHTML = '&#8734;';
    ngNoTimeBtn.addEventListener('click', () => {
      this._ngSelectedTime = 0;
      for (const b of this._ngTimeBtns) b.classList.toggle('selected', parseInt(b.dataset.minutes) === 0);
    });
    this._ngTimeBtns.push(ngNoTimeBtn);

    // --- Action buttons ---
    const ngBtnRow = document.createElement('div');
    ngBtnRow.className = 'setup-action-row';

    const ngStartBtn = document.createElement('button');
    ngStartBtn.className = 'panel-btn';
    ngStartBtn.textContent = 'Start Game';
    ngStartBtn.addEventListener('click', () => {
      this.state.playerColor = this._ngSelectedColor;
      this.state.difficulty = this._ngSelectedDifficulty;
      this.state.timeControl = this._ngSelectedTime;
      this.state.moveTime = this._ngEngineMode === 'movetime' ? this._ngSelectedMoveTime : null;
      this.settings.playerColor = this._ngSelectedColor;
      this.settings.difficulty = this._ngSelectedDifficulty;
      this.settings.timeControl = this._ngSelectedTime;
      this.settings.moveTime = this.state.moveTime;
      this._saveSettings();
      this._hideNewGameSetup();
      this._startGame();
    });

    const ngCancelBtn = document.createElement('button');
    ngCancelBtn.className = 'panel-btn panel-btn-secondary';
    ngCancelBtn.textContent = 'Cancel';
    ngCancelBtn.addEventListener('click', () => this._hideNewGameSetup());

    ngBtnRow.appendChild(ngStartBtn);
    ngBtnRow.appendChild(ngCancelBtn);

    // Divider helper
    const divider = () => {
      const d = document.createElement('div');
      d.className = 'setup-divider';
      return d;
    };

    this._newGameSetup.appendChild(ngColorLabel);
    this._newGameSetup.appendChild(ngColorRow);
    this._newGameSetup.appendChild(divider());
    this._newGameSetup.appendChild(ngDiffLabel);
    this._newGameSetup.appendChild(this._ngDiffSelect);
    this._newGameSetup.appendChild(ngMoveTimeLabel);
    this._newGameSetup.appendChild(ngMoveTimeGrid);
    this._newGameSetup.appendChild(divider());
    this._newGameSetup.appendChild(ngTimeLabel);
    this._newGameSetup.appendChild(ngTimeGrid);
    this._newGameSetup.appendChild(ngNoTimeBtn);
    this._newGameSetup.appendChild(divider());
    this._newGameSetup.appendChild(ngBtnRow);
    this._leftPanelEl.appendChild(this._newGameSetup);

    container.appendChild(this._leftPanelEl);
  }

  _ngSelectColor(color) {
    this._ngSelectedColor = color;
    this._ngWhiteBtn.classList.toggle('selected', color === 'w');
    this._ngBlackBtn.classList.toggle('selected', color === 'b');
  }

  _ngSelectEngineMode(mode) {
    this._ngEngineMode = mode;
    if (mode === 'difficulty') {
      this._ngSelectedMoveTime = null;
      this._ngDiffSelect.style.opacity = '1';
      for (const b of this._ngMoveTimeBtns) b.classList.remove('selected');
    } else {
      this._ngDiffSelect.style.opacity = '0.4';
    }
  }

  _showNewGameSetup() {
    // Sync current settings
    this._ngSelectedColor = this.settings.playerColor;
    this._ngSelectedDifficulty = this.settings.difficulty;
    this._ngSelectedTime = this.settings.timeControl || 0;
    this._ngSelectedMoveTime = this.settings.moveTime ?? null;
    this._ngSelectColor(this._ngSelectedColor);
    this._ngDiffSelect.value = this._ngSelectedDifficulty;
    for (const b of this._ngTimeBtns) b.classList.toggle('selected', parseInt(b.dataset.minutes) === this._ngSelectedTime);

    // Sync engine mode
    this._ngEngineMode = this._ngSelectedMoveTime != null ? 'movetime' : 'difficulty';
    this._ngDiffSelect.style.opacity = this._ngEngineMode === 'difficulty' ? '1' : '0.4';
    for (const b of this._ngMoveTimeBtns) {
      b.classList.toggle('selected', this._ngEngineMode === 'movetime' && parseInt(b.dataset.seconds) === this._ngSelectedMoveTime);
    }

    // Hide normal buttons, show setup
    this._leftPanelButtonsContainer.style.display = 'none';
    this._newGameSetup.style.display = 'flex';
  }

  _hideNewGameSetup() {
    this._newGameSetup.style.display = 'none';
    this._leftPanelButtonsContainer.style.display = 'flex';
  }

  _buildBelowBoard(container) {
    // Replay controls (shown after game over)
    this._replayEl = document.createElement('div');
    this._replayEl.className = 'replay-controls';
    this._replayEl.style.display = 'none';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'replay-btn';
    prevBtn.innerHTML = '&#9664;'; // left arrow
    prevBtn.addEventListener('click', () => this._navigateHistory('back'));

    const nextBtn = document.createElement('button');
    nextBtn.className = 'replay-btn';
    nextBtn.innerHTML = '&#9654;'; // right arrow
    nextBtn.addEventListener('click', () => this._navigateHistory('forward'));

    this._replayEl.appendChild(prevBtn);
    this._replayEl.appendChild(nextBtn);
    container.appendChild(this._replayEl);

  }

  _buildGameInfo(container) {
    this._gameInfoEl = document.createElement('div');
    this._gameInfoEl.className = 'game-info';
    this._gameInfoEl.style.display = 'none';

    // FEN section
    const fenLabel = document.createElement('div');
    fenLabel.className = 'game-info-label';
    fenLabel.textContent = 'FEN';

    const fenRow = document.createElement('div');
    fenRow.className = 'game-info-row';

    this._fenInputEl = document.createElement('input');
    this._fenInputEl.type = 'text';
    this._fenInputEl.className = 'fen-input';
    this._fenInputEl.readOnly = true;

    this._fenCopyBtn = document.createElement('button');
    this._fenCopyBtn.className = 'copy-btn';
    this._fenCopyBtn.textContent = 'Copy';
    this._fenCopyBtn.addEventListener('click', () => this._copyToClipboard(this._fenInputEl.value, this._fenCopyBtn));

    fenRow.appendChild(this._fenInputEl);
    fenRow.appendChild(this._fenCopyBtn);

    // PGN button
    this._pgnCopyBtn = document.createElement('button');
    this._pgnCopyBtn.className = 'panel-btn pgn-btn';
    this._pgnCopyBtn.textContent = 'Copy PGN';
    this._pgnCopyBtn.addEventListener('click', () => this._copyToClipboard(this._generatePgn(), this._pgnCopyBtn));

    this._gameInfoEl.appendChild(fenLabel);
    this._gameInfoEl.appendChild(fenRow);
    this._gameInfoEl.appendChild(this._pgnCopyBtn);
    container.appendChild(this._gameInfoEl);
  }

  _updateGameInfo() {
    if (!this._fenInputEl) return;
    // Show FEN for the currently viewed position
    const viewIdx = this.history.getCurrentViewIndex();
    if (viewIdx >= 0 && viewIdx < this.history.moves.length) {
      this._fenInputEl.value = this.history.moves[viewIdx].fen || this.state.fen;
    } else {
      this._fenInputEl.value = this.state.fen;
    }
  }

  _generatePgn() {
    const date = new Date();
    const dateStr = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
    const isWhite = this.state.lastPlayerColor === 'w';
    let engineLabel;
    if (this.state.moveTime != null) {
      const mtOpt = MOVE_TIME_OPTIONS.find(o => o.seconds === this.state.moveTime);
      engineLabel = `Stockfish (${mtOpt ? mtOpt.label : this.state.moveTime + 's'}/move)`;
    } else {
      engineLabel = `Stockfish (${getDifficultyLabel(this.state.lastDifficulty)})`;
    }
    const white = isWhite ? 'You' : engineLabel;
    const black = isWhite ? engineLabel : 'You';

    let result = '*';
    if (this.state.phase === 'over') {
      if (this.state.winner === 'White') result = '1-0';
      else if (this.state.winner === 'Black') result = '0-1';
      else result = '1/2-1/2';
    }

    let pgn = '';
    pgn += `[Event "Claude Chess"]\n`;
    pgn += `[Site "-"]\n`;
    pgn += `[Date "${dateStr}"]\n`;
    pgn += `[Round "-"]\n`;
    pgn += `[White "${white}"]\n`;
    pgn += `[Black "${black}"]\n`;
    pgn += `[Result "${result}"]\n\n`;

    // Build move text from history
    const moves = this.history.getMoves();
    for (let i = 0; i < moves.length; i++) {
      if (i % 2 === 0) pgn += `${Math.floor(i / 2) + 1}. `;
      pgn += moves[i].san + ' ';
    }
    pgn += result;

    return pgn.trim();
  }

  _copyToClipboard(text, btn) {
    const original = btn.textContent;
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      this._setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove('copied');
      }, 1500);
    }).catch(() => {
      btn.textContent = 'Failed!';
      this._setTimeout(() => {
        btn.textContent = original;
      }, 1500);
    });
  }

  _wireCallbacks() {
    // Board interaction
    this.boardView.onSquareClick = (square) => this._handleSquareClick(square);
    this.boardView.onPieceDragStart = (square) => this._handleDragStart(square);

    // Move list clicks
    this.moveList.onMoveClick = (idx) => this._goToMoveIndex(idx);

    // Setup screen (new game dialog)
    this.setupScreen.onStart = ({ color, difficulty }) => {
      this.state.playerColor = color;
      this.state.difficulty = difficulty;
      this.settings.playerColor = color;
      this.settings.difficulty = difficulty;
      this._saveSettings();
      this._startGame();
    };

    // Game over overlay
    this.gameOverOverlay.onRestart = () => this._restart();
    this.gameOverOverlay.onNewGame = () => this._newGame();
    this.gameOverOverlay.onAnalyze = (movetimeMs) => this._runPostGameAnalysis(movetimeMs);

    // Analysis graph
    this.analysisGraph.onMoveClick = (idx) => {
      this._goToMoveIndex(idx);
      this.analysisGraph.setHighlight(idx);
    };
    this.analysisGraph.onCancel = () => {
      this._cancelAnalysis = true;
    };

    // Settings dialog
    this.settingsDialog.onThemeChange = (theme) => {
      this.settings.theme = theme;
      this.boardView.applyTheme(theme);
      this._saveSettings();
    };
    this.settingsDialog.onSoundToggle = () => {
      this.settings.soundEnabled = !this.settings.soundEnabled;
      this.sound.setEnabled(this.settings.soundEnabled);
      this._saveSettings();
      this.settingsDialog.updateSettings(this.settings);
    };
    this.settingsDialog.onVolumeChange = (delta) => {
      this.settings.volume = Math.max(0, Math.min(1, this.settings.volume + delta));
      this.sound.setVolume(this.settings.volume);
      this._saveSettings();
      this.settingsDialog.updateSettings(this.settings);
    };

    // Engine analysis callback
    this.engine.onAnalysisUpdate = (info) => this._handleAnalysisUpdate(info);

    // Keyboard navigation
    document.addEventListener('keydown', this._boundKeyboard);
  }

  // --- Game Flow ---

  _showNewGameDialog() {
    this._showNewGameSetup();
  }

  _startGame() {
    this.setupScreen.hide();
    this.gameOverOverlay.hide();
    this._analyzeBtnEl.style.display = 'none';
    this._inlineTimePicker.style.display = 'none';
    this.analysisGraph.hide();
    this.state.resetGame();
    this.state.startGame();
    this.history.clear();
    this.history.setInitialFen(this.state.fen);

    // Setup board
    this.boardView.renderPosition(this.state.board, this.state.playerColor);
    this.boardView.setLastMove(null, null);
    this.boardView.setCheck(null);
    this.boardView.clearHintArrow();

    // Show UI elements
    this._leftPanelEl.style.display = 'flex';
    this._hintBtnEl.style.display = 'block';
    this._takeBackBtnEl.style.display = 'block';
    this._takeBackBtnEl.disabled = true;
    this._resignBtnEl.style.display = 'block';
    this._replayEl.style.display = 'none';
    this._gameInfoEl.style.display = 'flex';
    this._updateGameInfo();

    // Reset eval bar
    this.evalBar.reset();
    this.evalBar.setPlayerColor(this.state.playerColor);

    // Reset move list
    this.moveList.clear();

    // Set engine difficulty
    this.engine.setDifficulty(this.state.difficulty, this.state.moveTime);

    // Update player info
    this._updatePlayerInfos();

    // Initialize chess clocks
    const timeMinutes = this.state.timeControl || this.settings.timeControl || 0;
    this.chessClock.init(timeMinutes, this.state.playerColor);

    // Start analysis
    this._startAnalysis();

    // If player is black, AI makes first move
    if (this.state.playerColor === 'b') {
      // Start black's clock (the AI) right away
      if (this.chessClock.isActive) {
        this.chessClock.startClock('b');
      }
      this._setTimeout(() => this._makeAIMove(), 300);
    } else {
      // Start white's clock (the player)
      if (this.chessClock.isActive) {
        this.chessClock.startClock('w');
      }
    }
  }

  _restart() {
    this._cancelAnalysis = true;
    this._clearPendingTimeouts();
    this.chessClock.stop();
    this.gameOverOverlay.hide();
    this._analyzeBtnEl.style.display = 'none';
    this._inlineTimePicker.style.display = 'none';
    this.analysisGraph.hide();
    this.state.resetGame();
    this.state.playerColor = this.state.lastPlayerColor;
    this.state.difficulty = this.state.lastDifficulty;
    this.history.clear();
    this.history.setInitialFen(this.state.fen);

    this.boardView.renderPosition(this.state.board, this.state.playerColor);
    this.boardView.setSelected(null);
    this.boardView.setLastMove(null, null);
    this.boardView.setCheck(null);
    this.boardView.clearHintArrow();
    this.evalBar.reset();
    this.evalBar.setPlayerColor(this.state.playerColor);
    this.moveList.clear();
    this._hintBtnEl.style.display = 'block';
    this._hintBtnEl.textContent = 'Hint';
    this._takeBackBtnEl.style.display = 'block';
    this._resignBtnEl.style.display = 'block';
    this._takeBackBtnEl.disabled = true;
    this._replayEl.style.display = 'none';
    this._updateGameInfo();

    this.engine.setDifficulty(this.state.difficulty, this.state.moveTime);
    this._startAnalysis();

    if (this.state.playerColor === 'b') {
      this._setTimeout(() => this._makeAIMove(), 300);
    }
  }

  _newGame() {
    this._cancelAnalysis = true;
    this._clearPendingTimeouts();
    this.chessClock.stop();
    this.engine.stopAnalysis();
    this._showNewGameDialog();
  }

  // --- Move Handling ---

  _handleSquareClick(square) {
    if (this.state.phase !== 'playing') return;
    if (!this.history.isAtCurrentPosition()) return;
    if (this.boardView.isAnimating) return;
    if (!this.state.isPlayerTurn) return;

    const selected = this.boardView.selectedSquare;

    if (!selected) {
      // Select a piece
      const piece = this._getPieceAt(square);
      if (piece && piece.color === this.state.playerColor) {
        this.boardView.setSelected(square);
        const moves = this.state.legalMovesFrom(square);
        this.boardView.showLegalMoves(moves);
      }
    } else if (square === selected) {
      // Deselect
      this.boardView.setSelected(null);
    } else {
      // Try to move or select a different piece
      const piece = this._getPieceAt(square);
      if (piece && piece.color === this.state.playerColor) {
        // Select different piece
        this.boardView.setSelected(square);
        const moves = this.state.legalMovesFrom(square);
        this.boardView.showLegalMoves(moves);
      } else {
        // Try to make a move
        this._tryMove(selected, square);
      }
    }
  }

  _handleDragStart(square) {
    if (this.state.phase !== 'playing') return false;
    if (!this.history.isAtCurrentPosition()) return false;
    if (!this.state.isPlayerTurn) return false;
    const piece = this._getPieceAt(square);
    return piece && piece.color === this.state.playerColor;
  }

  async _tryMove(from, to) {
    // Check if this is a promotion
    const piece = this._getPieceAt(from);
    if (piece && piece.type === 'p') {
      const promoRank = this.state.playerColor === 'w' ? '8' : '1';
      if (to[1] === promoRank) {
        // Check if the move is legal with any promotion
        const testMove = this.state.chess.moves({ square: from, verbose: true })
          .find(m => m.to === to && m.promotion);
        if (testMove) {
          const choice = await this.promotionDialog.show(this.state.playerColor, to);
          if (choice) {
            await this._executeMove({ from, to, promotion: choice });
          }
          this.boardView.setSelected(null);
          return;
        }
      }
    }

    // Regular move
    await this._executeMove({ from, to });
  }

  async _executeMove(moveObj) {
    this.boardView.setSelected(null);
    this.boardView.clearLegalMoves();

    // Make the move in chess.js
    const result = this.state.makeMove(moveObj);
    if (!result) return; // illegal move

    // Play sound
    if (this.state.isCheck()) {
      this.sound.play('check');
    } else if (result.captured) {
      this.sound.play('capture');
    } else {
      this.sound.play('move');
    }

    // Record in history
    this.history.addMove(result.san, this.state.fen);

    // Update board immediately for player moves (no animation needed)
    this.boardView.updatePosition(this.state.board);

    // Update last move highlight
    this.boardView.setLastMove(result.from, result.to);

    // Show check highlight
    this._updateCheckHighlight();

    // Update move list
    this.moveList.render(this.history);
    this._updateGameInfo();

    // Enable take back
    this._takeBackBtnEl.disabled = false;

    // Reset hint
    this.state.showingHint = false;
    this.state.bestMove = null;
    this.boardView.clearHintArrow();
    this._hintBtnEl.textContent = 'Hint';

    // Check game over
    if (this.state.checkGameOver()) {
      this._handleGameOver();
      return;
    }

    // Switch the clock to the next player's turn
    if (this.chessClock.isActive) {
      this.chessClock.switchTo(this.state.turn);
    }

    // If it's the AI's turn, stop any running analysis immediately and
    // schedule the AI move. Stopping now prevents stale analysis commands
    // from racing with the upcoming getMove() call.
    if (!this.state.isPlayerTurn) {
      this.engine.stopAnalysis();
      this._setTimeout(() => this._makeAIMove(), 400);
    } else {
      this._startAnalysis();
    }
  }

  async _makeAIMove() {
    if (this.state.phase !== 'playing') return;
    if (this.state.isPlayerTurn) return;
    if (this.boardView.isAnimating) return;

    // Stop analysis while getting AI move
    this.engine.stopAnalysis();

    const moveTimeSec = this.state.moveTime != null ? this.state.moveTime : null;
    const moveUci = await this.engine.getMove(this.state.fen, this.state.difficulty, moveTimeSec);
    if (!moveUci || moveUci === '(none)') {
      console.warn('Engine failed to produce a move, retrying...');
      this._setTimeout(() => this._makeAIMove(), 500);
      return;
    }

    // Parse UCI move (e.g., "e2e4", "e7e8q")
    const from = moveUci.substring(0, 2);
    const to = moveUci.substring(2, 4);
    const promotion = moveUci.length > 4 ? moveUci[4] : undefined;

    const moveObj = { from, to };
    if (promotion) moveObj.promotion = promotion;

    const result = this.state.makeMove(moveObj);
    if (!result) {
      console.warn('Engine produced illegal move:', moveUci, 'retrying...');
      this._setTimeout(() => this._makeAIMove(), 500);
      return;
    }

    // Play sound
    if (this.state.isCheck()) {
      this.sound.play('check');
    } else if (result.captured) {
      this.sound.play('capture');
    } else {
      this.sound.play('move');
    }

    // Record in history
    this.history.addMove(result.san, this.state.fen);

    // Animate
    await this.boardView.animateMove(from, to, this.state.board);

    // Update UI
    this.boardView.setLastMove(from, to);
    this._updateCheckHighlight();
    this.moveList.render(this.history);
    this._updateGameInfo();

    // Check game over
    if (this.state.checkGameOver()) {
      this._handleGameOver();
      return;
    }

    // Switch clock to the player's turn
    if (this.chessClock.isActive) {
      this.chessClock.switchTo(this.state.turn);
    }

    // Restart analysis
    this._startAnalysis();
  }

  _handleGameOver() {
    this.engine.stopAnalysis();
    this.chessClock.stop();
    this._hintBtnEl.style.display = 'none';
    this._takeBackBtnEl.style.display = 'none';
    this._resignBtnEl.style.display = 'none';
    this._replayEl.style.display = 'none';

    // Show analyze button in left panel
    this._analyzeBtnEl.style.display = 'block';
    this._analyzeBtnEl.textContent = this.state.analysisResults ? 'View Analysis' : 'Analyze Game';
    this._inlineTimePicker.style.display = 'none';
  }

  _handleAnalyzeClick() {
    if (this.state.analysisResults) {
      this.analysisGraph.showGraph(this.state.analysisResults.evaluations);
      this.analysisGraph.setHighlight(this.history.getCurrentViewIndex());
    } else {
      // Toggle time picker visibility
      const isVisible = this._inlineTimePicker.style.display !== 'none';
      if (isVisible) {
        this._inlineTimePicker.style.display = 'none';
      } else {
        this._inlineSelectedTime = 3000;
        for (const btn of this._inlineTimeBtns) {
          btn.classList.toggle('selected', btn.textContent === '3s');
        }
        this._inlineTimePicker.style.display = 'flex';
      }
    }
  }

  _handleTimeOut(color) {
    if (this.state.phase !== 'playing') return;
    this._clearPendingTimeouts();
    this.state.phase = 'over';
    // The player who ran out of time loses
    this.state.winner = color === 'w' ? 'Black' : 'White';
    this._handleGameOver();
  }

  _resign() {
    if (this.state.phase !== 'playing') return;
    this._clearPendingTimeouts();
    this.state.phase = 'over';
    this.state.winner = this.state.playerColor === 'w' ? 'Black' : 'White';
    this._handleGameOver();
  }

  async _runPostGameAnalysis(movetime) {
    // If cached results exist, show graph immediately
    if (this.state.analysisResults) {
      this.analysisGraph.showGraph(this.state.analysisResults.evaluations);
      this.analysisGraph.setHighlight(this.history.getCurrentViewIndex());
      return;
    }

    this.engine.stopAnalysis();
    this._cancelAnalysis = false;

    this.analysisGraph.showProgress();

    const moves = this.history.moves;
    const total = moves.length;
    const evaluations = [];

    for (let i = 0; i < total; i++) {
      if (this._cancelAnalysis) {
        this.analysisGraph.hide();
        return;
      }

      this.analysisGraph.updateProgress(i + 1, total);

      const fen = moves[i].fen;
      const result = await this.engine.analyzePosition(fen, movetime);

      if (this._cancelAnalysis) {
        this.analysisGraph.hide();
        return;
      }

      if (result) {
        // Normalize to White's POV
        let cpVal = evalToCp(result);
        if (cpVal !== null) {
          // Engine reports from side-to-move's perspective
          // Parse whose turn it is from the FEN
          const turnFromFen = fen.split(' ')[1];
          if (turnFromFen === 'b') cpVal = -cpVal;
        }
        evaluations.push(cpVal);
      } else {
        evaluations.push(null);
      }
    }

    // Store results and show graph
    this.state.analysisResults = { evaluations, movetime };
    this.analysisGraph.showGraph(evaluations);
    this.analysisGraph.setHighlight(this.history.getCurrentViewIndex());

    // Update the analyze button to "View Analysis" now that results are cached
    this._analyzeBtnEl.textContent = 'View Analysis';
  }

  _takeBack() {
    if (this.state.phase !== 'playing') return;
    if (this.history.length === 0) return;
    if (!this.history.isAtCurrentPosition()) return;

    // Clear pending timeouts (cancel scheduled AI move)
    this._clearPendingTimeouts();
    this.engine.stopAnalysis();

    // Determine how many half-moves to undo
    const undoCount = this.state.isPlayerTurn ? 2 : 1;

    for (let i = 0; i < undoCount; i++) {
      if (this.history.length === 0) break;
      this.state.undoMove();
      this.history.removeLast();
    }

    // Update board
    this.boardView.updatePosition(this.state.board);

    // Clear last move highlight (history doesn't store from/to squares)
    this.boardView.setLastMove(null, null);

    // Update check highlight
    this._updateCheckHighlight();

    // Clear hint
    this.state.showingHint = false;
    this.state.bestMove = null;
    this.boardView.clearHintArrow();
    this._hintBtnEl.textContent = 'Hint';

    // Update move list
    this.moveList.render(this.history);
    this._updateGameInfo();

    // Disable take back if no moves left
    this._takeBackBtnEl.disabled = this.history.length === 0;

    // Switch clock to current turn after take-back
    if (this.chessClock.isActive) {
      this.chessClock.switchTo(this.state.turn);
    }

    // Restart analysis
    this._startAnalysis();
  }

  // --- Analysis ---

  _startAnalysis() {
    if (this.state.phase !== 'playing') return;
    this.state.analyzing = true;
    this.state.evaluation = null;
    this.state.bestMove = null;
    this.evalBar.update(null); // Reset depth gate for new position
    this.engine.onAnalysisUpdate = (info) => this._handleAnalysisUpdate(info);
    this.engine.startAnalysis(this.state.fen, this.state.analysisDepth);
  }

  _handleAnalysisUpdate(info) {
    if (this.state.phase !== 'playing' && this.state.phase !== 'over') return;

    // Stockfish reports scores from the side-to-move's perspective.
    // Normalize to white's perspective for the eval bar.
    const turnFromFen = this.state.fen.split(' ')[1];
    const flip = turnFromFen === 'b' ? -1 : 1;

    // Store evaluation (normalized to white's perspective)
    this.state.evaluation = {
      cp: info.cp != null ? info.cp * flip : info.cp,
      mate: info.mate != null ? info.mate * flip : info.mate,
      depth: info.depth,
    };

    // Store best move from PV
    if (info.bestMove) {
      this.state.bestMove = info.bestMove;
      // Update hint if showing
      if (this.state.showingHint) {
        this._showHintArrow();
      }
    }

    // Update eval bar
    this.evalBar.update(this.state.evaluation);
  }

  _toggleHint() {
    this.state.showingHint = !this.state.showingHint;
    if (this.state.showingHint) {
      this._hintBtnEl.textContent = 'Hide Hint';
      this._showHintArrow();
    } else {
      this._hintBtnEl.textContent = 'Hint';
      this.boardView.clearHintArrow();
    }
  }

  _showHintArrow() {
    if (!this.state.bestMove) return;
    const from = this.state.bestMove.substring(0, 2);
    const to = this.state.bestMove.substring(2, 4);
    this.boardView.showHintArrow(from, to);
  }

  // --- Navigation ---

  _navigateHistory(direction) {
    let fen = null;
    if (direction === 'back') {
      fen = this.history.goBack();
    } else {
      fen = this.history.goForward();
    }

    if (fen !== null) {
      this._showPositionFromFen(fen);
    } else if (direction === 'forward' && this.history.isAtCurrentPosition()) {
      // Returned to current position
      this.boardView.updatePosition(this.state.board);
    }

    this.moveList.render(this.history);
    this._updateGameInfo();
    if (this.analysisGraph.visible) {
      this.analysisGraph.setHighlight(this.history.getCurrentViewIndex());
    }
  }

  _goToMoveIndex(idx) {
    const fen = this.history.goToIndex(idx);
    if (fen !== null) {
      this._showPositionFromFen(fen);
    } else if (this.history.isAtCurrentPosition()) {
      this.boardView.updatePosition(this.state.board);
    }
    this.moveList.render(this.history);
    this._updateGameInfo();
    if (this.analysisGraph.visible) {
      this.analysisGraph.setHighlight(idx);
    }
  }

  _showPositionFromFen(fen) {
    const temp = new Chess(fen);
    this.boardView.updatePosition(temp.board());
  }

  _handleKeyboard(e) {
    if (this.state.phase === 'setup') return;
    if (this.history.length === 0) return;

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        this._navigateHistory('back');
        break;
      case 'ArrowRight':
        e.preventDefault();
        this._navigateHistory('forward');
        break;
      case 'ArrowUp':
      case 'Home':
        e.preventDefault();
        {
          const fen = this.history.goToStart();
          if (fen) this._showPositionFromFen(fen);
          this.moveList.render(this.history);
          this._updateGameInfo();
          if (this.analysisGraph.visible) {
            this.analysisGraph.setHighlight(this.history.getCurrentViewIndex());
          }
        }
        break;
      case 'ArrowDown':
      case 'End':
        e.preventDefault();
        this.history.goToEnd();
        this.boardView.updatePosition(this.state.board);
        this.moveList.render(this.history);
        this._updateGameInfo();
        if (this.analysisGraph.visible) {
          this.analysisGraph.setHighlight(this.history.getCurrentViewIndex());
        }
        break;
    }
  }

  // --- Player Info ---

  _buildPlayerInfo(role) {
    const el = document.createElement('div');
    el.className = `player-info ${role}`;
    el.style.display = 'none';

    const avatar = document.createElement('div');
    avatar.className = 'player-avatar';

    const name = document.createElement('span');
    name.className = 'player-name';

    el.appendChild(avatar);
    el.appendChild(name);
    return el;
  }

  _updatePlayerInfos() {
    const isWhite = this.state.playerColor === 'w';
    const difficulty = this.state.difficulty;

    // Player info
    const playerAvatar = this._playerInfo.querySelector('.player-avatar');
    const playerName = this._playerInfo.querySelector('.player-name');
    playerAvatar.textContent = isWhite ? 'W' : 'B';
    playerAvatar.className = `player-avatar ${isWhite ? 'white-piece' : 'black-piece'}`;
    playerName.textContent = 'You';

    // Opponent info
    const opponentAvatar = this._opponentInfo.querySelector('.player-avatar');
    const opponentName = this._opponentInfo.querySelector('.player-name');
    opponentAvatar.textContent = isWhite ? 'B' : 'W';
    opponentAvatar.className = `player-avatar ${isWhite ? 'black-piece' : 'white-piece'}`;
    if (this.state.moveTime != null) {
      const mtOpt = MOVE_TIME_OPTIONS.find(o => o.seconds === this.state.moveTime);
      const mtLabel = mtOpt ? mtOpt.label : `${this.state.moveTime}s`;
      opponentName.textContent = `Stockfish (${mtLabel}/move)`;
    } else {
      opponentName.textContent = `Stockfish (${getDifficultyLabel(difficulty)})`;
    }

    this._playerInfo.style.display = 'flex';
    this._opponentInfo.style.display = 'flex';
  }

  // --- Lifecycle ---

  _setTimeout(fn, delay) {
    const id = setTimeout(() => {
      this._pendingTimeouts = this._pendingTimeouts.filter(t => t !== id);
      fn();
    }, delay);
    this._pendingTimeouts.push(id);
    return id;
  }

  _clearPendingTimeouts() {
    for (const id of this._pendingTimeouts) {
      clearTimeout(id);
    }
    this._pendingTimeouts = [];
  }

  destroy() {
    this._clearPendingTimeouts();
    document.removeEventListener('keydown', this._boundKeyboard);
    this.boardView.destroy();
    this.evalBar.destroy();
    this.chessClock.destroy();
    this.engine.destroy();
  }

  // --- Helpers ---

  _getPieceAt(square) {
    const board = this.state.board;
    const file = square.charCodeAt(0) - 97; // 'a' = 0
    const rank = parseInt(square[1]) - 1;    // '1' = 0
    const row = 7 - rank;
    return board[row][file];
  }

  _updateCheckHighlight() {
    if (this.state.isCheck()) {
      // Find the king in check
      const board = this.state.board;
      const turn = this.state.turn;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const p = board[r][c];
          if (p && p.type === 'k' && p.color === turn) {
            const sq = String.fromCharCode(97 + c) + (8 - r);
            this.boardView.setCheck(sq);
            return;
          }
        }
      }
    } else {
      this.boardView.setCheck(null);
    }
  }

  // --- Settings & Persistence ---

  _openSettings() {
    this.settingsDialog.show(this.settings);
  }

  _saveGame() {
    const data = this.state.serialize(this.history);
    localStorage.setItem('claude-chess-save', JSON.stringify(data));
    console.log('Game saved');
  }

  _loadGame() {
    const raw = localStorage.getItem('claude-chess-save');
    if (!raw) {
      console.log('No saved game found');
      return;
    }
    try {
      const data = JSON.parse(raw);
      const moveData = this.state.deserialize(data);
      if (moveData) {
        this.history.deserialize(moveData);
      }
      this.setupScreen.hide();
      this.boardView.renderPosition(this.state.board, this.state.playerColor);
      this.evalBar.setPlayerColor(this.state.playerColor);
      this.evalBar.reset();
      // Hide clocks on load (time state is not preserved in saves)
      this.chessClock.hide();
      this.moveList.render(this.history);
      this._gameInfoEl.style.display = 'flex';
      this._updateGameInfo();
      this._leftPanelEl.style.display = 'flex';
      this._hintBtnEl.style.display = this.state.phase === 'over' ? 'none' : 'block';
      this._takeBackBtnEl.style.display = this.state.phase === 'over' ? 'none' : 'block';
      this._resignBtnEl.style.display = this.state.phase === 'over' ? 'none' : 'block';
      this._takeBackBtnEl.disabled = this.history.length === 0;
      this._replayEl.style.display = 'none';
      if (this.state.phase === 'over') {
        this._handleGameOver();
      }
      this.engine.setDifficulty(this.state.difficulty, this.state.moveTime);

      if (this.state.phase === 'playing') {
        this._startAnalysis();
        if (!this.state.isPlayerTurn) {
          this._setTimeout(() => this._makeAIMove(), 300);
        }
      }
    } catch (e) {
      console.error('Failed to load game:', e);
    }
  }

  _loadSettings() {
    const raw = localStorage.getItem('claude-chess-settings');
    if (raw) {
      try {
        const settings = { ...DEFAULTS, ...JSON.parse(raw) };
        // Migrate old settings to new difficulty/time system
        if (!('timeControl' in settings)) {
          settings.difficulty = DEFAULTS.difficulty;
          settings.timeControl = 0;
        }
        return settings;
      } catch (e) {
        // ignore
      }
    }
    return { ...DEFAULTS };
  }

  _saveSettings() {
    localStorage.setItem('claude-chess-settings', JSON.stringify({
      theme: this.settings.theme,
      volume: this.settings.volume,
      soundEnabled: this.settings.soundEnabled,
      playerColor: this.settings.playerColor,
      difficulty: this.settings.difficulty,
      timeControl: this.settings.timeControl || 0,
      moveTime: this.settings.moveTime ?? null,
    }));
  }
}
