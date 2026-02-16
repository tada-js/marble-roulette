/**
 * Create winner/result modal controller.
 *
 * @param {{
 *   dialog?: HTMLDialogElement | null;
 *   imageEl?: HTMLImageElement | null;
 *   nameEl?: HTMLElement | null;
 *   button?: HTMLButtonElement | null;
 *   getLatestPayload?: () => ({name: string; img: string} | null);
 }} opts
 */
export function createResultController(opts = {}) {
  const { dialog, imageEl, nameEl, button, getLatestPayload = () => null } = opts;
  let lastPayload = null;

  function playFanfare() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const gain = ctx.createGain();
      gain.gain.value = 0.055;
      gain.connect(ctx.destination);

      const notes = [523.25, 659.25, 783.99, 1046.5];
      const t0 = ctx.currentTime + 0.02;
      for (let i = 0; i < notes.length; i++) {
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = notes[i];
        osc.connect(gain);
        const t = t0 + i * 0.12;
        osc.start(t);
        osc.stop(t + 0.16);
      }
      setTimeout(() => ctx.close().catch(() => {}), 1200);
    } catch {
      // ignore
    }
  }

  /**
   * @param {{name: string; img: string} | null} payload
   */
  function setPayload(payload) {
    lastPayload = payload || null;
    if (button) button.disabled = !lastPayload;
  }

  function reset() {
    setPayload(null);
  }

  /**
   * @param {{fanfare?: boolean}} [opts]
   */
  function show(opts = {}) {
    if (!dialog) return;
    const { fanfare = true } = opts;
    const payload = lastPayload || getLatestPayload();
    if (!payload) return;
    lastPayload = payload;
    if (button) button.disabled = false;

    if (imageEl) {
      imageEl.src = payload.img || "";
      imageEl.alt = payload.name;
    }
    if (nameEl) nameEl.textContent = payload.name;

    if (fanfare) playFanfare();
    try {
      dialog.showModal();
    } catch {
      // ignore
    }
  }

  return {
    setPayload,
    reset,
    show,
    getLastPayload: () => lastPayload,
  };
}
