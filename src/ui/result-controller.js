/**
 * Play a short fanfare sound when the final result is revealed.
 */
export function playWinnerFanfare() {
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
    setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 1200);
  } catch {
    // ignore audio failures
  }
}
