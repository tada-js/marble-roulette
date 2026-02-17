import { classifyAvatarGlyph, getAvatarTextLayout } from "./avatar-glyph.ts";

type BallCatalogItem = {
  id: string;
  name: string;
  imageDataUrl: string;
  tint: string;
};

function escapeXml(s: string): string {
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function sanitizeHexColor(v: unknown, fallback: string): string {
  const s = String(v || "");
  if (/^#[0-9a-fA-F]{3}$/.test(s)) return s;
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  return fallback;
}

function renderAvatarGlyphText(name: string): string {
  const glyph = classifyAvatarGlyph(name);
  const layout = getAvatarTextLayout(glyph.kind);
  const attrs: string[] = [
    `x="${layout.x}"`,
    `y="${layout.y}"`,
    `text-anchor="middle"`,
    `font-family="${escapeXml(layout.fontFamily)}"`,
    `font-size="${layout.fontSize}"`,
    `font-weight="${layout.fontWeight}"`,
    `fill="${layout.fill}"`,
  ];

  if (layout.dy) attrs.push(`dy="${layout.dy}"`);
  if (layout.dominantBaseline) attrs.push(`dominant-baseline="${layout.dominantBaseline}"`);
  if (layout.style) attrs.push(`style="${layout.style}"`);

  return `<text ${attrs.join("\n          ")}>${escapeXml(glyph.grapheme)}</text>`;
}

function makeLetterBall({
  id,
  name,
  c0,
  c1,
  tint,
}: {
  id: string;
  name: string;
  c0: unknown;
  c1: unknown;
  tint: unknown;
}): BallCatalogItem {
  const glyphMarkup = renderAvatarGlyphText(name);
  const sc0 = sanitizeHexColor(c0, "#ffffff");
  const sc1 = sanitizeHexColor(c1, sc0);
  const svg =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" data-dg-avatar="1">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="${sc0}"/>
            <stop offset="1" stop-color="${sc1}"/>
          </linearGradient>
          <radialGradient id="v" cx="45%" cy="32%" r="78%">
            <stop offset="0" stop-color="rgba(255,255,255,0.18)"/>
            <stop offset="1" stop-color="rgba(0,0,0,0.62)"/>
          </radialGradient>
        </defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <rect width="128" height="128" rx="64" fill="url(#v)"/>
        ${glyphMarkup}
      </svg>`
    );
  const st = sanitizeHexColor(tint, sc0);
  return { id, name, imageDataUrl: svg, tint: st };
}

export function isSystemBallAvatarUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!value.startsWith("data:image/svg+xml")) return false;

  const hasMarker =
    value.includes("data-dg-avatar%3D%221%22") ||
    value.includes('data-dg-avatar="1"') ||
    value.includes("radialGradient%20id%3D%22v%22") ||
    value.includes('radialGradient id="v"') ||
    value.includes("paint-order%3A%20stroke") ||
    value.includes("paint-order: stroke");

  return hasMarker;
}

function readSystemBallGradient(value: string): { c0: string; c1: string } | null {
  if (!isSystemBallAvatarUrl(value)) return null;
  const commaIndex = value.indexOf(",");
  if (commaIndex < 0) return null;

  const encoded = value.slice(commaIndex + 1);
  let svg = encoded;
  try {
    svg = decodeURIComponent(encoded);
  } catch {
    // Keep raw payload if decodeURIComponent fails.
  }

  const c0 = svg.match(/<stop offset="0" stop-color="([^"]+)"/)?.[1];
  const c1 = svg.match(/<stop offset="1" stop-color="([^"]+)"/)?.[1];
  if (!c0 || !c1) return null;

  const sc0 = sanitizeHexColor(c0, "#ffffff");
  return {
    c0: sc0,
    c1: sanitizeHexColor(c1, sc0),
  };
}

export const DEFAULT_BALLS: BallCatalogItem[] = [
  makeLetterBall({ id: "dog", name: "강아지", c0: "#ffd36b", c1: "#ff2e7a", tint: "#ffb000" }),
  makeLetterBall({ id: "rabbit", name: "토끼", c0: "#7df3d3", c1: "#2aa6ff", tint: "#45f3c3" }),
  makeLetterBall({ id: "hamster", name: "햄스터", c0: "#ffe9b7", c1: "#caa0ff", tint: "#caa0ff" }),
];

// Library for adding new balls (capped to 15).
export const BALL_LIBRARY: BallCatalogItem[] = [
  ...DEFAULT_BALLS,
  makeLetterBall({ id: "cat", name: "고양이", c0: "#ff7ad9", c1: "#7a5cff", tint: "#ff7ad9" }),
  makeLetterBall({ id: "guineapig", name: "기니피그", c0: "#ffde7a", c1: "#ff7a7a", tint: "#ffde7a" }),
  makeLetterBall({ id: "panda", name: "판다", c0: "#5df0ff", c1: "#00ffa8", tint: "#5df0ff" }),
  makeLetterBall({ id: "redpanda", name: "레서판다", c0: "#ffb36b", c1: "#ff4d6d", tint: "#ffb36b" }),
  makeLetterBall({ id: "capybara", name: "카피바라", c0: "#ffd36b", c1: "#8bffb0", tint: "#ffd36b" }),
  makeLetterBall({ id: "quokka", name: "쿼카", c0: "#caa0ff", c1: "#2aa6ff", tint: "#caa0ff" }),
  makeLetterBall({ id: "otter", name: "수달", c0: "#7df3d3", c1: "#ffb000", tint: "#7df3d3" }),
  makeLetterBall({ id: "tiger", name: "호랑이", c0: "#ffb000", c1: "#ff4d6d", tint: "#ffb000" }),
  makeLetterBall({ id: "fox", name: "여우", c0: "#ff9f2e", c1: "#ff2e7a", tint: "#ff9f2e" }),
  makeLetterBall({ id: "magpie", name: "까치", c0: "#9afcff", c1: "#ffffff", tint: "#9afcff" }),
  makeLetterBall({ id: "elephant", name: "코끼리", c0: "#9aa8c4", c1: "#2aa6ff", tint: "#9aa8c4" }),
  makeLetterBall({ id: "penguin", name: "펭귄", c0: "#2aa6ff", c1: "#00ffa8", tint: "#2aa6ff" }),
];

export function buildSystemBallImageDataUrl({
  ballId,
  name,
  fallbackImageDataUrl = "",
  tint = "#ffffff",
}: {
  ballId: string;
  name: string;
  fallbackImageDataUrl?: string;
  tint?: string;
}): string {
  const lib = BALL_LIBRARY.find((item) => item.id === ballId);
  const fromLibrary = lib ? readSystemBallGradient(lib.imageDataUrl) : null;
  const fromFallback = readSystemBallGradient(fallbackImageDataUrl);
  const gradient = fromLibrary || fromFallback || {
    c0: sanitizeHexColor(tint, "#ffffff"),
    c1: sanitizeHexColor(tint, "#ffffff"),
  };

  const normalizedTint = sanitizeHexColor(tint, gradient.c0);
  return makeLetterBall({
    id: ballId,
    name,
    c0: gradient.c0,
    c1: gradient.c1,
    tint: normalizedTint,
  }).imageDataUrl;
}
