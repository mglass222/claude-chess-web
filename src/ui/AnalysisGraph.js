export class AnalysisGraph {
  constructor(container) {
    this.container = container;
    this.visible = false;
    this.onMoveClick = null;  // callback(moveIndex)
    this.onCancel = null;     // callback()
    this._points = [];
    this._evaluations = null;
    this._highlightIndex = -1;
    this._build();
  }

  _build() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'analysis-graph-overlay';
    this.overlay.style.display = 'none';

    // Progress elements
    this.progressEl = document.createElement('div');
    this.progressEl.className = 'analysis-progress';
    this.progressEl.style.display = 'none';

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

    // Graph elements
    this.graphEl = document.createElement('div');
    this.graphEl.style.display = 'none';
    this.graphEl.style.cssText = 'display:none;flex-direction:column;align-items:center;gap:12px;';

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'analysis-graph-canvas';
    this.canvas.width = 700;
    this.canvas.height = 500;

    this.canvas.addEventListener('click', (e) => this._handleCanvasClick(e));
    this.canvas.addEventListener('mousemove', (e) => this._handleCanvasMouseMove(e));

    this.closeBtn = document.createElement('button');
    this.closeBtn.className = 'analysis-graph-close';
    this.closeBtn.textContent = 'Close';
    this.closeBtn.addEventListener('click', () => this.hide());

    this.graphEl.appendChild(this.canvas);
    this.graphEl.appendChild(this.closeBtn);

    this.overlay.appendChild(this.progressEl);
    this.overlay.appendChild(this.graphEl);
    this.container.appendChild(this.overlay);
  }

  // --- Progress mode ---

  showProgress() {
    this.visible = true;
    this.overlay.style.display = 'flex';
    this.progressEl.style.display = 'flex';
    this.graphEl.style.display = 'none';
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
    this._highlightIndex = -1;
    this.visible = true;
    this.overlay.style.display = 'flex';
    this.progressEl.style.display = 'none';
    this.graphEl.style.display = 'flex';
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
    this.overlay.style.display = 'none';
    this.progressEl.style.display = 'none';
    this.graphEl.style.display = 'none';
  }

  // --- Drawing ---

  _draw() {
    const evaluations = this._evaluations;
    if (!evaluations) return;

    const ctx = this.canvas.getContext('2d');
    const W = this.canvas.width;
    const H = this.canvas.height;
    const margin = { top: 40, right: 30, bottom: 40, left: 50 };
    const gw = W - margin.left - margin.right;
    const gh = H - margin.top - margin.bottom;

    // Clear
    ctx.fillStyle = '#28283a';
    ctx.fillRect(0, 0, W, H);

    // Border
    ctx.strokeStyle = '#64647a';
    ctx.lineWidth = 2;
    ctx.strokeRect(margin.left, margin.top, gw, gh);

    const centerY = margin.top + gh / 2;
    const clamp = 1000; // +/- 10 pawns

    // Grid lines
    ctx.strokeStyle = '#3c3c50';
    ctx.lineWidth = 1;
    for (const pawnVal of [2, 4, 6, 8]) {
      for (const sign of [1, -1]) {
        const y = centerY - (sign * pawnVal * gh / 2 / 10);
        if (y > margin.top && y < margin.top + gh) {
          ctx.beginPath();
          ctx.moveTo(margin.left, y);
          ctx.lineTo(margin.left + gw, y);
          ctx.stroke();
        }
      }
    }

    // Center line
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin.left, centerY);
    ctx.lineTo(margin.left + gw, centerY);
    ctx.stroke();

    // Title
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Game Analysis', W / 2, margin.top - 12);

    // Y-axis labels
    ctx.fillStyle = '#999';
    ctx.font = '11px Arial';
    ctx.textAlign = 'right';
    for (let p = -10; p <= 10; p += 2) {
      const y = centerY - (p * gh / 2 / 10);
      if (y >= margin.top && y <= margin.top + gh) {
        ctx.fillText((p > 0 ? '+' : '') + p, margin.left - 8, y + 4);
      }
    }

    // Build points
    const total = evaluations.length;
    const xStep = gw / Math.max(total - 1, 1);
    this._points = [];

    for (let i = 0; i < total; i++) {
      const ev = evaluations[i];
      if (ev === null || ev === undefined) continue;
      const px = margin.left + i * xStep;
      const clamped = Math.max(-clamp, Math.min(clamp, ev));
      let py = centerY - (clamped * gh / 2 / clamp);
      py = Math.max(margin.top, Math.min(margin.top + gh, py));
      this._points.push({ x: px, y: py, idx: i });
    }

    if (this._points.length < 2) return;

    // Filled areas
    for (let i = 0; i < this._points.length - 1; i++) {
      const p1 = this._points[i];
      const p2 = this._points[i + 1];

      if (p1.y <= centerY || p2.y <= centerY) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath();
        ctx.moveTo(p1.x, Math.min(p1.y, centerY));
        ctx.lineTo(p2.x, Math.min(p2.y, centerY));
        ctx.lineTo(p2.x, centerY);
        ctx.lineTo(p1.x, centerY);
        ctx.closePath();
        ctx.fill();
      }

      if (p1.y >= centerY || p2.y >= centerY) {
        ctx.fillStyle = 'rgba(50, 50, 50, 0.15)';
        ctx.beginPath();
        ctx.moveTo(p1.x, centerY);
        ctx.lineTo(p2.x, centerY);
        ctx.lineTo(p2.x, Math.max(p2.y, centerY));
        ctx.lineTo(p1.x, Math.max(p1.y, centerY));
        ctx.closePath();
        ctx.fill();
      }
    }

    // Line
    ctx.strokeStyle = '#00c864';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this._points[0].x, this._points[0].y);
    for (let i = 1; i < this._points.length; i++) {
      ctx.lineTo(this._points[i].x, this._points[i].y);
    }
    ctx.stroke();

    // Dots
    for (const p of this._points) {
      const isHighlighted = p.idx === this._highlightIndex;
      if (isHighlighted) {
        // White ring
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
        ctx.fill();
        // Gold dot
        ctx.fillStyle = '#ffb020';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#00ff82';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // X-axis label
    ctx.fillStyle = '#999';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`Moves (1-${total})`, W / 2, H - 10);
  }

  // --- Interaction ---

  _getCanvasPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  _findNearestPoint(canvasX, canvasY) {
    let best = null;
    let bestDist = Infinity;
    for (const p of this._points) {
      const dx = p.x - canvasX;
      const dy = p.y - canvasY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = p;
      }
    }
    return bestDist <= 20 ? best : null;
  }

  _handleCanvasClick(e) {
    const { x, y } = this._getCanvasPoint(e);
    const point = this._findNearestPoint(x, y);
    if (point && this.onMoveClick) {
      this.onMoveClick(point.idx);
    }
  }

  _handleCanvasMouseMove(e) {
    const { x, y } = this._getCanvasPoint(e);
    const point = this._findNearestPoint(x, y);
    this.canvas.style.cursor = point ? 'pointer' : 'default';
  }
}
