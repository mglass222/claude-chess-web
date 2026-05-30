# Claude Chess — Project Guide

Vanilla-JS chess web app (no framework): direct DOM manipulation, Vite 6 build, ES
modules. Rules via `chess.js`; play and analysis via a vendored **single-threaded**
Stockfish 17.1 (ASYNCIFY WASM) running in a Web Worker. Deploys to GitHub Pages.

## Architecture & module boundaries

The app is organized by responsibility. Keep these seams intact: when a feature
introduces a **new responsibility, give it a new module** rather than growing an
existing one (this is how `GameController` ballooned past 1,300 lines).

- **`src/game/GameController.js`** — the coordinator. Wires UI, engine, and game
  state together and owns top-level flow. It should _delegate_, not _contain_,
  domain logic. View building and history navigation were extracted in A1 Tiers
  1–2; it remains oversized (~990 lines) until Tier 3 lands:
  - `HistoryNavigator` — back / forward / jump through move history — **extracted**
  - panel view modules — `LeftPanel`, `PlayerInfoView`, `boardUtils` — **extracted**
  - `AnalysisController` — live eval + post-game analysis orchestration — _planned (Tier 3)_
  - `MoveExecutor` — applying / validating a move + its side effects — _planned (Tier 3)_

  Do **not** add new responsibilities here — put them in the relevant module above
  (creating it if it doesn't exist yet).

- **`src/engine/`** — Stockfish integration: `EngineManager` (one worker: live eval
  + AI moves), `AnalysisPool` (N workers: parallel post-game analysis), `uci.js`
  (protocol parsing + worker URL). The engine is **single-threaded** (no
  SharedArrayBuffer / pthreads) — do not reintroduce COOP/COEP assumptions.
- **`src/ui/`** — presentational components (BoardView, MoveList, EvalBar,
  AnalysisGraph, LeftPanel, PlayerInfoView, dialogs, clock, sound). Each renders and
  emits events; none drives game flow directly.
- **`src/game/`** — non-UI game model: `GameState`, `MoveHistory`, `HistoryNavigator`,
  `boardUtils`, settings, PGN.

## File-size budget

ESLint enforces `max-lines: 400` and `max-lines-per-function: 120` (code lines;
blanks and comments excluded) as **hard errors**, wired into `npm run lint` (a CI
gate). Crossing a budget is a signal to decompose, not to raise the number.

`GameController.js` and `BoardView.js` predate the budget and are grandfathered via
an override in `eslint.config.js`. **That override list is the tracked refactor
debt** — remove an entry when its file is split; don't add new entries without
discussing first.

## Dev gates

Run before committing — these are the CI gates, in order, and all must pass:

```sh
npm run lint          # ESLint, incl. the size budgets above
npm run format:check  # Prettier — easy to forget; run it, not just lint
npm run build         # Vite production build
```

`npm run dev` serves on port 5173. Update `dev_log.md` whenever the program changes
(newest entry first).
