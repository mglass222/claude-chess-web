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
import { DEFAULTS, ANALYSIS_DEPTH_MIN, ANALYSIS_DEPTH_MAX } from '../config.js';

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

    // Left panel buttons
    this._leftPanelEl = null;

    // Depth slider
    this._depthSliderEl = null;
    this._depthValueEl = null;

    // Hint button
    this._hintBtnEl = null;

    // Replay controls
    this._replayEl = null;
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

    this.evalBar = new EvalBar(leftPanel);

    // Left panel buttons
    this._buildLeftPanel(leftPanel);

    this.moveList = new MoveList(rightPanel);
    this.analysisGraph = new AnalysisGraph(boardArea);
    this.promotionDialog = new PromotionDialog(boardArea);
    this.setupScreen = new SetupScreen(appContainer);
    this.gameOverOverlay = new GameOverOverlay(boardArea);
    this.settingsDialog = new SettingsDialog(appContainer);

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

    // Show setup screen
    this._showSetup();
  }

  _buildLeftPanel(container) {
    this._leftPanelEl = document.createElement('div');
    this._leftPanelEl.className = 'left-panel-buttons';
    this._leftPanelEl.style.display = 'none';

    const buttons = [
      { id: 'restart', label: 'Restart', action: () => this._restart() },
      { id: 'new-game', label: 'New Game', action: () => this._newGame() },
      { id: 'settings', label: 'Settings', action: () => this._openSettings() },
      { id: 'save', label: 'Save', action: () => this._saveGame() },
      { id: 'load', label: 'Load', action: () => this._loadGame() },
    ];

    for (const { id, label, action } of buttons) {
      const btn = document.createElement('button');
      btn.className = 'panel-btn';
      btn.id = `btn-${id}`;
      btn.textContent = label;
      btn.addEventListener('click', action);
      this._leftPanelEl.appendChild(btn);
    }

    // Depth slider
    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'depth-slider-container';

    this._depthValueEl = document.createElement('span');
    this._depthValueEl.className = 'depth-label';
    this._depthValueEl.textContent = `Depth: ${this.state.analysisDepth}`;

    this._depthSliderEl = document.createElement('input');
    this._depthSliderEl.type = 'range';
    this._depthSliderEl.min = ANALYSIS_DEPTH_MIN;
    this._depthSliderEl.max = ANALYSIS_DEPTH_MAX;
    this._depthSliderEl.value = this.state.analysisDepth;
    this._depthSliderEl.className = 'depth-slider';
    this._depthSliderEl.addEventListener('input', (e) => {
      const newDepth = parseInt(e.target.value);
      this.state.analysisDepth = newDepth;
      this._depthValueEl.textContent = `Depth: ${newDepth}`;
      // Restart analysis with new depth
      if (this.state.analyzing && this.state.phase === 'playing') {
        this.engine.stopAnalysis();
        setTimeout(() => {
          this.engine.startAnalysis(this.state.fen, newDepth);
        }, 100);
      }
    });

    sliderContainer.appendChild(this._depthValueEl);
    sliderContainer.appendChild(this._depthSliderEl);
    this._leftPanelEl.appendChild(sliderContainer);

    container.appendChild(this._leftPanelEl);
  }

  _buildBelowBoard(container) {
    // Hint button
    this._hintBtnEl = document.createElement('button');
    this._hintBtnEl.className = 'hint-btn';
    this._hintBtnEl.textContent = 'Hint';
    this._hintBtnEl.style.display = 'none';
    this._hintBtnEl.addEventListener('click', () => this._toggleHint());
    container.appendChild(this._hintBtnEl);

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

  _wireCallbacks() {
    // Board interaction
    this.boardView.onSquareClick = (square) => this._handleSquareClick(square);
    this.boardView.onPieceDragStart = (square) => this._handleDragStart(square);

    // Move list clicks
    this.moveList.onMoveClick = (idx) => this._goToMoveIndex(idx);

    // Setup screen
    this.setupScreen.onStart = ({ color, difficulty }) => {
      this.state.playerColor = color;
      this.state.difficulty = difficulty;
      this._startGame();
    };

    // Game over overlay
    this.gameOverOverlay.onRestart = () => this._restart();
    this.gameOverOverlay.onNewGame = () => this._newGame();
    this.gameOverOverlay.onAnalyze = () => {
      this.analysisGraph.toggle(this.state.moveEvaluations);
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
    document.addEventListener('keydown', (e) => this._handleKeyboard(e));
  }

  // --- Game Flow ---

  _showSetup() {
    this.setupScreen.show();
    this._leftPanelEl.style.display = 'none';
    this._hintBtnEl.style.display = 'none';
    this._replayEl.style.display = 'none';
    this.gameOverOverlay.hide();
    this.analysisGraph.hide();
  }

  _startGame() {
    this.setupScreen.hide();
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
    this._replayEl.style.display = 'none';

    // Reset eval bar
    this.evalBar.reset();
    this.evalBar.setPlayerColor(this.state.playerColor);

    // Reset move list
    this.moveList.clear();

    // Set engine difficulty
    this.engine.setDifficulty(this.state.difficulty);

    // Start analysis
    this._startAnalysis();

    // If player is black, AI makes first move
    if (this.state.playerColor === 'b') {
      setTimeout(() => this._makeAIMove(), 300);
    }
  }

  _restart() {
    this.gameOverOverlay.hide();
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
    this._replayEl.style.display = 'none';

    this.engine.setDifficulty(this.state.difficulty);
    this._startAnalysis();

    if (this.state.playerColor === 'b') {
      setTimeout(() => this._makeAIMove(), 300);
    }
  }

  _newGame() {
    this.gameOverOverlay.hide();
    this.analysisGraph.hide();
    this.engine.stopAnalysis();
    this.state.newGame();
    this.history.clear();
    this.boardView.setSelected(null);
    this.boardView.setLastMove(null, null);
    this.boardView.setCheck(null);
    this.boardView.clearHintArrow();
    this.evalBar.reset();
    this.moveList.clear();
    this._showSetup();
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

    // Store current eval before making the move
    if (this.state.evaluation) {
      const cp = this.state.evaluation.cp;
      const mate = this.state.evaluation.mate;
      if (mate !== null && mate !== undefined) {
        const cpVal = mate > 0 ? (10000 - Math.abs(mate) * 100) : (-10000 + Math.abs(mate) * 100);
        this.state.addEvaluation(cpVal);
      } else if (cp !== null && cp !== undefined) {
        this.state.addEvaluation(cp);
      }
    }

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

    // Animate the move
    await this.boardView.animateMove(result.from, result.to, this.state.board);

    // Update last move highlight
    this.boardView.setLastMove(result.from, result.to);

    // Show check highlight
    this._updateCheckHighlight();

    // Update move list
    this.moveList.render(this.history);

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

    // Restart analysis and make AI move
    this._startAnalysis();
    if (!this.state.isPlayerTurn) {
      setTimeout(() => this._makeAIMove(), 200);
    }
  }

  async _makeAIMove() {
    if (this.state.phase !== 'playing') return;
    if (this.state.isPlayerTurn) return;
    if (this.boardView.isAnimating) return;

    // Stop analysis while getting AI move
    this.engine.stopAnalysis();

    const moveUci = await this.engine.getMove(this.state.fen, this.state.difficulty);
    if (!moveUci) return;

    // Store current eval
    if (this.state.evaluation) {
      const cp = this.state.evaluation.cp;
      const mate = this.state.evaluation.mate;
      if (mate !== null && mate !== undefined) {
        const cpVal = mate > 0 ? (10000 - Math.abs(mate) * 100) : (-10000 + Math.abs(mate) * 100);
        this.state.addEvaluation(cpVal);
      } else if (cp !== null && cp !== undefined) {
        this.state.addEvaluation(cp);
      }
    }

    // Parse UCI move (e.g., "e2e4", "e7e8q")
    const from = moveUci.substring(0, 2);
    const to = moveUci.substring(2, 4);
    const promotion = moveUci.length > 4 ? moveUci[4] : undefined;

    const moveObj = { from, to };
    if (promotion) moveObj.promotion = promotion;

    const result = this.state.makeMove(moveObj);
    if (!result) return;

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

    // Check game over
    if (this.state.checkGameOver()) {
      this._handleGameOver();
      return;
    }

    // Restart analysis
    this._startAnalysis();
  }

  _handleGameOver() {
    this.engine.stopAnalysis();
    this._hintBtnEl.style.display = 'none';
    this._replayEl.style.display = 'flex';
    this.gameOverOverlay.show(this.state.winner);
  }

  // --- Analysis ---

  _startAnalysis() {
    if (this.state.phase !== 'playing') return;
    this.state.analyzing = true;
    this.state.evaluation = null;
    this.state.bestMove = null;
    this.engine.onAnalysisUpdate = (info) => this._handleAnalysisUpdate(info);
    this.engine.startAnalysis(this.state.fen, this.state.analysisDepth);
  }

  _handleAnalysisUpdate(info) {
    if (this.state.phase !== 'playing' && this.state.phase !== 'over') return;

    // Store evaluation
    this.state.evaluation = {
      cp: info.cp,
      mate: info.mate,
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
  }

  _goToMoveIndex(idx) {
    const fen = this.history.goToIndex(idx);
    if (fen !== null) {
      this._showPositionFromFen(fen);
    } else if (this.history.isAtCurrentPosition()) {
      this.boardView.updatePosition(this.state.board);
    }
    this.moveList.render(this.history);
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
      case 'Home':
        e.preventDefault();
        {
          const fen = this.history.goToStart();
          if (fen) this._showPositionFromFen(fen);
          this.moveList.render(this.history);
        }
        break;
      case 'End':
        e.preventDefault();
        this.history.goToEnd();
        this.boardView.updatePosition(this.state.board);
        this.moveList.render(this.history);
        break;
    }
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
      this.moveList.render(this.history);
      this._leftPanelEl.style.display = 'flex';
      this._hintBtnEl.style.display = this.state.phase === 'over' ? 'none' : 'block';
      this._replayEl.style.display = this.state.phase === 'over' ? 'flex' : 'none';
      this.engine.setDifficulty(this.state.difficulty);

      if (this.state.phase === 'playing') {
        this._startAnalysis();
        if (!this.state.isPlayerTurn) {
          setTimeout(() => this._makeAIMove(), 300);
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
        return { ...DEFAULTS, ...JSON.parse(raw) };
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
    }));
  }
}
