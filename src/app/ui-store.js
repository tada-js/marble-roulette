/**
 * Small external UI store shared between bootstrap (game logic) and React UI.
 */
const listeners = new Set();

const DEFAULT_SNAPSHOT = Object.freeze({
  startDisabled: true,
  startLabel: "게임 시작",
  pauseDisabled: true,
  pauseLabel: "일시정지",
  pausePressed: false,
  viewLockChecked: true,
  viewLockDisabled: true,
  winnerDisabled: true,
  bgmOn: true,
  bgmTrack: "bgm_1",
  balls: [],
});

const NOOP = () => {};
let snapshot = DEFAULT_SNAPSHOT;
let actions = {
  handleStartClick: NOOP,
  togglePause: NOOP,
  openSettings: NOOP,
  openWinner: NOOP,
  toggleBgm: NOOP,
  setBgmTrack: NOOP,
  toggleViewLock: NOOP,
  setBallCount: NOOP,
  adjustBallCount: NOOP,
};

function notify() {
  for (const listener of listeners) listener();
}

/**
 * @param {typeof DEFAULT_SNAPSHOT} a
 * @param {typeof DEFAULT_SNAPSHOT} b
 */
function isEqualSnapshot(a, b) {
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
    a.bgmOn !== b.bgmOn ||
    a.bgmTrack !== b.bgmTrack
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

/**
 * @param {typeof DEFAULT_SNAPSHOT} next
 */
export function setUiSnapshot(next) {
  if (isEqualSnapshot(snapshot, next)) return;
  snapshot = next;
  notify();
}

export function getUiSnapshot() {
  return snapshot;
}

/**
 * @param {() => void} listener
 */
export function subscribeUi(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * @param {Partial<typeof actions>} next
 */
export function setUiActions(next) {
  actions = { ...actions, ...next };
}

export function getUiActions() {
  return actions;
}
