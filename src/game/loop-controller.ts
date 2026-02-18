/**
 * Create a frame/update loop controller.
 *
 * Keeps fixed-step simulation, resize scheduling, and requestAnimationFrame loop
 * in one place so the app entry can focus on composition.
 *
 * @param {{
 *   state: State;
 *   stepFn: (state: State, dt: number) => void;
 *   renderer: { draw: (state: State, balls: Ball[], imagesById: Map<string, HTMLImageElement>) => void; resizeToFit?: () => void };
 *   getBallsCatalog: () => Ball[];
 *   getImagesById: () => Map<string, HTMLImageElement>;
 *   onAfterFrame?: () => void;
 *   syncViewportHeight?: () => void;
 *   initialSpeedMultiplier?: number;
 * }} opts
 */
export function createLoopController<State extends { mode?: string; paused?: boolean }, Ball>(opts: {
  state: State;
  stepFn: (state: State, dt: number) => void;
  renderer: {
    draw: (state: State, balls: Ball[], imagesById: Map<string, HTMLImageElement>) => void;
    resizeToFit?: () => void;
  };
  getBallsCatalog: () => Ball[];
  getImagesById: () => Map<string, HTMLImageElement>;
  onAfterFrame?: () => void;
  syncViewportHeight?: () => void;
  initialSpeedMultiplier?: number;
}) {
  const {
    state,
    stepFn,
    renderer,
    getBallsCatalog,
    getImagesById,
    onAfterFrame = () => {},
    syncViewportHeight = () => {},
    initialSpeedMultiplier = 1,
  } = opts;

  let resizeRaf = 0;
  let last = performance.now();
  const fixedStepSec = 1 / 60;
  const fixedStepMs = 1000 / 60;
  type FrameBudgetPolicy = {
    maxSpeedMultiplier: number;
    maxCatchUpSteps: number;
    maxElapsedMs: number;
  };
  const frameBudgetPolicies: FrameBudgetPolicy[] = [
    { maxSpeedMultiplier: 1.01, maxCatchUpSteps: 2, maxElapsedMs: 40 },
    { maxSpeedMultiplier: 1.5, maxCatchUpSteps: 3, maxElapsedMs: 56 },
    { maxSpeedMultiplier: 2.1, maxCatchUpSteps: 4, maxElapsedMs: 72 },
    { maxSpeedMultiplier: Number.POSITIVE_INFINITY, maxCatchUpSteps: 5, maxElapsedMs: 88 },
  ];
  let speedMultiplier = Number.isFinite(initialSpeedMultiplier)
    ? Math.max(0.5, Math.min(3, initialSpeedMultiplier))
    : 1;

  const fallbackFrameBudget = frameBudgetPolicies[frameBudgetPolicies.length - 1];
  function getFrameBudgetPolicy(): FrameBudgetPolicy {
    for (const policy of frameBudgetPolicies) {
      if (speedMultiplier <= policy.maxSpeedMultiplier) return policy;
    }
    return fallbackFrameBudget;
  }

  function draw(): void {
    renderer.draw(state, getBallsCatalog(), getImagesById());
  }

  /**
   * Advance simulation using a fixed 60hz step for stable behavior.
   *
   * @param {number} ms
   */
  function tickFixed(ms: number): void {
    const rawMs = Number(ms);
    const safeMs = Number.isFinite(rawMs) ? Math.max(0, rawMs) : 0;
    const scaledMs = safeMs * speedMultiplier;
    const frameBudget = getFrameBudgetPolicy();
    const maxStepBudgetMs = fixedStepMs * frameBudget.maxCatchUpSteps;
    const budgetMs = Math.min(maxStepBudgetMs, frameBudget.maxElapsedMs, scaledMs);
    const steps = Math.max(1, Math.round(budgetMs / fixedStepMs));
    for (let i = 0; i < steps; i++) stepFn(state, fixedStepSec);
    draw();
    onAfterFrame();
  }

  function scheduleResize(): void {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      syncViewportHeight();
      renderer.resizeToFit?.();
      draw();
    });
  }

  function mountResizeListeners(): void {
    window.addEventListener("resize", scheduleResize);
    window.visualViewport?.addEventListener("resize", scheduleResize);
    window.visualViewport?.addEventListener("scroll", scheduleResize);
  }

  function startAnimationLoop(): void {
    function raf(now: number): void {
      const elapsedMs = Math.max(0, now - last);
      last = now;
      if (state.mode === "playing" && !state.paused) {
        tickFixed(elapsedMs);
      } else {
        draw();
      }
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
  }

  function setSpeedMultiplier(next: number): number {
    const parsed = Number(next);
    const clamped = Number.isFinite(parsed) ? Math.max(0.5, Math.min(3, parsed)) : 1;
    speedMultiplier = clamped;
    return speedMultiplier;
  }

  return {
    tickFixed,
    scheduleResize,
    mountResizeListeners,
    startAnimationLoop,
    setSpeedMultiplier,
  };
}
