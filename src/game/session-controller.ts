// @ts-nocheck
/**
 * Create game session controller.
 *
 * Handles:
 * - run start/restart flow
 * - winner detection per frame
 * - camera focus reset and control updates around transitions
 *
 * @param {{
 *   state: {
 *     mode?: string;
 *     paused?: boolean;
 *     winner?: { t?: number } | null;
 *     seed?: number;
 *     rng?: unknown;
 *     _shownResultId?: unknown;
 *     _shownWinnerT?: unknown;
 *   };
 *   renderer: { clearCameraOverride?: () => void };
 *   viewState: { tailFocusOn: boolean };
 *   getTotalSelectedCount: (state: unknown) => number;
 *   makeRng: (seed: number) => unknown;
 *   startGame: (state: unknown) => void;
 *   dropAll: (state: unknown) => void;
 *   resetGame: (state: unknown) => void;
 *   onPreStart?: () => void;
 *   onReset?: () => void;
 *   onUpdateControls?: () => void;
 *   getWinnerPayload?: () => { name: string; img: string } | null;
 *   onWinnerPayload?: (payload: { name: string; img: string }) => void;
 *   onShowWinner?: () => void;
 }} opts
 */
export function createSessionController(opts) {
  const {
    state,
    renderer,
    viewState,
    getTotalSelectedCount,
    makeRng,
    startGame,
    dropAll,
    resetGame,
    onPreStart = () => {},
    onReset = () => {},
    onUpdateControls = () => {},
    getWinnerPayload = () => null,
    onWinnerPayload = () => {},
    onShowWinner = () => {},
  } = opts;

  function clearRunCaches() {
    state._shownResultId = null;
    state._shownWinnerT = null;
  }

  function applyDefaultRunView() {
    state.paused = false;
    viewState.tailFocusOn = true;
    renderer.clearCameraOverride?.();
  }

  function tryStart() {
    if (getTotalSelectedCount(state) <= 0) return false;
    state.seed = ((Date.now() & 0xffffffff) ^ (Math.random() * 0xffffffff)) >>> 0;
    state.rng = makeRng(state.seed);
    startGame(state);
    clearRunCaches();
    onPreStart();
    onUpdateControls();
    applyDefaultRunView();
    onReset();
    dropAll(state);
    return true;
  }

  function restartIfPlaying() {
    if (state.mode !== "playing") return;
    resetGame(state);
    clearRunCaches();
    applyDefaultRunView();
    onReset();
  }

  function togglePause() {
    if (state.mode !== "playing" || state.winner) return false;
    state.paused = !state.paused;
    onUpdateControls();
    return true;
  }

  function onAfterFrame() {
    if (state.winner && state._shownWinnerT !== state.winner.t) {
      state._shownWinnerT = state.winner.t;
      const payload = getWinnerPayload();
      if (payload) onWinnerPayload(payload);
      onShowWinner();
    }
    onUpdateControls();
  }

  function handleStartClick() {
    restartIfPlaying();
    tryStart();
  }

  return {
    tryStart,
    handleStartClick,
    togglePause,
    onAfterFrame,
  };
}
