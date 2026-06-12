import { Chess } from 'chess.js';
import { DEFAULTS } from '../config.js';

export class GameState {
  constructor() {
    this.chess = new Chess();
    this.playerColor = DEFAULTS.playerColor;
    this.difficulty = DEFAULTS.difficulty;
    this.timeControl = 0;
    this.moveTime = null;
    this.analysisDepth = DEFAULTS.analysisDepth;

    // Game phase
    this.phase = 'setup'; // 'setup' | 'playing' | 'over'
    this.winner = null; // 'White' | 'Black' | null (draw)

    // UI state
    this.settingsOpen = false;
    this.showingPromotion = false;
    this.promotionSquare = null;
    this.promotionFrom = null;
    this.showingHint = false;
    this.bestMove = null;

    // Analysis state
    this.analyzing = false;
    this.evaluation = null; // { cp, mate, depth }

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
    // chess.js v1 throws on an illegal/invalid move; callers expect a falsy
    // return instead (they guard with `if (!result)`), so translate the throw.
    try {
      return this.chess.move(move);
    } catch {
      return null;
    }
  }

  undoMove() {
    return this.chess.undo();
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

  resetGame() {
    this.chess.reset();
    this.phase = 'playing';
    this.winner = null;
    this.showingPromotion = false;
    this.showingHint = false;
    this.bestMove = null;
    this.analyzing = false;
    this.evaluation = null;
    this.analysisResults = null;
  }

  // Serialization for save/load
  serialize(moveHistory) {
    return {
      fen: this.fen,
      playerColor: this.playerColor,
      difficulty: this.difficulty,
      timeControl: this.timeControl,
      moveTime: this.moveTime,
      analysisResults: this.analysisResults,
      moveHistory: moveHistory ? moveHistory.serialize() : null,
    };
  }

  deserialize(data) {
    // Rebuild chess.js's internal move history by replaying the saved moves —
    // a bare load(fen) restores the position but leaves undo() and threefold-
    // repetition detection with no history to work from. When replay fails
    // (corrupt save), fall back to FEN-only and drop the history entirely:
    // returning an unreplayable move list would desync it from the board.
    const replayed = this._replayMoves(data.moveHistory, data.fen);
    if (!replayed) {
      this.chess.load(data.fen);
    }
    this.playerColor = data.playerColor;
    this.difficulty = data.difficulty;
    this.timeControl = data.timeControl ?? 0;
    this.moveTime = data.moveTime ?? null;
    this.phase = 'playing';
    this.winner = null;
    this.analysisResults = data.analysisResults || null;
    this.lastPlayerColor = this.playerColor;
    this.lastDifficulty = this.difficulty;
    this.checkGameOver();
    return replayed ? data.moveHistory : null;
  }

  // Replay a serialized MoveHistory ([{ san, fen }], entry 0 = initial position)
  // into a fresh Chess instance. Returns false (leaving this.chess untouched) on
  // missing or corrupt data — including a replay that parses but doesn't end on
  // the saved position — so the caller can fall back to a FEN-only load.
  _replayMoves(moveData, expectedFen) {
    if (!moveData || moveData.length === 0 || !moveData[0].fen) return false;
    try {
      const chess = new Chess(moveData[0].fen);
      for (const m of moveData.slice(1)) {
        chess.move(m.san);
      }
      if (chess.fen() !== expectedFen) return false;
      this.chess = chess;
      return true;
    } catch {
      return false;
    }
  }
}
