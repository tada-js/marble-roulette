/**
 * Controller for top control area (start button + view lock toggle state).
 *
 * @param {{
 *   startBtn: HTMLButtonElement;
 *   pauseBtn?: HTMLButtonElement | null;
 *   viewLockEl?: HTMLInputElement | null;
 *   state: { mode?: string; winner?: unknown; released?: boolean; paused?: boolean };
 *   viewState: { tailFocusOn: boolean };
 *   renderer: { getViewState?: () => unknown };
 *   getTotalSelectedCount: (state: unknown) => number;
 }} opts
 */
export function createControlPanelController(opts) {
  const { startBtn, pauseBtn, viewLockEl, state, viewState, renderer, getTotalSelectedCount } = opts;

  function updateControls() {
    const total = getTotalSelectedCount(state);
    startBtn.disabled = total <= 0;
    const inRun = state.mode === "playing" && !state.winner;
    startBtn.textContent = inRun ? "게임 재시작" : "게임 시작";

    if (pauseBtn) {
      pauseBtn.disabled = !inRun;
      pauseBtn.textContent = state.paused ? "이어하기" : "일시정지";
      pauseBtn.setAttribute("aria-pressed", state.paused ? "true" : "false");
    }

    if (!viewLockEl) return;
    const v = renderer.getViewState?.();
    viewLockEl.disabled = !(state.mode === "playing" && state.released && v);
    viewLockEl.checked = !!viewState.tailFocusOn;
  }

  return { updateControls };
}
