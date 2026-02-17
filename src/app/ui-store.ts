/**
 * Small external UI store shared between bootstrap (game logic) and React UI.
 */
const listeners = new Set<() => void>();

export type InquiryField = "email" | "subject" | "message" | "website";
export type RequiredInquiryField = "email" | "subject" | "message";

export type InquiryForm = {
  [K in InquiryField]: string;
};

export type ResultRevealPhase = "idle" | "spinning" | "single" | "summary";

export type ResultUiItem = {
  rank: number;
  ballId: string;
  name: string;
  img: string;
  finishedAt: number;
  slot: number;
  label: string;
};

export type ResultUiState = {
  open: boolean;
  phase: ResultRevealPhase;
  requestedCount: number;
  effectiveCount: number;
  items: ReadonlyArray<ResultUiItem>;
};

export type StatusTone = "ready" | "running" | "paused" | "done";

export type BallUiModel = {
  id: string;
  name: string;
  imageDataUrl: string;
  count: number;
  locked: boolean;
};

export type InquirySubmitResult =
  | { ok: true }
  | { ok: false; message: string; field?: RequiredInquiryField };

export type UiSnapshot = {
  startDisabled: boolean;
  startLabel: string;
  quickFinishPending: boolean;
  pauseDisabled: boolean;
  pauseLabel: string;
  pausePressed: boolean;
  statusLabel: string;
  statusTone: StatusTone;
  statusRemainingCount: number | null;
  lastFewRemaining: number;
  viewLockChecked: boolean;
  viewLockDisabled: boolean;
  resultDisabled: boolean;
  winnerCount: number;
  winnerCountMax: number;
  winnerCountWasClamped: boolean;
  startCaption: string;
  resultState: ResultUiState;
  settingsOpen: boolean;
  settingsDirty: boolean;
  settingsConfirmOpen: boolean;
  bgmOn: boolean;
  bgmTrack: string;
  inquiryOpen: boolean;
  inquirySubmitting: boolean;
  inquiryStatus: string;
  inquiryForm: InquiryForm;
  speedMultiplier: number;
  balls: BallUiModel[];
};

export type UiActions = {
  handleStartClick: () => void;
  prepareRestartForCountdown: () => void;
  completeRunNow: () => boolean;
  stopRunNow: () => boolean;
  togglePause: () => void;
  setWinnerCount: (nextValue: number) => void;
  setStartCaption: (value: string) => void;
  openSettings: () => void;
  closeSettings: () => void;
  applySettings: () => boolean;
  confirmDiscardSettings: () => void;
  cancelDiscardSettings: () => void;
  addCatalogBall: () => boolean;
  removeCatalogBall: (ballId: string) => boolean;
  reorderCatalogBall: (sourceBallId: string, targetBallId: string) => boolean;
  restoreDefaultCatalog: () => boolean;
  setCatalogBallName: (ballId: string, name: string) => boolean;
  setCatalogBallImage: (ballId: string, file: File) => Promise<boolean> | boolean;
  openResultModal: () => boolean;
  closeResultModal: () => void;
  skipResultReveal: () => void;
  completeResultSpin: () => void;
  copyResults: () => Promise<boolean> | boolean;
  restartFromResult: () => void;
  toggleBgm: () => void;
  setBgmTrack: (track: string) => void;
  toggleViewLock: (isOn: boolean) => void;
  setBallCount: (ballId: string, nextValue: number) => void;
  adjustBallCount: (ballId: string, delta: number) => void;
  openInquiry: () => void;
  closeInquiry: () => void;
  setInquiryField: (field: InquiryField, value: string) => boolean;
  submitInquiry: () => Promise<InquirySubmitResult> | InquirySubmitResult;
  toggleSpeedMode: () => void;
};

const DEFAULT_SNAPSHOT: UiSnapshot = Object.freeze({
  startDisabled: true,
  startLabel: "게임 시작",
  quickFinishPending: false,
  pauseDisabled: true,
  pauseLabel: "일시정지",
  pausePressed: false,
  statusLabel: "준비됨",
  statusTone: "ready",
  statusRemainingCount: null,
  lastFewRemaining: 0,
  viewLockChecked: true,
  viewLockDisabled: true,
  resultDisabled: true,
  winnerCount: 1,
  winnerCountMax: 1,
  winnerCountWasClamped: false,
  startCaption: "",
  resultState: Object.freeze({
    open: false,
    phase: "idle",
    requestedCount: 1,
    effectiveCount: 0,
    items: Object.freeze([]),
  }),
  settingsOpen: false,
  settingsDirty: false,
  settingsConfirmOpen: false,
  bgmOn: true,
  bgmTrack: "bgm_1",
  inquiryOpen: false,
  inquirySubmitting: false,
  inquiryStatus: "",
  inquiryForm: Object.freeze({
    email: "",
    subject: "",
    message: "",
    website: "",
  }),
  speedMultiplier: 1,
  balls: [],
});

const NOOP_VOID = (): void => {};
const NOOP_FALSE = (): false => false;
const NOOP_SUBMIT = (): InquirySubmitResult => ({ ok: false, message: "구현되지 않았습니다." });

let snapshot: UiSnapshot = DEFAULT_SNAPSHOT;
let actions: UiActions = {
  handleStartClick: NOOP_VOID,
  prepareRestartForCountdown: NOOP_VOID,
  completeRunNow: NOOP_FALSE,
  stopRunNow: NOOP_FALSE,
  togglePause: NOOP_VOID,
  setWinnerCount: NOOP_VOID,
  setStartCaption: NOOP_VOID,
  openSettings: NOOP_VOID,
  closeSettings: NOOP_VOID,
  applySettings: NOOP_FALSE,
  confirmDiscardSettings: NOOP_VOID,
  cancelDiscardSettings: NOOP_VOID,
  addCatalogBall: NOOP_FALSE,
  removeCatalogBall: NOOP_FALSE,
  reorderCatalogBall: NOOP_FALSE,
  restoreDefaultCatalog: NOOP_FALSE,
  setCatalogBallName: NOOP_FALSE,
  setCatalogBallImage: NOOP_FALSE,
  openResultModal: NOOP_FALSE,
  closeResultModal: NOOP_VOID,
  skipResultReveal: NOOP_VOID,
  completeResultSpin: NOOP_VOID,
  copyResults: NOOP_FALSE,
  restartFromResult: NOOP_VOID,
  toggleBgm: NOOP_VOID,
  setBgmTrack: NOOP_VOID,
  toggleViewLock: NOOP_VOID,
  setBallCount: NOOP_VOID,
  adjustBallCount: NOOP_VOID,
  openInquiry: NOOP_VOID,
  closeInquiry: NOOP_VOID,
  setInquiryField: NOOP_FALSE,
  submitInquiry: NOOP_SUBMIT,
  toggleSpeedMode: NOOP_VOID,
};

function notify() {
  for (const listener of listeners) listener();
}

function isEqualSnapshot(a: UiSnapshot, b: UiSnapshot) {
  if (a === b) return true;
  if (
    a.startDisabled !== b.startDisabled ||
    a.startLabel !== b.startLabel ||
    a.quickFinishPending !== b.quickFinishPending ||
    a.pauseDisabled !== b.pauseDisabled ||
    a.pauseLabel !== b.pauseLabel ||
    a.pausePressed !== b.pausePressed ||
    a.statusLabel !== b.statusLabel ||
    a.statusTone !== b.statusTone ||
    a.statusRemainingCount !== b.statusRemainingCount ||
    a.lastFewRemaining !== b.lastFewRemaining ||
    a.viewLockChecked !== b.viewLockChecked ||
    a.viewLockDisabled !== b.viewLockDisabled ||
    a.resultDisabled !== b.resultDisabled ||
    a.winnerCount !== b.winnerCount ||
    a.winnerCountMax !== b.winnerCountMax ||
    a.winnerCountWasClamped !== b.winnerCountWasClamped ||
    a.startCaption !== b.startCaption ||
    a.settingsOpen !== b.settingsOpen ||
    a.settingsDirty !== b.settingsDirty ||
    a.settingsConfirmOpen !== b.settingsConfirmOpen ||
    a.bgmOn !== b.bgmOn ||
    a.bgmTrack !== b.bgmTrack ||
    a.inquiryOpen !== b.inquiryOpen ||
    a.inquirySubmitting !== b.inquirySubmitting ||
    a.inquiryStatus !== b.inquiryStatus ||
    a.speedMultiplier !== b.speedMultiplier
  ) {
    return false;
  }

  const aResult = a.resultState;
  const bResult = b.resultState;
  if (
    aResult.open !== bResult.open ||
    aResult.phase !== bResult.phase ||
    aResult.requestedCount !== bResult.requestedCount ||
    aResult.effectiveCount !== bResult.effectiveCount ||
    aResult.items.length !== bResult.items.length
  ) {
    return false;
  }
  for (let i = 0; i < aResult.items.length; i++) {
    const x = aResult.items[i];
    const y = bResult.items[i];
    if (
      x.rank !== y.rank ||
      x.ballId !== y.ballId ||
      x.name !== y.name ||
      x.img !== y.img ||
      x.finishedAt !== y.finishedAt ||
      x.slot !== y.slot ||
      x.label !== y.label
    ) {
      return false;
    }
  }

  const aInquiry = a.inquiryForm;
  const bInquiry = b.inquiryForm;
  if (
    aInquiry.email !== bInquiry.email ||
    aInquiry.subject !== bInquiry.subject ||
    aInquiry.message !== bInquiry.message ||
    aInquiry.website !== bInquiry.website
  ) {
    return false;
  }

  const aBalls = a.balls;
  const bBalls = b.balls;
  if (aBalls.length !== bBalls.length) return false;

  for (let i = 0; i < aBalls.length; i++) {
    const x = aBalls[i];
    const y = bBalls[i];
    if (
      x.id !== y.id ||
      x.name !== y.name ||
      x.imageDataUrl !== y.imageDataUrl ||
      x.count !== y.count ||
      x.locked !== y.locked
    ) {
      return false;
    }
  }

  return true;
}

export function setUiSnapshot(next: UiSnapshot) {
  if (isEqualSnapshot(snapshot, next)) return;
  snapshot = next;
  notify();
}

export function getUiSnapshot() {
  return snapshot;
}

export function subscribeUi(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setUiActions(next: Partial<UiActions>) {
  actions = { ...actions, ...next };
}

export function getUiActions() {
  return actions;
}
