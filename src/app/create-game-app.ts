import {
  makeGameState,
  makeRng,
  type FinishedMarble,
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
  BALL_LIBRARY,
  DEFAULT_BALLS,
  buildSystemBallImageDataUrl,
  isSystemBallAvatarUrl,
} from "../game/assets.ts";
import { makeRenderer } from "../game/render.ts";
import { createGameBoard } from "../game/board-config.ts";
import { createLoopController } from "../game/loop-controller.ts";
import { createSessionController } from "../game/session-controller.ts";
import { mountDebugHooks } from "../game/debug-hooks.ts";
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
import type {
  InquiryField,
  InquiryForm,
  InquirySubmitResult,
  ResultUiItem,
  StatusTone,
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
  resultState: {
    open: boolean;
    phase: "idle" | "spinning" | "single" | "summary";
    requestedCount: number;
    effectiveCount: number;
    items: ResultUiItem[];
  };
  inquiryOpen: boolean;
  inquirySubmitting: boolean;
  inquiryStatus: string;
  inquiryOpenedAt: number;
  inquiryForm: InquiryForm;
  speedMultiplier: number;
  quickFinishPending: boolean;
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

const STATUS_LABEL_BY_TONE: Record<StatusTone, string> = {
  ready: "준비됨",
  running: "진행 중",
  paused: "일시 정지",
  done: "결과 준비 완료",
};

// At 3x caption font, ~28 chars keeps 2-line readability on 900px world width.
const START_CAPTION_MAX = 28;

function deriveStatusTone(state: {
  mode?: string;
  winner?: unknown;
  paused?: boolean;
}): StatusTone {
  if (state.mode !== "playing") return "ready";
  if (state.winner) return "done";
  if (state.paused) return "paused";
  return "running";
}

function fileToDataUrl(file: File): Promise<string> {
  const validation = validateUploadImageFile(file);
  if (!validation.ok) {
    return Promise.reject(new Error(validation.message));
  }
  return new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    fr.onload = () => resolve(String(fr.result || ""));
    fr.readAsDataURL(file);
  });
}

function sanitizeBallName(name: unknown, fallback: string): string {
  const value = String(name || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  return value || fallback;
}

function sanitizeStartCaption(value: unknown): string {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .slice(0, START_CAPTION_MAX);
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
    settingsDirty: false,
    settingsConfirmOpen: false,
    settingsDraft: null,
    winnerCount: 1,
    winnerCountWasClamped: false,
    startCaption: "",
    resultState: {
      open: false,
      phase: "idle",
      requestedCount: 1,
      effectiveCount: 0,
      items: [],
    },
    inquiryOpen: false,
    inquirySubmitting: false,
    inquiryStatus: "",
    inquiryOpenedAt: 0,
    inquiryForm: { ...EMPTY_INQUIRY_FORM },
    speedMultiplier: 1,
    quickFinishPending: false,
  };

  let refreshUi: () => void = () => {};
  let applyLoopSpeed = (_speedMultiplier: number): void => {};
  let quickFinishRafId = 0;
  let quickFinishJobId = 0;
  let lastFrameUiRefreshAt = 0;
  let lastFrameUiSignature = "";

  const QUICK_FINISH_STEPS_PER_FRAME = 560;
  const QUICK_FINISH_MAX_STEPS = 84000;
  const FRAME_UI_THROTTLE_MS = 96;

  const catalogController = createCatalogController({
    state,
    onCatalogChange: () => {
      refreshUi();
    },
  });

  const audioController = createAudioController({
    onStateChange: () => {
      refreshUi();
    },
  });

  function getWinnerCountMax() {
    if (state.totalToDrop > 0) return Math.max(1, Number(state.totalToDrop) || 1);
    return Math.max(1, getTotalSelectedCount(state));
  }

  function isBallControlLocked() {
    return state.mode === "playing" && !state.winner;
  }

  function cancelQuickFinishTask() {
    quickFinishJobId += 1;
    if (quickFinishRafId) {
      window.cancelAnimationFrame(quickFinishRafId);
      quickFinishRafId = 0;
    }
    uiState.quickFinishPending = false;
  }

  function completeRunNow(): boolean {
    if (uiState.quickFinishPending) return false;
    if (state.mode !== "playing" || state.winner) return false;

    const jobId = quickFinishJobId + 1;
    quickFinishJobId = jobId;
    if (quickFinishRafId) {
      window.cancelAnimationFrame(quickFinishRafId);
      quickFinishRafId = 0;
    }

    uiState.quickFinishPending = true;
    state.paused = false;
    let stepped = 0;

    const runChunk = () => {
      if (jobId !== quickFinishJobId) return;

      let localSteps = 0;
      while (
        localSteps < QUICK_FINISH_STEPS_PER_FRAME &&
        stepped < QUICK_FINISH_MAX_STEPS &&
        state.mode === "playing" &&
        !state.winner
      ) {
        step(state, 1 / 60);
        localSteps += 1;
        stepped += 1;
      }

      sessionController.onAfterFrame();

      if (state.winner || state.mode !== "playing" || stepped >= QUICK_FINISH_MAX_STEPS) {
        if (jobId === quickFinishJobId) {
          uiState.quickFinishPending = false;
          quickFinishRafId = 0;
          refreshUi();
        }
        return;
      }

      quickFinishRafId = window.requestAnimationFrame(runChunk);
    };

    quickFinishRafId = window.requestAnimationFrame(runChunk);
    refreshUi();
    return true;
  }

  function closeResultModalPresentation() {
    if (uiState.resultState.phase === "spinning") {
      uiState.resultState.phase = resolveResultPhase(uiState.resultState.items);
    }
    uiState.resultState.open = false;
  }

  function resetResultHistory() {
    uiState.resultState = {
      open: false,
      phase: "idle",
      requestedCount: uiState.winnerCount,
      effectiveCount: 0,
      items: [],
    };
  }

  function mapFinishedToResultItems(selected: FinishedMarble[]): ResultUiItem[] {
    return selected.map((entry, idx) => {
      const payload = catalogController.getWinnerPayload(entry.ballId);
      return {
        rank: idx + 1,
        ballId: entry.ballId,
        name: payload?.name || entry.ballId || "알 수 없는 공",
        img: payload?.img || "",
        finishedAt: entry.t,
        slot: entry.slot,
        label: entry.label,
      };
    });
  }

  function resolveResultPhase(items: ResultUiItem[]): "single" | "summary" {
    return items.length === 1 ? "single" : "summary";
  }

  function openResultPresentationByCount(items: ResultUiItem[]) {
    if (!items.length) {
      uiState.resultState = {
        open: true,
        phase: "summary",
        requestedCount: uiState.winnerCount,
        effectiveCount: 0,
        items,
      };
      return;
    }

    uiState.resultState = {
      open: true,
      phase: "spinning",
      requestedCount: uiState.winnerCount,
      effectiveCount: items.length,
      items,
    };
  }

  function completeResultSpin() {
    if (!uiState.resultState.items.length) return;
    if (uiState.resultState.phase !== "spinning") return;
    uiState.resultState.phase = resolveResultPhase(uiState.resultState.items);
    playWinnerFanfare();
  }

  function prepareAndOpenResultReveal() {
    if (!state.totalToDrop || !state.finished.length) return;
    const selected = selectLastFinishers(state.finished, uiState.winnerCount, state.totalToDrop);
    const items = mapFinishedToResultItems(selected);
    openResultPresentationByCount(items);
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
    const inRun = state.mode === "playing" && !state.winner;
    const remainingToFinish = inRun ? Math.max(0, (Number(state.totalToDrop) || 0) - state.finished.length) : -1;
    const winnerT = state.winner ? Number(state.winner.t.toFixed(4)) : -1;
    const signature = `${state.mode}|${state.paused ? 1 : 0}|${remainingToFinish}|${winnerT}|${uiState.quickFinishPending ? 1 : 0}`;
    const now = performance.now();

    if (signature === lastFrameUiSignature && now - lastFrameUiRefreshAt < FRAME_UI_THROTTLE_MS) return;
    lastFrameUiSignature = signature;
    lastFrameUiRefreshAt = now;
    refreshUi();
  }

  refreshUi = () => {
    const total = getTotalSelectedCount(state);
    const inRun = state.mode === "playing" && !state.winner;
    const remainingToFinish = inRun ? Math.max(0, (Number(state.totalToDrop) || 0) - state.finished.length) : 0;
    const view = renderer.getViewState?.();
    const visibleCatalog = uiState.settingsOpen ? ensureSettingsDraft() : getLiveCatalogView();
    const winnerCountMax = getWinnerCountMax();
    const clampedWinnerCount = clampResultCount(uiState.winnerCount, winnerCountMax);
    if (clampedWinnerCount !== uiState.winnerCount) {
      uiState.winnerCount = clampedWinnerCount;
    }
    const statusTone = deriveStatusTone(state);
    const statusLabel = STATUS_LABEL_BY_TONE[statusTone];

    const nextSnapshot: UiSnapshot = {
      startDisabled: total <= 0,
      startLabel: inRun ? "다시 시작" : "게임 시작",
      quickFinishPending: uiState.quickFinishPending,
      pauseDisabled: !inRun,
      pauseLabel: state.paused ? "이어하기" : "일시정지",
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
          ? Math.max(0, Math.min(99, Number(state.counts[ball.id]) || 0))
          : 1,
        locked: isBallControlLocked(),
      })),
    };
    renderer.setStartCaption?.(uiState.startCaption);
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
      cancelQuickFinishTask();
      uiState.winnerCountWasClamped = false;
      resetResultHistory();
      refreshUi();
    },
    onUpdateControls: refreshUiFromFrame,
    onShowWinner: () => {
      prepareAndOpenResultReveal();
      refreshUi();
    },
  });

  setUiActions({
    handleStartClick: () => {
      cancelQuickFinishTask();
      closeResultModalPresentation();
      resetResultHistory();
      uiState.winnerCountWasClamped = false;
      sessionController.handleStartClick();
      refreshUi();
    },
    prepareRestartForCountdown: () => {
      cancelQuickFinishTask();
      sessionController.prepareRestartForCountdown();
      refreshUi();
    },
    completeRunNow: () => completeRunNow(),
    stopRunNow: () => {
      const inRun = state.mode === "playing" && !state.winner;
      if (!inRun) return false;
      cancelQuickFinishTask();
      sessionController.prepareRestartForCountdown();
      refreshUi();
      return true;
    },
    togglePause: () => {
      sessionController.togglePause();
      refreshUi();
    },
    setWinnerCount: (nextValue) => {
      if (isBallControlLocked()) return;
      const raw = Math.floor(Number(nextValue) || 1);
      const max = getWinnerCountMax();
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
      if (draft.length >= BALL_LIBRARY.length) return false;
      const used = new Set(draft.map((ball) => ball.id));
      const nextBall = BALL_LIBRARY.find((ball) => !used.has(ball.id));
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
    restoreDefaultCatalog: () => {
      if (!uiState.settingsOpen || isBallControlLocked()) return false;
      uiState.settingsDraft = structuredClone(DEFAULT_BALLS);
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
        const message = err instanceof Error && err.message ? err.message : "이미지 업로드에 실패했습니다.";
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
    openResultModal: () => {
      if (!uiState.resultState.items.length) return false;
      uiState.resultState.open = true;
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
      if (copied) showInquiryToast("결과를 복사했습니다.", "success", 1800);
      else showInquiryToast("결과 복사에 실패했습니다.", "error", 2200);
      refreshUi();
      return copied;
    },
    restartFromResult: () => {
      cancelQuickFinishTask();
      closeResultModalPresentation();
      resetResultHistory();
      uiState.winnerCountWasClamped = false;
      sessionController.handleStartClick();
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
    toggleSpeedMode: () => {
      const next = uiState.speedMultiplier >= 2 ? 1 : 2;
      uiState.speedMultiplier = next;
      applyLoopSpeed(next);
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
    dispose: () => {
      cancelQuickFinishTask();
    },
  };
}
