// Move-quality classification shared by the analysis graph (dots) and the move
// list (text color). Uses a chess.com-style expected win% model.
// Win% = 50 + 50 * (2 / (1 + e^(-0.00368208 * cp)) - 1)  (Lichess sigmoid)

// Classification types that warrant a visible cue (a dot on the graph, a tinted
// move in the list). Quiet types (good / best / excellent) are intentionally
// left unmarked.
export const NOTABLE_TYPES = new Set([
  'blunder',
  'mistake',
  'miss',
  'inaccuracy',
  'brilliant',
  'great',
]);

// Standard chess annotation glyph per notable type (shown after the move in the
// move list). `miss` shares the mistake glyph, matching its shared color.
export const CLASSIFICATION_GLYPHS = {
  brilliant: '!!',
  great: '!',
  inaccuracy: '?!',
  mistake: '?',
  miss: '?',
  blunder: '??',
};

function cpToWinPct(cp) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export function classifyMoves(evaluations) {
  // Chess.com move classification using expected win% model.
  // Expected points lost (eploss) thresholds (0–1 scale):
  //   Best:       0.00        Excellent: 0.00–0.02    Good: 0.02–0.05
  //   Inaccuracy: 0.05–0.10   Mistake:  0.10–0.20    Blunder: 0.20+
  // Special: Brilliant (sacrifice + best), Great (swing game), Miss (missed opportunity)

  const classifications = new Array(evaluations.length).fill(null);
  for (let i = 1; i < evaluations.length; i++) {
    const prev = evaluations[i - 1];
    const curr = evaluations[i];
    if (prev === null || prev === undefined || curr === null || curr === undefined) continue;

    const whiteJustMoved = i % 2 === 1;

    // Win% from the moving side's perspective before and after
    const winBefore = whiteJustMoved ? cpToWinPct(prev) : cpToWinPct(-prev);
    const winAfter = whiteJustMoved ? cpToWinPct(curr) : cpToWinPct(-curr);
    const eploss = (winBefore - winAfter) / 100;

    // Position eval from moving side's perspective (cp)
    const posBefore = whiteJustMoved ? prev : -prev;
    const posAfter = whiteJustMoved ? curr : -curr;

    // Opponent's previous eval from their perspective (for miss detection)
    const oppPrevEval = i >= 2 ? evaluations[i - 2] : null;

    // --- Bad moves ---
    if (eploss >= 0.2) {
      classifications[i] = { type: 'blunder', color: '#ca3431' };
    } else if (eploss >= 0.1) {
      // Miss: opponent blundered on previous move but we failed to capitalize
      // Detected when: opponent's move (i-1) lost significant win%, and now
      // our move also loses win% instead of punishing them
      let isMiss = false;
      if (oppPrevEval !== null && oppPrevEval !== undefined && i >= 2) {
        const oppWhiteMoved = (i - 1) % 2 === 1;
        const oppWinBefore = oppWhiteMoved ? cpToWinPct(oppPrevEval) : cpToWinPct(-oppPrevEval);
        const oppWinAfter = oppWhiteMoved ? cpToWinPct(prev) : cpToWinPct(-prev);
        const oppEploss = (oppWinBefore - oppWinAfter) / 100;
        // Opponent lost 10%+ win chance (made a mistake/blunder) and we had
        // a strong position but failed to maintain advantage
        if (oppEploss >= 0.1 && posBefore > 100) {
          isMiss = true;
        }
      }
      if (isMiss) {
        classifications[i] = { type: 'miss', color: '#e6912a' };
      } else {
        classifications[i] = { type: 'mistake', color: '#e6912a' };
      }
    } else if (eploss >= 0.05) {
      classifications[i] = { type: 'inaccuracy', color: '#e6c831' };
    } else if (eploss >= 0.02) {
      classifications[i] = { type: 'good', color: '#97af8b' };
    } else {
      // --- Strong moves (eploss < 0.02) ---

      // Brilliant: best/near-best move involving a material sacrifice
      // in a competitive (non-winning) position
      const cpLoss = whiteJustMoved ? prev - curr : curr - prev;
      const isSacrifice = cpLoss < -100;
      const notAlreadyWinning = posBefore < 300;
      if (isSacrifice && notAlreadyWinning) {
        classifications[i] = { type: 'brilliant', color: '#1bada6' };
        continue;
      }

      // Great: turned a losing position into equal/winning
      const wasLosing = posBefore < -150;
      const nowOk = posAfter >= -50;
      if (wasLosing && nowOk) {
        classifications[i] = { type: 'great', color: '#5c8bb0' };
        continue;
      }

      // Best: eploss essentially 0
      if (eploss <= 0.001) {
        classifications[i] = { type: 'best', color: '#96bc4b' };
      } else {
        // Excellent: eploss between 0 and 0.02
        classifications[i] = { type: 'excellent', color: '#96bc4b' };
      }
    }
  }
  return classifications;
}
