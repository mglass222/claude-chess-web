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
import { DEFAULTS, ANALYSIS_DEPTH_MIN, ANALYSIS_DEPTH_MAX, evalToCp } from '../config.js';

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

    // Auto-start game with saved/default settings
    this.state.playerColor = this.settings.playerColor;
    this.state.difficulty = this.settings.difficulty;
    this._startGame();
  }

  _buildLeftPanel(container) {
    this._leftPanelEl = document.createElement('div');
    this._leftPanelEl.className = 'left-panel-buttons';
    this._leftPanelEl.style.display = 'none';

    const buttons = [
      { id: 'restart', label: 'Restart', action: () => this._restart() },
      { id: 'take-back', label: 'Take Back', action: () => this._takeBack() },
      { id: 'new-game', label: 'New Game', action: () => this._newGame() },
      { id: 'settings', label: 'Settings', action: () => this._openSettings() },
      { id: 'save', label: 'Save', action: () => this._saveGame() },
      { id: 'load', label: 'Load', action: () => this._loadGame() },
      { id: 'hint', label: 'Hint', action: () => this._toggleHint() },
      { id: 'resign', label: 'Resign', action: () => this._resign() },
    ];

    for (const { id, label, action } of buttons) {
      const btn = document.createElement('button');
      btn.className = 'panel-btn';
      btn.id = `btn-${id}`;
      btn.textContent = label;
      btn.addEventListener('click', action);
      this._leftPanelEl.appendChild(btn);
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
        btn.style.display = 'none';
      }
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
        this._setTimeout(() => {
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
    this.setupScreen.show(this.state.playerColor, this.state.difficulty);
  }

  _startGame() {
    this.setupScreen.hide();
    this.gameOverOverlay.hide();
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

    // Reset eval bar
    this.evalBar.reset();
    this.evalBar.setPlayerColor(this.state.playerColor);

    // Reset move list
    this.moveList.clear();

    // Set engine difficulty
    this.engine.setDifficulty(this.state.difficulty);

    // Update player info
    this._updatePlayerInfos();

    // Start analysis
    this._startAnalysis();

    // If player is black, AI makes first move
    if (this.state.playerColor === 'b') {
      this._setTimeout(() => this._makeAIMove(), 300);
    }
  }

  _restart() {
    this._cancelAnalysis = true;
    this._clearPendingTimeouts();
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
    this._takeBackBtnEl.style.display = 'block';
    this._resignBtnEl.style.display = 'block';
    this._takeBackBtnEl.disabled = true;
    this._replayEl.style.display = 'none';

    this.engine.setDifficulty(this.state.difficulty);
    this._startAnalysis();

    if (this.state.playerColor === 'b') {
      this._setTimeout(() => this._makeAIMove(), 300);
    }
  }

  _newGame() {
    this._cancelAnalysis = true;
    this._clearPendingTimeouts();
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

    // If it's the AI's turn, schedule its move (don't start analysis -
    // the engine would just be stopped 400ms later, and the heavy WASM
    // computation starves the audio thread, delaying the move sound).
    // Analysis restarts after the AI move completes.
    if (!this.state.isPlayerTurn) {
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

    const moveUci = await this.engine.getMove(this.state.fen, this.state.difficulty);
    if (!moveUci) return;

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
    this._takeBackBtnEl.style.display = 'none';
    this._resignBtnEl.style.display = 'none';
    this._replayEl.style.display = 'flex';
    this.gameOverOverlay.show(this.state.winner, !!this.state.analysisResults);
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
      this.gameOverOverlay.hide();
      this.analysisGraph.showGraph(this.state.analysisResults.evaluations);
      this.analysisGraph.setHighlight(this.history.getCurrentViewIndex());
      return;
    }

    // Hide game-over, show progress
    this.gameOverOverlay.hide();
    this.engine.stopAnalysis();
    this._cancelAnalysis = false;

    this.analysisGraph.showProgress();

    const moves = this.history.moves;
    const total = moves.length;
    const evaluations = [];

    for (let i = 0; i < total; i++) {
      if (this._cancelAnalysis) {
        this.analysisGraph.hide();
        this.gameOverOverlay.show(this.state.winner, false);
        return;
      }

      this.analysisGraph.updateProgress(i + 1, total);

      const fen = moves[i].fen;
      const result = await this.engine.analyzePosition(fen, movetime);

      if (this._cancelAnalysis) {
        this.analysisGraph.hide();
        this.gameOverOverlay.show(this.state.winner, false);
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

    // Disable take back if no moves left
    this._takeBackBtnEl.disabled = this.history.length === 0;

    // Restart analysis
    this._startAnalysis();
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
      case 'Home':
        e.preventDefault();
        {
          const fen = this.history.goToStart();
          if (fen) this._showPositionFromFen(fen);
          this.moveList.render(this.history);
          if (this.analysisGraph.visible) {
            this.analysisGraph.setHighlight(this.history.getCurrentViewIndex());
          }
        }
        break;
      case 'End':
        e.preventDefault();
        this.history.goToEnd();
        this.boardView.updatePosition(this.state.board);
        this.moveList.render(this.history);
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
    opponentName.textContent = `Stockfish (Level ${difficulty})`;

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
      this.moveList.render(this.history);
      this._leftPanelEl.style.display = 'flex';
      this._hintBtnEl.style.display = this.state.phase === 'over' ? 'none' : 'block';
      this._takeBackBtnEl.style.display = this.state.phase === 'over' ? 'none' : 'block';
      this._resignBtnEl.style.display = this.state.phase === 'over' ? 'none' : 'block';
      this._takeBackBtnEl.disabled = this.history.length === 0;
      this._replayEl.style.display = this.state.phase === 'over' ? 'flex' : 'none';
      this.engine.setDifficulty(this.state.difficulty);

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
      playerColor: this.settings.playerColor,
      difficulty: this.settings.difficulty,
    }));
  }
}
