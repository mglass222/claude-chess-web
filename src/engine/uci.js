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
 *   { depth, cp, mate, bestMove }
 * Returns null when the line has no usable depth, or when the score is an
 * aspiration-window bound (upperbound/lowerbound) — those scores are unreliable.
 * `cp` and `mate` are mutually exclusive (the unused one is null).
 *
 * Hot path: this runs on every info line (hundreds/sec at depth). It avoids
 * tokenizing the whole line — the principal variation (pv) is a long tail we
 * only need the first move of — by splitting just the head before " pv " and
 * slicing a single token out of the tail.
 */
export function parseInfoLine(line) {
  const pvIdx = line.indexOf(' pv ');
  const head = pvIdx === -1 ? line : line.slice(0, pvIdx);

  // Aspiration-window bounds are unreliable. Both "upperbound" and "lowerbound"
  // contain "bound", and the token sits in the head next to the score.
  if (head.indexOf('bound') !== -1) return null;

  let depth;
  let cp = null;
  let mate = null;
  const t = head.split(' ');
  for (let i = 0; i < t.length; i++) {
    if (t[i] === 'depth') {
      depth = parseInt(t[i + 1], 10);
    } else if (t[i] === 'score') {
      if (t[i + 1] === 'cp') cp = parseInt(t[i + 2], 10);
      else if (t[i + 1] === 'mate') mate = parseInt(t[i + 2], 10);
    }
  }

  if (depth === undefined) return null;

  let bestMove;
  if (pvIdx !== -1) {
    const after = line.slice(pvIdx + 4);
    const sp = after.indexOf(' ');
    bestMove = sp === -1 ? after : after.slice(0, sp);
  }

  return { depth, cp, mate, bestMove };
}
