/**
 * Play a short fanfare sound when the final result is revealed.
 */
export function playWinnerFanfare() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
    const gain = ctx.createGain();
    const notes = [523.25, 659.25, 783.99, 1046.5];
    const t0 = ctx.currentTime + 0.02;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(0.09, t0 + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.92);
    gain.connect(ctx.destination);

    for (let i = 0; i < notes.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = notes[i];
      osc.connect(gain);
      const t = t0 + i * 0.12;
      osc.start(t);
      osc.stop(t + 0.2);
    }
    setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 1200);
  } catch {
    // ignore audio failures
  }
}

function getAudioContext() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Play a subtle heartbeat-like cue during finish tension.
 *
 * @param {number} [intensity]
 */
export function playFinishHeartbeat(intensity = 0.6) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const t0 = ctx.currentTime + 0.01;
  const gain = ctx.createGain();
  const safeIntensity = Math.max(0.2, Math.min(1, Number(intensity) || 0.6));
  const level = 0.02 + safeIntensity * 0.04;

  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(level, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26);
  gain.connect(ctx.destination);

  const oscA = ctx.createOscillator();
  oscA.type = "sine";
  oscA.frequency.setValueAtTime(54, t0);
  oscA.frequency.exponentialRampToValueAtTime(46, t0 + 0.22);
  oscA.connect(gain);
  oscA.start(t0);
  oscA.stop(t0 + 0.24);

  const oscB = ctx.createOscillator();
  oscB.type = "triangle";
  oscB.frequency.setValueAtTime(78, t0 + 0.09);
  oscB.frequency.exponentialRampToValueAtTime(64, t0 + 0.24);
  oscB.connect(gain);
  oscB.start(t0 + 0.09);
  oscB.stop(t0 + 0.25);

  setTimeout(() => {
    void ctx.close().catch(() => {});
  }, 420);
}

/**
 * Play a short impact cue on final arrival.
 */
export function playFinishImpact() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const t0 = ctx.currentTime + 0.01;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.08, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
  gain.connect(ctx.destination);

  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(210, t0);
  osc.frequency.exponentialRampToValueAtTime(120, t0 + 0.16);
  osc.connect(gain);
  osc.start(t0);
  osc.stop(t0 + 0.17);

  setTimeout(() => {
    void ctx.close().catch(() => {});
  }, 320);
}
