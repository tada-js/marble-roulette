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
import { mountAppControls } from "../ui/app-controls.js";
import { createAudioController } from "../ui/audio-controller.js";
import { createResultController } from "../ui/result-controller.js";
import { createBallListController } from "../ui/ball-list-controller.js";
import { createControlPanelController } from "../ui/control-panel-controller.js";
import { getAppElements } from "../ui/dom-elements.js";

export function bootstrapGameApp() {
  const {
    canvas,
    startBtn,
    pauseBtn,
    settingsBtn,
    inquiryBtn,
    bgmBtn,
    bgmSettingsBtn,
    bgmMenu,
    winnerBtn,
    ballsEl,
    minimap,
    viewLockEl,
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
    // Mobile browsers: 100vh often includes dynamic browser chrome; use the visual viewport height instead.
    const vv = window.visualViewport;
    const h = vv?.height || window.innerHeight || document.documentElement.clientHeight;
    document.documentElement.style.setProperty("--appH", `${Math.round(h)}px`);
  }

  const board = createGameBoard();
  const state = makeGameState({ seed: 1337, board, ballsCatalog: [] });
  const renderer = makeRenderer(canvas, { board });
  // View mode:
  // - OFF: free view (minimap sets a manual camera override)
  // - ON: tail focus (auto-follow the straggler)
  const viewState = { tailFocusOn: true };
  let ballListController = null;
  const catalogController = createCatalogController({
    state,
    addBallBtn,
    settingsDialog,
    settingsList,
    restoreDefaultsBtn,
    onCatalogChange: () => {
      ballListController?.render();
    },
  });

  const { updateControls } = createControlPanelController({
    startBtn,
    pauseBtn,
    viewLockEl,
    state,
    viewState,
    renderer,
    getTotalSelectedCount,
  });

  ballListController = createBallListController({
    container: ballsEl,
    state,
    getCatalog: catalogController.getCatalog,
    getBallCount,
    setBallCount,
    saveCounts: catalogController.saveCounts,
    onChange: updateControls,
  });
  ballListController.render();

  function getWinnerPayloadFromState() {
    return catalogController.getWinnerPayload(state?.winner?.ballId);
  }

  const audioController = createAudioController({
    button: bgmBtn,
    settingsButton: bgmSettingsBtn,
    menu: bgmMenu,
  });
  const resultController = createResultController({
    dialog: winnerDialog,
    imageEl: winnerImgEl,
    nameEl: winnerNameEl,
    button: winnerBtn,
    getLatestPayload: getWinnerPayloadFromState,
  });
  const sessionController = createSessionController({
    state,
    renderer,
    viewState,
    viewLockEl,
    getTotalSelectedCount,
    makeRng,
    startGame,
    dropAll,
    resetGame,
    onPreStart: () => {
      ballListController.render(); // disable +/- while playing
    },
    onReset: () => {
      resultController.reset();
    },
    onUpdateControls: updateControls,
    getWinnerPayload: getWinnerPayloadFromState,
    onWinnerPayload: (payload) => {
      resultController.setPayload(payload);
    },
    onShowWinner: () => {
      resultController.show();
    },
  });

  const { inquiry } = mountAppControls({
    state,
    startBtn,
    pauseBtn,
    settingsBtn,
    bgmBtn,
    winnerBtn,
    catalogController,
    audioController,
    resultController,
    sessionController,
    inquiryOptions: {
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
    },
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
    viewLockEl,
    canvas,
    canvasCoordReadoutEl,
    canvasCoordCopyBtn,
    updateControls,
  });

  // Animation loop for interactive play. `advanceTime()` overrides are for automation.
  loopController.startAnimationLoop();

  // Init persisted BGM.
  audioController.restoreFromStorage();
}
