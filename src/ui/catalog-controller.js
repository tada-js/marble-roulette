import { BALL_LIBRARY } from "../game/assets.js";
import { loadBallsCatalog, loadBallCounts, saveBallsCatalog, saveBallCounts } from "./storage.js";
import { mountSettingsDialog } from "./settings.js";

/**
 * Create catalog controller for balls/settings/images.
 *
 * @param {{
 *   state: { mode?: string; ballsCatalog?: unknown[]; counts?: Record<string, number> };
 *   addBallBtn?: HTMLButtonElement | null;
 *   settingsDialog?: HTMLDialogElement | null;
 *   settingsList?: HTMLElement | null;
 *   restoreDefaultsBtn?: HTMLButtonElement | null;
 *   onCatalogChange?: () => void;
 }} opts
 */
export function createCatalogController(opts) {
  const {
    state,
    addBallBtn,
    settingsDialog,
    settingsList,
    restoreDefaultsBtn,
    onCatalogChange = () => {},
  } = opts;

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

  const settings = mountSettingsDialog(
    settingsDialog,
    settingsList,
    restoreDefaultsBtn,
    () => catalog,
    setCatalog
  );

  addBallBtn?.addEventListener("click", () => {
    if (state.mode === "playing") return;
    if (catalog.length >= BALL_LIBRARY.length) return;

    const used = new Set(catalog.map((b) => b.id));
    const nextBall = BALL_LIBRARY.find((b) => !used.has(b.id));
    if (!nextBall) return;

    const next = [...catalog, structuredClone(nextBall)];
    saveBallsCatalog(next);
    setCatalog(next);
    settings.render?.();
  });

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
    openSettings: () => settings.open(),
    saveCounts: saveBallCounts,
    getWinnerPayload,
    notifyCatalogMutated: onCatalogChange,
  };
}
