# Dev Log

A running summary of changes made to Claude Chess. Newest entries first.
Update this file whenever the program changes.

---

## 2026-06-13

### Fix — portrait clocks no longer overlap the player names

In portrait timed games the clock (absolutely positioned at `right: 0`) sat on
top of the player name. Root cause was a cascade bug, not a layout one: the
responsive `.player-info` overrides lived in `main.css`, but `panels.css` loads
*after* `main.css`, so its desktop `.player-info` rule (same specificity, later
in the cascade — media queries add none) silently won. Those overrides had
never applied. Moved them into `panels.css`'s own media blocks (portrait gets
`width: 100%` so the banner spans the board instead of shrink-wrapping around
the centered name — avatar + name now sit left, clock right) and deleted the
dead copies in `main.css`. Verified at 390×844 (no overlap, no clipping), plus
phone-landscape and desktop regressions.

### Feature — phone-landscape layout (3-column mini-desktop)

On a phone held sideways the app previously kept the portrait stack: button row
on top, board cut off below the fold, move list off-screen, right half of the
viewport empty. A new CSS-only mode — `@media (orientation: landscape) and
(max-height: 500px)` — now lays the screen out as three columns: a compact
120px button column on the left, the board maximized to the viewport height in
the middle (eval bar beside it), and a full-height scrollable 150px move list
on the right.

- The player banners + clocks move from above/below the board into a slim
  column on its right (opponent top, player bottom) via `grid-template-areas`
  on `#board-column`, targeting the existing `.player-info.opponent/.player`
  classes — no JS or DOM changes anywhere.
- Board size: `min(calc(100dvh - 24px), calc(100vw - 440px))`; page overflow
  hidden, so nothing scrolls off-screen.
- The two pre-existing `(max-width: 1000px) and (orientation: landscape)`
  blocks gained `and (min-height: 501px)` so exactly one landscape mode
  applies at a time; tablets and desktops are untouched.
- New Game setup / Settings stay in the (scrollable) left column; the time
  grid drops to 2 columns and the color kings shrink to fit 120px.
- Verified via Playwright at 844×390 and 667×375 (board fully visible, no
  page scroll, timed-game clocks beside the board, setup usable) plus
  desktop 1440×900 and portrait 390×844 regressions.
- Design spec: `docs/superpowers/specs/2026-06-13-phone-landscape-layout-design.md`.
- Known pre-existing issue (unchanged): in *portrait* timed games the
  absolute-positioned clock can overlap the centered player name on narrow
  screens.

---

## 2026-06-12

### Fixes — five verified bugs from a full-codebase review

- **New Game → Cancel no longer soft-locks the game.** `_newGame()` cancels
  in-flight engine work and stops the clock before showing the dialog, but the
  cancel path only hid it — leaving the AI's move permanently cancelled (and the
  clock stopped). New `_cancelNewGame()` resumes the clock and reschedules the AI
  move / live analysis as the turn requires. Verified in-browser. *(GameController)*
- **Take Back after loading a save no longer desyncs board and move list.**
  `GameState.deserialize` now replays the saved SAN history into a fresh Chess
  instance (falling back to FEN-only load on corrupt data), so `chess.undo()`
  works after a load — this also restores threefold-repetition detection across
  save/load. `_takeBack` additionally guards on `undoMove()`'s return so history
  is never popped without a matching board undo. Verified in-browser. *(GameState,
  GameController)*
- **Clock: the 1-second minimum deduction can now flag a player.** The deduction
  path in `ChessClock.switchTo` clamped to 0 without firing `onTimeOut`, letting a
  player at 0:00 keep playing until their next turn. It now stops the clock and
  fires the timeout, and `switchTo` bails if `_flushTick` already flagged the
  mover (previously it deducted from the wrong side and restarted the clock).
  *(ChessClock)*
- **AI-move failures are bounded.** A post-init engine crash (or persistent
  null/illegal bestmove) used to reschedule `_makeAIMove` every 500ms forever
  with no feedback. Retries are now capped at 3 — or zero if `engine.ready` is
  false — then the persistent engine-error banner is shown. *(GameController)*
- **Post-game analysis is re-entrancy-safe.** Clicking Analyze during a running
  analysis spawned a second pool that clobbered the first run's shared state
  (orphaning workers and hiding the live progress UI). `_runPostGameAnalysis` now
  early-returns while a pool exists, and a run id keeps a cancelled run's tail
  from touching a newer run. `analyze()` rejections are caught (the overlay no
  longer sticks), and `AnalysisPool._initOneWorker` resolves a dead slot instead
  of rejecting the whole `Promise.all` when `new Worker()` throws. *(GameController,
  AnalysisPool)*

### Accessibility

- Piece `alt` text is now human-readable ("white pawn") for screen readers; the
  `wP`-style code moved to `data-piece`, which `updatePosition`/`setPieceSet`
  read instead of `alt`. Promotion-piece images likewise. *(BoardView,
  PromotionDialog)*
- Promotion dialog: `role="dialog"` + `aria-modal`, per-piece `aria-label`s,
  Escape cancels, focus moves to the queen on open and returns to the prior
  element on close. Cleared via `replaceChildren()`. *(PromotionDialog)*
- `prefers-reduced-motion` support: global CSS collapse of animations/transitions
  (including the infinite critical-time clock pulse), and `animateMove` snaps
  instead of sliding. *(main.css, BoardView)*
- Contrast bumps for sub-AA text: setup section labels (0.45→0.7 alpha, 10→11px),
  time-control buttons (0.55→0.75), move numbers (0.35→0.6), empty-move-list
  text (0.4→0.65). *(panels.css)*
- History keyboard navigation no longer hijacks Alt/Ctrl/Cmd+Arrow (browser
  back!) or arrow keys inside focused form controls. *(HistoryNavigator)*

### CodeRabbit review follow-ups (PR #5)

- **AnalysisPool drops dead worker slots.** The earlier hardening resolved a
  failed `new Worker()` as `{ worker: null }`, but `_analyzeOne` returns null
  instantly for such a slot, so the scheduler would keep feeding it FENs and one
  dead slot could null out most of the queue. `_initWorkers` now filters dead
  slots, `analyze()` bails when none survive, and the kickoff loop iterates the
  filtered pool. *(AnalysisPool)*
- **`_aiMoveRetries` resets on take-back and load** so stale failures from a
  previous position can't trip the engine-error banner early. *(GameController)*
- **Save-load replay is validated against the saved FEN.** `_replayMoves` now
  rejects a history that parses but ends on a different position, and on any
  replay failure `deserialize` returns no history — `_loadGame` then clears the
  move list (FEN-only load) instead of leaving the previous game's history on
  screen. Verified in-browser with a deliberately corrupted save. *(GameState,
  GameController)*
- Declined (with reasoning on the PR): splitting `GameController` — that's the
  tracked Tier 3 refactor per the project guide, and this PR shrinks the file.

### Layout fix + dead-code cleanup

- Analysis mode no longer overflows mid-size viewports: the right-panel width is
  now a `--right-panel-w` variable (240px → 360px in analysis mode) that
  `#board-area`'s width calc references, instead of a hardcoded 240px. *(main.css)*
- Removed dead code found by review (all grep-verified unreferenced): the entire
  `setup.css` file (superseded by the inline new-game setup in panels.css),
  `.hint-btn`, `.fen-bar`/`.fen-input`/`.copy-btn`, `.analysis-time-section`/
  `-label`, `.depth-slider-container`, `.eval-score.calculating` CSS rules;
  `GameController._restart()` (~35 lines, never called, contained latent clock
  bugs); `GameState.newGame()`, `GameState.isCapture()`, and the vestigial
  eval-bar animation fields (`targetEvalCp` etc. — EvalBar owns that state).

---

## 2026-05-31

### Fix — illegal-move clicks threw an uncaught promise rejection

Clicking an illegal target (e.g. `e5→e6` with a piece selected) logged
`Uncaught (in promise) Error: Invalid move` and aborted the click handler.
Root cause: `GameState.makeMove` called `chess.move()` directly, but chess.js v1
**throws** on an invalid move instead of returning `null` — so the callers'
existing `if (!result) return; // illegal move` guard was dead code and the throw
escaped through the `async _executeMove`. `makeMove` now catches and returns
`null`, honoring the contract its callers already assume. Verified in-browser:
an illegal click is silently ignored (no error/rejection) and legal moves still
work. *(src/game/GameState.js)*

### UX — color-coded moves in the Move History list

After post-game analysis, moves in the Move History list are now tinted to match
their dot on the evaluation graph: **blunder** (red), **mistake/miss** (orange),
**inaccuracy** (yellow), **brilliant** (teal), **great** (blue). Quiet moves
(good / best / excellent — the ones with no dot on the graph) stay unmarked, so
the list mirrors the graph one-for-one.

- Extracted the chess.com-style win%-loss classifier out of the (presentational)
  `AnalysisGraph` into a shared game-model module **`game/moveClassification.js`**
  (`classifyMoves`, `NOTABLE_TYPES`), so the graph dots and the move-list colors
  share a single color source. `AnalysisGraph` now imports it; its `_draw` uses
  `NOTABLE_TYPES` and it exposes `getClassifications()`.
- `MoveList.setClassifications()` applies each move's color by `data-idx` (which
  already lines up with the classification index) via a `--q-color` custom
  property + `data-quality` attribute; CSS rule `.move-san[data-quality]` is
  declared before `.move-san.active` so the active highlight still overrides it.
  Colors reset on new game / load (`clear` / `rebuild`).
- `GameController._runPostGameAnalysis` calls `setClassifications` right after each
  `showGraph` (both the fresh and the cached path).
  *(src/game/moveClassification.js, src/ui/AnalysisGraph.js, src/ui/MoveList.js,
  src/styles/panels.css, src/game/GameController.js)*

Follow-up: each notable move also gets its standard annotation glyph after the
SAN — `!!` brilliant, `!` great, `?!` inaccuracy, `?` mistake/miss, `??` blunder.
The glyph is a `.move-q-glyph` child span (plain text) that inherits the move's
color, so it matches the tint and goes dark when the move is active. Added
`CLASSIFICATION_GLYPHS` to `moveClassification.js`; `_applyClassifications`
appends/refreshes the glyph idempotently.
*(src/game/moveClassification.js, src/ui/MoveList.js, src/styles/panels.css)*

## 2026-05-30

### UX — center the game-over result on the board
The result announcement (e.g. "Checkmate · Black wins") rendered as an inline
banner *below* the board, where it was easy to miss. It now appears as a card
**centered on the board**, with the board **dimmed and blurred** behind it —
matching the codebase's existing overlay pattern (promotion / analysis overlays,
which already live inside `#board-area`).

- `_resultBanner` is now a `.game-result-overlay` (absolute, `inset: 0`, fl-center,
  `rgba(0,0,0,0.55)` + `backdrop-filter: blur(4px)`, `z-index: 35`) appended to
  `#board-area` instead of inserted into `#board-column`; the text lives in an inner
  `.game-result` card (`dialogSlideIn` entrance, dark glass background). `_showResult`
  writes the card and flex-shows the overlay; the existing `display='none'` clears in
  `_startGame` / `_restart` / `_loadGame` are unchanged.
  *(src/game/GameController.js, src/styles/board.css)*

Verified in-browser (overlay rect matches the board rect exactly, dim + blur
applied); lint / format / build all green.

Follow-up fix: clicking **Analyze Game** after game over left the dimmed overlay
covering the board you're trying to review (best-move arrows drew underneath it).
`_handleAnalyzeClick` now hides `_resultBanner` first — covering both the
time-picker path and the cached "Best Move" path. Verified in-browser: overlay
clears on Analyze and the board (with arrows) is fully visible.
*(src/game/GameController.js)*

### A1 (Tiers 1–2): GameController decomposition

Began the deferred A1 architecture work via a brainstorm → spec → plan → execute
flow (docs under `docs/superpowers/`). Extracted four focused modules from the
1,325-line `GameController` — behavior-preserving, each verified in-browser and
committed separately:

- **`game/boardUtils.js`** — pure board helpers (`findKingSquare`, `pieceAt`,
  `checkHighlightSquare`).
- **`ui/PlayerInfoView.js`** — the player/opponent banners (build + `update`).
- **`ui/LeftPanel.js`** — the entire left control panel (buttons, PGN/FEN copy,
  settings, analyze, time-picker) behind intent methods + an `actions` callback map.
- **`game/HistoryNavigator.js`** — history/view navigation (arrows, jump-to-index,
  keyboard, position cache, per-move eval-bar sync); GameController no longer imports
  `chess.js` directly.

GameController dropped 1,325 → 986 lines. It stays grandfathered in the ESLint
size-budget override; **Tier 3 (extracting `AnalysisController` + `MoveExecutor`) is
the remaining path to clear the 400-line budget** and is deferred.
*(eslint.config.js, CLAUDE.md updated.)*

---

## 2026-05-29

A fresh full-codebase audit produced a prioritized backlog (quick wins →
performance → correctness → architecture). Working through it in order.

### Guardrails — enforced size budgets + project guide
To stop god-objects from re-accreting (GameController reached ~1.3k lines purely by
addition — every change was locally reasonable, nothing tripped a limit), added an
enforced budget and an architecture contract:

- **ESLint size budgets.** `max-lines: 400` and `max-lines-per-function: 120` (code
  lines only) as hard errors, wired into the existing `npm run lint` CI gate.
  `GameController.js` and `BoardView.js` are grandfathered via an override whose
  entries double as the tracked decomposition debt. *(eslint.config.js)*
- **Added `CLAUDE.md`.** A project guide documenting the module boundaries (the
  planned GameController seams — `AnalysisController` / `MoveExecutor` /
  `HistoryNavigator` / panel view-builders), the "new responsibility → new module"
  rule, the size budget, and the lint / format / build gates. *(CLAUDE.md)*

### Quick wins — dependency, asset, and game-over cleanup
Low-risk, high-value fixes (lint + build green; verified in-browser: engine
loads, fonts render, and a resignation now shows an inline result):

- **Removed unused deps `stockfish` (175 MB) and `howler`.** The engine loads
  from the vendored `public/stockfish/` copy via `new Worker`, and `SoundManager`
  uses native Web Audio — neither package was imported. *(package.json)*
- **Fixed the display-font typo.** The font request and `--font-display` both
  said `Cormorant Garant` (not a real family), so titles silently fell back to
  Georgia. Corrected to `Cormorant Garamond` (and dropped the now-confirmed-used
  JetBrains Mono re-trim). *(index.html, src/styles/main.css)*
- **Capped live analysis depth.** `DEFAULTS.analysisDepth` was 24, past the
  `ANALYSIS_DEPTH_MAX = 22` the config defined but never applied; depth-24 search
  costs ~2–4× longer per position for no real accuracy gain. Default now equals
  the max, and `_startAnalysis` clamps to it. *(src/config.js,
  src/game/GameController.js)*
- **Build hygiene.** Set `build.emptyOutDir: true` so stale/renamed public
  assets can't survive into a deploy, and removed the local `dist/` that had
  accumulated 23 macOS "foo 2" duplicate piece/sound files (which the
  `npm run deploy` script would have shipped). *(vite.config.js)*
- **Removed dead COOP/COEP dev headers.** The bundled Stockfish is the
  single-threaded ASYNCIFY build (no SharedArrayBuffer/threads), and GitHub Pages
  can't send those headers anyway — they were misleading dead config. Documented
  the single-threaded design. *(vite.config.js)*
- **Replaced the dead `GameOverOverlay` with an inline result.** That overlay was
  the only thing that announced "X wins!/Draw!", but `.show()` was never called —
  so finished games showed no outcome at all. Deleted the 149-line component and
  its wiring; added an inline `.game-result` banner under the board that derives
  the reason from chess.js (checkmate / stalemate / insufficient material /
  repetition) and labels resignation / timeout explicitly. Matches the codebase's
  move from modals toward inline panels. *(src/ui/GameOverOverlay.js removed,
  src/game/GameController.js, src/styles/board.css)*

### Performance — engine pipeline and rendering hot paths
Profiling-driven optimizations (lint + build green; verified in-browser: live
analysis, play vs AI, history navigation, take-back, post-game analysis pool +
graph, and the eval bar all still work):

- **Engine info throttle + cheaper parse (P1).** Stockfish emits hundreds of
  `info` lines/sec at depth; each was fully `split(' ')`'d (30–60 tokens) and the
  whole PV `slice`d just to read the first move. `parseInfoLine` now scans only
  the head before `" pv "` and slices one token from the tail; `EngineManager`
  coalesces lines to one parse+dispatch per animation frame and skips the work
  entirely while the AI is searching. *(src/engine/uci.js, EngineManager.js)*
- **MoveList append-only + delegation (P2).** `render()` rebuilt the whole list
  and re-bound two listeners per move on every move (O(n²) over a game). It now
  appends only new moves, toggles one `active` class for navigation, truncates on
  take-back, and uses a single delegated click listener; added `rebuild()` for
  load. *(src/ui/MoveList.js, src/game/GameController.js)*
- **Cached per-ply board view (P3).** History navigation constructed a fresh
  `new Chess(fen)` (chess.js's heaviest op) on every step. Derived board + check
  square are now memoized by FEN, cleared at game boundaries.
  *(src/game/GameController.js)*
- **BoardView reparenting + single-square highlights (P4).** Animated (AI) moves
  destroyed and recreated the moved `<img>`; they now reparent the existing
  element, with `updatePosition` still reconciling castling / en passant /
  promotion. `setCheck` / `clearHintArrow` touch only the one affected square
  instead of looping all 64. *(src/ui/BoardView.js)*
- **Capped analysis pool (P5).** Post-game analysis spawned one Stockfish WASM
  worker per core (16+ on big machines, ~7 MB each → possible tab OOM). Capped at
  `min(fens, cores, 4)`, and 2 on ≤4 GB devices. *(src/engine/AnalysisPool.js)*
- **Eval bar / graph per-frame cost (P6).** The eval-bar label rewrote its
  `className` every animation frame; now it writes only when the advantage side
  flips. The analysis graph caches its 2D context instead of re-fetching it on
  every draw. *(src/ui/EvalBar.js, src/ui/AnalysisGraph.js)*

### Correctness — save/load, engine error, and analysis races
Bug fixes surfaced by the audit (lint + build green; verified in-browser:
take-back, save→diverge→load restore, and a full post-game analysis run):

- **Guarded localStorage writes (B1).** `_saveGame` and `saveSettings` called
  `setItem` with no try/catch — a throw in private-browsing mode or on quota
  overflow propagated, and `_saveGame` still flashed "Saved!". Both are now
  wrapped; the save button flashes "Save failed" on error.
  *(src/game/GameController.js, src/game/settingsStore.js)*
- **Fail-fast on engine crash (B2).** A post-init WASM worker error left the
  pending `getMove` promise unresolved, soft-locking the AI turn until the 15s
  timeout. `onerror` now marks the engine not-ready and routes through
  `cancelPendingMove`, resolving the move immediately.
  *(src/engine/EngineManager.js)*
- **Take-back / AI-move race (B3).** `_takeBack` cancelled pending work without
  bumping `_gameSessionId`, so an AI move resolving mid-take-back (during its
  animation) could be applied to the now-undone position. It now routes through
  `_cancelTransientGameWork()`, which bumps the session so `_makeAIMove`'s guards
  bail. *(src/game/GameController.js)*
- **Analysis-pool cross-talk (B4).** Each position reused a worker by reassigning
  `onmessage`; a `bestmove` left over from a previous (stopped) search could
  resolve the next position prematurely. Each job now does an `isready`/`readyok`
  handshake before its `go` (flushing stragglers) and settles idempotently.
  *(src/engine/AnalysisPool.js)*

### Cleanup & build hygiene
- Deleted the dead `src/engine/EngineWorker.js` (a comment-only file with no
  importers; stockfish.js is itself the worker).
- Bumped the Pages workflow to Node 24, matching commit `fe0dbc6`'s Actions bump
  which had missed `node-version`. *(.github/workflows/deploy.yml)*
- Pinned `chess.js` to `^1.4.0` (the tested/installed version) instead of the
  misleading `^1.0.0-beta.8`. *(package.json, package-lock.json)*

Deferred for a focused pass: extracting cohesive modules out of `GameController`
(the ongoing Tier-3 decomposition); de-duplicating the modal show/hide and
ghost-button CSS patterns; the unused component `destroy()` teardown API.

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
