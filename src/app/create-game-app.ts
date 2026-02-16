import {
  makeGameState,
  makeRng,
  resetGame,
  snapshotForText,
  startGame,
  step,
  dropAll,
  getBallCount,
  getTotalSelectedCount,
  setBallCount,
} from "../game/engine.js";
import { makeRenderer } from "../game/render.js";
import { createGameBoard } from "../game/board-config.js";
import { createLoopController } from "../game/loop-controller.js";
import { createSessionController } from "../game/session-controller.js";
import { mountDebugHooks } from "../game/debug-hooks.js";
import { createCatalogController } from "../ui/catalog-controller.js";
import { mountViewControls } from "../ui/view-controls.js";
import { createAudioController } from "../ui/audio-controller.js";
import { validateInquiryInput, submitInquiry, showInquiryToast } from "../ui/inquiry.js";
import { playWinnerFanfare } from "../ui/result-controller.js";
import { mountKeyboardControls } from "../ui/keyboard-controls.js";
import { setUiActions, setUiSnapshot } from "./ui-store";
import type {
  InquiryField,
  InquiryForm,
  InquirySubmitResult,
  UiSnapshot,
  WinnerPayload,
} from "./ui-store";

const EMPTY_INQUIRY_FORM = Object.freeze({
  name: "",
  email: "",
  subject: "",
  message: "",
  website: "",
});

type UiLocalState = {
  settingsOpen: boolean;
  winnerOpen: boolean;
  winnerPayload: WinnerPayload | null;
  inquiryOpen: boolean;
  inquirySubmitting: boolean;
  inquiryStatus: string;
  inquiryOpenedAt: number;
  inquiryForm: InquiryForm;
};

type InquiryValidationResult =
  | {
      ok: true;
      data: {
        name: string;
        email: string;
        subject: string;
        message: string;
        website: string;
      };
    }
  | {
      ok: false;
      field: "name" | "email" | "subject" | "message";
      message: string;
    };

function fileToDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    fr.onload = () => resolve(String(fr.result || ""));
    fr.readAsDataURL(file);
  });
}

function getDomRefs() {
  const canvas = document.getElementById("game");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("게임 캔버스를 찾을 수 없습니다: #game");
  }

  const minimapEl = document.getElementById("minimap");
  const minimap = minimapEl instanceof HTMLCanvasElement ? minimapEl : null;

  const minimapHintEl = document.getElementById("minimap-hint");
  const minimapTitleEl = document.getElementById("minimap-title");
  const canvasCoordReadoutEl = document.getElementById("canvas-coord-readout");

  const canvasCoordCopyBtnEl = document.getElementById("canvas-coord-copy");
  const canvasCoordCopyBtn =
    canvasCoordCopyBtnEl instanceof HTMLButtonElement ? canvasCoordCopyBtnEl : null;

  return {
    canvas,
    minimap,
    minimapHintEl,
    minimapTitleEl,
    canvasCoordReadoutEl,
    canvasCoordCopyBtn,
  };
}

export function bootstrapGameApp() {
  const {
    canvas,
    minimap,
    minimapHintEl,
    minimapTitleEl,
    canvasCoordReadoutEl,
    canvasCoordCopyBtn,
  } = getDomRefs();

  function syncVisualViewportHeight() {
    const vv = window.visualViewport;
    const h = vv?.height || window.innerHeight || document.documentElement.clientHeight;
    document.documentElement.style.setProperty("--appH", `${Math.round(h)}px`);
  }

  const board = createGameBoard() as any;
  const state = makeGameState({ seed: 1337, board, ballsCatalog: [] }) as any;
  const renderer = makeRenderer(canvas, { board }) as any;
  const viewState = { tailFocusOn: true };

  const uiState: UiLocalState = {
    settingsOpen: false,
    winnerOpen: false,
    winnerPayload: null,
    inquiryOpen: false,
    inquirySubmitting: false,
    inquiryStatus: "",
    inquiryOpenedAt: 0,
    inquiryForm: { ...EMPTY_INQUIRY_FORM },
  };

  let refreshUi: () => void = () => {};

  const catalogController = createCatalogController({
    state,
    onCatalogChange: () => {
      refreshUi();
    },
  });

  function getWinnerPayloadFromState() {
    return catalogController.getWinnerPayload(state?.winner?.ballId) as WinnerPayload | null;
  }

  const audioController = createAudioController({
    onStateChange: () => {
      refreshUi();
    },
  });

  function isBallControlLocked() {
    return state.mode === "playing" && !state.winner;
  }

  refreshUi = () => {
    const total = getTotalSelectedCount(state);
    const inRun = state.mode === "playing" && !state.winner;
    const view = renderer.getViewState?.();

    const nextSnapshot: UiSnapshot = {
      startDisabled: total <= 0,
      startLabel: inRun ? "게임 재시작" : "게임 시작",
      pauseDisabled: !inRun,
      pauseLabel: state.paused ? "이어하기" : "일시정지",
      pausePressed: !!state.paused,
      viewLockChecked: !!viewState.tailFocusOn,
      viewLockDisabled: !(state.mode === "playing" && state.released && view),
      winnerDisabled: !uiState.winnerPayload,
      winnerOpen: uiState.winnerOpen,
      winnerPayload: uiState.winnerPayload,
      settingsOpen: uiState.settingsOpen,
      bgmOn: audioController.isOn(),
      bgmTrack: audioController.getTrack(),
      inquiryOpen: uiState.inquiryOpen,
      inquirySubmitting: uiState.inquirySubmitting,
      inquiryStatus: uiState.inquiryStatus,
      inquiryForm: { ...uiState.inquiryForm },
      balls: catalogController.getCatalog().map((ball: any) => ({
        id: ball.id,
        name: ball.name,
        imageDataUrl: ball.imageDataUrl,
        count: getBallCount(state, ball.id),
        locked: isBallControlLocked(),
      })),
    };
    setUiSnapshot(nextSnapshot);
  };

  const sessionController = createSessionController({
    state,
    renderer,
    viewState,
    getTotalSelectedCount,
    makeRng,
    startGame,
    dropAll,
    resetGame,
    onPreStart: () => {
      refreshUi();
    },
    onReset: () => {
      uiState.winnerOpen = false;
      uiState.winnerPayload = null;
      refreshUi();
    },
    onUpdateControls: refreshUi,
    getWinnerPayload: getWinnerPayloadFromState,
    onWinnerPayload: (payload: WinnerPayload) => {
      uiState.winnerPayload = payload;
      refreshUi();
    },
    onShowWinner: () => {
      if (!uiState.winnerPayload) {
        uiState.winnerPayload = getWinnerPayloadFromState();
      }
      if (uiState.winnerPayload) {
        playWinnerFanfare();
        uiState.winnerOpen = true;
      }
      refreshUi();
    },
  });

  setUiActions({
    handleStartClick: () => {
      sessionController.handleStartClick();
      refreshUi();
    },
    togglePause: () => {
      sessionController.togglePause();
      refreshUi();
    },
    openSettings: () => {
      uiState.settingsOpen = true;
      refreshUi();
    },
    closeSettings: () => {
      uiState.settingsOpen = false;
      refreshUi();
    },
    addCatalogBall: () => {
      if (isBallControlLocked()) return false;
      const changed = catalogController.addNextBall();
      refreshUi();
      return changed;
    },
    removeCatalogBall: (ballId) => {
      if (isBallControlLocked()) return false;
      const changed = catalogController.removeBall(ballId);
      refreshUi();
      return changed;
    },
    restoreDefaultCatalog: () => {
      if (isBallControlLocked()) return false;
      catalogController.restoreDefaults();
      refreshUi();
      return true;
    },
    setCatalogBallName: (ballId, name) => {
      if (isBallControlLocked()) return false;
      const changed = catalogController.updateBallName(ballId, name);
      refreshUi();
      return changed;
    },
    setCatalogBallImage: async (ballId, file) => {
      if (isBallControlLocked()) return false;
      if (!(file instanceof File)) return false;
      const dataUrl = await fileToDataUrl(file);
      const changed = catalogController.updateBallImage(ballId, dataUrl);
      refreshUi();
      return changed;
    },
    openWinner: () => {
      if (!uiState.winnerPayload) {
        uiState.winnerPayload = getWinnerPayloadFromState();
      }
      if (!uiState.winnerPayload) return false;
      uiState.winnerOpen = true;
      refreshUi();
      return true;
    },
    closeWinner: () => {
      uiState.winnerOpen = false;
      refreshUi();
    },
    openInquiry: () => {
      uiState.inquiryOpen = true;
      uiState.inquirySubmitting = false;
      uiState.inquiryStatus = "";
      uiState.inquiryOpenedAt = Date.now();
      uiState.inquiryForm = { ...EMPTY_INQUIRY_FORM };
      refreshUi();
    },
    closeInquiry: () => {
      uiState.inquiryOpen = false;
      uiState.inquirySubmitting = false;
      uiState.inquiryStatus = "";
      refreshUi();
    },
    setInquiryField: (field: InquiryField, value: string) => {
      if (!Object.prototype.hasOwnProperty.call(uiState.inquiryForm, field)) return false;
      uiState.inquiryForm = {
        ...uiState.inquiryForm,
        [field]: String(value || ""),
      };
      refreshUi();
      return true;
    },
    submitInquiry: async (): Promise<InquirySubmitResult> => {
      if (uiState.inquirySubmitting) {
        return { ok: false, message: "이미 전송 중입니다." };
      }

      const validated = validateInquiryInput(uiState.inquiryForm) as InquiryValidationResult;
      if (!validated.ok) {
        uiState.inquiryStatus = validated.message;
        refreshUi();
        return { ok: false, field: validated.field, message: validated.message };
      }

      uiState.inquirySubmitting = true;
      uiState.inquiryStatus = "전송 중...";
      refreshUi();

      try {
        const result = (await submitInquiry({
          ...validated.data,
          openedAt: uiState.inquiryOpenedAt || Date.now(),
        })) as { ok: boolean; message: string };

        if (!result.ok) {
          uiState.inquiryStatus = result.message;
          showInquiryToast(result.message, "error", 2600);
          return { ok: false, message: result.message };
        }

        uiState.inquiryOpen = false;
        uiState.inquiryStatus = "";
        uiState.inquiryOpenedAt = 0;
        uiState.inquiryForm = { ...EMPTY_INQUIRY_FORM };
        showInquiryToast("메일 전송 완료");
        return { ok: true };
      } catch {
        const message = "네트워크 오류가 발생했습니다.";
        uiState.inquiryStatus = message;
        showInquiryToast("네트워크 오류", "error", 2600);
        return { ok: false, message };
      } finally {
        uiState.inquirySubmitting = false;
        refreshUi();
      }
    },
    toggleBgm: () => {
      audioController.toggle({ autoplay: true });
      refreshUi();
    },
    setBgmTrack: (track) => {
      audioController.setTrack(track, { autoplay: true });
      refreshUi();
    },
    toggleViewLock: (isOn) => {
      const v = renderer.getViewState?.();
      if (!v) return;
      viewState.tailFocusOn = !!isOn;
      if (viewState.tailFocusOn) renderer.clearCameraOverride?.();
      else renderer.setCameraOverrideY?.(v.cameraY);
      refreshUi();
    },
    setBallCount: (ballId, nextValue) => {
      if (isBallControlLocked()) return;
      setBallCount(state, ballId, nextValue);
      catalogController.saveCounts(state.counts || {});
      refreshUi();
    },
    adjustBallCount: (ballId, delta) => {
      if (isBallControlLocked()) return;
      setBallCount(state, ballId, getBallCount(state, ballId) + delta);
      catalogController.saveCounts(state.counts || {});
      refreshUi();
    },
  });

  mountKeyboardControls({
    getMode: () => state.mode,
    tryStart: sessionController.tryStart,
  });

  const loopController = createLoopController({
    state,
    stepFn: step,
    renderer,
    getBallsCatalog: catalogController.getCatalog,
    getImagesById: catalogController.getImagesById,
    onAfterFrame: sessionController.onAfterFrame,
    syncViewportHeight: syncVisualViewportHeight,
  });

  mountDebugHooks({
    state,
    renderer,
    snapshotForText,
    tickFixed: loopController.tickFixed,
  });

  loopController.mountResizeListeners();
  syncVisualViewportHeight();
  loopController.scheduleResize();

  mountViewControls({
    board,
    state,
    renderer,
    viewState,
    minimap,
    minimapHintEl,
    minimapTitleEl,
    onTailFocusChange: (isOn) => {
      viewState.tailFocusOn = !!isOn;
      refreshUi();
    },
    canvas,
    canvasCoordReadoutEl,
    canvasCoordCopyBtn,
    updateControls: refreshUi,
  });

  loopController.startAnimationLoop();

  audioController.restoreFromStorage();
  refreshUi();

  return {
    refreshUi,
  };
}
