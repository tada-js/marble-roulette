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
} from "../game/engine.ts";
import {
  getBallLibrary,
  getDefaultBalls,
  buildSystemBallImageDataUrl,
  isSystemBallAvatarUrl,
} from "../game/assets.ts";
import { makeRenderer } from "../game/render.ts";
import { createGameBoard } from "../game/board-config.ts";
import { createLoopController } from "../game/loop-controller.ts";
import { createSessionController } from "../game/session-controller.ts";
import { mountDebugHooks } from "../game/debug-hooks.ts";
import { computeFinishTriggerRemaining } from "../game/finish-tension.ts";
import { createCatalogController } from "../ui/catalog-controller.js";
import { mountViewControls } from "../ui/view-controls.js";
import { createAudioController } from "../ui/audio-controller.js";
import { validateInquiryInput, submitInquiry, showInquiryToast } from "../ui/inquiry.js";
import { playWinnerFanfare } from "../ui/result-controller.js";
import { mountKeyboardControls } from "../ui/keyboard-controls.js";
import { clampResultCount, selectLastFinishers } from "./ui-selectors";
import {
  getDataUrlMimeType,
  isAllowedUploadImageMimeType,
  validateUploadImageFile,
} from "./image-upload-policy";
import { setUiActions, setUiSnapshot } from "./ui-store";
import { ANALYTICS_EVENTS, trackAnalyticsEvent } from "./analytics";
import { createArrivalTimingTracker } from "./arrival-timing-tracker";
import {
  getDefaultStartCaption,
  getStatusLabelByTone,
  clamp,
  deriveStatusTone,
  getFinishTempoMultiplier,
  getFinishTensionSnapshot,
  getParticipantCount,
  getWinnerCountMax,
  sanitizeBallName,
  sanitizeStartCaption,
} from "./game-flow-selectors";
import {
  getCurrentLanguage,
  subscribeLanguage,
  t,
  type Language,
} from "../i18n/runtime";
import {
  buildIdleResultState,
  buildResultItems,
  buildResultStateFromItems,
  closeResultPresentation,
  completeSpinResultPresentation,
  type ResultPresentationState,
} from "./result-presentation";
import type {
  AudioActions,
  CatalogSettingsActions,
  GameConfigActions,
  InquiryField,
  InquiryForm,
  InquiryActions,
  InquirySubmitResult,
  ResultUiItem,
  ResultActions,
  RunActions,
  UiSnapshot,
} from "./ui-store";

const EMPTY_INQUIRY_FORM = Object.freeze({
  email: "",
  subject: "",
  message: "",
  website: "",
});

type UiLocalState = {
  settingsOpen: boolean;
  settingsDirty: boolean;
  settingsConfirmOpen: boolean;
  settingsDraft: CatalogDraftItem[] | null;
  winnerCount: number;
  winnerCountWasClamped: boolean;
  startCaption: string;
  resultState: ResultPresentationState;
  inquiryOpen: boolean;
  inquirySubmitting: boolean;
  inquiryStatus: string;
  inquiryOpenedAt: number;
  inquiryForm: InquiryForm;
  speedMultiplier: number;
};

type InquiryValidationResult =
  | {
      ok: true;
      data: {
        email: string;
        subject: string;
        message: string;
        website: string;
      };
    }
  | {
      ok: false;
      field: "email" | "subject" | "message";
      message: string;
    };

type CatalogDraftItem = {
  id: string;
  name: string;
  imageDataUrl: string;
  tint: string;
};
const LOOP_SPEED_BLEND_RATIO = 0.3;
const LOOP_SPEED_EPSILON = 0.002;

function fileToDataUrl(file: File): Promise<string> {
  const validation = validateUploadImageFile(file);
  if (!validation.ok) {
    return Promise.reject(new Error(validation.message));
  }
  return new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error(t("error.fileRead")));
    fr.onload = () => resolve(String(fr.result || ""));
    fr.readAsDataURL(file);
  });
}

function isDataImageUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith("data:image/")) return false;
  const mime = getDataUrlMimeType(value);
  return isAllowedUploadImageMimeType(mime);
}

function cloneCatalogForDraft(input: unknown[]): CatalogDraftItem[] {
  return input.map((ball) => {
    const item = ball as {
      id?: unknown;
      name?: unknown;
      imageDataUrl?: unknown;
      tint?: unknown;
    };
    return {
      id: String(item.id || ""),
      name: String(item.name || ""),
      imageDataUrl: String(item.imageDataUrl || ""),
      tint: typeof item.tint === "string" ? item.tint : "#ffffff",
    };
  });
}

function catalogFingerprint(input: CatalogDraftItem[]): string {
  return JSON.stringify(
    input.map((ball) => ({
      id: ball.id,
      name: ball.name,
      imageDataUrl: ball.imageDataUrl,
      tint: ball.tint,
    }))
  );
}

function reorderCatalogDraft(
  draft: CatalogDraftItem[],
  sourceBallId: string,
  targetBallId: string
): CatalogDraftItem[] | null {
  if (!sourceBallId || !targetBallId || sourceBallId === targetBallId) return null;

  const sourceIndex = draft.findIndex((ball) => ball.id === sourceBallId);
  const targetIndex = draft.findIndex((ball) => ball.id === targetBallId);
  if (sourceIndex < 0 || targetIndex < 0) return null;

  const next = draft.slice();
  const [moved] = next.splice(sourceIndex, 1);
  if (!moved) return null;
  next.splice(targetIndex, 0, moved);
  return next;
}

function toResultCopyText(items: ResultUiItem[]): string {
  if (!items.length) return "";
  return items.map((item) => `${item.rank}. ${item.name}`).join("\n");
}

async function copyTextWithFallback(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below.
  }

  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "true");
    area.style.position = "fixed";
    area.style.top = "-9999px";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.focus();
    area.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(area);
    return !!copied;
  } catch {
    return false;
  }
}

function getDomRefs() {
  const canvas = document.getElementById("game");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error(t("error.canvasMissing", { selector: "#game" }));
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
    settingsDirty: false,
    settingsConfirmOpen: false,
    settingsDraft: null,
    winnerCount: 1,
    winnerCountWasClamped: false,
    startCaption: getDefaultStartCaption(),
    resultState: buildIdleResultState(1),
    inquiryOpen: false,
    inquirySubmitting: false,
    inquiryStatus: "",
    inquiryOpenedAt: 0,
    inquiryForm: { ...EMPTY_INQUIRY_FORM },
    speedMultiplier: 1,
  };
  let currentLanguage: Language = getCurrentLanguage();

  let refreshUi: () => void = () => {};
  let applyLoopSpeed = (_speedMultiplier: number): void => {};
  let appliedLoopSpeed = uiState.speedMultiplier;
  let lastFrameUiRefreshAt = 0;
  let lastFrameUiSignature = "";
  const arrivalTimingTracker = createArrivalTimingTracker();

  const FRAME_UI_THROTTLE_MS = 96;

  const catalogController = createCatalogController({
    state,
    onCatalogChange: () => {
      refreshUi();
    },
  });
  catalogController.relocalizeCatalog?.(currentLanguage);

  const audioController = createAudioController({
    onStateChange: () => {
      refreshUi();
    },
  });

  function getWinnerCountMaxForState() {
    return getWinnerCountMax(state.totalToDrop, getTotalSelectedCount(state));
  }

  function syncFinishTriggerRemaining() {
    const participantCount = getParticipantCount(state.totalToDrop, getTotalSelectedCount(state));
    const winnerCount = clampResultCount(uiState.winnerCount, Math.max(1, participantCount));
    state.finishTriggerRemaining = computeFinishTriggerRemaining(participantCount, winnerCount);
  }

  function isBallControlLocked() {
    return state.mode === "playing" && !state.winner;
  }

  function getFinishTempoMultiplierForState(baseMultiplier: number): number {
    const snapshot = getFinishTensionSnapshot({
      mode: state.mode,
      hasWinner: !!state.winner,
      released: !!state.released,
      totalToDrop: Number(state.totalToDrop) || 0,
      finishedCount: state.finished.length,
      finishTriggerRemaining: Number(state.finishTriggerRemaining) || 0,
      marbles: state.marbles,
      worldH: state.board.worldH,
    });
    return getFinishTempoMultiplier(baseMultiplier, snapshot);
  }

  function syncLoopSpeed(force = false) {
    const targetSpeed = getFinishTempoMultiplierForState(uiState.speedMultiplier);
    const nextSpeed = force
      ? targetSpeed
      : appliedLoopSpeed + (targetSpeed - appliedLoopSpeed) * LOOP_SPEED_BLEND_RATIO;
    if (!force && Math.abs(nextSpeed - appliedLoopSpeed) < LOOP_SPEED_EPSILON) return;
    appliedLoopSpeed = nextSpeed;
    applyLoopSpeed(appliedLoopSpeed);
  }

  function closeResultModalPresentation() {
    uiState.resultState = closeResultPresentation(uiState.resultState);
  }

  function resetResultHistory() {
    uiState.resultState = buildIdleResultState(uiState.winnerCount);
  }

  function completeResultSpin() {
    const nextState = completeSpinResultPresentation(uiState.resultState);
    if (nextState === uiState.resultState) return;
    uiState.resultState = nextState;
    playWinnerFanfare();
  }

  function trackGameStartEvent(restartedFromRun: boolean) {
    const participantCount = getParticipantCount(state.totalToDrop, getTotalSelectedCount(state));
    const winnerCount = clampResultCount(uiState.winnerCount, participantCount);
    trackAnalyticsEvent(ANALYTICS_EVENTS.gameStart, {
      participantCount,
      winnerCount,
      speedMultiplier: uiState.speedMultiplier,
      restartedFromRun,
    });
  }

  function trackResultOpenEvent(source: "auto" | "manual") {
    const selectedCount = uiState.resultState.items.length;
    if (!selectedCount) return;
    const participantCount = getParticipantCount(state.totalToDrop, getTotalSelectedCount(state));
    trackAnalyticsEvent(ANALYTICS_EVENTS.resultOpen, {
      source,
      selectedCount,
      requestedCount: uiState.resultState.requestedCount,
      participantCount,
    });
  }

  function prepareAndOpenResultReveal() {
    if (!state.totalToDrop || !state.finished.length) return;
    arrivalTimingTracker.capture({
      nowMs: performance.now(),
      simNow: Number(state.t) || 0,
      finished: state.finished,
    });
    const selected = selectLastFinishers(state.finished, uiState.winnerCount, state.totalToDrop);
    const items = buildResultItems({
      selected,
      getWinnerPayload: (ballId) => catalogController.getWinnerPayload(ballId),
      getArrivalTimeSeconds: (entry) => arrivalTimingTracker.getArrivalSeconds(entry),
    });
    uiState.resultState = buildResultStateFromItems(items, uiState.winnerCount);
    trackResultOpenEvent("auto");
  }

  function getLiveCatalogForDraft() {
    return cloneCatalogForDraft(catalogController.getCatalog() as unknown[]);
  }

  function getLiveCatalogView() {
    return catalogController.getCatalog() as unknown as CatalogDraftItem[];
  }

  function ensureSettingsDraft() {
    if (!uiState.settingsDraft) {
      uiState.settingsDraft = getLiveCatalogForDraft();
    }
    return uiState.settingsDraft;
  }

  function recalcSettingsDirty() {
    if (!uiState.settingsDraft) {
      uiState.settingsDirty = false;
      return;
    }
    uiState.settingsDirty =
      catalogFingerprint(uiState.settingsDraft) !== catalogFingerprint(getLiveCatalogForDraft());
  }

  function closeSettingsEditor() {
    uiState.settingsOpen = false;
    uiState.settingsDirty = false;
    uiState.settingsConfirmOpen = false;
    uiState.settingsDraft = null;
  }

  function refreshUiFromFrame() {
    syncFinishTriggerRemaining();
    syncLoopSpeed();
    const now = performance.now();
    arrivalTimingTracker.capture({
      nowMs: now,
      simNow: Number(state.t) || 0,
      finished: state.finished,
    });
    const inRun = state.mode === "playing" && !state.winner;
    const remainingToFinish = inRun ? Math.max(0, (Number(state.totalToDrop) || 0) - state.finished.length) : -1;
    const winnerT = state.winner ? Number(state.winner.t.toFixed(4)) : -1;
    const signature = `${state.mode}|${state.paused ? 1 : 0}|${remainingToFinish}|${winnerT}`;

    if (signature === lastFrameUiSignature && now - lastFrameUiRefreshAt < FRAME_UI_THROTTLE_MS) return;
    lastFrameUiSignature = signature;
    lastFrameUiRefreshAt = now;
    refreshUi();
  }

  refreshUi = () => {
    syncFinishTriggerRemaining();
    const total = getTotalSelectedCount(state);
    const inRun = state.mode === "playing" && !state.winner;
    const remainingToFinish = inRun ? Math.max(0, (Number(state.totalToDrop) || 0) - state.finished.length) : 0;
    const view = renderer.getViewState?.();
    const visibleCatalog = uiState.settingsOpen ? ensureSettingsDraft() : getLiveCatalogView();
    const winnerCountMax = getWinnerCountMaxForState();
    const clampedWinnerCount = clampResultCount(uiState.winnerCount, winnerCountMax);
    if (clampedWinnerCount !== uiState.winnerCount) {
      uiState.winnerCount = clampedWinnerCount;
    }
    const statusTone = deriveStatusTone(state);
    const statusLabel = getStatusLabelByTone(statusTone);

    const nextSnapshot: UiSnapshot = {
      startDisabled: total <= 0,
      startLabel: inRun ? t("game.restart") : t("game.start"),
      pauseDisabled: !inRun,
      pauseLabel: state.paused ? t("game.resume") : t("game.pause"),
      pausePressed: !!state.paused,
      statusLabel,
      statusTone,
      statusRemainingCount: inRun ? remainingToFinish : null,
      lastFewRemaining: remainingToFinish > 0 && remainingToFinish <= 3 ? remainingToFinish : 0,
      viewLockChecked: !!viewState.tailFocusOn,
      viewLockDisabled: !(state.mode === "playing" && state.released && view),
      resultDisabled: uiState.resultState.items.length <= 0,
      winnerCount: uiState.winnerCount,
      winnerCountMax,
      winnerCountWasClamped: uiState.winnerCountWasClamped,
      startCaption: uiState.startCaption,
      resultState: {
        open: uiState.resultState.open,
        phase: uiState.resultState.phase,
        requestedCount: uiState.resultState.requestedCount,
        effectiveCount: uiState.resultState.effectiveCount,
        items: uiState.resultState.items.map((item) => ({ ...item })),
      },
      settingsOpen: uiState.settingsOpen,
      settingsDirty: uiState.settingsDirty,
      settingsConfirmOpen: uiState.settingsConfirmOpen,
      bgmOn: audioController.isOn(),
      bgmTrack: audioController.getTrack(),
      inquiryOpen: uiState.inquiryOpen,
      inquirySubmitting: uiState.inquirySubmitting,
      inquiryStatus: uiState.inquiryStatus,
      inquiryForm: { ...uiState.inquiryForm },
      speedMultiplier: uiState.speedMultiplier,
      balls: visibleCatalog.map((ball: CatalogDraftItem) => ({
        id: ball.id,
        name: ball.name,
        imageDataUrl: ball.imageDataUrl,
        count: Number.isFinite(state.counts?.[ball.id])
          ? Math.max(1, Math.min(99, Number(state.counts[ball.id]) || 1))
          : 1,
        locked: isBallControlLocked(),
      })),
    };
    renderer.setStartCaption?.(uiState.startCaption);
    setUiSnapshot(nextSnapshot);
  };

  const unsubscribeLanguage = subscribeLanguage(() => {
    const nextLanguage = getCurrentLanguage();
    const previousDefaultCaption = getDefaultStartCaption(currentLanguage);
    const nextDefaultCaption = getDefaultStartCaption(nextLanguage);
    if (uiState.startCaption === previousDefaultCaption) {
      uiState.startCaption = nextDefaultCaption;
    }
    catalogController.relocalizeCatalog?.(nextLanguage);
    currentLanguage = nextLanguage;
    refreshUi();
  });

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
      arrivalTimingTracker.reset();
      uiState.winnerCountWasClamped = false;
      resetResultHistory();
      syncLoopSpeed(true);
      refreshUi();
    },
    onUpdateControls: refreshUiFromFrame,
    onShowWinner: () => {
      prepareAndOpenResultReveal();
      syncLoopSpeed(true);
      refreshUi();
    },
  });

  const runActions: RunActions = {
    handleStartClick: () => {
      const wasInRun = state.mode === "playing" && !state.winner;
      closeResultModalPresentation();
      resetResultHistory();
      uiState.winnerCountWasClamped = false;
      sessionController.handleStartClick();
      if (state.mode === "playing" && state.released) {
        arrivalTimingTracker.begin(performance.now(), Number(state.t) || 0);
        trackGameStartEvent(wasInRun);
      }
      syncLoopSpeed(true);
      refreshUi();
    },
    prepareRestartForCountdown: () => {
      sessionController.prepareRestartForCountdown();
      syncLoopSpeed(true);
      refreshUi();
    },
    stopRunNow: () => {
      const inRun = state.mode === "playing" && !state.winner;
      if (!inRun) return false;
      sessionController.prepareRestartForCountdown();
      syncLoopSpeed(true);
      refreshUi();
      return true;
    },
    togglePause: () => {
      sessionController.togglePause();
      refreshUi();
    },
    toggleSpeedMode: () => {
      const next = uiState.speedMultiplier >= 2 ? 1 : 2;
      uiState.speedMultiplier = next;
      syncLoopSpeed(true);
      refreshUi();
    },
  };

  const gameConfigActions: GameConfigActions = {
    setWinnerCount: (nextValue) => {
      if (isBallControlLocked()) return;
      const raw = Math.floor(Number(nextValue) || 1);
      const max = getWinnerCountMaxForState();
      const clamped = clampResultCount(raw, max);
      uiState.winnerCount = clamped;
      uiState.winnerCountWasClamped = raw !== clamped;
      refreshUi();
    },
    setStartCaption: (value) => {
      const nextValue = sanitizeStartCaption(value);
      if (nextValue === uiState.startCaption) return;
      uiState.startCaption = nextValue;
      refreshUi();
    },
    toggleViewLock: (isOn) => {
      const view = renderer.getViewState?.();
      if (!view) return;
      viewState.tailFocusOn = !!isOn;
      if (viewState.tailFocusOn) renderer.clearCameraOverride?.();
      else renderer.setCameraOverrideY?.(view.cameraY);
      refreshUi();
    },
    setBallCount: (ballId, nextValue) => {
      if (isBallControlLocked()) return;
      setBallCount(state, ballId, nextValue);
      catalogController.saveCounts(state.counts || {});
      uiState.winnerCountWasClamped = false;
      refreshUi();
    },
    adjustBallCount: (ballId, delta) => {
      if (isBallControlLocked()) return;
      setBallCount(state, ballId, getBallCount(state, ballId) + delta);
      catalogController.saveCounts(state.counts || {});
      uiState.winnerCountWasClamped = false;
      refreshUi();
    },
  };

  const catalogSettingsActions: CatalogSettingsActions = {
    openSettings: () => {
      uiState.settingsOpen = true;
      uiState.settingsDirty = false;
      uiState.settingsConfirmOpen = false;
      uiState.settingsDraft = getLiveCatalogForDraft();
      refreshUi();
    },
    closeSettings: () => {
      if (!uiState.settingsOpen) return;
      if (uiState.settingsDirty) {
        uiState.settingsOpen = false;
        uiState.settingsConfirmOpen = true;
        refreshUi();
        return;
      }
      closeSettingsEditor();
      refreshUi();
    },
    applySettings: () => {
      if (!uiState.settingsOpen || !uiState.settingsDraft || !uiState.settingsDirty) return false;
      const changed = catalogController.replaceCatalog(uiState.settingsDraft);
      uiState.settingsDraft = getLiveCatalogForDraft();
      uiState.settingsDirty = false;
      uiState.settingsConfirmOpen = false;
      refreshUi();
      return !!changed;
    },
    confirmDiscardSettings: () => {
      closeSettingsEditor();
      refreshUi();
    },
    cancelDiscardSettings: () => {
      if (!uiState.settingsConfirmOpen) return;
      uiState.settingsConfirmOpen = false;
      uiState.settingsOpen = true;
      refreshUi();
    },
    addCatalogBall: () => {
      if (!uiState.settingsOpen || isBallControlLocked()) return false;
      const draft = ensureSettingsDraft();
      const library = getBallLibrary();
      if (draft.length >= library.length) return false;
      const used = new Set(draft.map((ball) => ball.id));
      const nextBall = library.find((ball) => !used.has(ball.id));
      if (!nextBall) return false;
      uiState.settingsDraft = [...draft, structuredClone(nextBall)];
      recalcSettingsDirty();
      refreshUi();
      return true;
    },
    removeCatalogBall: (ballId) => {
      if (!uiState.settingsOpen || isBallControlLocked()) return false;
      const draft = ensureSettingsDraft();
      if (draft.length <= 1) return false;
      const next = draft.filter((ball) => ball.id !== ballId);
      if (next.length === draft.length) return false;
      uiState.settingsDraft = next;
      recalcSettingsDirty();
      refreshUi();
      return true;
    },
    reorderCatalogBall: (sourceBallId, targetBallId) => {
      if (isBallControlLocked()) return false;
      if (uiState.settingsOpen) {
        const draft = ensureSettingsDraft();
        const next = reorderCatalogDraft(draft, sourceBallId, targetBallId);
        if (!next) return false;
        uiState.settingsDraft = next;
        recalcSettingsDirty();
        refreshUi();
        return true;
      }

      const live = getLiveCatalogView();
      const next = reorderCatalogDraft(live, sourceBallId, targetBallId);
      if (!next) return false;
      const changed = catalogController.replaceCatalog(next);
      if (!changed) return false;
      refreshUi();
      return true;
    },
    restoreDefaultCatalog: () => {
      if (!uiState.settingsOpen || isBallControlLocked()) return false;
      uiState.settingsDraft = structuredClone(getDefaultBalls());
      recalcSettingsDirty();
      refreshUi();
      return true;
    },
    setCatalogBallName: (ballId, name) => {
      if (!uiState.settingsOpen || isBallControlLocked()) return false;
      const draft = ensureSettingsDraft();
      const idx = draft.findIndex((ball) => ball.id === ballId);
      if (idx < 0) return false;
      const target = draft[idx];
      const nextName = sanitizeBallName(name, target.name);
      const shouldSyncAvatar = isSystemBallAvatarUrl(target.imageDataUrl);
      const nextImageDataUrl = shouldSyncAvatar
        ? buildSystemBallImageDataUrl({
            ballId: target.id,
            name: nextName,
            fallbackImageDataUrl: target.imageDataUrl,
            tint: target.tint,
          })
        : target.imageDataUrl;

      if (nextName === target.name && nextImageDataUrl === target.imageDataUrl) return false;
      const next = draft.slice();
      next[idx] = {
        ...target,
        name: nextName,
        imageDataUrl: nextImageDataUrl,
      };
      uiState.settingsDraft = next;
      recalcSettingsDirty();
      refreshUi();
      return true;
    },
    setCatalogBallImage: async (ballId, file) => {
      if (!uiState.settingsOpen || isBallControlLocked()) return false;
      if (!(file instanceof File)) return false;
      let dataUrl = "";
      try {
        dataUrl = await fileToDataUrl(file);
      } catch (err) {
        const message = err instanceof Error && err.message ? err.message : t("error.uploadFailed");
        showInquiryToast(message, "error", 2200);
        refreshUi();
        return false;
      }
      if (!isDataImageUrl(dataUrl)) return false;
      const draft = ensureSettingsDraft();
      const idx = draft.findIndex((ball) => ball.id === ballId);
      if (idx < 0) return false;
      const target = draft[idx];
      if (target.imageDataUrl === dataUrl) return false;
      const next = draft.slice();
      next[idx] = { ...target, imageDataUrl: dataUrl };
      uiState.settingsDraft = next;
      recalcSettingsDirty();
      refreshUi();
      return true;
    },
  };

  const resultActions: ResultActions = {
    openResultModal: () => {
      if (!uiState.resultState.items.length) return false;
      const wasOpen = uiState.resultState.open;
      uiState.resultState.open = true;
      if (!wasOpen) trackResultOpenEvent("manual");
      refreshUi();
      return true;
    },
    closeResultModal: () => {
      closeResultModalPresentation();
      refreshUi();
    },
    skipResultReveal: () => {
      if (uiState.resultState.phase !== "spinning") return;
      completeResultSpin();
      refreshUi();
    },
    completeResultSpin: () => {
      if (uiState.resultState.phase !== "spinning") return;
      completeResultSpin();
      refreshUi();
    },
    copyResults: async () => {
      const text = toResultCopyText(uiState.resultState.items);
      if (!text) return false;
      const copied = await copyTextWithFallback(text);
      if (copied) {
        trackAnalyticsEvent(ANALYTICS_EVENTS.resultCopy, {
          selectedCount: uiState.resultState.items.length,
          requestedCount: uiState.resultState.requestedCount,
        });
        showInquiryToast(t("toast.resultCopied"), "success", 1800);
      } else {
        showInquiryToast(t("toast.resultCopyFailed"), "error", 2200);
      }
      refreshUi();
      return copied;
    },
    restartFromResult: () => {
      closeResultModalPresentation();
      resetResultHistory();
      uiState.winnerCountWasClamped = false;
      sessionController.handleStartClick();
      syncLoopSpeed(true);
      refreshUi();
    },
  };

  const inquiryActions: InquiryActions = {
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
        return { ok: false, message: t("inquiry.alreadySubmitting") };
      }

      const validated = validateInquiryInput(uiState.inquiryForm) as InquiryValidationResult;
      if (!validated.ok) {
        uiState.inquiryStatus = validated.message;
        refreshUi();
        return { ok: false, field: validated.field, message: validated.message };
      }

      uiState.inquirySubmitting = true;
      uiState.inquiryStatus = t("inquiry.sendingStatus");
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
        showInquiryToast(t("inquiry.sendDone"));
        return { ok: true };
      } catch {
        const message = t("error.network");
        uiState.inquiryStatus = message;
        showInquiryToast(t("toast.networkError"), "error", 2600);
        return { ok: false, message };
      } finally {
        uiState.inquirySubmitting = false;
        refreshUi();
      }
    },
  };

  const audioActions: AudioActions = {
    toggleBgm: () => {
      audioController.toggle({ autoplay: true });
      refreshUi();
    },
    setBgmTrack: (track) => {
      audioController.setTrack(track, { autoplay: true });
      refreshUi();
    },
  };

  setUiActions({
    ...runActions,
    ...gameConfigActions,
    ...catalogSettingsActions,
    ...resultActions,
    ...inquiryActions,
    ...audioActions,
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
    initialSpeedMultiplier: uiState.speedMultiplier,
  });
  applyLoopSpeed = (speedMultiplier) => {
    loopController.setSpeedMultiplier(speedMultiplier);
  };
  syncLoopSpeed(true);

  mountDebugHooks({
    state,
    renderer,
    snapshotForText,
    tickFixed: loopController.tickFixed,
  });

  loopController.mountResizeListeners();
  syncVisualViewportHeight();
  loopController.scheduleResize();

  const viewControls = mountViewControls({
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
    dispose: () => {
      syncLoopSpeed(true);
      unsubscribeLanguage();
      viewControls.dispose?.();
    },
  };
}
