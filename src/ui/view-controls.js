import { mountMinimapController } from "./minimap-controller.js";
import { mountCoordModeController } from "./coord-mode-controller.js";

/**
 * Mount camera/minimap/coordinate debug controls.
 *
 * @param {{
 *   board: { worldW: number; worldH: number; slotH: number; layout: string; zigzag?: { propellers?: Array<{x:number;y:number}> } };
 *   state: { mode?: string; pending?: Array<{x:number;y:number}>; marbles?: Array<{x:number;y:number}>; released?: boolean };
 *   renderer: {
 *     getViewState?: () => { cameraY: number; viewHWorld: number; cameraOverrideY?: number } | undefined;
 *     setCameraOverrideY?: (y: number) => void;
 *     clearCameraOverride?: () => void;
 *     screenToWorld: (sx: number, sy: number) => { x: number; y: number };
 *   };
 *   viewState: { tailFocusOn: boolean };
 *   minimap?: HTMLCanvasElement | null;
 *   minimapHintEl?: HTMLElement | null;
 *   minimapTitleEl?: HTMLElement | null;
 *   viewLockEl?: HTMLInputElement | null;
 *   canvas?: HTMLCanvasElement | null;
 *   canvasCoordReadoutEl?: HTMLElement | null;
 *   canvasCoordCopyBtn?: HTMLButtonElement | null;
 *   updateControls?: () => void;
 * }} opts
 */
export function mountViewControls(opts) {
  const {
    board,
    state,
    renderer,
    viewState,
    minimap,
    minimapHintEl,
    minimapTitleEl,
    viewLockEl,
    canvas,
    canvasCoordReadoutEl,
    canvasCoordCopyBtn,
    updateControls = () => {},
  } = opts;

  const minimapController = mountMinimapController({
    board,
    state,
    renderer,
    viewState,
    minimap,
    minimapHintEl,
    viewLockEl,
    updateControls,
  });

  const coordModeController = mountCoordModeController({
    board,
    renderer,
    canvas,
    canvasCoordReadoutEl,
    canvasCoordCopyBtn,
    minimapTitleEl,
  });

  return {
    drawMinimap: minimapController.drawMinimap,
    isCoordMode: coordModeController.isCoordMode,
  };
}
