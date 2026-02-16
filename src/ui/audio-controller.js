/**
 * Create BGM controller (8-bit style procedural synth).
 *
 * @param {{
 *   button?: HTMLButtonElement | null;
 *   storageKey?: string;
 * }} opts
 */
export function createAudioController(opts = {}) {
  const { button = null, storageKey = "bgmOn" } = opts;

  const bgm = {
    on: false,
    ctx: null,
    gain: null,
    timer: null,
    loopSec: 0,
    nextT: 0,
    _armed: false,
  };

  /**
   * @param {number} n
   */
  function midiToHz(n) {
    return 440 * Math.pow(2, (n - 69) / 12);
  }

  function stop() {
    if (bgm.timer) {
      clearInterval(bgm.timer);
      bgm.timer = null;
    }
    bgm.nextT = 0;
    if (bgm.gain) {
      try {
        bgm.gain.gain.setValueAtTime(0.0, bgm.ctx.currentTime);
      } catch {
        // ignore
      }
    }
    if (bgm.ctx) {
      bgm.ctx.close().catch(() => {});
    }
    bgm.ctx = null;
    bgm.gain = null;
    bgm.loopSec = 0;
  }

  function start() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    stop();
    const ctx = new AC();
    const gain = ctx.createGain();
    gain.gain.value = 0.0;
    gain.connect(ctx.destination);
    bgm.ctx = ctx;
    bgm.gain = gain;

    const t0 = ctx.currentTime + 0.02;
    gain.gain.setValueAtTime(0.0, t0);
    gain.gain.linearRampToValueAtTime(0.12, t0 + 0.25);

    const bpm = 152;
    const step = 60 / bpm / 2;
    const bars = 4;
    const stepsPerBar = 8;
    const totalSteps = bars * stepsPerBar;
    bgm.loopSec = totalSteps * step;
    bgm.nextT = t0;

    const melody = [
      76, 79, 83, 79, 76, 74, 71, 74,
      76, 79, 83, 86, 83, 79, 76, 74,
      71, 74, 76, 79, 83, 79, 76, 74,
      71, 69, 71, 74, 76, 74, 71, 69,
    ];
    const bass = [
      52, 52, 52, 52, 50, 50, 50, 50,
      48, 48, 48, 48, 50, 50, 50, 50,
      52, 52, 52, 52, 55, 55, 55, 55,
      50, 50, 50, 50, 48, 48, 48, 48,
    ];

    /**
     * @param {"square" | "triangle"} type
     * @param {number} hz
     * @param {number} startT
     * @param {number} dur
     * @param {number} vol
     */
    function playTone(type, hz, startT, dur, vol) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(hz, startT);
      g.gain.setValueAtTime(0.0001, startT);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), startT + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, startT + dur);
      o.connect(g);
      g.connect(gain);
      o.start(startT);
      o.stop(startT + dur + 0.02);
    }

    /**
     * @param {number} fromT
     * @param {number} horizonSec
     */
    function schedule(fromT, horizonSec) {
      const endT = fromT + horizonSec;
      let t = bgm.nextT;
      while (t < endT) {
        const k = Math.floor((t - t0) / step);
        const i = ((k % totalSteps) + totalSteps) % totalSteps;
        const m = melody[i];
        const b = bass[i];
        playTone("square", midiToHz(m), t, step * 0.92, 0.080);
        playTone("triangle", midiToHz(b), t, step * 0.98, 0.068);
        if (i % 2 === 0) playTone("square", midiToHz(b - 12), t, step * 0.30, 0.024);
        t += step;
      }
      bgm.nextT = t;
    }

    schedule(ctx.currentTime, 0.8);
    bgm.timer = setInterval(() => {
      if (!bgm.ctx) return;
      const now = bgm.ctx.currentTime;
      if (bgm.nextT && bgm.nextT < now) bgm.nextT = now;
      schedule(now, 0.9);
    }, 320);
  }

  function armAutostart() {
    if (bgm.ctx || bgm._armed) return;
    bgm._armed = true;

    const tryResume = () => {
      if (!bgm.on) return cleanup();
      if (bgm.ctx) return cleanup();
      start();
      cleanup();
    };
    const cleanup = () => {
      window.removeEventListener("pointerdown", tryResume);
      window.removeEventListener("keydown", tryResume);
      bgm._armed = false;
    };

    window.addEventListener("pointerdown", tryResume, { once: true, passive: true });
    window.addEventListener("keydown", tryResume, { once: true });
  }

  /**
   * @param {boolean} on
   * @param {{autoplay?: boolean}} [opts]
   */
  function setOn(on, opts = {}) {
    const { autoplay = true } = opts;
    bgm.on = !!on;
    try {
      localStorage.setItem(storageKey, bgm.on ? "1" : "0");
    } catch {
      // ignore
    }

    if (button) {
      button.setAttribute("aria-pressed", bgm.on ? "true" : "false");
      button.textContent = bgm.on ? "BGM 켬" : "BGM 끔";
    }

    if (bgm.on) {
      if (autoplay) start();
      else armAutostart();
    } else {
      stop();
    }
  }

  /**
   * @param {{autoplay?: boolean}} [opts]
   */
  function toggle(opts = {}) {
    setOn(!bgm.on, opts);
  }

  function restoreFromStorage() {
    try {
      const v = localStorage.getItem(storageKey);
      setOn(v === "1", { autoplay: false });
    } catch {
      setOn(false, { autoplay: false });
    }
  }

  return {
    isOn: () => bgm.on,
    setOn,
    toggle,
    restoreFromStorage,
  };
}
