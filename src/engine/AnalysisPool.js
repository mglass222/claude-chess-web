import { parseInfoLine, stockfishWorkerUrl } from './uci.js';

/**
 * Pool of Stockfish Web Workers for parallel game analysis.
 * Each worker independently analyzes positions, enabling ~Nx speedup.
 */
export class AnalysisPool {
  constructor() {
    this._workers = [];
    this._cancelled = false;
  }

  /**
   * Analyze multiple FEN positions in parallel.
   * @param {string[]} fens - Array of FEN strings to analyze
   * @param {number} movetime - Milliseconds per position
   * @param {function} onProgress - Called with (completedCount, total) after each position
   * @returns {Promise<Array<{cp, mate, depth, bestMove}|null>>} Results in order
   */
  async analyze(fens, movetime, onProgress) {
    this._cancelled = false;

    // Empty input: settle immediately. Otherwise workerCount becomes 0, the
    // kickoff loop never runs, and this Promise would never resolve. Returning
    // null routes the caller down its existing "no results" path. (Not reachable
    // today — the sole caller always passes at least the initial position — but
    // keeps analyze() total for any future caller.)
    if (!fens || fens.length === 0) return null;

    // Cap the number of parallel engines. Each Stockfish WASM instance is ~7 MB
    // plus its own hash tables, so one-per-core (16+ on big machines) can OOM a
    // tab — and beyond ~4 there's little speedup for a CPU-bound search anyway.
    const cores = navigator.hardwareConcurrency || 4;
    const memCap = (navigator.deviceMemory || 4) <= 4 ? 2 : 4;
    const workerCount = Math.min(fens.length, cores, memCap);

    // Initialize workers in parallel
    await this._initWorkers(workerCount);

    if (this._cancelled) {
      this._destroyWorkers();
      return null;
    }

    const results = new Array(fens.length).fill(null);
    let completed = 0;
    let nextIndex = 0;

    return new Promise((resolve) => {
      const assignNext = (workerIdx) => {
        if (this._cancelled) {
          this._destroyWorkers();
          resolve(null);
          return;
        }

        if (nextIndex >= fens.length) {
          // This worker is done; check if all are done
          if (completed >= fens.length) {
            this._destroyWorkers();
            resolve(results);
          }
          return;
        }

        const idx = nextIndex++;
        this._analyzeOne(workerIdx, fens[idx], movetime).then((result) => {
          if (this._cancelled) {
            this._destroyWorkers();
            resolve(null);
            return;
          }

          results[idx] = result;
          completed++;
          if (onProgress) onProgress(completed, fens.length);

          // Feed this worker the next position
          assignNext(workerIdx);
        });
      };

      // Kick off one job per worker
      for (let w = 0; w < workerCount; w++) {
        assignNext(w);
      }
    });
  }

  cancel() {
    this._cancelled = true;
    for (const w of this._workers) {
      if (w.worker) {
        try {
          w.worker.postMessage('stop');
        } catch (_) {
          /* ignore */
        }
      }
    }
    this._destroyWorkers();
  }

  async _initWorkers(count) {
    const url = stockfishWorkerUrl();
    const promises = [];
    for (let i = 0; i < count; i++) {
      promises.push(this._initOneWorker(url));
    }
    this._workers = await Promise.all(promises);
  }

  _initOneWorker(url) {
    return new Promise((resolve) => {
      const worker = new Worker(url);
      let gotUciOk = false;

      const onMsg = (e) => {
        const line = e.data;
        if (typeof line !== 'string') return;
        if (line === 'uciok') {
          gotUciOk = true;
          worker.postMessage('isready');
        }
        if (line === 'readyok' && gotUciOk) {
          resolve({ worker, handler: null });
        }
      };

      worker.onmessage = onMsg;
      worker.onerror = () => resolve({ worker, handler: null });
      worker.postMessage('uci');
    });
  }

  _analyzeOne(workerIdx, fen, movetime) {
    return new Promise((resolve) => {
      const w = this._workers[workerIdx];
      if (!w || !w.worker) {
        resolve(null);
        return;
      }

      let best = null;
      let settled = false;
      let searching = false; // only trust search output after our own readyok

      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        w.worker.onmessage = null;
        resolve(result);
      };

      const timeoutId = setTimeout(() => {
        try {
          w.worker.postMessage('stop');
        } catch (_) {
          /* ignore */
        }
        finish(best);
      }, movetime + 5000);

      w.worker.onmessage = (e) => {
        const line = e.data;
        if (typeof line !== 'string' || settled) return;

        // Handshake: wait for our own readyok before starting the search. This
        // flushes any stray bestmove left over from a previous (stopped) search
        // on this worker, so it can't prematurely resolve this position.
        if (line === 'readyok') {
          searching = true;
          w.worker.postMessage(`go movetime ${movetime}`);
          return;
        }
        if (!searching) return; // ignore stragglers from the prior position

        if (line.startsWith('info') && line.includes('score')) {
          const info = parseInfoLine(line);
          if (info) {
            best = {
              cp: info.cp,
              mate: info.mate,
              depth: info.depth,
              bestMove: info.bestMove || null,
            };
          }
        } else if (line.startsWith('bestmove')) {
          finish(best);
        }
      };

      // Set the position, then handshake; the readyok handler kicks off `go`.
      w.worker.postMessage(`position fen ${fen}`);
      w.worker.postMessage('isready');
    });
  }

  _destroyWorkers() {
    for (const w of this._workers) {
      if (w && w.worker) {
        try {
          w.worker.postMessage('quit');
          w.worker.terminate();
        } catch (_) {
          /* ignore */
        }
      }
    }
    this._workers = [];
  }
}
