import test from "node:test";
import assert from "node:assert/strict";
import { buildSystemBallImageDataUrl, isSystemBallAvatarUrl } from "../src/game/assets.ts";

function decodeSvg(dataUrl) {
  const commaIndex = String(dataUrl).indexOf(",");
  if (commaIndex < 0) return "";
  const payload = String(dataUrl).slice(commaIndex + 1);
  try {
    return decodeURIComponent(payload);
  } catch {
    return payload;
  }
}

test("buildSystemBallImageDataUrl updates glyph from the latest name (emoji 포함)", () => {
  const base = buildSystemBallImageDataUrl({ ballId: "rabbit", name: "토끼" });
  const emoji = buildSystemBallImageDataUrl({ ballId: "rabbit", name: "☺️토끼" });

  assert.equal(isSystemBallAvatarUrl(base), true);
  assert.equal(isSystemBallAvatarUrl(emoji), true);
  assert.notEqual(base, emoji);

  const svg = decodeSvg(emoji);
  assert.equal(svg.includes(">☺"), true);
  assert.equal(svg.includes('data-dg-avatar="1"'), true);
  assert.equal(svg.includes('x="49%"'), true);
  assert.equal(svg.includes('y="56%"'), true);
  assert.equal(svg.includes('font-size="56"'), true);
  assert.equal(svg.includes('dominant-baseline="middle"'), true);
});
