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
