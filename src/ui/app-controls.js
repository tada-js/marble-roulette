import { mountInquiry } from "./inquiry.js";
import { mountKeyboardControls } from "./keyboard-controls.js";

/**
 * Mount top-level app control bindings (buttons, dialogs, keyboard).
 *
 * @param {{
 *   state: { mode?: string };
 *   startBtn?: HTMLButtonElement | null;
 *   pauseBtn?: HTMLButtonElement | null;
 *   settingsBtn?: HTMLButtonElement | null;
 *   bgmBtn?: HTMLButtonElement | null;
 *   winnerBtn?: HTMLButtonElement | null;
 *   catalogController: { openSettings: () => void };
 *   audioController: { toggle: (opts?: { autoplay?: boolean }) => void };
 *   resultController: { show: (opts?: { fanfare?: boolean }) => void };
 *   sessionController: { handleStartClick: () => void; tryStart: () => boolean; togglePause: () => boolean };
 *   inquiryOptions: Parameters<typeof mountInquiry>[0];
 * }} opts
 */
export function mountAppControls(opts) {
  const {
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
    inquiryOptions,
  } = opts;

  startBtn?.addEventListener("click", () => {
    sessionController.handleStartClick();
  });
  pauseBtn?.addEventListener("click", () => {
    sessionController.togglePause();
  });

  settingsBtn?.addEventListener("click", () => {
    catalogController.openSettings();
  });

  const inquiry = mountInquiry(inquiryOptions);

  bgmBtn?.addEventListener("click", () => {
    audioController.toggle({ autoplay: true });
  });

  winnerBtn?.addEventListener("click", () => {
    resultController.show({ fanfare: false });
  });

  mountKeyboardControls({
    getMode: () => state.mode,
    tryStart: sessionController.tryStart,
  });

  return { inquiry };
}
