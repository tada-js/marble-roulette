function escapeXml(s) {
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function firstChar(s) {
  // Properly handles Hangul/etc by iterating Unicode codepoints.
  return Array.from(String(s || ""))[0] || "?";
}

function makeLetterBall({ id, name, c0, c1, tint }) {
  const ch = escapeXml(firstChar(name));
  const svg =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="${c0}"/>
            <stop offset="1" stop-color="${c1}"/>
          </linearGradient>
          <radialGradient id="v" cx="45%" cy="32%" r="78%">
            <stop offset="0" stop-color="rgba(255,255,255,0.18)"/>
            <stop offset="1" stop-color="rgba(0,0,0,0.62)"/>
          </radialGradient>
        </defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <rect width="128" height="128" rx="64" fill="url(#v)"/>
        <text x="64" y="78"
          text-anchor="middle"
          font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
          font-size="68"
          font-weight="950"
          fill="rgba(255,255,255,0.96)"
          style="paint-order: stroke; stroke: rgba(0,0,0,0.45); stroke-width: 10px; stroke-linejoin: round;"
        >${ch}</text>
      </svg>`
    );
  return { id, name, imageDataUrl: svg, tint: tint || c0 || "#ffffff" };
}

export const DEFAULT_BALLS = [
  makeLetterBall({ id: "dog", name: "강아지", c0: "#ffd36b", c1: "#ff2e7a", tint: "#ffb000" }),
  makeLetterBall({ id: "rabbit", name: "토끼", c0: "#7df3d3", c1: "#2aa6ff", tint: "#45f3c3" }),
  makeLetterBall({ id: "hamster", name: "햄스터", c0: "#ffe9b7", c1: "#caa0ff", tint: "#caa0ff" }),
];

// Library for adding new balls (capped to 15).
export const BALL_LIBRARY = [
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
