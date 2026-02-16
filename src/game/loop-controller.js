/**
 * Create a frame/update loop controller.
 *
 * Keeps fixed-step simulation, resize scheduling, and requestAnimationFrame loop
 * in one place so the app entry can focus on composition.
 *
 * @param {{
 *   state: { mode?: string; paused?: boolean };
 *   stepFn: (state: unknown, dt: number) => void;
 *   renderer: { draw: (state: unknown, balls: unknown[], imagesById: Map<string, HTMLImageElement>) => void; resizeToFit?: () => void };
 *   getBallsCatalog: () => unknown[];
 *   getImagesById: () => Map<string, HTMLImageElement>;
 *   onAfterFrame?: () => void;
 *   syncViewportHeight?: () => void;
 * }} opts
 */
export function createLoopController(opts) {
  const {
    state,
    stepFn,
    renderer,
    getBallsCatalog,
    getImagesById,
    onAfterFrame = () => {},
    syncViewportHeight = () => {},
  } = opts;

  let resizeRaf = 0;
  let last = performance.now();

  function draw() {
    renderer.draw(state, getBallsCatalog(), getImagesById());
  }

  /**
   * Advance simulation using a fixed 60hz step for stable behavior.
   *
   * @param {number} ms
   */
  function tickFixed(ms) {
    const dt = 1 / 60;
    const steps = Math.max(1, Math.round((ms / 1000) / dt));
    for (let i = 0; i < steps; i++) stepFn(state, dt);
    draw();
    onAfterFrame();
  }

  function scheduleResize() {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      syncViewportHeight();
      renderer.resizeToFit?.();
      draw();
    });
  }

  function mountResizeListeners() {
    window.addEventListener("resize", scheduleResize);
    window.visualViewport?.addEventListener("resize", scheduleResize);
    window.visualViewport?.addEventListener("scroll", scheduleResize);
  }

  function startAnimationLoop() {
    function raf(now) {
      const dtMs = Math.min(40, now - last);
      last = now;
      if (state.mode === "playing" && !state.paused) tickFixed(dtMs);
      else draw();
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
  }

  return {
    tickFixed,
    scheduleResize,
    mountResizeListeners,
    startAnimationLoop,
  };
}
