# Claude Chess

A fast, framework-free chess web app. Play against Stockfish, watch a live
evaluation bar as you think, and review your game afterward with full-game
computer analysis — all running entirely in the browser.

**▶ Play now: https://mglass222.github.io/claude-chess-web/**

## Features

### Play
- **Play vs. Stockfish** across eight strength levels — Novice, Beginner,
  Intermediate, Advanced, Master, IM, GM, and Super GM.
- **Or set a think-time per move** (instant, 1s, 3s, 5s, or 10s) as an
  alternative to a fixed difficulty.
- **Choose your color** — play as White or Black.
- **Time controls** — 1, 3, 5, 10, 15, or 30 minutes per side, or no limit, with
  per-side clocks and a low-time warning.
- **Move the pieces your way** — drag-and-drop or click-to-move, with legal-move
  highlights, last-move and check indicators, smooth animations, and pawn-promotion
  selection.
- **Right-click arrows & square highlights** for marking up the board while you
  think.
- **Hint** — ask the engine for a suggested move.
- **Take back** your last move, **resign**, or start a **new game** at any time.

### Analyze
- **Live evaluation bar** that updates as the engine thinks about the current
  position.
- **Post-game analysis** — evaluate the whole game in parallel across multiple
  Stockfish workers, then scrub the **evaluation graph** to jump to any moment.
- **Best-move arrows** overlaid on the board for the position you're reviewing.
- **Move list & history navigation** — step backward/forward or jump to any move,
  by click or with the arrow keys.
- A **game-over card** appears centered on the board (checkmate, stalemate, draw,
  resignation, or timeout); click anywhere to dismiss it and review the position.

### Customize & persist
- **16 board themes** (Classic, Forest, Ocean, Midnight, Coffee, Neon, and more).
- **28 piece sets** (cburnett, merida, alpha, staunty, fantasy, and many others).
- **Sound effects** for moves, captures, check, and low-time, with an on/off
  toggle and volume control.
- **Save & load** a game to your browser, and **copy PGN / FEN** to the clipboard.
- Your settings (theme, pieces, sound, last game setup) are remembered between
  visits.

## Tech

- **Vanilla JavaScript** (ES modules) with direct DOM manipulation — no UI
  framework.
- **[chess.js](https://github.com/jhlywa/chess.js)** for move generation and rules.
- **Stockfish 17.1** (single-threaded ASYNCIFY WebAssembly build) running in Web
  Workers — one for live eval / AI moves, a pool for parallel post-game analysis.
- **[Vite](https://vitejs.dev/)** for the dev server and production build.
- Deployed to **GitHub Pages**.

## Development

Requires Node.js 24.

```sh
npm install
npm run dev      # start the dev server at http://localhost:5173
```

Before committing, run the CI gates (all must pass):

```sh
npm run lint          # ESLint, including file-size budgets
npm run format:check  # Prettier
npm run build         # Vite production build
```

Deploy to GitHub Pages with `npm run deploy`.

See [`CLAUDE.md`](CLAUDE.md) for the architecture and module boundaries, and
[`dev_log.md`](dev_log.md) for the running changelog.
