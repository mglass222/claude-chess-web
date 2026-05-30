import { GameState } from './GameState.js';
import { MoveHistory } from './MoveHistory.js';
import { generatePgn } from './pgn.js';
import { loadSettings, saveSettings } from './settingsStore.js';
import { EngineManager } from '../engine/EngineManager.js';
import { AnalysisPool } from '../engine/AnalysisPool.js';
import { BoardView } from '../ui/BoardView.js';
import { EvalBar } from '../ui/EvalBar.js';
import { MoveList } from '../ui/MoveList.js';
import { AnalysisGraph } from '../ui/AnalysisGraph.js';
import { PromotionDialog } from '../ui/PromotionDialog.js';
import { SettingsDialog } from '../ui/SettingsDialog.js';
import { NewGameSetup } from '../ui/NewGameSetup.js';
import { SoundManager } from '../ui/SoundManager.js';
import { ChessClock } from '../ui/ChessClock.js';
import { evalToCp, ANALYSIS_DEPTH_MAX } from '../config.js';
import { pieceAt, checkHighlightSquare } from './boardUtils.js';
import { HistoryNavigator } from './HistoryNavigator.js';
import { PlayerInfoView } from '../ui/PlayerInfoView.js';
import { LeftPanel } from '../ui/LeftPanel.js';

export class GameController {
  constructor() {
    this.state = new GameState();
    this.history = new MoveHistory();
    this.engine = new EngineManager();
    this._engineReady = false;
    this.sound = new SoundManager();

    // Settings (persisted to localStorage)
    this.settings = loadSettings();

    // UI components (created in init)
    this.boardView = null;
    this.evalBar = null;
    this.moveList = null;
    this.analysisGraph = null;
    this.promotionDialog = null;
    this.settingsDialog = null;
    this.newGameSetup = null;
    this.chessClock = null;

    // Replay controls
    this._replayEl = null;

    // Analysis pool for parallel post-game analysis
    this._analysisPool = null;

    // Analysis cancel flag
    this._cancelAnalysis = false;

    // Bound handlers for cleanup
    this._boundKeyboard = (e) => this.historyNavigator.handleKey(e);

    // Tracked timeouts for cleanup
    this._pendingTimeouts = [];
    this._gameSessionId = 0;
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
    const belowBoard = document.getElementById('below-board');

    // Create UI components
    this.boardView = new BoardView(boardArea);
    this.boardView.applyTheme(this.settings.theme);
    this.boardView.setPieceSet(this.settings.pieceSet);

    // Create a row wrapper for eval bar + board
    const boardColumn = document.getElementById('board-column');

    // Player/opponent info banners (placement stays here; the view builds them)
    this.playerInfoView = new PlayerInfoView();
    this._opponentInfo = this.playerInfoView.opponentEl;
    this._playerInfo = this.playerInfoView.playerEl;
    boardColumn.insertBefore(this._opponentInfo, boardArea);

    const boardRow = document.createElement('div');
    boardRow.id = 'board-row';
    boardColumn.insertBefore(boardRow, boardArea);
    boardRow.appendChild(boardArea);

    this.evalBar = new EvalBar(boardRow);
    boardRow.insertBefore(this.evalBar.el, boardArea);

    // Player info (below board)
    boardColumn.insertBefore(this._playerInfo, document.getElementById('below-board'));

    // Inline game-over result banner (replaces the old modal overlay), shown
    // directly under the board on checkmate / draw / resignation / timeout.
    this._resultBanner = document.createElement('div');
    this._resultBanner.className = 'game-result';
    this._resultBanner.style.display = 'none';
    boardColumn.insertBefore(this._resultBanner, this._playerInfo);

    // Chess clocks (each placed on its color's side of the board)
    this.chessClock = new ChessClock(this._playerInfo, this._opponentInfo);
    this.chessClock.onTimeOut = (color) => this._handleTimeOut(color);
    this.chessClock.onLowTimeTick = () => this.sound.playLowTimeWarning();

    // Settings dialog + new-game setup are owned by the controller (it wires their
    // callbacks); the left panel hosts their elements.
    this.settingsDialog = new SettingsDialog();
    this.newGameSetup = new NewGameSetup(this.settings.pieceSet);
    this.newGameSetup.onStart = (opts) => this._startNewGame(opts);
    this.newGameSetup.onCancel = () => this._hideNewGameSetup();

    this.leftPanel = new LeftPanel(leftPanel, {
      actions: {
        onNewGame: () => this._newGame(),
        onTakeBack: () => this._takeBack(),
        onSave: () => this._saveGame(),
        onLoad: () => this._loadGame(),
        onToggleHint: () => this._toggleHint(),
        onResign: () => this._resign(),
        onOpenSettings: () => this._openSettings(),
        onCopyPgn: () => generatePgn(this.state, this.history),
        onCopyFen: () => this._getCurrentFen(),
        onToggleAnalyze: () => this._handleAnalyzeClick(),
        onStartAnalysis: (ms) => this._runPostGameAnalysis(ms),
      },
      newGameSetupEl: this.newGameSetup.el,
      settingsDialogEl: this.settingsDialog.el,
    });

    this.moveList = new MoveList(rightPanel);

    // FEN bar is built in _buildBelowBoard

    this.analysisGraph = new AnalysisGraph(boardArea, rightPanel);
    this.promotionDialog = new PromotionDialog(boardArea);
    this.promotionDialog.pieceSet = this.settings.pieceSet;

    // History/view navigation (back/forward/jump, keyboard, per-ply position cache)
    this.historyNavigator = new HistoryNavigator({
      history: this.history,
      boardView: this.boardView,
      evalBar: this.evalBar,
      analysisGraph: this.analysisGraph,
      moveList: this.moveList,
      state: this.state,
      onReturnToLive: () => {
        this.boardView.updatePosition(this.state.board);
        this._updateCheckHighlight();
      },
      onPositionShown: () => {
        if (this.state.showingBestMove) this._showBestMoveForCurrentPosition();
      },
    });

    // Build below-board area (hint + replay)
    this._buildBelowBoard(belowBoard);

    // Wire up callbacks
    this._wireCallbacks();

    // Initialize engine
    try {
      await this.engine.init();
      this._engineReady = true;
      console.log('Stockfish engine ready');
    } catch (e) {
      console.warn('Engine failed to initialize:', e);
      this._showEngineError();
    }

    // Auto-start game with saved/default settings
    this.state.playerColor = this.settings.playerColor;
    this.state.difficulty = this.settings.difficulty;
    this.state.moveTime = this.settings.moveTime ?? null;
    this._startGame();
  }

  _startNewGame({ color, difficulty, timeControl, moveTime }) {
    this.state.playerColor = color;
    this.state.difficulty = difficulty;
    this.state.timeControl = timeControl;
    this.state.moveTime = moveTime;
    this.settings.playerColor = color;
    this.settings.difficulty = difficulty;
    this.settings.timeControl = timeControl;
    this.settings.moveTime = moveTime;
    saveSettings(this.settings);
    this._hideNewGameSetup();
    this._startGame();
  }

  _showNewGameSetup() {
    this.leftPanel.setButtonsVisible(false);
    this.newGameSetup.show(this.settings);
    document.getElementById('board-column').classList.add('board-inactive');
  }

  _hideNewGameSetup() {
    this.newGameSetup.hide();
    this.leftPanel.setButtonsVisible(true);
    document.getElementById('board-column').classList.remove('board-inactive');
  }

  _buildBelowBoard(container) {
    // Replay controls (shown after game over)
    this._replayEl = document.createElement('div');
    this._replayEl.className = 'replay-controls';
    this._replayEl.style.display = 'none';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'replay-btn';
    prevBtn.textContent = '\u25C0'; // left arrow
    prevBtn.addEventListener('click', () => this.historyNavigator.back());

    const nextBtn = document.createElement('button');
    nextBtn.className = 'replay-btn';
    nextBtn.textContent = '\u25B6'; // right arrow
    nextBtn.addEventListener('click', () => this.historyNavigator.forward());

    this._replayEl.appendChild(prevBtn);
    this._replayEl.appendChild(nextBtn);
    container.appendChild(this._replayEl);
  }

  _getCurrentFen() {
    const viewIdx = this.history.getCurrentViewIndex();
    if (viewIdx >= 0 && viewIdx < this.history.moves.length) {
      return this.history.moves[viewIdx].fen || this.state.fen;
    }
    return this.state.fen;
  }

  // Show a persistent notice on the board when Stockfish fails to load.
  _showEngineError() {
    if (this._engineErrorEl) return;
    const banner = document.createElement('div');
    banner.className = 'engine-error-banner';
    banner.textContent = 'Chess engine failed to load — refresh the page to try again.';
    document.getElementById('board-area').appendChild(banner);
    this._engineErrorEl = banner;
  }

  _wireCallbacks() {
    // Board interaction
    this.boardView.onSquareClick = (square) => this._handleSquareClick(square);
    this.boardView.onPieceDragStart = (square) => this._handleDragStart(square);

    // Move list clicks
    this.moveList.onMoveClick = (idx) => this.historyNavigator.goToIndex(idx);

    // Analysis graph
    this.analysisGraph.onMoveClick = (idx) => {
      this.historyNavigator.goToIndex(idx);
      this.analysisGraph.setHighlight(idx);
    };
    this.analysisGraph.onCancel = () => {
      this._cancelAnalysis = true;
      if (this._analysisPool) {
        this._analysisPool.cancel();
        this._analysisPool = null;
      }
    };

    // Settings dialog
    this.settingsDialog.onThemeChange = (theme) => {
      this.settings.theme = theme;
      this.boardView.applyTheme(theme);
      saveSettings(this.settings);
    };
    this.settingsDialog.onPieceSetChange = (pieceSet) => {
      this.settings.pieceSet = pieceSet;
      this.boardView.setPieceSet(pieceSet);
      this.promotionDialog.pieceSet = pieceSet;
      saveSettings(this.settings);
    };
    this.settingsDialog.onSoundToggle = () => {
      this.settings.soundEnabled = !this.settings.soundEnabled;
      this.sound.setEnabled(this.settings.soundEnabled);
      saveSettings(this.settings);
      this.settingsDialog.updateSettings(this.settings);
    };
    this.settingsDialog.onVolumeChange = (delta) => {
      this.settings.volume = Math.max(0, Math.min(1, this.settings.volume + delta));
      this.sound.setVolume(this.settings.volume);
      saveSettings(this.settings);
      this.settingsDialog.updateSettings(this.settings);
    };
    this.settingsDialog.onClose = () => {
      this.leftPanel.setButtonsVisible(true);
    };

    // The analysis callback is (re)installed per-position in _startAnalysis,
    // bound to the exact FEN being analyzed — see _handleAnalysisUpdate.

    // Keyboard navigation
    document.addEventListener('keydown', this._boundKeyboard);
  }

  // --- Game Flow ---

  _showNewGameDialog() {
    this._showNewGameSetup();
  }

  _startGame() {
    this._resultBanner.style.display = 'none';
    this.leftPanel.hideAnalyzeButton();
    this.leftPanel.hideTimePicker();
    this.analysisGraph.hide();
    this.state.showingBestMove = false;
    this.state.resetGame();
    this.state.startGame();
    this.historyNavigator.clearCache();
    this.history.clear();
    this.history.setInitialFen(this.state.fen);

    // Setup board
    this.boardView.renderPosition(this.state.board, this.state.playerColor);
    this.boardView.setLastMove(null, null);
    this.boardView.setCheck(null);
    this.boardView.clearHintArrow();

    // Show UI elements
    this.leftPanel.setPanelVisible(true);
    this.leftPanel.setInGameControlsVisible(true);
    this.leftPanel.setTakeBackEnabled(false);
    this._replayEl.style.display = 'none';

    // Reset eval bar
    this.evalBar.reset();
    this.evalBar.setPlayerColor(this.state.playerColor);

    // Reset move list
    this.moveList.clear();

    // Set engine difficulty
    this.engine.setDifficulty(this.state.difficulty, this.state.moveTime);

    // Update player info
    this.playerInfoView.update(this.state);

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
    this._cancelTransientGameWork();
    this.chessClock.stop();
    this._resultBanner.style.display = 'none';
    this.leftPanel.hideAnalyzeButton();
    this.leftPanel.hideTimePicker();
    this.analysisGraph.hide();
    this.state.showingBestMove = false;
    this.state.resetGame();
    this.state.playerColor = this.state.lastPlayerColor;
    this.state.difficulty = this.state.lastDifficulty;
    this.historyNavigator.clearCache();
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
    this.leftPanel.setInGameControlsVisible(true);
    this.leftPanel.setHintLabel('Hint');
    this.leftPanel.setTakeBackEnabled(false);
    this._replayEl.style.display = 'none';

    this.engine.setDifficulty(this.state.difficulty, this.state.moveTime);
    this._startAnalysis();

    if (this.state.playerColor === 'b') {
      this._setTimeout(() => this._makeAIMove(), 300);
    }
  }

  _newGame() {
    this._cancelTransientGameWork();
    this.chessClock.stop();
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
        const testMove = this.state.chess
          .moves({ square: from, verbose: true })
          .find((m) => m.to === to && m.promotion);
        if (testMove) {
          const choice = await this.promotionDialog.show(this.state.playerColor);
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
    this.leftPanel.setTakeBackEnabled(true);

    // Reset hint
    this.state.showingHint = false;
    this.state.bestMove = null;
    this.boardView.clearHintArrow();
    this.leftPanel.setHintLabel('Hint');

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
    if (!this._engineReady) return; // engine never loaded — don't spin retrying
    const sessionId = this._gameSessionId;

    // Stop analysis while getting AI move
    this.engine.stopAnalysis();

    const moveTimeSec = this.state.moveTime != null ? this.state.moveTime : null;
    const moveUci = await this.engine.getMove(this.state.fen, this.state.difficulty, moveTimeSec);
    if (
      sessionId !== this._gameSessionId ||
      this.state.phase !== 'playing' ||
      this.state.isPlayerTurn
    ) {
      return;
    }
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
    if (sessionId !== this._gameSessionId || this.state.phase !== 'playing') {
      return;
    }

    // Update UI
    this.boardView.setLastMove(from, to);
    this._updateCheckHighlight();
    this.moveList.render(this.history);

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

  _handleGameOver(reason) {
    this.engine.cancelPendingMove();
    this.engine.stopAnalysis();
    this.chessClock.stop();
    this.leftPanel.setInGameControlsVisible(false);
    this._replayEl.style.display = 'none';

    // Show analyze button in left panel
    this.state.showingBestMove = false;
    this.leftPanel.showAnalyzeButton(!!this.state.analysisResults);
    this.leftPanel.hideTimePicker();

    this._showResult(reason);
  }

  _showResult(reason) {
    this._resultBanner.textContent = this._gameOverMessage(reason);
    this._resultBanner.classList.toggle('is-draw', !this.state.winner);
    this._resultBanner.style.display = 'block';
  }

  // Human-readable game-over message. `reason` is 'timeout' or 'resignation'
  // for those paths; otherwise the reason is derived from chess.js.
  _gameOverMessage(reason) {
    const winner = this.state.winner;
    if (reason === 'timeout') return `${winner} wins on time`;
    if (reason === 'resignation') return `${winner} wins by resignation`;
    const chess = this.state.chess;
    if (chess.isCheckmate()) return `Checkmate · ${winner} wins`;
    if (chess.isStalemate()) return 'Stalemate · Draw';
    if (chess.isInsufficientMaterial()) return 'Draw · insufficient material';
    if (chess.isThreefoldRepetition()) return 'Draw · repetition';
    return winner ? `${winner} wins` : 'Draw';
  }

  _handleAnalyzeClick() {
    if (this.state.analysisResults) {
      this._toggleBestMoveArrow();
    } else {
      this.leftPanel.toggleTimePicker();
    }
  }

  _handleTimeOut(color) {
    if (this.state.phase !== 'playing') return;
    this._clearPendingTimeouts();
    this.state.phase = 'over';
    // The player who ran out of time loses
    this.state.winner = color === 'w' ? 'Black' : 'White';
    this._handleGameOver('timeout');
  }

  _resign() {
    if (this.state.phase !== 'playing') return;
    this._clearPendingTimeouts();
    this.state.phase = 'over';
    this.state.winner = this.state.playerColor === 'w' ? 'Black' : 'White';
    this._handleGameOver('resignation');
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
    const fens = moves.map((m) => m.fen);

    // Use parallel worker pool for analysis
    this._analysisPool = new AnalysisPool();

    const results = await this._analysisPool.analyze(fens, movetime, (completed, total) =>
      this.analysisGraph.updateProgress(completed, total)
    );

    this._analysisPool = null;

    if (!results || this._cancelAnalysis) {
      this.analysisGraph.hide();
      return;
    }

    // Convert results to centipawn values normalized to White's POV
    const evaluations = results.map((result, i) => {
      if (!result) return null;
      let cpVal = evalToCp(result);
      if (cpVal !== null) {
        const turnFromFen = fens[i].split(' ')[1];
        if (turnFromFen === 'b') cpVal = -cpVal;
      }
      return cpVal;
    });

    // Extract best moves per position
    const bestMoves = results.map((r) => r?.bestMove || null);

    // Store results and show graph
    this.state.analysisResults = { evaluations, bestMoves, movetime };
    this.analysisGraph.showGraph(evaluations);
    this.analysisGraph.setHighlight(this.history.getCurrentViewIndex());

    // Update the analyze button to show best move now that results are cached
    this.leftPanel.setAnalyzeLabel('Best Move', true);
  }

  _takeBack() {
    if (this.state.phase !== 'playing') return;
    if (this.history.length === 0) return;
    if (!this.history.isAtCurrentPosition()) return;

    // Cancel any in-flight AI move / scheduled retry AND bump the session id, so
    // an AI move that resolves mid-take-back can't be applied to the now-undone
    // position (the session guards in _makeAIMove will bail).
    this._cancelTransientGameWork();

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
    this.leftPanel.setHintLabel('Hint');

    // Update move list
    this.moveList.render(this.history);

    // Disable take back if no moves left
    this.leftPanel.setTakeBackEnabled(this.history.length > 0);

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
    // Capture the exact position being analyzed. Info lines are only applied
    // while this is still the displayed position, so stale lines from a prior
    // search and lines emitted by the AI's own move search can't drive the bar.
    const analysisFen = this.state.fen;
    this.engine.onAnalysisUpdate = (info) => this._handleAnalysisUpdate(info, analysisFen);
    this.engine.startAnalysis(analysisFen, Math.min(this.state.analysisDepth, ANALYSIS_DEPTH_MAX));
  }

  _handleAnalysisUpdate(info, analysisFen) {
    if (this.state.phase !== 'playing' && this.state.phase !== 'over') return;

    // Only apply scores for the position currently on the board. A line for any
    // other position (a stale flush from the previous search, or the AI's own
    // move-search output) must be ignored — normalizing it against the wrong
    // side-to-move would flip the bar's sign.
    if (analysisFen !== this.state.fen) return;

    // Stockfish reports scores from the side-to-move's perspective.
    // Normalize to white's perspective for the eval bar.
    const turnFromFen = analysisFen.split(' ')[1];
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
      this.leftPanel.setHintLabel('Hide Hint');
      this._showHintArrow();
    } else {
      this.leftPanel.setHintLabel('Hint');
      this.boardView.clearHintArrow();
    }
  }

  _showHintArrow() {
    if (!this.state.bestMove) return;
    const from = this.state.bestMove.substring(0, 2);
    const to = this.state.bestMove.substring(2, 4);
    this.boardView.showHintArrow(from, to);
  }

  _toggleBestMoveArrow() {
    this.state.showingBestMove = !this.state.showingBestMove;
    if (this.state.showingBestMove) {
      this.leftPanel.setAnalyzeLabel('Hide Best Move');
      this._showBestMoveForCurrentPosition();
    } else {
      this.leftPanel.setAnalyzeLabel('Best Move');
      this.boardView.clearHintArrow();
    }
  }

  _showBestMoveForCurrentPosition() {
    if (!this.state.analysisResults?.bestMoves) return;
    const viewIdx = this.history.getCurrentViewIndex();
    const bestMove = this.state.analysisResults.bestMoves[viewIdx];
    if (bestMove && bestMove.length >= 4) {
      const from = bestMove.substring(0, 2);
      const to = bestMove.substring(2, 4);
      this.boardView.showHintArrow(from, to);
    } else {
      this.boardView.clearHintArrow();
    }
  }

  // --- Lifecycle ---

  _setTimeout(fn, delay) {
    const id = setTimeout(() => {
      this._pendingTimeouts = this._pendingTimeouts.filter((t) => t !== id);
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

  _cancelTransientGameWork() {
    this._gameSessionId++;
    this._cancelAnalysis = true;
    if (this._analysisPool) {
      this._analysisPool.cancel();
      this._analysisPool = null;
    }
    this._clearPendingTimeouts();
    this.engine.cancelPendingMove();
    this.engine.stopAnalysis();
  }

  destroy() {
    this._cancelTransientGameWork();
    document.removeEventListener('keydown', this._boundKeyboard);
    this.boardView.destroy();
    this.evalBar.destroy();
    this.chessClock.destroy();
    this.engine.destroy();
  }

  // --- Helpers ---

  _getPieceAt(square) {
    return pieceAt(this.state.board, square);
  }

  _updateCheckHighlight() {
    const sq = checkHighlightSquare(this.state.board, this.state.turn, this.state.isCheck());
    this.boardView.setCheck(sq);
  }

  // --- Settings & Persistence ---

  _openSettings() {
    this.leftPanel.setButtonsVisible(false);
    this.settingsDialog.show(this.settings);
  }

  _saveGame() {
    const data = this.state.serialize(this.history);
    try {
      localStorage.setItem('claude-chess-save', JSON.stringify(data));
      this.leftPanel.flash('save', 'Saved!');
    } catch (e) {
      // Private-browsing mode or quota exceeded (the save blob can be large
      // when it carries cached analysisResults).
      console.error('Failed to save game:', e);
      this.leftPanel.flash('save', 'Save failed');
    }
  }

  _loadGame() {
    const raw = localStorage.getItem('claude-chess-save');
    if (!raw) {
      this.leftPanel.flash('load', 'No saved game');
      return;
    }
    try {
      this._cancelTransientGameWork();
      this.chessClock.stop();
      this.historyNavigator.clearCache();
      const data = JSON.parse(raw);
      const moveData = this.state.deserialize(data);
      if (moveData) {
        this.history.deserialize(moveData);
      }
      this.boardView.renderPosition(this.state.board, this.state.playerColor);
      this._resultBanner.style.display = 'none';
      this.evalBar.setPlayerColor(this.state.playerColor);
      this.evalBar.reset();
      this.chessClock.hide();
      this.moveList.rebuild(this.history);
      this.leftPanel.setPanelVisible(true);
      this.leftPanel.setInGameControlsVisible(this.state.phase !== 'over');
      this.leftPanel.setTakeBackEnabled(this.history.length > 0);
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
      this.leftPanel.flash('load', 'Loaded!');
    } catch (e) {
      console.error('Failed to load game:', e);
      this.leftPanel.flash('load', 'Load failed');
    }
  }
}
