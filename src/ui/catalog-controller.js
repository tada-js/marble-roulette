import {
  BALL_LIBRARY,
  buildSystemBallImageDataUrl,
  isSystemBallAvatarUrl,
} from "../game/assets.ts";
import {
  loadBallsCatalog,
  loadBallCounts,
  restoreDefaultBalls,
  saveBallsCatalog,
  saveBallCounts,
} from "./storage.js";

/**
 * Create catalog controller for balls/settings/images.
 * This module is intentionally UI-framework agnostic (no direct DOM access).
 *
 * @param {{
 *   state: { mode?: string; ballsCatalog?: unknown[]; counts?: Record<string, number> };
 *   onCatalogChange?: () => void;
 }} opts
 */
export function createCatalogController(opts) {
  const { state, onCatalogChange = () => {} } = opts;

  const imagesById = new Map();
  let catalog = normalizeInitialCatalog(loadBallsCatalog());

  state.ballsCatalog = catalog;
  state.counts = loadBallCounts(catalog);
  refreshImages();

  function normalizeInitialCatalog(input) {
    const libById = new Map(BALL_LIBRARY.map((b) => [b.id, b]));
    let changed = false;

    const next = (Array.isArray(input) ? input : []).map((b) => {
      const lib = libById.get(b?.id);
      if (!lib) return b;

      const url = String(b?.imageDataUrl || "");
      const nextName = sanitizeName(b?.name, lib.name);
      const normalizedAutoAvatar = buildSystemBallImageDataUrl({
        ballId: lib.id,
        name: nextName,
        fallbackImageDataUrl: url,
        tint: typeof b?.tint === "string" ? b.tint : lib.tint,
      });

      if (isSystemBallAvatarUrl(url) && url !== normalizedAutoAvatar) {
        changed = true;
        return {
          ...b,
          name: nextName,
          imageDataUrl: normalizedAutoAvatar,
          tint: typeof b?.tint === "string" ? b.tint : lib.tint,
        };
      }
      return b;
    });

    if (changed) saveBallsCatalog(next);
    return next;
  }

  function refreshImages() {
    imagesById.clear();
    for (const b of catalog) {
      const img = new Image();
      img.src = b.imageDataUrl;
      imagesById.set(b.id, img);
    }
  }

  /**
   * @param {Array<{id: string}>} next
   */
  function setCatalog(next) {
    catalog = next;
    state.ballsCatalog = next;

    const nextCounts = {};
    for (const b of next) nextCounts[b.id] = state.counts?.[b.id] ?? 1;
    state.counts = nextCounts;
    saveBallCounts(state.counts);
    refreshImages();
    onCatalogChange();
  }

  function sanitizeName(name, fallback) {
    const value = String(name || "")
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40);
    return value || fallback;
  }

  function isDataImageUrl(value) {
    return typeof value === "string" && value.startsWith("data:image/");
  }

  function addNextBall() {
    if (catalog.length >= BALL_LIBRARY.length) return false;
    const used = new Set(catalog.map((b) => b.id));
    const nextBall = BALL_LIBRARY.find((b) => !used.has(b.id));
    if (!nextBall) return false;
    const next = [...catalog, structuredClone(nextBall)];
    saveBallsCatalog(next);
    setCatalog(next);
    return true;
  }

  /**
   * @param {string} ballId
   */
  function removeBall(ballId) {
    if (catalog.length <= 1) return false;
    const next = catalog.filter((b) => b.id !== ballId);
    if (next.length === catalog.length) return false;
    saveBallsCatalog(next);
    setCatalog(next);
    return true;
  }

  /**
   * @param {string} ballId
   * @param {string} name
   */
  function updateBallName(ballId, name) {
    const idx = catalog.findIndex((b) => b.id === ballId);
    if (idx < 0) return false;
    const target = catalog[idx];
    const nextName = sanitizeName(name, target.name);
    const shouldSyncAvatar = isSystemBallAvatarUrl(target.imageDataUrl);
    const nextImageDataUrl = shouldSyncAvatar
      ? buildSystemBallImageDataUrl({
          ballId: target.id,
          name: nextName,
          fallbackImageDataUrl: target.imageDataUrl,
          tint: target.tint,
        })
      : target.imageDataUrl;
    if (nextName === target.name && nextImageDataUrl === target.imageDataUrl) return false;
    const next = catalog.slice();
    next[idx] = { ...target, name: nextName, imageDataUrl: nextImageDataUrl };
    saveBallsCatalog(next);
    setCatalog(next);
    return true;
  }

  /**
   * @param {string} ballId
   * @param {string} imageDataUrl
   */
  function updateBallImage(ballId, imageDataUrl) {
    if (!isDataImageUrl(imageDataUrl)) return false;
    const idx = catalog.findIndex((b) => b.id === ballId);
    if (idx < 0) return false;
    const target = catalog[idx];
    if (target.imageDataUrl === imageDataUrl) return false;
    const next = catalog.slice();
    next[idx] = { ...target, imageDataUrl };
    saveBallsCatalog(next);
    setCatalog(next);
    return true;
  }

  function restoreDefaults() {
    const next = restoreDefaultBalls();
    saveBallsCatalog(next);
    setCatalog(next);
    return true;
  }

  /**
   * Replace entire catalog from external draft (used by settings "Apply").
   *
   * @param {Array<{id?: unknown; name?: unknown; imageDataUrl?: unknown; tint?: unknown}>} nextInput
   */
  function replaceCatalog(nextInput) {
    const libById = new Map(BALL_LIBRARY.map((b) => [b.id, b]));
    const used = new Set();
    const next = [];

    for (const item of Array.isArray(nextInput) ? nextInput : []) {
      const id = String(item?.id || "");
      if (!id || used.has(id)) continue;
      const lib = libById.get(id);
      if (!lib) continue;
      used.add(id);

      next.push({
        id,
        name: sanitizeName(item?.name, lib.name),
        imageDataUrl: isDataImageUrl(item?.imageDataUrl) ? item.imageDataUrl : lib.imageDataUrl,
        tint: typeof item?.tint === "string" ? item.tint : lib.tint,
      });
    }

    if (!next.length) return false;
    if (JSON.stringify(next) === JSON.stringify(catalog)) return false;

    saveBallsCatalog(next);
    setCatalog(next);
    return true;
  }

  /**
   * @param {string | undefined} ballId
   */
  function getWinnerPayload(ballId) {
    if (!ballId) return null;
    const b = catalog.find((x) => x.id === ballId);
    return {
      name: b?.name || ballId || "알 수 없는 공",
      img: b?.imageDataUrl || "",
    };
  }

  return {
    getCatalog: () => catalog,
    getImagesById: () => imagesById,
    saveCounts: saveBallCounts,
    addNextBall,
    removeBall,
    updateBallName,
    updateBallImage,
    restoreDefaults,
    replaceCatalog,
    getCatalogMax: () => BALL_LIBRARY.length,
    isAtMax: () => catalog.length >= BALL_LIBRARY.length,
    getWinnerPayload,
    notifyCatalogMutated: onCatalogChange,
  };
}
