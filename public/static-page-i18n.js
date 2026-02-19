(() => {
  const STORAGE_KEY = "degururu:language";

  const PAGE_MESSAGES = {
    offline: {
      ko: {
        "meta.title": "오프라인 | 데구르르",
        title: "오프라인 상태입니다",
        desc: "네트워크 연결 후 다시 시도해 주세요. 연결이 복구되면 게임을 바로 이어서 사용할 수 있어요.",
        retry: "다시 시도",
      },
      en: {
        "meta.title": "Offline | Degururu",
        title: "You are offline",
        desc: "Please reconnect to the network and try again. Once connected, you can jump right back into the game.",
        retry: "Retry",
      },
    },
    privacy: {
      ko: {
        "meta.title": "개인정보 처리방침 | Degururu",
        h1: "개인정보 처리방침",
        h2_1: "1. 수집 항목",
        li_1: "이메일",
        li_2: "문의 제목",
        li_3: "문의 내용",
        h2_2: "2. 이용 목적",
        p_2: "문의 확인, 답변 전달, 서비스 개선을 위한 최소한의 연락/기록 목적에만 사용합니다.",
        h2_3: "3. 보관 기간",
        p_3: "문의 처리 완료 후 최대 1년 보관 후 파기합니다.",
        h2_4: "4. 문의",
        p_4: "개인정보 관련 문의는 서비스 운영자에게 요청할 수 있습니다.",
        note: "본 문서는 운영 정책에 맞춰 변경될 수 있습니다.",
      },
      en: {
        "meta.title": "Privacy Policy | Degururu",
        h1: "Privacy Policy",
        h2_1: "1. Collected Data",
        li_1: "Email address",
        li_2: "Inquiry subject",
        li_3: "Inquiry message",
        h2_2: "2. Purpose of Use",
        p_2: "We use this information only to review inquiries, send replies, and keep minimal records for service improvement.",
        h2_3: "3. Retention Period",
        p_3: "Inquiry data is retained for up to one year after processing and then deleted.",
        h2_4: "4. Contact",
        p_4: "For privacy-related requests, please contact the service operator.",
        note: "This document may be updated according to operational policy.",
      },
    },
    "pinball-game": {
      ko: {
        "meta.title": "핀볼 게임 | 데구르르 (Degururu)",
        "meta.description": "데구르르는 공이 떨어지며 결과를 고르는 핀볼 게임입니다. 치지직 핀볼, 스트리머 핀볼, 모임 이벤트 게임으로 활용해 보세요.",
        "meta.ogTitle": "핀볼 게임 | 데구르르 (Degururu)",
        "meta.ogDescription": "공이 떨어지며 결과를 고르는 데구르르 핀볼 게임을 바로 플레이해 보세요.",
        h1: "데구르르 핀볼 게임",
        p1: "데구르르는 여러 개의 공이 보드를 내려오며 결과를 고르는 실시간 핀볼 게임입니다. 모임, 팀 정하기, 스트리머 방송 참여형 콘텐츠에서 빠르게 결과를 확인할 수 있습니다.",
        p2: "치지직 핀볼, 스트리머 핀볼, 이벤트용 참가자 선택 게임을 찾고 있다면 바로 플레이해 보세요.",
        cta: "데구르르 플레이하기",
        related: "관련 페이지:",
        relatedLink: "핀볼 사다리타기 안내",
      },
      en: {
        "meta.title": "Pinball Picker Game | Degururu",
        "meta.description": "Degururu is a real-time pinball picker game where marbles drop to decide outcomes. Great for streams, teams, and events.",
        "meta.ogTitle": "Pinball Picker Game | Degururu",
        "meta.ogDescription": "Play Degururu now and pick results with a pinball-style reveal.",
        h1: "Degururu Pinball Picker",
        p1: "Degururu is a real-time pinball picker where multiple marbles drop through the board to decide results. It is designed for quick picks in meetups, team selection, and live stream participation.",
        p2: "If you are looking for a stream-friendly pinball winner picker, start playing now.",
        cta: "Play Degururu",
        related: "Related page:",
        relatedLink: "Pinball ladder guide",
      },
    },
    "pinball-ladder": {
      ko: {
        "meta.title": "핀볼 사다리타기 | 데구르르 (Degururu)",
        "meta.description": "데구르르는 핀볼 사다리타기 방식으로 참가자를 선택하는 웹 게임입니다. 공의 이동을 보며 긴장감 있는 결과 공개를 경험해 보세요.",
        "meta.ogTitle": "핀볼 사다리타기 | 데구르르 (Degururu)",
        "meta.ogDescription": "핀볼 사다리타기 스타일로 결과를 선택하는 데구르르를 만나보세요.",
        h1: "핀볼 사다리타기 데구르르",
        p1: "데구르르는 핀볼 사다리타기 형태의 참가자 선택 게임으로, 공이 내려오는 과정을 보며 결과를 확인할 수 있습니다.",
        p2: "핀볼 게임 특유의 긴장감과 결과 공개 연출을 살리면서도, 모임/방송/이벤트에서 빠르게 사용할 수 있도록 설계됐습니다.",
        cta: "데구르르 시작하기",
        related: "관련 페이지:",
        relatedLink: "핀볼 게임 안내",
      },
      en: {
        "meta.title": "Pinball Ladder Picker | Degururu",
        "meta.description": "Degururu is a web game that picks participants with a pinball-ladder style flow. Watch marbles fall and reveal the result with suspense.",
        "meta.ogTitle": "Pinball Ladder Picker | Degururu",
        "meta.ogDescription": "Try Degururu for pinball-ladder style participant selection.",
        h1: "Degururu Pinball Ladder Picker",
        p1: "Degururu is a participant picker with a pinball-ladder style board, where you watch marbles travel and reveal the final result.",
        p2: "It keeps the suspense of pinball-style reveals while staying fast to use for meetups, streams, and events.",
        cta: "Start Degururu",
        related: "Related page:",
        relatedLink: "Pinball game guide",
      },
    },
  };

  function normalizeLanguage(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return null;
    if (raw === "ko" || raw.startsWith("ko-")) return "ko";
    if (raw === "en" || raw.startsWith("en-")) return "en";
    return null;
  }

  function detectLanguage() {
    try {
      const qs = new URL(window.location.href).searchParams.get("lang");
      const fromQuery = normalizeLanguage(qs);
      if (fromQuery) return fromQuery;
    } catch {
      // Ignore invalid URL parsing.
    }

    try {
      const fromStorage = normalizeLanguage(localStorage.getItem(STORAGE_KEY));
      if (fromStorage) return fromStorage;
    } catch {
      // Ignore storage errors.
    }

    return normalizeLanguage(navigator.language) || "ko";
  }

  function persistLanguage(language) {
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // Ignore storage errors.
    }
  }

  function setMeta(selector, value) {
    const node = document.querySelector(selector);
    if (!(node instanceof HTMLMetaElement)) return;
    node.content = value;
  }

  function applyPageLanguage(page, language) {
    const bundle = PAGE_MESSAGES[page];
    if (!bundle) return;
    const dict = bundle[language] || bundle.ko;

    document.documentElement.lang = language;

    if (dict["meta.title"]) {
      document.title = dict["meta.title"];
    }
    if (dict["meta.description"]) {
      setMeta('meta[name="description"]', dict["meta.description"]);
    }
    if (dict["meta.ogTitle"]) {
      setMeta('meta[property="og:title"]', dict["meta.ogTitle"]);
    }
    if (dict["meta.ogDescription"]) {
      setMeta('meta[property="og:description"]', dict["meta.ogDescription"]);
    }
    setMeta('meta[property="og:locale"]', language === "en" ? "en_US" : "ko_KR");

    const nodes = document.querySelectorAll("[data-i18n]");
    for (const node of nodes) {
      const key = node.getAttribute("data-i18n") || "";
      if (!key || !(key in dict)) continue;
      node.textContent = dict[key];
    }

    const options = document.querySelectorAll("[data-lang-option]");
    for (const option of options) {
      if (!(option instanceof HTMLButtonElement)) continue;
      const isActive = option.getAttribute("data-lang-option") === language;
      option.classList.toggle("is-active", isActive);
      option.setAttribute("aria-pressed", isActive ? "true" : "false");
    }
  }

  const page = document.documentElement.getAttribute("data-page");
  if (!page || !PAGE_MESSAGES[page]) return;

  const initialLanguage = detectLanguage();
  persistLanguage(initialLanguage);
  applyPageLanguage(page, initialLanguage);

  const options = document.querySelectorAll("[data-lang-option]");
  for (const option of options) {
    if (!(option instanceof HTMLButtonElement)) continue;
    option.addEventListener("click", () => {
      const next = normalizeLanguage(option.getAttribute("data-lang-option"));
      if (!next) return;
      persistLanguage(next);
      applyPageLanguage(page, next);
    });
  }
})();
