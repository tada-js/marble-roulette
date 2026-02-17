const TRACKS = Object.freeze({
  bgm_1: ["/assets/bgm_1.mp3", "/public/assets/bgm_1.mp3"],
  bgm_2: ["/assets/bgm_2.mp3", "/public/assets/bgm_2.mp3"],
});
const DEFAULT_TRACK = "bgm_1";
const BGM_VOLUME = 0.3;

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Create BGM controller (MP3 tracks).
 *
 * @param {{
 *   storageKey?: string;
 *   trackStorageKey?: string;
 *   onStateChange?: (state: { on: boolean; track: string }) => void;
 * }} opts
 */
export function createAudioController(opts = {}) {
  const {
    storageKey = "bgmOn",
    trackStorageKey = "bgmTrack",
    onStateChange = () => {},
  } = opts;

  const trackMap = new WeakMap();
  const bgm = {
    on: false,
    track: DEFAULT_TRACK,
    audio: null,
    duckLevel: 1,
    _armed: false,
    _resumeHandler: null,
  };

  function emitState() {
    onStateChange({ on: bgm.on, track: bgm.track });
  }

  function getEffectiveVolume() {
    return clamp(BGM_VOLUME * bgm.duckLevel, 0, 1);
  }

  function applyVolume() {
    if (!bgm.audio) return;
    bgm.audio.volume = getEffectiveVolume();
  }

  /**
   * @param {HTMLAudioElement} audio
   */
  function destroyAudio(audio) {
    const meta = trackMap.get(audio);
    if (meta?.onError) {
      try {
        audio.removeEventListener("error", meta.onError);
      } catch {
        // ignore
      }
    }
    if (meta) meta.disposed = true;
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {
      // ignore
    }
  }

  /**
   * @param {unknown} value
   */
  function isValidTrack(value) {
    return typeof value === "string" && Object.prototype.hasOwnProperty.call(TRACKS, value);
  }

  /**
   * @param {string} trackId
   */
  function createAudio(trackId) {
    const sources = TRACKS[trackId];
    const audio = new Audio(sources[0]);
    audio.preload = "auto";
    audio.loop = true;
    audio.volume = getEffectiveVolume();

    const meta = {
      trackId,
      sourceIndex: 0,
      disposed: false,
      onError: null,
    };

    const onError = () => {
      const current = trackMap.get(audio);
      if (!current || current.disposed) return;
      if (current.sourceIndex >= sources.length - 1) return;
      current.sourceIndex += 1;
      audio.src = sources[current.sourceIndex];
      audio.load();
      if (bgm.on) {
        void audio.play().catch(() => {
          armAutostart();
        });
      }
    };

    meta.onError = onError;
    audio.addEventListener("error", onError);

    trackMap.set(audio, meta);
    return audio;
  }

  function clearAutostartArming() {
    if (!bgm._armed || !bgm._resumeHandler) return;
    window.removeEventListener("pointerdown", bgm._resumeHandler);
    window.removeEventListener("keydown", bgm._resumeHandler);
    bgm._armed = false;
    bgm._resumeHandler = null;
  }

  function ensureAudioForTrack() {
    if (!bgm.audio) {
      bgm.audio = createAudio(bgm.track);
      return;
    }
    const currentTrack = trackMap.get(bgm.audio);
    if (currentTrack?.trackId === bgm.track) return;

    destroyAudio(bgm.audio);

    bgm.audio = createAudio(bgm.track);
  }

  function stop() {
    clearAutostartArming();
    if (!bgm.audio) return;
    try {
      bgm.audio.pause();
      bgm.audio.currentTime = 0;
    } catch {
      // ignore
    }
  }

  async function play() {
    ensureAudioForTrack();
    if (!bgm.audio) return;
    bgm.audio.loop = true;
    applyVolume();
    if (bgm.audio.readyState === 0) bgm.audio.load();
    try {
      await bgm.audio.play();
    } catch {
      armAutostart();
    }
  }

  function armAutostart() {
    if (bgm._armed) return;
    bgm._armed = true;

    const tryResume = () => {
      if (!bgm.on) {
        clearAutostartArming();
        return;
      }
      void play();
      clearAutostartArming();
    };

    bgm._resumeHandler = tryResume;
    window.addEventListener("pointerdown", tryResume, { passive: true });
    window.addEventListener("keydown", tryResume);
  }

  /**
   * @param {string} trackId
   * @param {{autoplay?: boolean}} [opts]
   */
  function setTrack(trackId, opts = {}) {
    const { autoplay = true } = opts;
    if (!isValidTrack(trackId)) return;

    bgm.track = trackId;
    try {
      localStorage.setItem(trackStorageKey, bgm.track);
    } catch {
      // ignore
    }

    ensureAudioForTrack();
    emitState();

    if (!bgm.on) return;
    if (autoplay) void play();
    else armAutostart();
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

    emitState();

    if (bgm.on) {
      if (autoplay) void play();
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

  /**
   * @param {number} level 0.05 ~ 1.0
   */
  function setDuckLevel(level = 1) {
    const parsed = Number(level);
    const next = Number.isFinite(parsed) ? clamp(parsed, 0.05, 1) : 1;
    if (next === bgm.duckLevel) return;
    bgm.duckLevel = next;
    applyVolume();
  }

  function restoreFromStorage() {
    let nextOn = true;

    try {
      const savedTrack = localStorage.getItem(trackStorageKey);
      if (isValidTrack(savedTrack)) bgm.track = savedTrack;
    } catch {
      // ignore
    }

    try {
      const v = localStorage.getItem(storageKey);
      if (v === "0") nextOn = false;
      else if (v === "1") nextOn = true;
    } catch {
      nextOn = true;
    }

    setOn(nextOn, { autoplay: false });
    emitState();
  }

  emitState();

  return {
    isOn: () => bgm.on,
    getTrack: () => bgm.track,
    setDuckLevel,
    setOn,
    toggle,
    setTrack,
    restoreFromStorage,
  };
}
