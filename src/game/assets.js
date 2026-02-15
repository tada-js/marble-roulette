export const DEFAULT_BALLS = [
  {
    id: "dog",
    name: "강아지",
    // Simple inline SVG so the repo stays self-contained.
    imageDataUrl:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#ffd36b"/>
              <stop offset="1" stop-color="#ff9f2e"/>
            </linearGradient>
          </defs>
          <rect width="128" height="128" rx="64" fill="url(#g)"/>
          <circle cx="64" cy="70" r="34" fill="#fff5e6" opacity="0.95"/>
          <ellipse cx="40" cy="44" rx="14" ry="18" fill="#c9733d"/>
          <ellipse cx="88" cy="44" rx="14" ry="18" fill="#c9733d"/>
          <circle cx="52" cy="70" r="4" fill="#1b1b1b"/>
          <circle cx="76" cy="70" r="4" fill="#1b1b1b"/>
          <path d="M64 76c6 0 10 4 10 8s-4 10-10 10-10-6-10-10 4-8 10-8z" fill="#1b1b1b"/>
          <path d="M54 92c6 6 14 6 20 0" fill="none" stroke="#c0562f" stroke-width="6" stroke-linecap="round"/>
        </svg>`
      ),
    tint: "#ffb000"
  },
  {
    id: "rabbit",
    name: "토끼",
    imageDataUrl:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#7df3d3"/>
              <stop offset="1" stop-color="#2aa6ff"/>
            </linearGradient>
          </defs>
          <rect width="128" height="128" rx="64" fill="url(#g)"/>
          <ellipse cx="48" cy="36" rx="12" ry="30" fill="#f8fbff"/>
          <ellipse cx="80" cy="36" rx="12" ry="30" fill="#f8fbff"/>
          <ellipse cx="48" cy="40" rx="7" ry="20" fill="#ff98b5" opacity="0.85"/>
          <ellipse cx="80" cy="40" rx="7" ry="20" fill="#ff98b5" opacity="0.85"/>
          <circle cx="64" cy="74" r="34" fill="#f8fbff"/>
          <circle cx="52" cy="72" r="4" fill="#1b1b1b"/>
          <circle cx="76" cy="72" r="4" fill="#1b1b1b"/>
          <path d="M64 76c6 0 10 4 10 8s-4 10-10 10-10-6-10-10 4-8 10-8z" fill="#ff4d6d"/>
          <path d="M54 92c6 6 14 6 20 0" fill="none" stroke="#9aa8c4" stroke-width="6" stroke-linecap="round"/>
        </svg>`
      ),
    tint: "#45f3c3"
  },
  {
    id: "hamster",
    name: "햄스터",
    imageDataUrl:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stop-color="#ffe9b7"/>
              <stop offset="1" stop-color="#caa0ff"/>
            </linearGradient>
          </defs>
          <rect width="128" height="128" rx="64" fill="url(#g)"/>
          <circle cx="64" cy="72" r="38" fill="#fff7ea"/>
          <circle cx="38" cy="60" r="10" fill="#ffcf9f"/>
          <circle cx="90" cy="60" r="10" fill="#ffcf9f"/>
          <circle cx="52" cy="72" r="4" fill="#1b1b1b"/>
          <circle cx="76" cy="72" r="4" fill="#1b1b1b"/>
          <ellipse cx="64" cy="82" rx="8" ry="6" fill="#c0562f"/>
          <path d="M50 92c10 10 18 10 28 0" fill="none" stroke="#d7b091" stroke-width="6" stroke-linecap="round"/>
        </svg>`
      ),
    tint: "#caa0ff"
  }
];

