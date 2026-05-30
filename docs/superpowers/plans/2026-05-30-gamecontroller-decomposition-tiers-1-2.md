# GameController Decomposition (A1, Tiers 1–2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Extract view construction and history navigation out of the 1,325-line
`GameController` into four focused modules, with no behavior change.

**Architecture:** Hybrid coupling — pure helpers (`boardUtils`), self-contained view
modules (`PlayerInfoView`, `LeftPanel`) exposing intent methods + callbacks, and a
read-mostly navigation module (`HistoryNavigator`) with injected dependencies and
two controller callbacks. GameController stays the single owner of game state, the
engine loop, analysis, persistence, and game-over.

**Tech Stack:** Vanilla JS, ES modules, Vite 6, chess.js. No test runner.

**Verification model (read first):** There are no automated tests and we are not
adding any. After each task, "verify" means:

1. `npm run lint && npm run format:check && npm run build` — all pass.
2. A manual in-browser sweep (dev server on :5173, preview tooling) covering the
   flows that task touches. The **baseline sweep** referenced throughout:
   - Play several moves vs the AI as White; then New Game as Black (AI opens).
   - Navigate: ArrowLeft/Right, Home/End, click moves in the move list, click the
     analysis graph after analysis.
   - Take back during play.
   - Save, reload the page, Load.
   - Resign, then Analyze Game → confirm the eval graph renders.

Each task is its own commit. Commit messages end with the project trailer:
`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- Create: `src/game/boardUtils.js` — pure board helpers (Task 1)
- Create: `src/ui/PlayerInfoView.js` — player/opponent banners (Task 2)
- Create: `src/ui/LeftPanel.js` — left control panel (Task 3)
- Create: `src/game/HistoryNavigator.js` — history/view navigation (Task 4)
- Modify: `src/game/GameController.js` — delegate to the above (all tasks)
- Modify: `eslint.config.js`, `CLAUDE.md`, `dev_log.md` — sync (Task 5)

GameController stays in the ESLint grandfather override (it lands ~900 lines). The
four new files are NOT exempt and must pass `max-lines: 400` and
`max-lines-per-function: 120`.

---

## Task 1: boardUtils — pure helpers

**Files:**

- Create: `src/game/boardUtils.js`
- Modify: `src/game/GameController.js`

- [ ] **Step 1: Create `src/game/boardUtils.js`**

```js
// Pure board-geometry helpers operating on chess.js board() arrays.
// board[0] is rank 8, board[7] is rank 1; board[r][c] is { type, color } | null.

/** Algebraic square (e.g. 'e1') of the given color's king, or null. */
export function findKingSquare(board, color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.type === 'k' && p.color === color) {
        return String.fromCharCode(97 + c) + (8 - r);
      }
    }
  }
  return null;
}

/** The piece at an algebraic square (e.g. 'e4'), or null. */
export function pieceAt(board, square) {
  const file = square.charCodeAt(0) - 97; // 'a' = 0
  const rank = parseInt(square[1]) - 1; // '1' = 0
  const row = 7 - rank;
  return board[row][file];
}

/** The king square to highlight when in check, else null. */
export function checkHighlightSquare(board, turn, isCheck) {
  return isCheck ? findKingSquare(board, turn) : null;
}
```

- [ ] **Step 2: Wire into GameController**

In `src/game/GameController.js`:

1. Delete the module-level `findKingSquare` function (the `function findKingSquare(board, color) { ... }` block above the class, including its doc comment).
2. Add to the import block at the top:

```js
import { findKingSquare, pieceAt, checkHighlightSquare } from './boardUtils.js';
```

3. Replace the body of `_getPieceAt`:

```js
  _getPieceAt(square) {
    return pieceAt(this.state.board, square);
  }
```

4. Replace `_updateCheckHighlight`:

```js
  _updateCheckHighlight() {
    const sq = checkHighlightSquare(this.state.board, this.state.turn, this.state.isCheck());
    this.boardView.setCheck(sq);
  }
```

5. In `_showPositionFromFen`, replace the cache-miss `view` construction's
   `checkSquare` line:

```js
        checkSquare: checkHighlightSquare(board, temp.turn(), temp.isCheck()),
```

(`findKingSquare` is still imported and is now used only by `boardUtils`'
`checkHighlightSquare`; the named import in GameController keeps it available for
the `temp`-based path until Task 4 moves `_showPositionFromFen` out. It is
imported but unused in GameController after this task only if no other reference
remains — verify with lint in Step 3 and drop `findKingSquare` from the import if
ESLint flags it.)

- [ ] **Step 3: Run gates**

Run: `npm run lint && npm run format:check && npm run build`
Expected: all pass. If `no-unused-vars` flags `findKingSquare` in GameController,
remove it from the `boardUtils` import line (keep `pieceAt`, `checkHighlightSquare`).

- [ ] **Step 4: Manual verification**

Dev server running. Verify check highlighting specifically:

- Deliver a check (e.g. scholar's-mate setup) → the checked king's square is
  highlighted.
- Navigate back to a non-check position → highlight clears; forward to the check →
  highlight returns (historical path through `_showPositionFromFen`).
- Select a piece and confirm legal-move dots appear (exercises `pieceAt`).

- [ ] **Step 5: Commit**

```bash
git add src/game/boardUtils.js src/game/GameController.js
git commit -m "refactor: extract pure board helpers to boardUtils" \
  -m "Move findKingSquare, piece lookup, and check-square computation out of GameController into a pure module. No behavior change." \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: PlayerInfoView — player/opponent banners

**Files:**

- Create: `src/ui/PlayerInfoView.js`
- Modify: `src/game/GameController.js`

- [ ] **Step 1: Create `src/ui/PlayerInfoView.js`**

```js
import { MOVE_TIME_OPTIONS, getDifficultyLabel } from '../config.js';

/**
 * The two player-info banners: opponent (above the board) and player (below).
 * Builds the elements; placement into the layout stays with the controller.
 */
export class PlayerInfoView {
  constructor() {
    this.opponentEl = this._build('opponent');
    this.playerEl = this._build('player');
  }

  _build(role) {
    const el = document.createElement('div');
    el.className = `player-info ${role}`;
    el.style.display = 'none';

    const avatar = document.createElement('div');
    avatar.className = 'player-avatar';

    const name = document.createElement('span');
    name.className = 'player-name';

    el.appendChild(avatar);
    el.appendChild(name);
    return el;
  }

  /** Apply names/avatars from game state and reveal both banners. */
  update(state) {
    const isWhite = state.playerColor === 'w';

    const playerAvatar = this.playerEl.querySelector('.player-avatar');
    const playerName = this.playerEl.querySelector('.player-name');
    playerAvatar.textContent = isWhite ? 'W' : 'B';
    playerAvatar.className = `player-avatar ${isWhite ? 'white-piece' : 'black-piece'}`;
    playerName.textContent = 'You';

    const opponentAvatar = this.opponentEl.querySelector('.player-avatar');
    const opponentName = this.opponentEl.querySelector('.player-name');
    opponentAvatar.textContent = isWhite ? 'B' : 'W';
    opponentAvatar.className = `player-avatar ${isWhite ? 'black-piece' : 'white-piece'}`;
    if (state.moveTime != null) {
      const mtOpt = MOVE_TIME_OPTIONS.find((o) => o.seconds === state.moveTime);
      const mtLabel = mtOpt ? mtOpt.label : `${state.moveTime}s`;
      opponentName.textContent = `Stockfish (${mtLabel}/move)`;
    } else {
      opponentName.textContent = `Stockfish (${getDifficultyLabel(state.difficulty)})`;
    }

    this.playerEl.style.display = 'flex';
    this.opponentEl.style.display = 'flex';
  }
}
```

- [ ] **Step 2: Wire into GameController**

1. Add import: `import { PlayerInfoView } from '../ui/PlayerInfoView.js';`
2. Remove the `MOVE_TIME_OPTIONS` and `getDifficultyLabel` names from the
   `../config.js` import if they become unused in GameController (verify via lint
   in Step 3 — `getDifficultyLabel` may remain used elsewhere; keep what lint
   needs). `MOVE_TIME_OPTIONS` is used only by the old `_updatePlayerInfos`.
3. In `init()`, replace the two `_buildPlayerInfo` calls. Where the code currently
   reads:

```js
    this._opponentInfo = this._buildPlayerInfo('opponent');
    boardColumn.insertBefore(this._opponentInfo, boardArea);
```

create the view once just before, and use its elements:

```js
    this.playerInfoView = new PlayerInfoView();
    this._opponentInfo = this.playerInfoView.opponentEl;
    this._playerInfo = this.playerInfoView.playerEl;
    boardColumn.insertBefore(this._opponentInfo, boardArea);
```

Keep the existing `this._playerInfo` insertion, the result-banner insertion
(`insertBefore(this._resultBanner, this._playerInfo)`), and the
`new ChessClock(this._playerInfo, this._opponentInfo)` line unchanged — they now
reference the view's elements via the two aliases. (Aliases keep this a minimal
diff; they can be inlined later.)

4. Delete the `_buildPlayerInfo(role)` method.
5. Replace the `_updatePlayerInfos()` method with a one-line delegator, OR delete
   it and change its single call site in `_startGame`. Chosen: delete
   `_updatePlayerInfos` and change the call site. In `_startGame`, replace:

```js
    this._updatePlayerInfos();
```

with:

```js
    this.playerInfoView.update(this.state);
```

- [ ] **Step 3: Run gates**

Run: `npm run lint && npm run format:check && npm run build`
Expected: all pass. Resolve any `no-unused-vars` on `MOVE_TIME_OPTIONS` /
`getDifficultyLabel` by trimming the `../config.js` import to what remains used.

- [ ] **Step 4: Manual verification**

- Start a game as White → "You" shows a white avatar (W); opponent shows
  "Stockfish (<difficulty>)" with a black avatar.
- New Game as Black → avatars swap (You = B, opponent = W).
- Start a game in move-time mode → opponent label reads "Stockfish (Ns/move)".
- Confirm the clocks still sit on the correct sides (they attach to the banner
  elements).

- [ ] **Step 5: Commit**

```bash
git add src/ui/PlayerInfoView.js src/game/GameController.js
git commit -m "refactor: extract PlayerInfoView from GameController" \
  -m "Move the player/opponent banner construction and update logic into a view module. Controller keeps element placement. No behavior change." \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: LeftPanel — left control panel

This is the largest task. The current `_buildLeftPanel` (~135 lines) becomes a
module whose construction is split into sub-builders (to satisfy the 120-line
function budget), and GameController's element toggling is replaced by intent
methods.

**Files:**

- Create: `src/ui/LeftPanel.js`
- Modify: `src/game/GameController.js`

- [ ] **Step 1: Create `src/ui/LeftPanel.js`**

```js
/**
 * The left control panel: primary buttons, Copy PGN/FEN, Settings, Analyze, and
 * the inline analysis time-picker. Hosts the new-game-setup and settings-dialog
 * elements. Communicates outward through the `actions` callback map; the
 * controller drives visibility/labels through the intent methods below.
 */
export class LeftPanel {
  constructor(container, { actions, newGameSetupEl, settingsDialogEl }) {
    this._actions = actions;
    this._selectedTime = 3000;
    this._timeBtns = [];

    this.el = document.createElement('div');
    this.el.className = 'left-panel-buttons';
    this.el.style.display = 'none';

    this._buttonsContainer = document.createElement('div');
    this._buttonsContainer.className = 'left-panel-buttons-inner';

    this._buildPrimaryButtons();
    this._buildSecondaryButtons();
    this._buildAnalyzeControls();

    this.el.appendChild(this._buttonsContainer);
    this.el.appendChild(newGameSetupEl);
    this.el.appendChild(settingsDialogEl);
    container.appendChild(this.el);
  }

  _buildPrimaryButtons() {
    const a = this._actions;
    const buttons = [
      { id: 'new-game', label: 'New Game', action: a.onNewGame },
      { id: 'take-back', label: 'Take Back', action: a.onTakeBack },
      { id: 'save', label: 'Save', action: a.onSave },
      { id: 'load', label: 'Load', action: a.onLoad },
      { id: 'hint', label: 'Hint', action: a.onToggleHint },
      { id: 'resign', label: 'Resign', action: a.onResign },
    ];
    const secondaryIds = new Set(['save', 'load']);
    for (const { id, label, action } of buttons) {
      const btn = document.createElement('button');
      btn.className = 'panel-btn';
      if (secondaryIds.has(id)) btn.classList.add('panel-btn-secondary');
      btn.id = `btn-${id}`;
      btn.textContent = label;
      btn.addEventListener('click', action);
      this._buttonsContainer.appendChild(btn);
      if (id === 'hint') {
        this._hintBtn = btn;
        btn.style.display = 'none';
      } else if (id === 'take-back') {
        this._takeBackBtn = btn;
        btn.style.display = 'none';
      } else if (id === 'resign') {
        this._resignBtn = btn;
        btn.classList.add('panel-btn-danger');
        btn.style.display = 'none';
      } else if (id === 'save') {
        this._saveBtn = btn;
      } else if (id === 'load') {
        this._loadBtn = btn;
      }
    }
  }

  _buildSecondaryButtons() {
    const a = this._actions;
    this._pgnBtn = this._makeButton('panel-btn pgn-btn', 'Copy PGN', () =>
      this._copyToClipboard(a.onCopyPgn(), this._pgnBtn)
    );
    this._fenBtn = this._makeButton('panel-btn fen-btn', 'Copy FEN', () =>
      this._copyToClipboard(a.onCopyFen(), this._fenBtn)
    );
    const settingsBtn = this._makeButton(
      'panel-btn panel-btn-secondary settings-btn',
      'Settings',
      a.onOpenSettings
    );
    settingsBtn.id = 'btn-settings';
    this._buttonsContainer.append(this._pgnBtn, this._fenBtn, settingsBtn);
  }

  _buildAnalyzeControls() {
    const a = this._actions;
    this._analyzeBtn = this._makeButton('panel-btn', 'Analyze Game', a.onToggleAnalyze);
    this._analyzeBtn.id = 'btn-analyze';
    this._analyzeBtn.style.display = 'none';
    this._buttonsContainer.appendChild(this._analyzeBtn);

    this._timePicker = document.createElement('div');
    this._timePicker.className = 'analysis-time-picker';
    this._timePicker.style.display = 'none';

    const tpLabel = document.createElement('div');
    tpLabel.className = 'depth-label';
    tpLabel.textContent = 'Seconds per move:';

    const tpOptions = document.createElement('div');
    tpOptions.className = 'analysis-time-options';
    for (const { label, ms } of [
      { label: '1s', ms: 1000 },
      { label: '3s', ms: 3000 },
      { label: '5s', ms: 5000 },
      { label: '10s', ms: 10000 },
    ]) {
      const btn = document.createElement('button');
      btn.className = 'analysis-time-btn';
      if (ms === 3000) btn.classList.add('selected');
      btn.textContent = label;
      btn.addEventListener('click', () => {
        this._selectedTime = ms;
        for (const b of this._timeBtns) b.classList.remove('selected');
        btn.classList.add('selected');
      });
      tpOptions.appendChild(btn);
      this._timeBtns.push(btn);
    }

    const startBtn = this._makeButton('panel-btn', 'Start Analysis', () => {
      this.hideTimePicker();
      a.onStartAnalysis(this._selectedTime);
    });

    this._timePicker.append(tpLabel, tpOptions, startBtn);
    this._buttonsContainer.appendChild(this._timePicker);
  }

  _makeButton(className, label, onClick) {
    const btn = document.createElement('button');
    btn.className = className;
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  _copyToClipboard(text, btn) {
    navigator.clipboard
      .writeText(text)
      .then(() => this._flashEl(btn, 'Copied!'))
      .catch(() => this._flashEl(btn, 'Failed!'));
  }

  _flashEl(btn, message) {
    const original = btn.textContent;
    btn.textContent = message;
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove('copied');
    }, 1500);
  }

  // --- Intent methods (driven by the controller) ---

  setPanelVisible(visible) {
    this.el.style.display = visible ? 'flex' : 'none';
  }

  setButtonsVisible(visible) {
    this._buttonsContainer.style.display = visible ? 'flex' : 'none';
  }

  setInGameControlsVisible(visible) {
    const d = visible ? 'block' : 'none';
    this._hintBtn.style.display = d;
    this._takeBackBtn.style.display = d;
    this._resignBtn.style.display = d;
  }

  setHintLabel(text) {
    this._hintBtn.textContent = text;
  }

  setTakeBackEnabled(enabled) {
    this._takeBackBtn.disabled = !enabled;
  }

  showAnalyzeButton(hasResults) {
    this._analyzeBtn.style.display = 'block';
    this._analyzeBtn.textContent = hasResults ? 'Best Move' : 'Analyze Game';
    this._analyzeBtn.classList.toggle('best-move-btn', hasResults);
  }

  hideAnalyzeButton() {
    this._analyzeBtn.style.display = 'none';
    this._analyzeBtn.classList.remove('best-move-btn');
  }

  setAnalyzeLabel(text, isBestMove = null) {
    this._analyzeBtn.textContent = text;
    if (isBestMove !== null) this._analyzeBtn.classList.toggle('best-move-btn', isBestMove);
  }

  isTimePickerVisible() {
    return this._timePicker.style.display !== 'none';
  }

  toggleTimePicker() {
    if (this.isTimePickerVisible()) {
      this.hideTimePicker();
    } else {
      this._selectedTime = 3000;
      for (const b of this._timeBtns) b.classList.toggle('selected', b.textContent === '3s');
      this._timePicker.style.display = 'flex';
    }
  }

  hideTimePicker() {
    this._timePicker.style.display = 'none';
  }

  getSelectedAnalysisTime() {
    return this._selectedTime;
  }

  flash(which, message) {
    this._flashEl(which === 'save' ? this._saveBtn : this._loadBtn, message);
  }
}
```

Note: the original `Settings` button had `id: 'settings'` in the `secondaryIds`
set used purely to add `panel-btn-secondary`; here `settingsBtn` adds that class
directly, so behavior is identical. The flash timers use plain `setTimeout`
(cosmetic, no cleanup needed) instead of the controller's tracked timeout — a
deliberate, negligible change that also avoids a flash sticking if a reset cleared
the tracked timer mid-flash.

- [ ] **Step 2: Wire into GameController — `init()` + construction**

1. Add import: `import { LeftPanel } from '../ui/LeftPanel.js';`
2. The controller currently creates `this.settingsDialog = new SettingsDialog();`
   then calls `this._buildLeftPanel(leftPanel);`. Replace that call (and the
   internal `newGameSetup` creation that lived inside `_buildLeftPanel`) with
   explicit construction in `init()`:

```js
    // Settings dialog + new-game setup are owned by the controller (it wires
    // their callbacks); the left panel just hosts their elements.
    this.settingsDialog = new SettingsDialog();
    this.newGameSetup = new NewGameSetup(this.settings.pieceSet);
    this.newGameSetup.onStart = (opts) => this._startNewGame(opts);
    this.newGameSetup.onCancel = () => this._hideNewGameSetup();

    this.leftPanel = new LeftPanel(leftPanel, {
      actions: {
        onNewGame: () => this._newGame(),
        onTakeBack: () => this._takeBack(),
        onSave: () => this._saveGame(),
        onLoad: () => this._loadGame(),
        onToggleHint: () => this._toggleHint(),
        onResign: () => this._resign(),
        onOpenSettings: () => this._openSettings(),
        onCopyPgn: () => generatePgn(this.state, this.history),
        onCopyFen: () => this._getCurrentFen(),
        onToggleAnalyze: () => this._handleAnalyzeClick(),
        onStartAnalysis: (ms) => this._runPostGameAnalysis(ms),
      },
      newGameSetupEl: this.newGameSetup.el,
      settingsDialogEl: this.settingsDialog.el,
    });
```

(Keep the existing `this.settingsDialog` creation point — do not double-create it.
If `SettingsDialog` was constructed earlier in `init`, move the `newGameSetup` +
`LeftPanel` block to where `_buildLeftPanel(leftPanel)` was called.)

3. Delete the entire `_buildLeftPanel(container)` method.
4. Delete `_flashButton(btn, message)` and `_copyToClipboard(text, btn)` (moved
   into LeftPanel).

- [ ] **Step 3: Wire into GameController — re-point call sites**

Replace each old element access with the LeftPanel method. Mechanical swaps:

- `_startGame`:
  - `this._analyzeBtnEl.style.display = 'none'` + `classList.remove('best-move-btn')` → `this.leftPanel.hideAnalyzeButton()`
  - `this._inlineTimePicker.style.display = 'none'` → `this.leftPanel.hideTimePicker()`
  - `this._leftPanelEl.style.display = 'flex'` → `this.leftPanel.setPanelVisible(true)`
  - `this._hintBtnEl.style.display = 'block'` → (covered by) `this.leftPanel.setInGameControlsVisible(true)`
  - `this._takeBackBtnEl.style.display = 'block'` + `this._takeBackBtnEl.disabled = true` → `this.leftPanel.setTakeBackEnabled(false)` (visibility via the line above)
  - `this._resignBtnEl.style.display = 'block'` → (covered by `setInGameControlsVisible(true)`)
  - Net: replace the hint/takeback/resign show block with `this.leftPanel.setInGameControlsVisible(true); this.leftPanel.setTakeBackEnabled(false);`
- `_restart`: same as `_startGame`, plus `this._hintBtnEl.textContent = 'Hint'` → `this.leftPanel.setHintLabel('Hint')`.
- `_executeMove`:
  - `this._takeBackBtnEl.disabled = false` → `this.leftPanel.setTakeBackEnabled(true)`
  - `this._hintBtnEl.textContent = 'Hint'` → `this.leftPanel.setHintLabel('Hint')`
- `_takeBack`:
  - `this._hintBtnEl.textContent = 'Hint'` → `this.leftPanel.setHintLabel('Hint')`
  - `this._takeBackBtnEl.disabled = this.history.length === 0` → `this.leftPanel.setTakeBackEnabled(this.history.length > 0)`
- `_handleGameOver`:
  - hint/takeback/resign `display = 'none'` (3 lines) → `this.leftPanel.setInGameControlsVisible(false)`
  - the analyze-button block (`display='block'` + text/class per `analysisResults`) → `this.leftPanel.showAnalyzeButton(!!this.state.analysisResults)`
  - `this._inlineTimePicker.style.display = 'none'` → `this.leftPanel.hideTimePicker()`
  - (`this._replayEl.style.display = 'none'` stays — replay is still in GC)
- `_toggleHint`: `this._hintBtnEl.textContent = 'Hide Hint' / 'Hint'` → `this.leftPanel.setHintLabel('Hide Hint' / 'Hint')`
- `_runPostGameAnalysis`: the trailing `this._analyzeBtnEl.textContent = 'Best Move'; this._analyzeBtnEl.classList.add('best-move-btn')` → `this.leftPanel.setAnalyzeLabel('Best Move', true)`
- `_saveGame`: `this._flashButton(this._saveBtnEl, 'Saved!' / 'Save failed')` → `this.leftPanel.flash('save', 'Saved!' / 'Save failed')`
- `_loadGame`:
  - `this._leftPanelEl.style.display = 'flex'` → `this.leftPanel.setPanelVisible(true)`
  - hint/takeback/resign `display = over ? 'none' : 'block'` (3 lines) → `this.leftPanel.setInGameControlsVisible(this.state.phase !== 'over')`
  - `this._takeBackBtnEl.disabled = this.history.length === 0` → `this.leftPanel.setTakeBackEnabled(this.history.length > 0)`
  - `this._flashButton(this._loadBtnEl, 'Loaded!' / 'Load failed' / 'No saved game')` → `this.leftPanel.flash('load', ...)`

Method rewrites (show full new bodies):

```js
  _showNewGameSetup() {
    this.leftPanel.setButtonsVisible(false);
    this.newGameSetup.show(this.settings);
    document.getElementById('board-column').classList.add('board-inactive');
  }

  _hideNewGameSetup() {
    this.newGameSetup.hide();
    this.leftPanel.setButtonsVisible(true);
    document.getElementById('board-column').classList.remove('board-inactive');
  }

  _handleAnalyzeClick() {
    if (this.state.analysisResults) {
      this._toggleBestMoveArrow();
    } else {
      this.leftPanel.toggleTimePicker();
    }
  }

  _toggleBestMoveArrow() {
    this.state.showingBestMove = !this.state.showingBestMove;
    if (this.state.showingBestMove) {
      this.leftPanel.setAnalyzeLabel('Hide Best Move');
      this._showBestMoveForCurrentPosition();
    } else {
      this.leftPanel.setAnalyzeLabel('Best Move');
      this.boardView.clearHintArrow();
    }
  }

  _openSettings() {
    this.leftPanel.setButtonsVisible(false);
    this.settingsDialog.show(this.settings);
  }
```

In `_wireCallbacks`, the `settingsDialog.onClose` handler:

```js
    this.settingsDialog.onClose = () => {
      this.leftPanel.setButtonsVisible(true);
    };
```

Finally, delete now-dead fields if present (they are assigned only inside the
deleted `_buildLeftPanel`): `_leftPanelEl`, `_leftPanelButtonsContainer`,
`_hintBtnEl`, `_takeBackBtnEl`, `_resignBtnEl`, `_saveBtnEl`, `_loadBtnEl`,
`_analyzeBtnEl`, `_inlineTimePicker`, `_inlineTimeBtns`, `_inlineSelectedTime`,
`_pgnCopyBtn`, `_fenCopyBtn`. There are no constructor declarations to remove (they
were only set in `_buildLeftPanel`), but grep to confirm no remaining reader.

- [ ] **Step 4: Run gates + grep for stragglers**

Run: `npm run lint && npm run format:check && npm run build`
Then: `grep -nE "_(hintBtnEl|takeBackBtnEl|resignBtnEl|analyzeBtnEl|inlineTimePicker|inlineTimeBtns|inlineSelectedTime|leftPanelEl|leftPanelButtonsContainer|saveBtnEl|loadBtnEl|pgnCopyBtn|fenCopyBtn|flashButton|copyToClipboard|buildLeftPanel)" src/game/GameController.js`
Expected: lint/build pass; grep returns nothing.

- [ ] **Step 5: Manual verification (full baseline sweep)**

This task touches the whole left panel — run the entire baseline sweep, plus:

- Every primary button: New Game (setup shows, buttons hide), Take Back
  (enables/disables correctly), Save/Load (flash "Saved!"/"Loaded!"), Hint
  (toggles "Hint"/"Hide Hint" + arrow), Resign (ends game).
- Copy PGN and Copy FEN flash "Copied!" and place correct text on the clipboard.
- Settings opens (buttons hide) and closes (buttons return).
- After game over: Analyze button appears; the time-picker toggles open/closed and
  defaults to 3s; Start Analysis runs and the button becomes "Best Move".

- [ ] **Step 6: Commit**

```bash
git add src/ui/LeftPanel.js src/game/GameController.js
git commit -m "refactor: extract LeftPanel from GameController" \
  -m "Move the left control panel (buttons, PGN/FEN copy, settings, analyze, time-picker) into a view module with intent methods + an actions callback map. Builder split into sub-methods to satisfy the function-size budget. No behavior change." \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: HistoryNavigator — history/view navigation (Tier 2)

**Files:**

- Create: `src/game/HistoryNavigator.js`
- Modify: `src/game/GameController.js`

- [ ] **Step 1: Create `src/game/HistoryNavigator.js`**

```js
import { Chess } from 'chess.js';
import { checkHighlightSquare } from './boardUtils.js';

/**
 * Moves the displayed position through move history. Read-mostly: it changes the
 * history view index and the rendered view, never game state. Two controller
 * callbacks bridge back to logic that stays in the controller:
 *   onReturnToLive() — render the live position + check highlight
 *   onPositionShown() — redraw the best-move arrow (analysis cluster)
 */
export class HistoryNavigator {
  constructor({
    history,
    boardView,
    evalBar,
    analysisGraph,
    moveList,
    state,
    onReturnToLive,
    onPositionShown,
  }) {
    this._history = history;
    this._boardView = boardView;
    this._evalBar = evalBar;
    this._analysisGraph = analysisGraph;
    this._moveList = moveList;
    this._state = state;
    this._onReturnToLive = onReturnToLive;
    this._onPositionShown = onPositionShown;
    this._positionCache = new Map();
  }

  clearCache() {
    this._positionCache.clear();
  }

  back() {
    this._step('back');
  }

  forward() {
    this._step('forward');
  }

  _step(direction) {
    const fen = direction === 'back' ? this._history.goBack() : this._history.goForward();
    if (fen !== null) {
      this._showPositionFromFen(fen);
    } else if (direction === 'forward' && this._history.isAtCurrentPosition()) {
      this._onReturnToLive();
    }
    this._afterNavigate(this._history.getCurrentViewIndex());
  }

  goToIndex(idx) {
    const fen = this._history.goToIndex(idx);
    if (fen !== null) {
      this._showPositionFromFen(fen);
    } else if (this._history.isAtCurrentPosition()) {
      this._onReturnToLive();
    }
    this._afterNavigate(idx);
  }

  handleKey(e) {
    if (this._state.phase === 'setup') return;
    if (this._history.length === 0) return;

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        this.back();
        break;
      case 'ArrowRight':
        e.preventDefault();
        this.forward();
        break;
      case 'ArrowUp':
      case 'Home': {
        e.preventDefault();
        const fen = this._history.goToStart();
        if (fen) this._showPositionFromFen(fen);
        this._afterNavigate(this._history.getCurrentViewIndex());
        break;
      }
      case 'ArrowDown':
      case 'End': {
        e.preventDefault();
        this._history.goToEnd();
        this._onReturnToLive();
        this._afterNavigate(this._history.getCurrentViewIndex());
        break;
      }
    }
  }

  _afterNavigate(viewIdx) {
    this._moveList.render(this._history);
    if (this._analysisGraph.visible) {
      this._analysisGraph.setHighlight(viewIdx);
    }
    this._updateEvalBarFromAnalysis(viewIdx);
    this._onPositionShown();
  }

  _showPositionFromFen(fen) {
    let view = this._positionCache.get(fen);
    if (!view) {
      const temp = new Chess(fen);
      const board = temp.board();
      view = {
        board,
        checkSquare: checkHighlightSquare(board, temp.turn(), temp.isCheck()),
      };
      this._positionCache.set(fen, view);
    }
    this._boardView.updatePosition(view.board);
    this._boardView.setCheck(view.checkSquare);
  }

  _updateEvalBarFromAnalysis(moveIndex) {
    const results = this._state.analysisResults;
    if (!results) return;
    const evals = results.evaluations;
    if (!evals || moveIndex < 0 || moveIndex >= evals.length) return;
    const cp = evals[moveIndex];
    if (cp !== null && cp !== undefined) {
      this._evalBar.setEvalCp(cp);
    }
  }
}
```

- [ ] **Step 2: Wire into GameController**

1. Add import: `import { HistoryNavigator } from './HistoryNavigator.js';`
2. Remove `import { Chess } from 'chess.js';` — after `_showPositionFromFen` moves
   out, GameController no longer references `Chess` (confirm via lint in Step 3).
3. Remove `this._positionCache = new Map();` from the constructor (the cache moves
   into the navigator).
4. In `init()`, after `this.moveList`, `this.analysisGraph`, `this.evalBar`, and
   `this.boardView` exist (place just after `this.analysisGraph` is created),
   construct the navigator:

```js
    this.historyNavigator = new HistoryNavigator({
      history: this.history,
      boardView: this.boardView,
      evalBar: this.evalBar,
      analysisGraph: this.analysisGraph,
      moveList: this.moveList,
      state: this.state,
      onReturnToLive: () => {
        this.boardView.updatePosition(this.state.board);
        this._updateCheckHighlight();
      },
      onPositionShown: () => {
        if (this.state.showingBestMove) this._showBestMoveForCurrentPosition();
      },
    });
```

5. Replace the three `this._positionCache.clear()` calls (in `_startGame`,
   `_restart`, `_loadGame`) with `this.historyNavigator.clearCache()`.
6. Update the bound keyboard handler. In the constructor, change:

```js
    this._boundKeyboard = (e) => this.historyNavigator.handleKey(e);
```

(`historyNavigator` is created in `init()`; the closure resolves it lazily, and
keydown only fires after a game starts, so it is always set by then.)

7. In `_wireCallbacks`, re-point the move-list and graph click handlers:

```js
    this.moveList.onMoveClick = (idx) => this.historyNavigator.goToIndex(idx);

    this.analysisGraph.onMoveClick = (idx) => {
      this.historyNavigator.goToIndex(idx);
      this.analysisGraph.setHighlight(idx);
    };
```

8. In `_buildBelowBoard`, re-point the replay arrows:

```js
    prevBtn.addEventListener('click', () => this.historyNavigator.back());
    // ...
    nextBtn.addEventListener('click', () => this.historyNavigator.forward());
```

9. Delete these now-moved methods from GameController: `_navigateHistory`,
   `_goToMoveIndex`, `_showPositionFromFen`, `_updateEvalBarFromAnalysis`,
   `_handleKeyboard`. Keep `_updateCheckHighlight`, `_showBestMoveForCurrentPosition`,
   and `_setTimeout`/cleanup helpers.

- [ ] **Step 3: Run gates + grep for stragglers**

Run: `npm run lint && npm run format:check && npm run build`
Then: `grep -nE "_(navigateHistory|goToMoveIndex|showPositionFromFen|updateEvalBarFromAnalysis|handleKeyboard|positionCache)|new Chess" src/game/GameController.js`
Expected: lint/build pass; grep returns nothing.

- [ ] **Step 4: Manual verification (navigation-focused)**

- ArrowLeft/Right step one ply; Home jumps to start, End back to live.
- Click a move in the move list → board jumps there; the active move highlights.
- Take back, then navigate — confirm back/forward bounds are correct and returning
  to the latest position shows the live board with the correct check highlight.
- After running post-game analysis: graph click jumps the board and moves the
  graph highlight; the eval bar updates to the selected move's evaluation.
- With "Best Move" toggled on, navigating updates the best-move arrow per position.

- [ ] **Step 5: Commit**

```bash
git add src/game/HistoryNavigator.js src/game/GameController.js
git commit -m "refactor: extract HistoryNavigator from GameController" \
  -m "Move history/view navigation (arrows, jump-to-index, keyboard, position cache, per-move eval-bar sync) into a read-mostly module with injected deps and onReturnToLive/onPositionShown callbacks. No behavior change." \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Documentation & config sync

**Files:**

- Modify: `eslint.config.js`, `CLAUDE.md`, `dev_log.md`

- [ ] **Step 1: Update the ESLint grandfather comment**

GameController stays in the override (it lands ~900 lines). Update only the comment
so it points at the remaining work. In `eslint.config.js`, adjust the override
comment to note that `GameController.js` now delegates view + navigation and that
Tier 3 (extracting `AnalysisController` + `MoveExecutor`) is the remaining path to
clear the budget. Do not change the `files` array.

- [ ] **Step 2: Update `CLAUDE.md` architecture section**

Mark `HistoryNavigator` and the panel view-builders (`LeftPanel`, `PlayerInfoView`,
`boardUtils`) as existing. Keep `AnalysisController` / `MoveExecutor` listed as the
remaining future seams. Re-point the "do not add new responsibilities to
GameController" guidance to mention the new modules.

- [ ] **Step 3: Add a `dev_log.md` entry**

Newest-first, under today's date. One entry summarizing the A1 Tier 1–2
decomposition: the four extracted modules, that behavior is unchanged, that
GameController dropped ~1,325 → ~900 lines and remains grandfathered, and that
Tier 3 is deferred.

- [ ] **Step 4: Run gates**

Run: `npm run lint && npm run format:check && npm run build`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.js CLAUDE.md dev_log.md
git commit -m "docs: sync architecture notes after A1 Tiers 1-2" \
  -m "Update ESLint grandfather comment, CLAUDE.md module map, and dev_log for the GameController decomposition." \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** All four spec modules have tasks (1–4); the spec's "expected end
state" doc/config updates are Task 5. Manual verification model and per-tier commits
match the spec. Tier 3 is explicitly deferred (not in any task).

**Placeholder scan:** No TBD/TODO. Every code step shows complete code; every edit
step names exact methods and shows before→after. Grep commands make the "delete all
stragglers" steps concrete rather than vague.

**Type/interface consistency:** LeftPanel method names used in GameController edits
(`setPanelVisible`, `setButtonsVisible`, `setInGameControlsVisible`, `setHintLabel`,
`setTakeBackEnabled`, `showAnalyzeButton`, `hideAnalyzeButton`, `setAnalyzeLabel`,
`toggleTimePicker`, `hideTimePicker`, `getSelectedAnalysisTime`, `flash`) all match
the LeftPanel definition in Task 3. HistoryNavigator methods (`back`, `forward`,
`goToIndex`, `handleKey`, `clearCache`) match the call sites in Task 4. The
`onReturnToLive` / `onPositionShown` callbacks are defined where the navigator is
constructed. `checkHighlightSquare` is used identically in boardUtils, GameController
(Task 1), and HistoryNavigator (Task 4).

**Ordering safety:** Tier order is safest-first (pure → view → view → navigation).
Each task builds and is independently verifiable/committable; intermediate states
keep the app working.
