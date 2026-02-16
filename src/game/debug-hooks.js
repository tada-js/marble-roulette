/**
 * Mount debug/testing hooks on window for automation.
 *
 * @param {{
 *   state: unknown;
 *   renderer: { getViewState?: () => { cameraY: number; viewHWorld: number; cameraOverrideY?: number } | undefined };
 *   snapshotForText: (state: unknown) => Record<string, unknown>;
 *   tickFixed: (ms: number) => void;
 }} opts
 */
export function mountDebugHooks(opts) {
  const { state, renderer, snapshotForText, tickFixed } = opts;

  window.render_game_to_text = () => {
    const base = snapshotForText(state);
    const v = renderer.getViewState?.();
    if (v) base.camera = { cameraY: v.cameraY, viewHWorld: v.viewHWorld, override: v.cameraOverrideY };
    return JSON.stringify(base);
  };

  window.advanceTime = async (ms) => {
    tickFixed(ms);
  };
}
