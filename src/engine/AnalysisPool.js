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
    const workerCount = Math.min(
      fens.length,
      Math.max(2, navigator.hardwareConcurrency || 4)
    );

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
        try { w.worker.postMessage('stop'); } catch (_) { /* ignore */ }
      }
    }
    this._destroyWorkers();
  }

  async _initWorkers(count) {
    const base = import.meta.env.BASE_URL;
    const wasmUrl = `${location.origin}${base}stockfish/stockfish.js`;

    const promises = [];
    for (let i = 0; i < count; i++) {
      promises.push(this._initOneWorker(wasmUrl));
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
      const timeoutId = setTimeout(() => {
        w.worker.onmessage = null;
        try { w.worker.postMessage('stop'); } catch (_) { /* ignore */ }
        resolve(best);
      }, movetime + 5000);

      w.worker.onmessage = (e) => {
        const line = e.data;
        if (typeof line !== 'string') return;

        if (line.startsWith('info') && line.includes('score')) {
          const info = this._parseInfo(line);
          if (info) {
            best = {
              cp: info.cp,
              mate: info.mate,
              depth: info.depth,
              bestMove: info.bestMove || null,
            };
          }
        }

        if (line.startsWith('bestmove')) {
          clearTimeout(timeoutId);
          resolve(best);
        }
      };

      w.worker.postMessage(`position fen ${fen}`);
      w.worker.postMessage(`go movetime ${movetime}`);
    });
  }

  _parseInfo(line) {
    const tokens = line.split(' ');
    if (tokens.includes('upperbound') || tokens.includes('lowerbound')) return null;

    const info = {};
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] === 'depth') info.depth = parseInt(tokens[i + 1], 10);
      if (tokens[i] === 'score') {
        if (tokens[i + 1] === 'cp') {
          info.cp = parseInt(tokens[i + 2], 10);
          info.mate = null;
        } else if (tokens[i + 1] === 'mate') {
          info.mate = parseInt(tokens[i + 2], 10);
          info.cp = null;
        }
      }
      if (tokens[i] === 'pv') {
        info.bestMove = tokens[i + 1] || null;
      }
    }
    return info.depth !== undefined ? info : null;
  }

  _destroyWorkers() {
    for (const w of this._workers) {
      if (w && w.worker) {
        try {
          w.worker.postMessage('quit');
          w.worker.terminate();
        } catch (_) { /* ignore */ }
      }
    }
    this._workers = [];
  }
}
