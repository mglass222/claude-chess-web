# Right-Click Arrow Drawing

## Overview

Add right-click drag to draw persistent move arrows and right-click to highlight squares on the chess board, for mental calculation aid.

## Interaction Model

- Right-click drag between two squares draws an arrow from source to target
- Right-click on a single square (no drag / same square) toggles a colored highlight
- Right-click empty area or making any move clears all annotations
- Context menu is prevented on the board

## Colors

| Modifier | Color |
|----------|-------|
| None | Orange (default) |
| Shift | Red |
| Ctrl | Blue |
| Alt | Yellow |

## Toggle Behavior

- Drawing the same arrow (same from/to/color) removes it
- Clicking an already-highlighted square with the same color removes it
- Different colors on the same arrow/square coexist

## SVG Rendering

- Reuse existing `svgOverlay` and `_squareToSvgCoords()`
- Add color-specific arrowhead markers (`arrowhead-orange`, `arrowhead-red`, etc.)
- Arrows: `<line>` elements, stroke width ~14, opacity ~0.8, rounded caps
- Square highlights: `<rect>` elements, fill opacity ~0.4, 100x100 SVG units
- All annotation elements get class `user-annotation` for bulk removal

## Data Model

```js
this.annotations = []; // { type: 'arrow'|'square', from, to?, color }
```

## State

- `_rightClickFrom` — square where right-click started
- `_rightClickModifiers` — modifier keys from mousedown
- On mouseup, compare start/end to decide arrow vs highlight
- `clearAnnotations()` — called on left-click move

## Files Changed

- `src/ui/BoardView.js` — event handlers, SVG rendering, annotation state
- `src/config.js` — annotation color constants
- `src/ui/board.css` — annotation SVG element styling (if needed)

## Approach

Extend existing BoardView SVG overlay (Approach A). No new classes — the feature is tightly coupled to board coordinates, flip state, and mouse events.
