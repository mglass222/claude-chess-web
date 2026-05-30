// Pure board-geometry helpers operating on chess.js board() arrays.
// board[0] is rank 8, board[7] is rank 1; board[r][c] is { type, color } | null.

/** Algebraic square (e.g. 'e1') of the given color's king, or null. */
export function findKingSquare(board, color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.type === 'k' && p.color === color) {
        return String.fromCharCode(97 + c) + (8 - r);
      }
    }
  }
  return null;
}

/** The piece at an algebraic square (e.g. 'e4'), or null. */
export function pieceAt(board, square) {
  const file = square.charCodeAt(0) - 97; // 'a' = 0
  const rank = parseInt(square[1]) - 1; // '1' = 0
  const row = 7 - rank;
  return board[row][file];
}

/** The king square to highlight when in check, else null. */
export function checkHighlightSquare(board, turn, isCheck) {
  return isCheck ? findKingSquare(board, turn) : null;
}
