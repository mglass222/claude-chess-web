# Dev Log

A running summary of changes made to Claude Chess. Newest entries first.
Update this file whenever the program changes.

---

## 2026-05-28

### UX — engine-failure notice and save/load feedback (Tier 4)
Two silent states now give the player feedback:

- **Engine-load failure.** If Stockfish fails to initialize, the app showed
  nothing — you'd get an opponent that never moves. Now a red banner appears on
  the board ("Chess engine failed to load — refresh the page to try again").
  Also fixed a latent bug it exposed: as Black, `_makeAIMove` would retry every
  500 ms forever when the engine never loaded — it now bails on `_engineReady`.
  *(src/game/GameController.js, src/styles/main.css)*
- **Save / Load.** These only logged to the console. Now the button briefly
  flashes status ("Saved!", "Loaded!", "No saved game", "Load failed"), reusing
  the existing Copy-PGN/FEN flash (extracted as `_flashButton`).
  *(src/game/GameController.js)*

Board keyboard accessibility (also flagged in the audit) was intentionally
skipped as YAGNI for a personal project with no known keyboard/AT users.

### Chore — bump GitHub Actions to Node 24 majors
checkout v4->v6, setup-node v4->v6, upload-pages-artifact v3->v5,
deploy-pages v4->v5, clearing the Node 20 runtime deprecation warning.
*(.github/workflows/deploy.yml)*

### Refactor — split the GameController god object (Tier 3)
Pulled three self-contained concerns out of the 1,556-line `GameController`,
which is now **1,264 lines**. Pure structural refactor — no behavior change;
lint + build green, and the full New Game flow (color/difficulty/time-control
selection, Start as Black → board flip + AI first move + clock init, and Cancel)
was verified in-browser with zero console errors.

- **`src/game/pgn.js`** — `generatePgn(state, history)`, extracted from
  `_generatePgn()`.
- **`src/game/settingsStore.js`** — `loadSettings()` / `saveSettings()`
  (localStorage + legacy-save migration), extracted from `_loadSettings()` /
  `_saveSettings()`.
- **`src/ui/NewGameSetup.js`** — the inline new-game panel (~180 lines of DOM
  building + the `_ng*` state/handlers) is now a self-contained component with
  `onStart` / `onCancel` callbacks and `show(settings)` / `hide()`, matching the
  pattern of the other UI components. `GameController` keeps only the small
  `_startNewGame` / `_showNewGameSetup` / `_hideNewGameSetup` glue.
  The now-unused `DIFFICULTY_LEVELS` / `TIME_CONTROLS` imports were dropped from
  `GameController`.

### Refactor — shared UCI helper + de-duplicated check-highlight logic
Consolidated duplication flagged in the audit (no behavior change; lint + build
green, verified in-browser that the engine still loads, plays, and drives the
eval bar):

- **New `src/engine/uci.js`** holds the two helpers `EngineManager` and
  `AnalysisPool` had each copied: `parseInfoLine()` (parses UCI `info` lines —
  the two copies had already drifted, one keeping the full PV and the other only
  the best move) and `stockfishWorkerUrl()` (worker-URL construction). Both
  engine classes import them now.
  *(src/engine/uci.js, src/engine/EngineManager.js, src/engine/AnalysisPool.js)*
- **`findKingSquare(board, color)`** — extracted the identical 8×8 king-search
  loop that `_showPositionFromFen` and `_updateCheckHighlight` each inlined.
  *(src/game/GameController.js)*

### Tooling — ESLint + Prettier, enforced in CI
Added linting/formatting so issues like the dead code below get caught
automatically going forward.

- **ESLint** (flat config) with the recommended ruleset + browser globals. The
  first run found and fixed 3 real issues: a useless `let` init in
  `_navigateHistory`, an unused `catch` binding in `_loadSettings`, and an
  unused `square` param on `PromotionDialog.show()`.
- **Prettier** (`.prettierrc.json`: 100-col, single quotes, ES5 commas) tuned to
  the existing style; formatted the codebase to one consistent baseline.
- **Scripts** `lint` / `lint:fix` / `format` / `format:check`; the Pages
  workflow now runs `lint` + `format:check` before building.
  *(package.json, eslint.config.js, .prettierrc.json, .prettierignore,
  .github/workflows/deploy.yml)*

### Dead-code cleanup — removed an unused module, methods, and exports
A codebase audit surfaced several pieces of code with zero call sites. Removed
them with no behavior change (build green; verified in-browser that play, move
history, and the New Game flow all still work):

- **`SetupScreen` (entire component).** The old new-game popup was replaced by
  the inline left-panel setup, so `setupScreen.show()` was never called. Deleted
  `src/ui/SetupScreen.js` and its wiring (import, field, `onStart` handler, two
  dead `.hide()` calls, the `appContainer` lookup). The now-orphaned
  `DIFFICULTY_OPTIONS` export went with it.
  *(src/ui/SetupScreen.js, src/game/GameController.js, src/config.js)*
- **`EngineManager.analyzePosition()`** — superseded by `AnalysisPool`, no
  callers. *(src/engine/EngineManager.js)*
- **`_updateGameInfo()`** — an empty no-op still called in ~10 places (left over
  from the removed FEN bar). Removed the method and every call.
  *(src/game/GameController.js)*
- **`EvalBar._showCalculating()`** and the unused **`COLORS`** palette export
  (plus its dead import in `BoardView`).
  *(src/ui/EvalBar.js, src/config.js, src/ui/BoardView.js)*

Net: one fewer module (24 vs 25 build modules), ~250 fewer lines.

### Evaluation bar — fixed freeze/jump, fluctuation, and sign-flipping
The eval bar misbehaved in three distinct ways; all were tracked to how engine
output reached the bar.

- **Freeze-then-jump (debounce bug).** `EvalBar.update()` restarted a 400ms
  "settle" timer on every engine info line, so the bar never updated until the
  search went silent — then jumped in one late step. Removed the debounce; the
  depth gate (`MIN_DEPTH=20`) and the `delta < 30` gate already filter noise.
  *(src/ui/EvalBar.js)*

- **Jerky / fluctuating motion.** The animation restarted a fresh ease-out on
  every new target, causing speed discontinuities when deep evals shifted.
  Replaced with **continuous exponential smoothing** toward the latest target
  (`EVAL_BAR_SMOOTHING = 0.12`), so successive eval changes blend into one
  smooth glide. *(src/ui/EvalBar.js, src/config.js)*

- **Swinging between black/white advantage (sign flips).** Two causes:
  1. The AI's own move search leaked into the bar because `getMove()` never
     detached `onAnalysisUpdate`. Now detached during the move search.
     *(src/engine/EngineManager.js)*
  2. `_handleAnalysisUpdate` normalized scores against the live `this.state.fen`,
     so stale lines flushed after a move were flipped to the wrong
     side-to-move. Each analysis is now bound to the FEN it started for, and
     lines that don't match the current position are rejected. Removed the
     redundant unguarded callback set at init. *(src/game/GameController.js)*

  Verified in-browser: 0 direction reversals, 0 spurious center-line crossings,
  no AI-turn leakage; the bar settles smoothly on the correct side.

  Commit: `0c93db6`

### Favicon — fixed 404 on the live site
The tab icon pointed at `/pieces/wK.svg`, but pieces live under a set subfolder
(`pieces/<set>/wK.svg`), so it 404'd on GitHub Pages. Pointed it at
`pieces/cburnett/wK.svg`. *(index.html)*

Commit: `eaef597`

### Housekeeping
- Recovered the local repo from git object corruption via a clean re-clone,
  reinstalled dependencies, and verified the build.
- Deployed the above fixes to GitHub Pages (`npm run deploy`) and verified them
  on the live site.
