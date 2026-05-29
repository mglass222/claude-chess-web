# Dev Log

A running summary of changes made to Claude Chess. Newest entries first.
Update this file whenever the program changes.

---

## 2026-05-28

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
