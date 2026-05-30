# GameController Decomposition (A1, Tiers 1–2) — Design

## Background

`src/game/GameController.js` is a 1,325-line god object: ~40 methods spanning DOM
construction, game lifecycle, move handling, the engine loop, live + post-game
analysis, history navigation, persistence, and lifecycle cleanup. It is one of two
files grandfathered past the `max-lines: 400` budget in `eslint.config.js`.

This is the A1 decomposition. It was scoped down to the two lower-risk tiers; the
tightly-coupled engine core is deferred (see Out of Scope).

## Goals & success criteria

- Extract four focused modules, removing view construction and history navigation
  from GameController so it is closer to a pure coordinator.
- **No behavior change.** This is a structural refactor; every user-facing flow
  behaves exactly as before.
- GameController drops from ~1,325 to ~900 lines.
- All four new modules pass the existing budgets (`max-lines: 400`,
  `max-lines-per-function: 120`) with no new exemptions.
- All CI gates stay green (`npm run lint`, `npm run format:check`, `npm run build`).
- Each tier is verified in-browser and committed separately.

## Out of scope (deferred to a future session)

- **Tier 3 — the coupled engine core:** `AnalysisController` (live + post-game
  analysis, hints) and `MoveExecutor` (square/drag handling, move execution, AI
  move). These own the `_gameSessionId` / engine-callback race logic hardened in
  B2/B3/B4 and carry the real regression risk. They stay in GameController.
- **Clearing the size budget.** Because Tier 3 stays put, GameController remains
  ~900 lines and stays grandfathered in `eslint.config.js`. Its override comment
  will be updated to note Tier 3 is the remaining path to clear the budget.

## Constraints & principles

- **No automated test suite.** Verification is manual, in-browser, per step.
- **Hybrid coupling.** All Tier 1–2 modules get clean, intention-revealing
  interfaces (they are genuinely separable). No context/controller injection is
  needed at this tier.
- **Behavior-preserving moves.** Method bodies move as close to verbatim as the
  new interface allows; logic is not rewritten.
- **Follow existing patterns.** New UI modules mirror the existing component style
  (e.g. `MoveList`, `NewGameSetup`): construct DOM, expose methods + callbacks.

## Target modules

### `src/game/boardUtils.js` (Tier 1) — pure functions

Board geometry helpers, no state, no DOM.

- `findKingSquare(board, color)` — moved verbatim from the module-level function.
- `pieceAt(board, square)` — extracted from `_getPieceAt` (file/rank math).
- `checkHighlightSquare(board, turn, isCheck)` — returns the king square to
  highlight when `isCheck`, else `null`. Serves both call sites today: the live
  path (`_updateCheckHighlight`) and the historical path (`_showPositionFromFen`).

GameController keeps a thin `_updateCheckHighlight()` that calls
`checkHighlightSquare` with live state and forwards to `boardView.setCheck`.

### `src/ui/PlayerInfoView.js` (Tier 1) — view

Owns the two player-info banners (opponent above board, player below).

- `constructor()` builds `this.opponentEl` and `this.playerEl` (hidden initially).
- `update(state)` applies avatar/name/engine-label logic from `_updatePlayerInfos`
  (imports `MOVE_TIME_OPTIONS`, `getDifficultyLabel`) and shows both banners.

GameController's `init()` keeps ownership of *placement* — it inserts
`playerInfoView.opponentEl` and `.playerEl` at the correct positions, because that
insertion interleaves with the board row, eval bar, and result banner.

### `src/ui/LeftPanel.js` (Tier 1) — view

Owns the entire left-panel DOM: the primary buttons (New Game, Take Back, Save,
Load, Hint, Resign), Copy PGN / Copy FEN, Settings, the Analyze button, and the
inline analysis time-picker. Hosts the `newGameSetup.el` and `settingsDialog.el`
elements (appended into the panel root).

- `constructor(container, { actions, newGameSetupEl, settingsDialogEl })` —
  `actions` is a callback map (`onNewGame`, `onTakeBack`, `onSave`, `onLoad`,
  `onToggleHint`, `onResign`, `onOpenSettings`, `onCopyPgn`, `onCopyFen`,
  `onToggleAnalyze`, `onStartAnalysis(timeMs)`).
- Construction is split into focused sub-builders (`_buildButtons`,
  `_buildAnalyzeControls`, `_buildTimePicker`) so no single method exceeds the
  120-line function budget (the current `_buildLeftPanel` is ~135 lines).
- Intent methods replace the controller's ad-hoc element toggling. The set:
  - `setPanelVisible(bool)`, `setButtonsVisible(bool)`
  - `setHintVisible(bool)`, `setHintLabel(text)`
  - `setTakeBackVisible(bool)`, `setTakeBackEnabled(bool)`
  - `setResignVisible(bool)`
  - `showAnalyzeButton(hasResults)`, `setAnalyzeLabel(text, isBestMove)`
  - `showTimePicker(bool)`, `resetTimePicker()`, `getSelectedAnalysisTime()`
  - `flash(buttonId, message)` (Save / Load / Copy PGN / Copy FEN feedback)
- Absorbs the `_flashButton` and `_copyToClipboard` helpers (only the left panel
  uses them).

`_showEngineError` stays in GameController — it appends a banner to `board-area`,
not the left panel. The below-board replay controls (`_buildBelowBoard`,
`_replayEl`) also stay in GameController for now (see Risks).

### `src/game/HistoryNavigator.js` (Tier 2) — navigation

Owns moving the displayed position through move history. Read-mostly: it never
mutates game state, only the history view index and the resulting view.

- `constructor({ history, boardView, evalBar, analysisGraph, moveList, state,
  onReturnToLive, onPositionShown })`.
  - `state` is read-only here (for `board`, `analysisResults`, `showingBestMove`).
  - `onReturnToLive()` — controller-provided; renders the live position and runs
    `_updateCheckHighlight` when navigation returns to the current move.
  - `onPositionShown(viewIdx)` — controller-provided; lets the controller redraw
    the best-move arrow (that logic stays with the deferred analysis cluster).
- Methods: `back()`, `forward()`, `goToIndex(idx)`, `goToStart()`, `goToEnd()`,
  `handleKey(e)` (the `_handleKeyboard` switch), plus the owned position cache
  (`_positionCache`, cleared via `clearCache()` from the controller on
  start/restart/load) and `_showPositionFromFen`.

GameController keeps the `document.addEventListener('keydown', …)` lifecycle and
delegates to `historyNavigator.handleKey(e)`; the replay arrows (if/when shown)
call `historyNavigator.back()` / `forward()`.

## Coupling & data flow

- View modules (`PlayerInfoView`, `LeftPanel`) are sinks: the controller calls
  their methods; they call back through the `actions` map. They hold no game state.
- `boardUtils` is pure: inputs in, values out.
- `HistoryNavigator` holds injected references and two callbacks. It reads game
  state and component views but writes only navigation/view state. All writes to
  *game* state remain in GameController.
- GameController remains the single owner of game state (`state`, `history`),
  engine orchestration, lifecycle, persistence, and game-over handling.

## Extraction order & verification

Each step is a separate commit, verified in-browser via the preview tooling before
moving on. Baseline manual sweep (run after every step):

1. Play several moves vs the AI (as White, then a New Game as Black).
2. Navigate: arrow keys, move-list clicks, and analysis-graph clicks.
3. Take back during play.
4. Save, reload the page, Load.
5. Reach game over (resign), then run post-game analysis and confirm the graph.

Order:

1. `boardUtils` — extract pure helpers; re-point call sites. (lowest risk)
2. `PlayerInfoView` — extract banners; verify labels for difficulty + movetime.
3. `LeftPanel` — extract panel; verify every button, the time-picker, PGN/FEN
   copy flashes, and settings / new-game show-hide. (largest Tier-1 step)
4. `HistoryNavigator` — extract navigation; focus verification on every navigation
   entry point and the take-back / return-to-live interplay.

## Expected end state

- New files: `src/game/boardUtils.js`, `src/ui/PlayerInfoView.js`,
  `src/ui/LeftPanel.js`, `src/game/HistoryNavigator.js`.
- `src/game/GameController.js` ~900 lines, now a coordinator that owns state,
  lifecycle, the engine loop, analysis, persistence, and game-over — delegating
  view construction and navigation.
- `eslint.config.js`: GameController stays in the grandfather override; comment
  updated to point at Tier 3 as the remaining work.
- `CLAUDE.md`: architecture section updated — `HistoryNavigator` and the panel
  view-builders now exist; `AnalysisController` / `MoveExecutor` remain the
  documented future seams.
- `dev_log.md`: an entry per tier.

## Risks & mitigations

- **Re-pointing many call sites** (LeftPanel touches dozens of element-toggle
  lines). Mitigation: intent methods keep call sites readable; the full manual
  sweep runs after the LeftPanel step.
- **Navigation's dual check-highlight path** (live vs historical position).
  Mitigation: `checkHighlightSquare` unifies the computation; `onReturnToLive`
  keeps the live path in the controller. Verify End/Home and forward-to-current.
- **DOM insertion ordering** in `init()`. Mitigation: placement stays in the
  controller; modules only build elements, they don't self-insert.
- **Replay controls appear unused** (`_replayEl` is set to `display:none`
  everywhere and never shown). Left untouched to preserve behavior; flagged here
  for a possible future cleanup, not part of this refactor.
