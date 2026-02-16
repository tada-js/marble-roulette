/**
 * Small external UI store shared between bootstrap (game logic) and React UI.
 */
const listeners = new Set<() => void>();

export type InquiryField = "name" | "email" | "subject" | "message" | "website";
export type RequiredInquiryField = Exclude<InquiryField, "website">;

export type InquiryForm = {
  [K in InquiryField]: string;
};

export type WinnerPayload = {
  name: string;
  img: string;
};

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
  pauseDisabled: boolean;
  pauseLabel: string;
  pausePressed: boolean;
  viewLockChecked: boolean;
  viewLockDisabled: boolean;
  winnerDisabled: boolean;
  winnerOpen: boolean;
  winnerPayload: WinnerPayload | null;
  settingsOpen: boolean;
  bgmOn: boolean;
  bgmTrack: string;
  inquiryOpen: boolean;
  inquirySubmitting: boolean;
  inquiryStatus: string;
  inquiryForm: InquiryForm;
  balls: BallUiModel[];
};

export type UiActions = {
  handleStartClick: () => void;
  togglePause: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  addCatalogBall: () => boolean;
  removeCatalogBall: (ballId: string) => boolean;
  restoreDefaultCatalog: () => boolean;
  setCatalogBallName: (ballId: string, name: string) => boolean;
  setCatalogBallImage: (ballId: string, file: File) => Promise<boolean> | boolean;
  openWinner: () => boolean;
  closeWinner: () => void;
  toggleBgm: () => void;
  setBgmTrack: (track: string) => void;
  toggleViewLock: (isOn: boolean) => void;
  setBallCount: (ballId: string, nextValue: number) => void;
  adjustBallCount: (ballId: string, delta: number) => void;
  openInquiry: () => void;
  closeInquiry: () => void;
  setInquiryField: (field: InquiryField, value: string) => boolean;
  submitInquiry: () => Promise<InquirySubmitResult> | InquirySubmitResult;
};

const DEFAULT_SNAPSHOT: UiSnapshot = Object.freeze({
  startDisabled: true,
  startLabel: "게임 시작",
  pauseDisabled: true,
  pauseLabel: "일시정지",
  pausePressed: false,
  viewLockChecked: true,
  viewLockDisabled: true,
  winnerDisabled: true,
  winnerOpen: false,
  winnerPayload: null,
  settingsOpen: false,
  bgmOn: true,
  bgmTrack: "bgm_1",
  inquiryOpen: false,
  inquirySubmitting: false,
  inquiryStatus: "",
  inquiryForm: Object.freeze({
    name: "",
    email: "",
    subject: "",
    message: "",
    website: "",
  }),
  balls: [],
});

const NOOP_VOID = (): void => {};
const NOOP_FALSE = (): false => false;
const NOOP_SUBMIT = (): InquirySubmitResult => ({ ok: false, message: "구현되지 않았습니다." });

let snapshot: UiSnapshot = DEFAULT_SNAPSHOT;
let actions: UiActions = {
  handleStartClick: NOOP_VOID,
  togglePause: NOOP_VOID,
  openSettings: NOOP_VOID,
  closeSettings: NOOP_VOID,
  addCatalogBall: NOOP_FALSE,
  removeCatalogBall: NOOP_FALSE,
  restoreDefaultCatalog: NOOP_FALSE,
  setCatalogBallName: NOOP_FALSE,
  setCatalogBallImage: NOOP_FALSE,
  openWinner: NOOP_FALSE,
  closeWinner: NOOP_VOID,
  toggleBgm: NOOP_VOID,
  setBgmTrack: NOOP_VOID,
  toggleViewLock: NOOP_VOID,
  setBallCount: NOOP_VOID,
  adjustBallCount: NOOP_VOID,
  openInquiry: NOOP_VOID,
  closeInquiry: NOOP_VOID,
  setInquiryField: NOOP_FALSE,
  submitInquiry: NOOP_SUBMIT,
};

function notify() {
  for (const listener of listeners) listener();
}

function isEqualSnapshot(a: UiSnapshot, b: UiSnapshot) {
  if (a === b) return true;
  if (
    a.startDisabled !== b.startDisabled ||
    a.startLabel !== b.startLabel ||
    a.pauseDisabled !== b.pauseDisabled ||
    a.pauseLabel !== b.pauseLabel ||
    a.pausePressed !== b.pausePressed ||
    a.viewLockChecked !== b.viewLockChecked ||
    a.viewLockDisabled !== b.viewLockDisabled ||
    a.winnerDisabled !== b.winnerDisabled ||
    a.winnerOpen !== b.winnerOpen ||
    a.settingsOpen !== b.settingsOpen ||
    a.bgmOn !== b.bgmOn ||
    a.bgmTrack !== b.bgmTrack ||
    a.inquiryOpen !== b.inquiryOpen ||
    a.inquirySubmitting !== b.inquirySubmitting ||
    a.inquiryStatus !== b.inquiryStatus
  ) {
    return false;
  }

  const aWinner = a.winnerPayload;
  const bWinner = b.winnerPayload;
  if (!!aWinner !== !!bWinner) return false;
  if (aWinner && bWinner && (aWinner.name !== bWinner.name || aWinner.img !== bWinner.img)) return false;

  const aInquiry = a.inquiryForm;
  const bInquiry = b.inquiryForm;
  if (
    aInquiry.name !== bInquiry.name ||
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
