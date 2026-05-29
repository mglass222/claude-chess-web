export class AnalysisGraph {
  constructor(boardArea, rightPanel) {
    this.boardArea = boardArea;
    this.rightPanel = rightPanel;
    this.visible = false;
    this.onMoveClick = null; // callback(moveIndex)
    this.onCancel = null; // callback()
    this._points = [];
    this._evaluations = null;
    this._classifications = null;
    this._highlightIndex = -1;
    this._resizeObserver = null;
    this._build();
  }

  _build() {
    // --- Progress overlay (on the board) ---
    this.progressOverlay = document.createElement('div');
    this.progressOverlay.className = 'analysis-progress-overlay';
    this.progressOverlay.style.display = 'none';

    this.progressEl = document.createElement('div');
    this.progressEl.className = 'analysis-progress';

    this.progressText = document.createElement('div');
    this.progressText.className = 'analysis-progress-text';
    this.progressText.textContent = 'Analyzing...';

    const barOuter = document.createElement('div');
    barOuter.className = 'analysis-progress-bar-outer';
    this.progressBarInner = document.createElement('div');
    this.progressBarInner.className = 'analysis-progress-bar-inner';
    barOuter.appendChild(this.progressBarInner);

    this.cancelBtn = document.createElement('button');
    this.cancelBtn.className = 'analysis-graph-close';
    this.cancelBtn.textContent = 'Cancel';
    this.cancelBtn.addEventListener('click', () => {
      if (this.onCancel) this.onCancel();
    });

    this.progressEl.appendChild(this.progressText);
    this.progressEl.appendChild(barOuter);
    this.progressEl.appendChild(this.cancelBtn);
    this.progressOverlay.appendChild(this.progressEl);
    this.boardArea.appendChild(this.progressOverlay);

    // --- Graph panel (in right panel, below move list) ---
    this.graphPanel = document.createElement('div');
    this.graphPanel.className = 'analysis-graph-panel';
    this.graphPanel.style.display = 'none';

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'analysis-graph-canvas';
    this.canvas.addEventListener('click', (e) => this._handleCanvasClick(e));
    this.canvas.addEventListener('mousemove', (e) => this._handleCanvasMouseMove(e));

    this.graphPanel.appendChild(this.canvas);
    this.rightPanel.appendChild(this.graphPanel);

    // ResizeObserver to keep canvas sized to panel width
    this._resizeObserver = new ResizeObserver(() => {
      if (this._evaluations && this.graphPanel.style.display !== 'none') {
        this._sizeCanvas();
        this._draw();
      }
    });
    this._resizeObserver.observe(this.graphPanel);
  }

  _sizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.rightPanel.getBoundingClientRect();
    const w = rect.width;
    const h = 180;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
  }

  // --- Progress mode ---

  showProgress() {
    this.visible = true;
    this.progressOverlay.style.display = 'flex';
    this.graphPanel.style.display = 'none';
    this.progressText.textContent = 'Analyzing...';
    this.progressBarInner.style.width = '0%';
  }

  updateProgress(current, total) {
    this.progressText.textContent = `Analyzing move ${current}/${total}...`;
    this.progressBarInner.style.width = `${(current / total) * 100}%`;
  }

  // --- Graph mode ---

  showGraph(evaluations) {
    if (!evaluations || evaluations.length < 2) return;
    this._evaluations = evaluations;
    this._classifications = this._classifyMoves(evaluations);
    this._highlightIndex = -1;
    this.visible = true;
    this.progressOverlay.style.display = 'none';
    this.graphPanel.style.display = 'flex';
    this._setAnalysisMode(true);
    this._sizeCanvas();
    this._draw();
  }

  setHighlight(moveIndex) {
    if (this._highlightIndex === moveIndex) return;
    this._highlightIndex = moveIndex;
    if (this._evaluations && this.visible) {
      this._draw();
    }
  }

  hide() {
    this.visible = false;
    this.progressOverlay.style.display = 'none';
    this.graphPanel.style.display = 'none';
    this._setAnalysisMode(false);
  }

  _setAnalysisMode(on) {
    const layout = document.getElementById('game-layout');
    if (layout) layout.classList.toggle('analysis-mode', on);
  }

  // --- Move Classification ---
  // Uses chess.com-style expected win% model.
  // Win% = 50 + 50 * (2 / (1 + e^(-0.00368208 * cp)) - 1)  (Lichess sigmoid)

  _cpToWinPct(cp) {
    return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
  }

  _classifyMoves(evaluations) {
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
      const winBefore = whiteJustMoved ? this._cpToWinPct(prev) : this._cpToWinPct(-prev);
      const winAfter = whiteJustMoved ? this._cpToWinPct(curr) : this._cpToWinPct(-curr);
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
          const oppWinBefore = oppWhiteMoved
            ? this._cpToWinPct(oppPrevEval)
            : this._cpToWinPct(-oppPrevEval);
          const oppWinAfter = oppWhiteMoved ? this._cpToWinPct(prev) : this._cpToWinPct(-prev);
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

  // --- Drawing ---

  _draw() {
    const evaluations = this._evaluations;
    if (!evaluations) return;

    const ctx = this.canvas.getContext('2d');
    const W = this.canvas.width;
    const H = this.canvas.height;
    const dpr = window.devicePixelRatio || 1;
    const margin = 4 * dpr;
    const gw = W - margin * 2;
    const gh = H - margin * 2;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Dark gray background (black's territory)
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(0, 0, W, H);

    const centerY = margin + gh / 2;
    const bottom = margin + gh;
    const clamp = 1000; // +/- 10 pawns

    // Build points
    const total = evaluations.length;
    const xStep = gw / Math.max(total - 1, 1);
    this._points = [];

    for (let i = 0; i < total; i++) {
      const ev = evaluations[i];
      if (ev === null || ev === undefined) continue;
      const px = margin + i * xStep;
      const clamped = Math.max(-clamp, Math.min(clamp, ev));
      let py = centerY - (clamped * gh) / 2 / clamp;
      py = Math.max(margin, Math.min(bottom, py));
      this._points.push({ x: px, y: py, idx: i });
    }

    if (this._points.length < 2) return;

    // Solid white fill from bottom up to the eval line
    ctx.beginPath();
    ctx.moveTo(this._points[0].x, bottom);
    for (const p of this._points) {
      ctx.lineTo(p.x, p.y);
    }
    ctx.lineTo(this._points[this._points.length - 1].x, bottom);
    ctx.closePath();
    ctx.fillStyle = '#e8e4dc';
    ctx.fill();

    // Subtle center line
    ctx.strokeStyle = 'rgba(150, 150, 150, 0.4)';
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(margin, centerY);
    ctx.lineTo(margin + gw, centerY);
    ctx.stroke();

    // Highlighted move: dashed vertical line
    const highlightPoint = this._points.find((p) => p.idx === this._highlightIndex);
    if (highlightPoint) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1 * dpr;
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.beginPath();
      ctx.moveTo(highlightPoint.x, margin);
      ctx.lineTo(highlightPoint.x, bottom);
      ctx.stroke();
      ctx.restore();
    }

    // Dots only for notable classifications (chess.com style)
    const dotTypes = new Set(['blunder', 'mistake', 'miss', 'inaccuracy', 'brilliant', 'great']);
    for (const p of this._points) {
      const cls = this._classifications ? this._classifications[p.idx] : null;
      const isHighlighted = p.idx === this._highlightIndex;
      const showDot = cls && dotTypes.has(cls.type);

      if (isHighlighted) {
        // White ring
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6 * dpr, 0, Math.PI * 2);
        ctx.fill();
        // Colored dot (use classification color or dark gray)
        ctx.fillStyle = showDot ? cls.color : '#555';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 * dpr, 0, Math.PI * 2);
        ctx.fill();
      } else if (showDot) {
        // Only draw dots for notable moves
        ctx.fillStyle = cls.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // --- Interaction ---

  _getCanvasPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return {
      x: (e.clientX - rect.left) * dpr,
      y: (e.clientY - rect.top) * dpr,
    };
  }

  _findNearestPoint(canvasX) {
    // X-axis snap: find nearest point horizontally
    let best = null;
    let bestDist = Infinity;
    for (const p of this._points) {
      const dx = Math.abs(p.x - canvasX);
      if (dx < bestDist) {
        bestDist = dx;
        best = p;
      }
    }
    const dpr = window.devicePixelRatio || 1;
    return bestDist <= 30 * dpr ? best : null;
  }

  _handleCanvasClick(e) {
    const { x } = this._getCanvasPoint(e);
    const point = this._findNearestPoint(x);
    if (point && this.onMoveClick) {
      this.onMoveClick(point.idx);
    }
  }

  _handleCanvasMouseMove(e) {
    const { x } = this._getCanvasPoint(e);
    const point = this._findNearestPoint(x);
    this.canvas.style.cursor = point ? 'pointer' : 'default';
  }
}
