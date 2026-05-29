import { getDifficultyConfig } from '../config.js';

const ENGINE_MOVE_TIMEOUT = 15000; // 15s timeout for getMove

export class EngineManager {
  constructor() {
    this.worker = null;
    this.ready = false;
    this.analyzing = false;
    this.onAnalysisUpdate = null; // callback({ cp, mate, depth, bestMove, pv })
    this.onBestMove = null;       // callback(moveUci)
    this._initResolve = null;
    this._initReject = null;
    this._readyCallback = null;
    this._analysisTimeoutId = null;
    this._moveTimeoutId = null;
    this._pendingMoveResolve = null;
    this._moveRequestId = 0;
  }

  async init() {
    return new Promise((resolve, reject) => {
      this._initResolve = resolve;
      this._initReject = reject;

      try {
        // The stockfish.js file from the npm package self-initializes as a worker.
        // We create a Worker pointing to the stockfish.js file in public/stockfish/
        // The hash tells stockfish.js it's running as a worker
        const base = import.meta.env.BASE_URL;
        const wasmUrl = `${location.origin}${base}stockfish/stockfish.js`;
        this.worker = new Worker(wasmUrl);

        this.worker.onmessage = (e) => {
          this._handleMessage(e.data);
        };

        this.worker.onerror = (err) => {
          console.error('Engine worker error:', err);
          if (this._initReject) {
            this._initReject(err);
            this._initReject = null;
          }
          // Handle post-init errors: resolve pending move with null
          if (this.onBestMove) {
            this.onBestMove(null);
            this.onBestMove = null;
          }
        };

        // Send UCI init - the worker will respond with 'uciok'
        this.worker.postMessage('uci');
      } catch (err) {
        reject(err);
      }
    });
  }

  _handleMessage(line) {
    if (typeof line !== 'string') return;

    // Engine is ready when we get 'uciok'
    if (line === 'uciok') {
      this.ready = true;
      this.worker.postMessage('isready');
      return;
    }

    if (line === 'readyok') {
      if (this._initResolve) {
        this._initResolve();
        this._initResolve = null;
      } else if (this._readyCallback) {
        const cb = this._readyCallback;
        this._readyCallback = null;
        cb();
      }
      return;
    }

    // Parse UCI info lines during analysis
    if (line.startsWith('info') && line.includes('score')) {
      const info = this._parseInfo(line);
      if (info && this.onAnalysisUpdate) {
        this.onAnalysisUpdate(info);
      }
    }

    // Best move response
    if (line.startsWith('bestmove')) {
      const parts = line.split(' ');
      const moveUci = parts[1];
      this.analyzing = false;

      if (this.onBestMove) {
        this.onBestMove(moveUci);
        this.onBestMove = null;
      }
    }
  }

  _parseInfo(line) {
    const tokens = line.split(' ');
    const info = {};

    // Skip aspiration window failures — scores are unreliable
    if (tokens.includes('upperbound') || tokens.includes('lowerbound')) {
      return null;
    }

    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] === 'depth') {
        info.depth = parseInt(tokens[i + 1], 10);
      }
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
        info.pv = tokens.slice(i + 1);
      }
    }

    if (info.pv && info.pv.length > 0) {
      info.bestMove = info.pv[0];
    }

    return (info.depth !== undefined) ? info : null;
  }

  setDifficulty(difficulty, moveTimeSec = null) {
    if (!this.ready) return;
    // When using movetime mode, set full strength (skill 20)
    const skillLevel = moveTimeSec != null ? 20 : getDifficultyConfig(difficulty).skillLevel;
    this.worker.postMessage(`setoption name Skill Level value ${skillLevel}`);
  }

  getMove(fen, difficulty, moveTimeSec = null) {
    return new Promise((resolve) => {
      if (!this.ready) {
        resolve(null);
        return;
      }

      this.cancelPendingMove();

      // Stop any ongoing analysis. Detach the analysis callback so this move
      // search's own info lines never reach the eval bar.
      this.stopAnalysis();
      this.onAnalysisUpdate = null;
      const requestId = ++this._moveRequestId;
      this._pendingMoveResolve = resolve;

      const finish = (moveUci) => {
        if (requestId !== this._moveRequestId) return;
        if (this._moveTimeoutId) {
          clearTimeout(this._moveTimeoutId);
          this._moveTimeoutId = null;
        }
        this.onBestMove = null;
        this._readyCallback = null;
        if (this._pendingMoveResolve === resolve) {
          this._pendingMoveResolve = null;
        }
        resolve(moveUci);
      };

      // Timeout safety: resolve with null if engine doesn't respond
      const timeout = moveTimeSec ? (moveTimeSec * 1000 + ENGINE_MOVE_TIMEOUT) : ENGINE_MOVE_TIMEOUT;
      this._moveTimeoutId = setTimeout(() => {
        if (requestId !== this._moveRequestId) return;
        console.warn('Engine move timed out');
        this.worker.postMessage('stop');
        finish(null);
      }, timeout);

      // Wait for readyok to ensure the "stop" bestmove has been flushed,
      // then set the callback and start the search
      this._readyCallback = () => {
        if (requestId !== this._moveRequestId) return;
        this.onBestMove = (moveUci) => {
          finish(moveUci);
        };
        this.worker.postMessage(`position fen ${fen}`);
        if (moveTimeSec != null && moveTimeSec > 0) {
          this.worker.postMessage(`go movetime ${moveTimeSec * 1000}`);
        } else if (moveTimeSec === 0) {
          // "Instant" movetime mode: full strength, depth 15
          this.worker.postMessage('go depth 15');
        } else {
          const { depth } = getDifficultyConfig(difficulty);
          this.worker.postMessage(`go depth ${depth}`);
        }
      };
      this.worker.postMessage('isready');
    });
  }

  cancelPendingMove() {
    this._moveRequestId++;
    if (this._moveTimeoutId) {
      clearTimeout(this._moveTimeoutId);
      this._moveTimeoutId = null;
    }
    this._readyCallback = null;
    this.onBestMove = null;
    if (this._pendingMoveResolve) {
      const resolve = this._pendingMoveResolve;
      this._pendingMoveResolve = null;
      resolve(null);
    }
    if (this.ready && this.worker) {
      this.worker.postMessage('stop');
    }
  }

  startAnalysis(fen, maxDepth = 18) {
    if (!this.ready) return;

    this.analyzing = true;
    this.worker.postMessage('stop');

    if (this._analysisTimeoutId) {
      clearTimeout(this._analysisTimeoutId);
    }
    this._analysisTimeoutId = setTimeout(() => {
      this._analysisTimeoutId = null;
      if (!this.ready || !this.worker) return;
      this.worker.postMessage(`position fen ${fen}`);
      this.worker.postMessage(`go depth ${maxDepth}`);
    }, 50);
  }

  analyzePosition(fen, movetime) {
    return new Promise((resolve) => {
      if (!this.ready) {
        resolve(null);
        return;
      }

      this.stopAnalysis();

      let best = null;
      const timeoutId = setTimeout(() => {
        this.onAnalysisUpdate = null;
        this.onBestMove = null;
        this.worker.postMessage('stop');
        resolve(best);
      }, movetime + 5000);

      this._readyCallback = () => {
        // Capture deepest info line
        this.onAnalysisUpdate = (info) => {
          best = {
            cp: info.cp,
            mate: info.mate,
            depth: info.depth,
            bestMove: info.bestMove || (info.pv && info.pv[0]) || null,
          };
        };

        this.onBestMove = () => {
          clearTimeout(timeoutId);
          this.onAnalysisUpdate = null;
          resolve(best);
        };

        this.worker.postMessage(`position fen ${fen}`);
        this.worker.postMessage(`go movetime ${movetime}`);
      };
      this.worker.postMessage('isready');
    });
  }

  stopAnalysis() {
    if (!this.ready) return;
    this.analyzing = false;
    // Clear any pending analysis timeout to prevent stale commands
    if (this._analysisTimeoutId) {
      clearTimeout(this._analysisTimeoutId);
      this._analysisTimeoutId = null;
    }
    this.worker.postMessage('stop');
  }

  destroy() {
    this.cancelPendingMove();
    if (this._analysisTimeoutId) {
      clearTimeout(this._analysisTimeoutId);
      this._analysisTimeoutId = null;
    }
    if (this.worker) {
      this.worker.postMessage('quit');
      this.worker.terminate();
      this.worker = null;
      this.ready = false;
    }
  }
}
