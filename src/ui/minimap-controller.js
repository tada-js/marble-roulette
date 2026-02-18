/**
 * Mount minimap rendering and camera interaction controls.
 *
 * @param {{
 *   board: { worldW: number; worldH: number; slotH: number; layout: string; zigzag?: { propellers?: Array<{x:number;y:number}> } };
 *   state: { mode?: string; pending?: Array<{x:number;y:number}>; marbles?: Array<{x:number;y:number}> };
 *   renderer: {
 *     getViewState?: () => { cameraY: number; viewHWorld: number } | undefined;
 *     setCameraOverrideY?: (y: number) => void;
 *     clearCameraOverride?: () => void;
 *   };
 *   viewState: { tailFocusOn: boolean };
 *   minimap?: HTMLCanvasElement | null;
 *   minimapHintEl?: HTMLElement | null;
 *   onTailFocusChange?: (isOn: boolean) => void;
 *   updateControls?: () => void;
 }} opts
 */
export function mountMinimapController(opts) {
  const {
    board,
    state,
    renderer,
    viewState,
    minimap,
    minimapHintEl,
    onTailFocusChange = () => {},
    updateControls = () => {},
  } = opts;

  const minimapCtx = minimap?.getContext?.("2d");

  /**
   * @param {number} v
   * @param {number} a
   * @param {number} b
   */
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function drawMinimap() {
    if (!minimapCtx || !minimap) return;
    const w = minimap.width;
    const h = minimap.height;
    minimapCtx.clearRect(0, 0, w, h);

    const v = renderer.getViewState?.();
    const camY = v?.cameraY ?? 0;
    const viewH = v?.viewHWorld ?? board.worldH;
    const worldH = board.worldH;
    const worldW = board.worldW;

    minimapCtx.fillStyle = "rgba(0,0,0,0.25)";
    minimapCtx.fillRect(0, 0, w, h);
    minimapCtx.strokeStyle = "rgba(255,255,255,0.18)";
    minimapCtx.lineWidth = 1;
    minimapCtx.strokeRect(0.5, 0.5, w - 1, h - 1);

    const pad = 10;
    const trackX = pad;
    const trackW = w - pad * 2;
    const trackY = pad;
    const trackH = h - pad * 2;
    minimapCtx.fillStyle = "rgba(255,255,255,0.05)";
    minimapCtx.fillRect(trackX, trackY, trackW, trackH);

    const finishY = worldH - board.slotH;
    const finishNy = finishY / worldH;
    minimapCtx.fillStyle = "rgba(255,176,0,0.18)";
    minimapCtx.fillRect(trackX, trackY + trackH * finishNy, trackW, Math.max(2, trackH * (board.slotH / worldH)));

    const y0 = clamp(camY / worldH, 0, 1);
    const y1 = clamp((camY + viewH) / worldH, 0, 1);
    minimapCtx.strokeStyle = "rgba(69,243,195,0.9)";
    minimapCtx.lineWidth = 2;
    minimapCtx.strokeRect(trackX + 1, trackY + trackH * y0, trackW - 2, Math.max(8, trackH * (y1 - y0)));

    if (board.layout === "zigzag" && board.zigzag?.propellers?.length) {
      for (const p of board.zigzag.propellers) {
        const nx = p.x / worldW;
        const ny = p.y / worldH;
        minimapCtx.fillStyle = "rgba(255,176,0,0.95)";
        minimapCtx.fillRect(trackX + trackW * nx - 2, trackY + trackH * ny - 2, 4, 4);
      }
    }

    const all = [...(state.pending || []), ...(state.marbles || [])];
    for (const m of all) {
      const nx = m.x / worldW;
      const ny = m.y / worldH;
      const cx = trackX + trackW * nx;
      const cy = trackY + trackH * ny;
      minimapCtx.fillStyle = "rgba(255,255,255,0.85)";
      minimapCtx.beginPath();
      minimapCtx.arc(cx, cy, 2.2, 0, Math.PI * 2);
      minimapCtx.fill();
    }

    if (minimapHintEl) {
      if (state.mode !== "playing") minimapHintEl.textContent = "시작 전에도 미니맵으로 맵을 둘러볼 수 있어요.";
      else minimapHintEl.textContent = "토글 OFF: 자유 시점(미니맵으로 이동)\n토글 ON: 후미 공 자동 추적";
    }
  }

  function shouldDrawMinimap() {
    if (!minimap) return false;
    const rect = minimap.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return false;
    if (document.hidden) return false;
    return true;
  }

  function getMinimapTickMs() {
    if (document.hidden) return 520;
    if (state.mode === "playing") return 120;
    return 220;
  }

  const onPick = (e) => {
    if (!minimap) return;
    viewState.tailFocusOn = false;
    onTailFocusChange(false);
    const rect = minimap.getBoundingClientRect();
    const y = (e.clientY - rect.top) / rect.height;
    const v = renderer.getViewState?.();
    const viewH = v?.viewHWorld ?? board.worldH;
    const desired = y * board.worldH - viewH * 0.5;
    renderer.setCameraOverrideY?.(desired);
    updateControls();
  };
  const onPointerMove = (e) => {
    if (e.buttons !== 1) return;
    onPick(e);
  };

  if (minimap) {
    minimap.addEventListener("pointerdown", onPick);
    minimap.addEventListener("pointermove", onPointerMove);
  }

  let minimapTimer = 0;
  function scheduleMinimapDraw() {
    minimapTimer = window.setTimeout(() => {
      if (shouldDrawMinimap()) drawMinimap();
      scheduleMinimapDraw();
    }, getMinimapTickMs());
  }
  scheduleMinimapDraw();

  function dispose() {
    if (minimapTimer) {
      window.clearTimeout(minimapTimer);
      minimapTimer = 0;
    }
    if (!minimap) return;
    minimap.removeEventListener("pointerdown", onPick);
    minimap.removeEventListener("pointermove", onPointerMove);
  }

  return { drawMinimap, dispose };
}
