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
  setBallCount
} from "../game/engine.js";
import { makeRenderer } from "../game/render.js";
import { createGameBoard } from "../game/board-config.js";
import { createLoopController } from "../game/loop-controller.js";
import { createSessionController } from "../game/session-controller.js";
import { mountDebugHooks } from "../game/debug-hooks.js";
import { createCatalogController } from "../ui/catalog-controller.js";
import { mountViewControls } from "../ui/view-controls.js";
import { createAudioController } from "../ui/audio-controller.js";
import { createResultController } from "../ui/result-controller.js";
import { mountInquiry } from "../ui/inquiry.js";
import { mountKeyboardControls } from "../ui/keyboard-controls.js";
import { getAppElements } from "../ui/dom-elements.js";
import { setUiActions, setUiSnapshot } from "./ui-store.js";

export function bootstrapGameApp() {
  const {
    canvas,
    inquiryBtn,
    minimap,
    minimapHintEl,
    canvasCoordReadoutEl,
    canvasCoordCopyBtn,
    minimapTitleEl,

    settingsDialog,
    settingsList,
    restoreDefaultsBtn,
    addBallBtn,

    winnerDialog,
    winnerImgEl,
    winnerNameEl,

    inquiryDialog,
    inquiryForm,
    inquiryNameInput,
    inquiryEmailInput,
    inquirySubjectInput,
    inquiryMessageInput,
    inquiryMessageCountEl,
    inquiryWebsiteInput,
    inquirySendBtn,
    inquiryStatusEl,
  } = getAppElements();

  function syncVisualViewportHeight() {
    const vv = window.visualViewport;
    const h = vv?.height || window.innerHeight || document.documentElement.clientHeight;
    document.documentElement.style.setProperty("--appH", `${Math.round(h)}px`);
  }

  const board = createGameBoard();
  const state = makeGameState({ seed: 1337, board, ballsCatalog: [] });
  const renderer = makeRenderer(canvas, { board });
  const viewState = { tailFocusOn: true };

  let refreshUi = () => {};
  const catalogController = createCatalogController({
    state,
    addBallBtn,
    settingsDialog,
    settingsList,
    restoreDefaultsBtn,
    onCatalogChange: () => {
      refreshUi();
    },
  });

  function getWinnerPayloadFromState() {
    return catalogController.getWinnerPayload(state?.winner?.ballId);
  }

  const audioController = createAudioController({
    onStateChange: () => {
      refreshUi();
    },
  });

  const resultController = createResultController({
    dialog: winnerDialog,
    imageEl: winnerImgEl,
    nameEl: winnerNameEl,
    getLatestPayload: getWinnerPayloadFromState,
  });

  function isBallControlLocked() {
    return state.mode === "playing" && !state.winner;
  }

  refreshUi = () => {
    const total = getTotalSelectedCount(state);
    const inRun = state.mode === "playing" && !state.winner;
    const view = renderer.getViewState?.();

    setUiSnapshot({
      startDisabled: total <= 0,
      startLabel: inRun ? "게임 재시작" : "게임 시작",
      pauseDisabled: !inRun,
      pauseLabel: state.paused ? "이어하기" : "일시정지",
      pausePressed: !!state.paused,
      viewLockChecked: !!viewState.tailFocusOn,
      viewLockDisabled: !(state.mode === "playing" && state.released && view),
      winnerDisabled: !resultController.getLastPayload(),
      bgmOn: audioController.isOn(),
      bgmTrack: audioController.getTrack(),
      balls: catalogController.getCatalog().map((ball) => ({
        id: ball.id,
        name: ball.name,
        imageDataUrl: ball.imageDataUrl,
        count: getBallCount(state, ball.id),
        locked: isBallControlLocked(),
      })),
    });
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
      resultController.reset();
      refreshUi();
    },
    onUpdateControls: refreshUi,
    getWinnerPayload: getWinnerPayloadFromState,
    onWinnerPayload: (payload) => {
      resultController.setPayload(payload);
      refreshUi();
    },
    onShowWinner: () => {
      resultController.show();
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
      catalogController.openSettings();
    },
    openWinner: () => {
      resultController.show({ fanfare: false });
      refreshUi();
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

  const inquiry = mountInquiry({
    button: inquiryBtn,
    dialog: inquiryDialog,
    form: inquiryForm,
    nameInput: inquiryNameInput,
    emailInput: inquiryEmailInput,
    subjectInput: inquirySubjectInput,
    messageInput: inquiryMessageInput,
    messageCountEl: inquiryMessageCountEl,
    websiteInput: inquiryWebsiteInput,
    sendButton: inquirySendBtn,
    statusEl: inquiryStatusEl,
    endpoint: "/api/inquiry",
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
  inquiry.updateMessageCount();

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
