# Phone-Landscape Layout — Design

**Date:** 2026-06-13
**Status:** Approved (mockup iterated and confirmed by Matt on 2026-06-13)

## Problem

On a phone held sideways (e.g. 844×390), the current layout is still the
single-column portrait stack: a wrapped button row on top, the board cut off
below the fold, the move list entirely off-screen, and the right half of the
viewport unused.

## Trigger

A new media query: `(orientation: landscape) and (max-height: 500px)`.
Height-gating targets phones held sideways (390–430px tall) without touching
tablets or normal desktop windows. The existing
`(max-width: 1000px) and (orientation: landscape)` blocks in `main.css` and
`panels.css` gain `and (min-height: 501px)` so exactly one landscape block
applies at a time.

## Layout

Three columns, board maximized to the viewport height (mockup v3):

```
+---------+--------------------+-----------+
| New     | |  BOARD  | Stockf.| Moves     |
| Back    | |  fills  |        | 1. e4  e5 |
| Save    |e|  screen |        | 2. Nf3 .. |
| ...     |v|  height |        |  (scroll) |
| Settings| |         | You    |           |
+---------+--------------------+-----------+
  120px      1fr (board+names)    150px
```

- `#game-layout` grid: `120px 1fr 150px`, height `100dvh`, page overflow
  hidden (no scrolling in this mode).
- `#board-column` becomes a grid with template areas: board (with eval bar,
  via the existing `#board-row`) on the left spanning all rows; opponent
  banner top-right; `#below-board` (replay controls) middle-right; player
  banner bottom-right. The banners are targeted via their existing
  `.player-info.opponent` / `.player-info.player` classes — no DOM changes.
- Board size: `min(calc(100dvh - 24px), calc(100vw - 440px))` — the height
  term wins on phones, so the board is edge-to-edge vertically.

## Component adjustments (phone landscape only)

- **Left panel:** vertical button column (overrides the portrait row),
  `overflow-y: auto`, buttons full-width at 11px font.
- **Player banners:** stack vertically (avatar+name, clock below); clock
  loses its `position: absolute` and shrinks digits to 16px.
- **Right panel:** full height, scrollable move list; the analysis graph's
  180px height now fits (fixes the old 150px-cap squeeze).
- **New Game setup / Settings:** stay in the (scrollable) left column; time
  grid drops to 2 columns, color buttons/kings shrink to fit 120px.
- **Eval bar:** 24px wide, beside the board as today.

## Implementation

CSS only: one new media block appended to `main.css` (layout) and one to
`panels.css` (components), plus the `min-height: 501px` gate on the two
existing landscape blocks. No JS, no DOM, no desktop/portrait changes.

## Testing

Playwright: 844×390 and 667×375 (board fully visible, no page scroll,
buttons usable, move list scrolls, New Game setup usable); regression checks
at desktop 1440×900 and portrait 390×844. Dev gates: `npm run lint`,
`npm run format:check`, `npm run build`.
