export class AnalysisGraph {
  constructor(container) {
    this.container = container;
    this.visible = false;
    this._build();
  }

  _build() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'analysis-graph-overlay';
    this.overlay.style.display = 'none';

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'analysis-graph-canvas';
    this.canvas.width = 700;
    this.canvas.height = 500;

    this.closeBtn = document.createElement('button');
    this.closeBtn.className = 'analysis-graph-close';
    this.closeBtn.textContent = 'Close';
    this.closeBtn.addEventListener('click', () => this.hide());

    this.overlay.appendChild(this.canvas);
    this.overlay.appendChild(this.closeBtn);
    this.container.appendChild(this.overlay);
  }

  show(evaluations) {
    if (!evaluations || evaluations.length < 2) return;
    this.visible = true;
    this.overlay.style.display = 'flex';
    this._draw(evaluations);
  }

  hide() {
    this.visible = false;
    this.overlay.style.display = 'none';
  }

  toggle(evaluations) {
    if (this.visible) {
      this.hide();
    } else {
      this.show(evaluations);
    }
  }

  _draw(evaluations) {
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
    ctx.fillText('Game Evaluation', W / 2, margin.top - 12);

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
    const points = [];

    for (let i = 0; i < total; i++) {
      const ev = evaluations[i];
      if (ev === null || ev === undefined) continue;
      const px = margin.left + i * xStep;
      const clamped = Math.max(-clamp, Math.min(clamp, ev));
      let py = centerY - (clamped * gh / 2 / clamp);
      py = Math.max(margin.top, Math.min(margin.top + gh, py));
      points.push({ x: px, y: py, idx: i });
    }

    if (points.length < 2) return;

    // Filled areas
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];

      // White advantage fill (above center)
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

      // Black advantage fill (below center)
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
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();

    // Dots
    ctx.fillStyle = '#00ff82';
    for (const p of points) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // X-axis label
    ctx.fillStyle = '#999';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`Moves (1-${total})`, W / 2, H - 10);
  }
}
