export class AnalysisGraph {
  constructor(boardArea, rightPanel) {
    this.boardArea = boardArea;
    this.rightPanel = rightPanel;
    this.visible = false;
    this.onMoveClick = null;  // callback(moveIndex)
    this.onCancel = null;     // callback()
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

    const header = document.createElement('div');
    header.className = 'analysis-graph-header';

    const title = document.createElement('span');
    title.className = 'analysis-graph-title';
    title.textContent = 'Analysis';

    this.closeBtn = document.createElement('button');
    this.closeBtn.className = 'analysis-graph-close-x';
    this.closeBtn.textContent = '\u00d7';
    this.closeBtn.addEventListener('click', () => this.hide());

    header.appendChild(title);
    header.appendChild(this.closeBtn);

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'analysis-graph-canvas';
    this.canvas.addEventListener('click', (e) => this._handleCanvasClick(e));
    this.canvas.addEventListener('mousemove', (e) => this._handleCanvasMouseMove(e));

    this.graphPanel.appendChild(header);
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
    const rect = this.graphPanel.getBoundingClientRect();
    const w = rect.width - 8; // account for padding
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
  }

  // --- Move Classification ---

  _classifyMoves(evaluations) {
    const classifications = new Array(evaluations.length).fill(null);
    // First position (index 0) is the starting position, no classification
    for (let i = 1; i < evaluations.length; i++) {
      const prev = evaluations[i - 1];
      const curr = evaluations[i];
      if (prev === null || prev === undefined || curr === null || curr === undefined) continue;

      // Determine which side moved: odd index = white just moved, even = black just moved
      const whiteJustMoved = (i % 2 === 1);

      // Centipawn loss from the moving side's perspective
      // Positive eval = good for white. If white moved, loss = prev - curr. If black moved, loss = curr - prev.
      const cpLoss = whiteJustMoved ? (prev - curr) : (curr - prev);

      // Position eval from the moving side's perspective before the move
      const posBefore = whiteJustMoved ? prev : -prev;

      if (cpLoss >= 200) {
        classifications[i] = { type: 'blunder', color: '#ca3431' };
      } else if (cpLoss >= 50) {
        classifications[i] = { type: 'mistake', color: '#e6a817' };
      } else if (cpLoss < 10) {
        if (posBefore < -300) {
          classifications[i] = { type: 'brilliant', color: '#1bada6' };
        } else if (posBefore < -100) {
          classifications[i] = { type: 'great', color: '#3c6eb4' };
        } else {
          classifications[i] = { type: 'excellent', color: '#5dab47' };
        }
      }
      // 10-50 cp loss = normal, no dot (null)
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

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, W, H);

    const centerY = margin + gh / 2;
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
      let py = centerY - (clamped * gh / 2 / clamp);
      py = Math.max(margin, Math.min(margin + gh, py));
      this._points.push({ x: px, y: py, idx: i });
    }

    if (this._points.length < 2) return;

    // White advantage gradient fill (above center)
    const whiteGrad = ctx.createLinearGradient(0, margin, 0, centerY);
    whiteGrad.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
    whiteGrad.addColorStop(1, 'rgba(255, 255, 255, 0.03)');

    // Black advantage gradient fill (below center)
    const blackGrad = ctx.createLinearGradient(0, centerY, 0, margin + gh);
    blackGrad.addColorStop(0, 'rgba(40, 40, 40, 0.03)');
    blackGrad.addColorStop(1, 'rgba(40, 40, 40, 0.3)');

    // Fill white area (segments above center)
    ctx.beginPath();
    ctx.moveTo(this._points[0].x, centerY);
    for (const p of this._points) {
      ctx.lineTo(p.x, Math.min(p.y, centerY));
    }
    ctx.lineTo(this._points[this._points.length - 1].x, centerY);
    ctx.closePath();
    ctx.fillStyle = whiteGrad;
    ctx.fill();

    // Fill black area (segments below center)
    ctx.beginPath();
    ctx.moveTo(this._points[0].x, centerY);
    for (const p of this._points) {
      ctx.lineTo(p.x, Math.max(p.y, centerY));
    }
    ctx.lineTo(this._points[this._points.length - 1].x, centerY);
    ctx.closePath();
    ctx.fillStyle = blackGrad;
    ctx.fill();

    // Center line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(margin, centerY);
    ctx.lineTo(margin + gw, centerY);
    ctx.stroke();

    // Evaluation line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1.5 * dpr;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(this._points[0].x, this._points[0].y);
    for (let i = 1; i < this._points.length; i++) {
      ctx.lineTo(this._points[i].x, this._points[i].y);
    }
    ctx.stroke();

    // Highlighted move: dashed vertical line
    const highlightPoint = this._points.find(p => p.idx === this._highlightIndex);
    if (highlightPoint) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1 * dpr;
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.beginPath();
      ctx.moveTo(highlightPoint.x, margin);
      ctx.lineTo(highlightPoint.x, margin + gh);
      ctx.stroke();
      ctx.restore();
    }

    // Colored dots for classified moves only
    for (const p of this._points) {
      const cls = this._classifications ? this._classifications[p.idx] : null;
      const isHighlighted = p.idx === this._highlightIndex;

      if (isHighlighted) {
        // White ring
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6 * dpr, 0, Math.PI * 2);
        ctx.fill();
        // Colored dot (use classification color or white)
        ctx.fillStyle = cls ? cls.color : '#fff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 * dpr, 0, Math.PI * 2);
        ctx.fill();
      } else if (cls) {
        // Only draw dots for classified moves
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
