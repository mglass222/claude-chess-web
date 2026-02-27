# Right-Click Arrow Drawing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add right-click drag arrows and square highlights to the chess board for mental calculation.

**Architecture:** Extend BoardView with right-click event handling and annotation rendering on the existing SVG overlay. Store annotations as an array of objects and render them as SVG elements. GameController clears annotations on player moves.

**Tech Stack:** Vanilla JS, SVG, CSS

---

### Task 1: Add annotation color constants to config.js

**Files:**
- Modify: `src/config.js:108-117` (COLORS object)

**Step 1: Add annotation colors to COLORS**

Add these entries to the existing `COLORS` object in `src/config.js`:

```js
export const ANNOTATION_COLORS = {
  orange: 'rgba(235, 137, 33, 0.8)',
  red:    'rgba(220, 50, 50, 0.8)',
  blue:   'rgba(50, 100, 220, 0.8)',
  yellow: 'rgba(220, 200, 50, 0.8)',
};
```

Add this after the existing `COLORS` export (after line 117).

**Step 2: Verify the app still loads**

Run: `npx vite build`
Expected: Build succeeds with no errors.

**Step 3: Commit**

```bash
git add src/config.js
git commit -m "feat: add annotation color constants for arrow drawing"
```

---

### Task 2: Add colored arrowhead markers to SVG overlay

**Files:**
- Modify: `src/ui/BoardView.js:1` (import)
- Modify: `src/ui/BoardView.js:50-65` (marker creation in `_build()`)

**Step 1: Import ANNOTATION_COLORS**

Update the import on line 1 of `BoardView.js`:

```js
import { THEMES, ANIMATION_DURATION, COLORS, ANNOTATION_COLORS } from '../config.js';
```

**Step 2: Create colored markers in `_build()`**

Replace the single arrowhead marker block (lines 50-65) with a loop that creates one marker per annotation color, plus keeps the existing green hint marker:

```js
    // Arrow marker definitions
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

    // Existing hint arrow marker (green)
    const hintMarker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    hintMarker.setAttribute('id', 'arrowhead');
    hintMarker.setAttribute('markerWidth', '28');
    hintMarker.setAttribute('markerHeight', '24');
    hintMarker.setAttribute('refX', '0');
    hintMarker.setAttribute('refY', '12');
    hintMarker.setAttribute('orient', 'auto');
    hintMarker.setAttribute('markerUnits', 'userSpaceOnUse');
    const hintPolygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    hintPolygon.setAttribute('points', '0 0, 28 12, 0 24');
    hintPolygon.setAttribute('fill', 'rgba(0, 220, 0, 0.85)');
    hintMarker.appendChild(hintPolygon);
    defs.appendChild(hintMarker);

    // Annotation arrow markers (one per color)
    for (const [name, color] of Object.entries(ANNOTATION_COLORS)) {
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      marker.setAttribute('id', `arrowhead-${name}`);
      marker.setAttribute('markerWidth', '28');
      marker.setAttribute('markerHeight', '24');
      marker.setAttribute('refX', '0');
      marker.setAttribute('refY', '12');
      marker.setAttribute('orient', 'auto');
      marker.setAttribute('markerUnits', 'userSpaceOnUse');
      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      polygon.setAttribute('points', '0 0, 28 12, 0 24');
      polygon.setAttribute('fill', color);
      marker.appendChild(polygon);
      defs.appendChild(marker);
    }

    this.svgOverlay.appendChild(defs);
```

**Step 3: Verify hint arrows still work**

Run: `npx vite build`
Expected: Build succeeds. Manually test that hint arrows still render green.

**Step 4: Commit**

```bash
git add src/ui/BoardView.js src/config.js
git commit -m "feat: add colored arrowhead SVG markers for annotations"
```

---

### Task 3: Add annotation state and rendering methods

**Files:**
- Modify: `src/ui/BoardView.js` (constructor and new methods)

**Step 1: Add annotation state to constructor**

Add after `this.hintArrow = null;` (after line 16):

```js
    this.annotations = [];    // [{ type: 'arrow'|'square', from, to?, color }]
```

**Step 2: Add `_renderAnnotations()` method**

Add this method after `clearHintArrow()` (after line 363):

```js
  _renderAnnotations() {
    // Remove existing annotation SVG elements
    this.svgOverlay.querySelectorAll('.user-annotation').forEach(el => el.remove());

    for (const ann of this.annotations) {
      if (ann.type === 'square') {
        const coords = this._squareToSvgCoords(ann.from);
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', coords.x - 50);
        rect.setAttribute('y', coords.y - 50);
        rect.setAttribute('width', '100');
        rect.setAttribute('height', '100');
        rect.setAttribute('fill', ANNOTATION_COLORS[ann.color]);
        rect.setAttribute('opacity', '0.5');
        rect.classList.add('user-annotation');
        this.svgOverlay.appendChild(rect);
      } else if (ann.type === 'arrow') {
        const fromCoords = this._squareToSvgCoords(ann.from);
        const toCoords = this._squareToSvgCoords(ann.to);

        const dx = toCoords.x - fromCoords.x;
        const dy = toCoords.y - fromCoords.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const arrowLen = 28;
        const shortenedX = toCoords.x - (dx / len) * arrowLen;
        const shortenedY = toCoords.y - (dy / len) * arrowLen;

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', fromCoords.x);
        line.setAttribute('y1', fromCoords.y);
        line.setAttribute('x2', shortenedX);
        line.setAttribute('y2', shortenedY);
        line.setAttribute('stroke', ANNOTATION_COLORS[ann.color]);
        line.setAttribute('stroke-width', '14');
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('marker-end', `url(#arrowhead-${ann.color})`);
        line.classList.add('user-annotation');
        this.svgOverlay.appendChild(line);
      }
    }
  }
```

**Step 3: Add `_toggleAnnotation()` method**

Add after `_renderAnnotations()`:

```js
  _toggleAnnotation(type, from, to, color) {
    const idx = this.annotations.findIndex(a =>
      a.type === type && a.from === from && a.to === (to || null) && a.color === color
    );
    if (idx !== -1) {
      this.annotations.splice(idx, 1);
    } else {
      this.annotations.push({ type, from, to: to || null, color });
    }
    this._renderAnnotations();
  }
```

**Step 4: Add `clearAnnotations()` method**

Add after `_toggleAnnotation()`:

```js
  clearAnnotations() {
    if (this.annotations.length === 0) return;
    this.annotations = [];
    this.svgOverlay.querySelectorAll('.user-annotation').forEach(el => el.remove());
  }
```

**Step 5: Verify build**

Run: `npx vite build`
Expected: Build succeeds.

**Step 6: Commit**

```bash
git add src/ui/BoardView.js
git commit -m "feat: add annotation state, rendering, and toggle methods"
```

---

### Task 4: Add right-click event handling

**Files:**
- Modify: `src/ui/BoardView.js` (constructor, `_build()`, new handlers)

**Step 1: Add right-click state to constructor**

Add after `this.annotations = [];`:

```js
    this._rightClickFrom = null;
    this._rightClickColor = 'orange';
```

**Step 2: Add `_getAnnotationColor()` helper**

Add this method somewhere in the class (e.g., after `clearAnnotations()`):

```js
  _getAnnotationColor(e) {
    if (e.shiftKey) return 'red';
    if (e.ctrlKey || e.metaKey) return 'blue';
    if (e.altKey) return 'yellow';
    return 'orange';
  }
```

**Step 3: Handle right-click in `_onMouseDown()`**

Currently line 397 has `if (e.button !== 0) return;`. Replace this early return to handle right-click (button === 2):

Replace:
```js
    if (e.button !== 0) return; // only allow left-click
```

With:
```js
    if (e.button === 2) {
      // Right-click: start annotation drawing
      this._rightClickFrom = square;
      this._rightClickColor = this._getAnnotationColor(e);
      return;
    }
    if (e.button !== 0) return; // only allow left-click

    // Left-click clears annotations
    this.clearAnnotations();
```

**Step 4: Handle right-click release in `_onMouseUp()`**

Add at the top of `_onMouseUp()` (before the pending drag check):

```js
    if (e.button === 2 && this._rightClickFrom) {
      const target = this._getSquareFromPoint(e.clientX, e.clientY);
      const from = this._rightClickFrom;
      const color = this._rightClickColor;
      this._rightClickFrom = null;

      if (!target) return;

      if (target === from) {
        // Same square: toggle highlight
        this._toggleAnnotation('square', from, null, color);
      } else {
        // Different square: toggle arrow
        this._toggleAnnotation('arrow', from, target, color);
      }
      return;
    }
```

**Step 5: Verify build and test manually**

Run: `npx vite build`
Expected: Build succeeds.

Manual test:
1. Right-click drag from e2 to e4 — orange arrow appears
2. Right-click same drag again — arrow disappears
3. Right-click e4 without dragging — orange highlight on e4
4. Shift+right-click drag — red arrow
5. Left-click anywhere — all annotations clear
6. Making a move — annotations should clear (handled in next task)

**Step 6: Commit**

```bash
git add src/ui/BoardView.js
git commit -m "feat: add right-click event handling for arrow/highlight annotations"
```

---

### Task 5: Clear annotations on player moves

**Files:**
- Modify: `src/game/GameController.js:774` (`_handleSquareClick` method)

**Step 1: Clear annotations when a move is made**

In `_handleSquareClick()`, the left-click clearing is already handled by BoardView (Task 4, Step 3). But we also need to clear when a move is successfully executed. Find `_tryMove` call sites and the `_executeMove` method.

Actually, since we added `this.clearAnnotations()` on every left-click in BoardView's `_onMouseDown` (Task 4 Step 3), annotations will clear whenever the player clicks the board with left button. This covers: selecting a piece, deselecting, making a move. No changes needed in GameController.

**Step 2: Verify the interaction works end-to-end**

Manual test:
1. Draw some arrows and highlights
2. Click a piece (left click) — annotations clear
3. Draw more arrows
4. Make a move — annotations clear (because move starts with left click)

**Step 3: Commit (if any changes)**

No commit needed — this was handled in Task 4.

---

### Task 6: Handle SVG overlay pointer events

**Files:**
- Modify: `src/ui/board.css` (if needed)

**Step 1: Ensure SVG overlay doesn't block mouse events**

The SVG overlay already has `pointer-events: none` in CSS. Verify this in `board.css`. The annotation elements inherit this, so they won't interfere with piece dragging or right-click events.

Check `board.css` for `.board-svg-overlay` — confirm it has `pointer-events: none`.

**Step 2: Verify everything works together**

Manual test checklist:
- [ ] Right-click drag draws orange arrow
- [ ] Shift+right-click drag draws red arrow
- [ ] Ctrl+right-click drag draws blue arrow
- [ ] Alt+right-click drag draws yellow arrow
- [ ] Right-click same square highlights it
- [ ] Repeating same action toggles off
- [ ] Different colors coexist
- [ ] Left-click clears all annotations
- [ ] Hint arrows still work independently
- [ ] Piece dragging still works
- [ ] Board flip doesn't break arrows
- [ ] No context menu appears on right-click

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: right-click arrow drawing for mental calculation"
```
