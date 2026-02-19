import { getDefaultBalls } from "../game/assets.ts";
import { getCurrentLanguage } from "../i18n/runtime.ts";

const KEY = "marble-roulette:balls:v1";
const COUNTS_KEY = "marble-roulette:ball-counts:v1";

function cloneDefaultBalls() {
  return structuredClone(getDefaultBalls(getCurrentLanguage()));
}

export function loadBallsCatalog() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return cloneDefaultBalls();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return cloneDefaultBalls();
    const safe = [];
    for (const it of parsed) {
      if (!it || typeof it !== "object") continue;
      if (typeof it.id !== "string" || !it.id) continue;
      if (typeof it.name !== "string" || !it.name) continue;
      if (typeof it.imageDataUrl !== "string" || !it.imageDataUrl.startsWith("data:image/")) continue;
      safe.push({
        id: it.id.slice(0, 40),
        name: it.name.slice(0, 40),
        imageDataUrl: it.imageDataUrl,
        tint: typeof it.tint === "string" ? it.tint : "#ffffff"
      });
    }
    return safe.length ? safe : cloneDefaultBalls();
  } catch {
    return cloneDefaultBalls();
  }
}

export function saveBallsCatalog(balls) {
  localStorage.setItem(KEY, JSON.stringify(balls));
}

export function restoreDefaultBalls() {
  localStorage.removeItem(KEY);
  return cloneDefaultBalls();
}

export function loadBallCounts(ballsCatalog) {
  const counts = {};
  for (const b of ballsCatalog) counts[b.id] = 1;
  try {
    const raw = localStorage.getItem(COUNTS_KEY);
    if (!raw) return counts;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return counts;
    for (const b of ballsCatalog) {
      const v = parsed[b.id];
      if (typeof v === "number" && Number.isFinite(v)) counts[b.id] = Math.max(1, Math.min(99, v | 0));
    }
    return counts;
  } catch {
    return counts;
  }
}

export function saveBallCounts(counts) {
  localStorage.setItem(COUNTS_KEY, JSON.stringify(counts));
}
