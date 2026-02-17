export type AvatarGlyphKind = "emoji" | "text" | "unknown";

export type AvatarGlyphInfo =
  | { kind: "emoji"; grapheme: string }
  | { kind: "text"; grapheme: string }
  | { kind: "unknown"; grapheme: "?" };

export type AvatarTextLayout = {
  x: string;
  y: string;
  dy?: string;
  dominantBaseline?: "middle";
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fill: string;
  style?: string;
};

type AvatarOffsetFactors = {
  xFactor: number;
  yFactor: number;
};

const UNKNOWN_GRAPHEME = "?" as const;

const GLYPH_CLASSIFIERS: Array<{
  kind: Extract<AvatarGlyphKind, "emoji" | "text">;
  test: (grapheme: string) => boolean;
}> = [
  {
    kind: "emoji",
    test: (grapheme) => {
      try {
        return /\p{Extended_Pictographic}/u.test(grapheme);
      } catch {
        return false;
      }
    },
  },
  {
    kind: "text",
    test: () => true,
  },
];

const AVATAR_TEXT_LAYOUT_BY_KIND: Record<AvatarGlyphKind, AvatarTextLayout> = {
  emoji: {
    x: "49%",
    y: "56%",
    dominantBaseline: "middle",
    fontFamily:
      "Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
    fontSize: 56,
    fontWeight: 700,
    fill: "rgba(255,255,255,0.98)",
  },
  text: {
    x: "50%",
    y: "50%",
    dy: "0.35em",
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
    fontSize: 72,
    fontWeight: 950,
    fill: "rgba(255,255,255,0.96)",
    style: "paint-order: stroke; stroke: rgba(0,0,0,0.45); stroke-width: 10px; stroke-linejoin: round;",
  },
  unknown: {
    x: "50%",
    y: "50%",
    dy: "0.35em",
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
    fontSize: 72,
    fontWeight: 950,
    fill: "rgba(255,255,255,0.96)",
    style: "paint-order: stroke; stroke: rgba(0,0,0,0.45); stroke-width: 10px; stroke-linejoin: round;",
  },
};

const AVATAR_OFFSET_FACTORS_BY_KIND: Record<AvatarGlyphKind, AvatarOffsetFactors> = {
  emoji: { xFactor: 0.1, yFactor: 0 },
  text: { xFactor: 0, yFactor: 0 },
  unknown: { xFactor: 0, yFactor: 0 },
};

export function extractFirstGrapheme(value: string): string {
  const text = String(value || "");
  if (!text) return "";

  const Segmenter = (Intl as unknown as {
    Segmenter?: new (...args: unknown[]) => {
      segment: (input: string) => Iterable<{ segment?: string }>;
    };
  }).Segmenter;

  if (typeof Segmenter === "function") {
    try {
      const segmenter = new Segmenter(undefined, { granularity: "grapheme" });
      for (const token of segmenter.segment(text)) {
        if (token?.segment) return token.segment;
      }
    } catch {
      // Fallback below.
    }
  }

  return Array.from(text)[0] || "";
}

export function classifyAvatarGlyph(name: string): AvatarGlyphInfo {
  const grapheme = extractFirstGrapheme(name);
  if (!grapheme) return { kind: "unknown", grapheme: UNKNOWN_GRAPHEME };

  const classifier = GLYPH_CLASSIFIERS.find((entry) => entry.test(grapheme));
  if (!classifier) return { kind: "unknown", grapheme: UNKNOWN_GRAPHEME };
  if (classifier.kind === "emoji") return { kind: "emoji", grapheme };
  return { kind: "text", grapheme };
}

export function getAvatarTextLayout(kind: AvatarGlyphKind): AvatarTextLayout {
  return AVATAR_TEXT_LAYOUT_BY_KIND[kind];
}

export function getAvatarImageOffset(kind: AvatarGlyphKind, radius: number): { x: number; y: number } {
  const factors = AVATAR_OFFSET_FACTORS_BY_KIND[kind];
  return {
    x: radius * factors.xFactor,
    y: radius * factors.yFactor,
  };
}
