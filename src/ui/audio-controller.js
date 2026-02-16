const TRACKS = Object.freeze({
  bgm_1: ["/assets/bgm_1.mp3", "/public/assets/bgm_1.mp3"],
  bgm_2: ["/assets/bgm_2.mp3", "/public/assets/bgm_2.mp3"],
});
const DEFAULT_TRACK = "bgm_1";
const BGM_VOLUME = 0.3;

/**
 * Create BGM controller (MP3 tracks).
 *
 * @param {{
 *   button?: HTMLButtonElement | null;
 *   settingsButton?: HTMLButtonElement | null;
 *   menu?: HTMLElement | null;
 *   storageKey?: string;
 *   trackStorageKey?: string;
 * }} opts
 */
export function createAudioController(opts = {}) {
  const {
    button = null,
    settingsButton = null,
    menu = null,
    storageKey = "bgmOn",
    trackStorageKey = "bgmTrack",
  } = opts;

  const labelEl = button?.querySelector("[data-bgm-label]") || null;
  const menuItems = menu ? Array.from(menu.querySelectorAll("[data-bgm-track]")) : [];
  const trackMap = new WeakMap();

  const bgm = {
    on: false,
    track: DEFAULT_TRACK,
    audio: null,
    _armed: false,
    _resumeHandler: null,
  };

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
    let sourceIndex = 0;
    const audio = new Audio(sources[sourceIndex]);
    audio.preload = "auto";
    audio.loop = true;
    audio.volume = BGM_VOLUME;
    audio.addEventListener("error", () => {
      if (sourceIndex >= sources.length - 1) return;
      sourceIndex += 1;
      audio.src = sources[sourceIndex];
      audio.load();
      if (bgm.on) {
        void audio.play().catch(() => {
          armAutostart();
        });
      }
      const meta = trackMap.get(audio);
      if (meta) meta.sourceIndex = sourceIndex;
    });

    trackMap.set(audio, { trackId, sourceIndex });
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

    try {
      bgm.audio.pause();
      bgm.audio.src = "";
      bgm.audio.load();
    } catch {
      // ignore
    }
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
    bgm.audio.volume = BGM_VOLUME;
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

  function syncToggleLabel() {
    if (!button) return;
    button.setAttribute("aria-pressed", bgm.on ? "true" : "false");
    const label = bgm.on ? "BGM 켬" : "BGM 끔";
    if (labelEl) labelEl.textContent = label;
    else button.textContent = label;
  }

  function syncMenuSelection() {
    for (const item of menuItems) {
      const trackId = item.dataset.bgmTrack;
      const selected = trackId === bgm.track;
      item.setAttribute("aria-checked", selected ? "true" : "false");
    }
  }

  /**
   * @param {boolean} open
   */
  function setMenuOpen(open) {
    if (!menu || !settingsButton) return;
    const next = !!open;
    menu.hidden = !next;
    settingsButton.setAttribute("aria-expanded", next ? "true" : "false");
  }

  function toggleMenu() {
    if (!menu) return;
    setMenuOpen(menu.hidden);
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
    syncMenuSelection();

    ensureAudioForTrack();

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
    syncToggleLabel();

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

  function restoreFromStorage() {
    let nextOn = true;

    try {
      const savedTrack = localStorage.getItem(trackStorageKey);
      if (isValidTrack(savedTrack)) bgm.track = savedTrack;
    } catch {
      // ignore
    }
    syncMenuSelection();

    try {
      const v = localStorage.getItem(storageKey);
      if (v === "0") nextOn = false;
      else if (v === "1") nextOn = true;
    } catch {
      nextOn = true;
    }

    setOn(nextOn, { autoplay: false });
  }

  settingsButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMenu();
  });

  document.addEventListener("pointerdown", (event) => {
    if (!menu || menu.hidden) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (menu.contains(target)) return;
    if (settingsButton?.contains(target)) return;
    setMenuOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    setMenuOpen(false);
  });

  for (const item of menuItems) {
    item.addEventListener("click", () => {
      const trackId = item.dataset.bgmTrack;
      if (!isValidTrack(trackId)) return;
      setTrack(trackId, { autoplay: true });
      setMenuOpen(false);
    });
  }

  syncToggleLabel();
  syncMenuSelection();
  setMenuOpen(false);

  return {
    isOn: () => bgm.on,
    setOn,
    toggle,
    setTrack,
    getTrack: () => bgm.track,
    restoreFromStorage,
  };
}
