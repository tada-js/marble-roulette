import { t } from "../i18n/runtime.ts";

/**
 * Mount secret coordinate mode controls for board canvas.
 *
 * @param {{
 *   board: { worldW: number; worldH: number };
 *   renderer: { screenToWorld: (sx: number, sy: number) => { x: number; y: number } };
 *   canvas?: HTMLCanvasElement | null;
 *   canvasCoordReadoutEl?: HTMLElement | null;
 *   canvasCoordCopyBtn?: HTMLButtonElement | null;
 *   minimapTitleEl?: HTMLElement | null;
 }} opts
 */
export function mountCoordModeController(opts) {
  const {
    board,
    renderer,
    canvas,
    canvasCoordReadoutEl,
    canvasCoordCopyBtn,
    minimapTitleEl,
  } = opts;

  let lastCanvasFrac = null; // {xFrac,yFrac}
  let pinnedCanvasFrac = null; // {xFrac,yFrac}
  let coordMode = false;

  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  /**
   * @param {string} s
   */
  async function copyText(s) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(s);
        return true;
      }
    } catch {
      // fall through
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = s;
      ta.setAttribute("readonly", "true");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }

  /**
   * @param {number} xFrac
   * @param {number} yFrac
   */
  function updateCanvasCoordReadout(xFrac, yFrac) {
    if (!coordMode) return;
    lastCanvasFrac =
      Number.isFinite(xFrac) && Number.isFinite(yFrac) ? { xFrac: clamp01(xFrac), yFrac: clamp01(yFrac) } : null;
    const show = pinnedCanvasFrac || lastCanvasFrac;
    if (canvasCoordReadoutEl) {
      if (!show) canvasCoordReadoutEl.textContent = "xFrac: -, yFrac: -";
      else {
        canvasCoordReadoutEl.textContent =
          `xFrac: ${show.xFrac.toFixed(3)}, yFrac: ${show.yFrac.toFixed(3)}` +
          `${pinnedCanvasFrac ? t("coord.pinnedSuffix") : ""}`;
      }
    }
    if (canvasCoordCopyBtn) canvasCoordCopyBtn.disabled = !show;
  }

  function setCoordMode(on) {
    coordMode = !!on;
    document.documentElement.classList.toggle("coord-mode", coordMode);
    pinnedCanvasFrac = null;
    lastCanvasFrac = null;
    if (coordMode) updateCanvasCoordReadout(NaN, NaN);
  }

  canvas?.addEventListener("pointermove", (e) => {
    if (!coordMode || pinnedCanvasFrac) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const w = renderer.screenToWorld(sx, sy);
    updateCanvasCoordReadout(w.x / board.worldW, w.y / board.worldH);
  });
  canvas?.addEventListener("pointerleave", () => {
    if (!coordMode || pinnedCanvasFrac) return;
    updateCanvasCoordReadout(NaN, NaN);
  });
  canvas?.addEventListener("pointerdown", (e) => {
    if (!coordMode) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const w = renderer.screenToWorld(sx, sy);
    pinnedCanvasFrac = { xFrac: clamp01(w.x / board.worldW), yFrac: clamp01(w.y / board.worldH) };
    updateCanvasCoordReadout(pinnedCanvasFrac.xFrac, pinnedCanvasFrac.yFrac);
  });
  canvasCoordCopyBtn?.addEventListener("click", async () => {
    if (!coordMode) return;
    const v = pinnedCanvasFrac || lastCanvasFrac;
    if (!v) return;
    const txt = `{ xFrac: ${v.xFrac.toFixed(3)}, yFrac: ${v.yFrac.toFixed(3)} }`;
    const ok = await copyText(txt);
    if (!canvasCoordCopyBtn) return;
    const prev = canvasCoordCopyBtn.textContent;
    canvasCoordCopyBtn.textContent = ok ? t("coord.copyDone") : t("coord.copyFail");
    setTimeout(() => {
      if (canvasCoordCopyBtn) canvasCoordCopyBtn.textContent = prev;
    }, 650);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !coordMode) return;
    pinnedCanvasFrac = null;
    updateCanvasCoordReadout(NaN, NaN);
  });

  if (minimapTitleEl) {
    let clicks = 0;
    let lastClickMs = 0;
    minimapTitleEl.addEventListener("click", () => {
      const now = Date.now();
      if (now - lastClickMs > 900) clicks = 0;
      lastClickMs = now;
      clicks++;
      if (clicks >= 5) {
        clicks = 0;
        setCoordMode(!coordMode);
      }
    });
  }

  setCoordMode(false);
  return { isCoordMode: () => coordMode };
}
