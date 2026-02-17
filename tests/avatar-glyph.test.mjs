import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyAvatarGlyph,
  getAvatarImageOffset,
  getAvatarTextLayout,
} from "../src/game/avatar-glyph.ts";

test("classifyAvatarGlyph returns emoji kind for emoji-leading name", () => {
  const glyph = classifyAvatarGlyph("☺️토끼");
  assert.equal(glyph.kind, "emoji");
  assert.equal(glyph.grapheme.startsWith("☺"), true);
});

test("classifyAvatarGlyph returns text kind for normal Korean name", () => {
  const glyph = classifyAvatarGlyph("토끼");
  assert.equal(glyph.kind, "text");
  assert.equal(glyph.grapheme, "토");
});

test("avatar layouts and offsets are data-driven by glyph kind", () => {
  const emojiLayout = getAvatarTextLayout("emoji");
  const textLayout = getAvatarTextLayout("text");
  const emojiOffset = getAvatarImageOffset("emoji", 20);
  const textOffset = getAvatarImageOffset("text", 20);

  assert.equal(emojiLayout.x, "49%");
  assert.equal(emojiLayout.y, "56%");
  assert.equal(textLayout.x, "50%");
  assert.equal(textLayout.y, "50%");
  assert.equal(emojiOffset.x > 0, true);
  assert.equal(emojiOffset.y, 0);
  assert.equal(textOffset.x, 0);
  assert.equal(textOffset.y, 0);
});

