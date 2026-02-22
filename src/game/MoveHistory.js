export class MoveHistory {
  constructor() {
    this.moves = [];          // [{ san, fen }] - san is null for initial position
    this.currentIndex = -1;   // -1 means at latest position
  }

  addMove(san, fen) {
    // Store initial position if first move
    if (this.moves.length === 0) {
      this.moves.push({ san: null, fen: null }); // placeholder for start
    }
    this.moves.push({ san, fen });
    this.currentIndex = -1;
  }

  setInitialFen(fen) {
    if (this.moves.length === 0) {
      this.moves.push({ san: null, fen });
    } else {
      this.moves[0].fen = fen;
    }
  }

  removeLast() {
    if (this.moves.length > 1) {
      this.moves.pop();
      this.currentIndex = -1;
    }
  }

  clear() {
    this.moves = [];
    this.currentIndex = -1;
  }

  getMoves() {
    // Return all moves except initial position placeholder
    return this.moves.slice(1);
  }

  get length() {
    return Math.max(0, this.moves.length - 1);
  }

  canGoBack() {
    return this.moves.length > 1 && this.currentIndex !== 0;
  }

  canGoForward() {
    return this.currentIndex !== -1 && this.currentIndex < this.moves.length - 1;
  }

  goBack() {
    if (!this.canGoBack()) return null;
    if (this.currentIndex === -1) {
      this.currentIndex = this.moves.length - 1;
    }
    this.currentIndex--;
    return this.moves[this.currentIndex].fen;
  }

  goForward() {
    if (!this.canGoForward()) return null;
    this.currentIndex++;
    if (this.currentIndex === this.moves.length - 1) {
      this.currentIndex = -1;
      return null; // signal to use current board
    }
    return this.moves[this.currentIndex].fen;
  }

  goToStart() {
    if (this.moves.length === 0) return null;
    this.currentIndex = 0;
    return this.moves[0].fen;
  }

  goToEnd() {
    this.currentIndex = -1;
    return null;
  }

  goToIndex(idx) {
    // idx is 1-based (move 1, move 2, etc.) corresponding to this.moves[idx]
    if (idx < 0 || idx >= this.moves.length) return null;
    if (idx === this.moves.length - 1) {
      this.currentIndex = -1;
      return null;
    }
    this.currentIndex = idx;
    return this.moves[idx].fen;
  }

  isAtCurrentPosition() {
    return this.currentIndex === -1;
  }

  getCurrentViewIndex() {
    return this.currentIndex === -1 ? this.moves.length - 1 : this.currentIndex;
  }

  serialize() {
    return this.moves.map(m => ({ san: m.san, fen: m.fen }));
  }

  deserialize(data) {
    this.moves = data.map(m => ({ san: m.san, fen: m.fen }));
    this.currentIndex = -1;
  }
}
