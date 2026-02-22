import { Chess } from 'chess.js';
import { DEFAULTS } from '../config.js';

export class GameState {
  constructor() {
    this.chess = new Chess();
    this.playerColor = DEFAULTS.playerColor;
    this.difficulty = DEFAULTS.difficulty;
    this.analysisDepth = DEFAULTS.analysisDepth;

    // Game phase
    this.phase = 'setup'; // 'setup' | 'playing' | 'over'
    this.winner = null;   // 'White' | 'Black' | null (draw)

    // UI state
    this.settingsOpen = false;
    this.showingPromotion = false;
    this.promotionSquare = null;
    this.promotionFrom = null;
    this.showingHint = false;
    this.bestMove = null;

    // Analysis state
    this.analyzing = false;
    this.evaluation = null;       // { cp, mate, depth }
    this.analysisInfo = null;
    this.draggingDepthSlider = false;

    // Eval bar animation
    this.targetEvalCp = 0;
    this.currentEvalCp = 0;
    this.targetIsMate = false;
    this.targetMateIn = null;
    this.currentIsMate = false;
    this.currentMateIn = null;
    this.evalAnimStart = 0;
    this.evalAnimating = false;

    // Post-game analysis results: { evaluations: number[], movetime: number } or null
    this.analysisResults = null;

    // Remember last settings for restart
    this.lastPlayerColor = this.playerColor;
    this.lastDifficulty = this.difficulty;
  }

  get fen() {
    return this.chess.fen();
  }

  get turn() {
    return this.chess.turn();
  }

  get isPlayerTurn() {
    return this.turn === this.playerColor;
  }

  get board() {
    return this.chess.board();
  }

  legalMoves() {
    return this.chess.moves({ verbose: true });
  }

  legalMovesFrom(square) {
    return this.chess.moves({ square, verbose: true });
  }

  makeMove(move) {
    const result = this.chess.move(move);
    return result;
  }

  undoMove() {
    return this.chess.undo();
  }

  isCapture(move) {
    // move is a verbose move object from chess.js
    return move.captured !== undefined;
  }

  isCheck() {
    return this.chess.inCheck();
  }

  checkGameOver() {
    if (this.chess.isGameOver()) {
      this.phase = 'over';
      if (this.chess.isCheckmate()) {
        // The side that just moved won
        this.winner = this.turn === 'w' ? 'Black' : 'White';
      } else {
        this.winner = null; // Draw
      }
      return true;
    }
    return false;
  }

  startGame() {
    this.phase = 'playing';
    this.lastPlayerColor = this.playerColor;
    this.lastDifficulty = this.difficulty;
  }

  newGame() {
    this.chess.reset();
    this.playerColor = DEFAULTS.playerColor;
    this.difficulty = DEFAULTS.difficulty;
    this.phase = 'setup';
    this.winner = null;
    this.showingPromotion = false;
    this.promotionSquare = null;
    this.promotionFrom = null;
    this.showingHint = false;
    this.bestMove = null;
    this.analyzing = false;
    this.evaluation = null;
    this.analysisInfo = null;
    this.analysisResults = null;
    this.targetEvalCp = 0;
    this.currentEvalCp = 0;
    this.evalAnimating = false;
    this.targetIsMate = false;
    this.targetMateIn = null;
    this.currentIsMate = false;
    this.currentMateIn = null;
  }

  resetGame() {
    this.chess.reset();
    this.phase = 'playing';
    this.winner = null;
    this.showingPromotion = false;
    this.showingHint = false;
    this.bestMove = null;
    this.analyzing = false;
    this.evaluation = null;
    this.analysisInfo = null;
    this.analysisResults = null;
    this.targetEvalCp = 0;
    this.currentEvalCp = 0;
    this.evalAnimating = false;
    this.targetIsMate = false;
    this.targetMateIn = null;
    this.currentIsMate = false;
    this.currentMateIn = null;
  }

  // Serialization for save/load
  serialize(moveHistory) {
    return {
      fen: this.fen,
      playerColor: this.playerColor,
      difficulty: this.difficulty,
      analysisResults: this.analysisResults,
      moveHistory: moveHistory ? moveHistory.serialize() : null,
    };
  }

  deserialize(data) {
    this.chess.load(data.fen);
    this.playerColor = data.playerColor;
    this.difficulty = data.difficulty;
    this.phase = 'playing';
    this.winner = null;
    this.analysisResults = data.analysisResults || null;
    this.checkGameOver();
    return data.moveHistory || null;
  }
}
