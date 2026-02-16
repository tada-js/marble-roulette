import { BALL_LIBRARY } from "../game/assets.ts";
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
      const isSvg = url.startsWith("data:image/svg+xml");
      const isOurSvg =
        isSvg &&
        (url.includes("radialGradient%20id%3D%22v%22") ||
          url.includes('radialGradient id="v"') ||
          url.includes("paint-order%3A%20stroke") ||
          url.includes("paint-order: stroke"));

      if (isOurSvg && url !== lib.imageDataUrl) {
        changed = true;
        return { ...b, imageDataUrl: lib.imageDataUrl, tint: lib.tint };
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
    if (nextName === target.name) return false;
    const next = catalog.slice();
    next[idx] = { ...target, name: nextName };
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
    getCatalogMax: () => BALL_LIBRARY.length,
    isAtMax: () => catalog.length >= BALL_LIBRARY.length,
    getWinnerPayload,
    notifyCatalogMutated: onCatalogChange,
  };
}
