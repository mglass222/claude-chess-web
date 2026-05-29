// Shared helpers for talking to the Stockfish UCI worker.

/**
 * Build the URL to the Stockfish worker script, respecting Vite's base path.
 * stockfish.js self-initializes as a Web Worker when loaded in a Worker context.
 */
export function stockfishWorkerUrl() {
  const base = import.meta.env.BASE_URL;
  return `${location.origin}${base}stockfish/stockfish.js`;
}

/**
 * Parse a Stockfish UCI "info ... score ..." line into a normalized object:
 *   { depth, cp, mate, pv, bestMove }
 * Returns null when the line has no usable depth, or when the score is an
 * aspiration-window bound (upperbound/lowerbound) — those scores are unreliable.
 * `cp` and `mate` are mutually exclusive (the unused one is set to null).
 */
export function parseInfoLine(line) {
  const tokens = line.split(' ');

  // Skip aspiration window failures — scores are unreliable.
  if (tokens.includes('upperbound') || tokens.includes('lowerbound')) {
    return null;
  }

  const info = {};
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === 'depth') {
      info.depth = parseInt(tokens[i + 1], 10);
    } else if (tokens[i] === 'score') {
      if (tokens[i + 1] === 'cp') {
        info.cp = parseInt(tokens[i + 2], 10);
        info.mate = null;
      } else if (tokens[i + 1] === 'mate') {
        info.mate = parseInt(tokens[i + 2], 10);
        info.cp = null;
      }
    } else if (tokens[i] === 'pv') {
      info.pv = tokens.slice(i + 1);
    }
  }

  if (info.pv && info.pv.length > 0) {
    info.bestMove = info.pv[0];
  }

  return info.depth !== undefined ? info : null;
}
