/**
 * Mount global keyboard interactions:
 * - `f`: fullscreen toggle
 * - `Enter`: start game when idle
 *
 * @param {{
 *   getMode: () => string;
 *   tryStart: () => boolean;
 * }} opts
 */
export function mountKeyboardControls(opts) {
  const { getMode, tryStart } = opts;

  document.addEventListener("keydown", async (e) => {
    const tag = e.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    const k = e.key?.toLowerCase?.() || "";
    if (k === "f") {
      try {
        if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
        else await document.exitFullscreen();
      } catch {
        // ignore
      }
      return;
    }

    if (e.key === "Enter" && getMode() !== "playing") {
      if (tryStart()) e.preventDefault();
    }
  });
}
