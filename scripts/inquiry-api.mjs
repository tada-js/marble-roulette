const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const GLOBAL_RATE_LIMIT_MAX = 80;
const RATE_LIMIT_SWEEP_INTERVAL_MS = 60 * 1000;
const RATE_LIMIT_MAX_KEYS = 4096;
const XSS_RE = /<[^>]*>|javascript:|on\w+\s*=|data:text\/html/i;
const API_CSP = "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
const SEC_HEADERS = Object.freeze({
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
});
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/**
 * @param {unknown} value
 */
function normalizeOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    const origin = String(parsed.origin || "").toLowerCase();
    return origin === "null" ? "" : origin;
  } catch {
    return "";
  }
}

/**
 * @param {unknown} value
 */
function normalizeHost(value) {
  return String(value || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
}

/**
 * @param {import("node:http").IncomingMessage} req
 */
function resolveRequestOrigin(req) {
  const origin = normalizeOrigin(req.headers.origin);
  if (origin) return origin;
  const referer = normalizeOrigin(req.headers.referer || req.headers.referrer);
  if (referer) return referer;
  return "";
}

/**
 * @param {import("node:http").IncomingMessage} req
 */
function resolveRequestHostOrigin(req) {
  const forwardedHost = normalizeHost(req.headers["x-forwarded-host"]);
  const host = forwardedHost || normalizeHost(req.headers.host);
  if (!host) return "";
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const proto = forwardedProto === "https" ? "https" : "http";
  return normalizeOrigin(`${proto}://${host}`);
}

/**
 * @param {string} origin
 */
function extractOriginHostname(origin) {
  try {
    return String(new URL(origin).hostname || "").toLowerCase();
  } catch {
    return "";
  }
}

/**
 * @param {string} requestOrigin
 * @param {string} hostOrigin
 */
function isLoopbackOriginPair(requestOrigin, hostOrigin) {
  const requestHost = extractOriginHostname(requestOrigin);
  const hostHost = extractOriginHostname(hostOrigin);
  return LOOPBACK_HOSTS.has(requestHost) && LOOPBACK_HOSTS.has(hostHost);
}

/**
 * @param {unknown} value
 */
function parseAllowedOrigins(value) {
  if (!value) return new Set();
  const raw = Array.isArray(value) ? value : String(value).split(",");
  const normalized = raw.map((entry) => normalizeOrigin(entry)).filter(Boolean);
  return new Set(normalized);
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @param {number} min
 * @param {number} max
 */
function toBoundedNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return Math.floor(n);
}

/**
 * @param {string} value
 */
function hashToken(value) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16);
}

/**
 * Create an inquiry API handler closure.
 *
 * @param {{
 *   toEmail: string;
 *   fromEmail: string;
 *   resendApiKey: string;
 *   fetchImpl?: typeof fetch;
 *   allowedOrigins?: string[] | string;
 *   rateLimitWindowMs?: number;
 *   rateLimitMax?: number;
 *   rateLimitGlobalMax?: number;
 * }} config
 */
export function createInquiryApiHandler(config) {
  const toEmail = String(config?.toEmail || "").trim();
  const fromEmail = String(config?.fromEmail || "onboarding@resend.dev").trim();
  const resendApiKey = String(config?.resendApiKey || "").trim();
  const fetchImpl = config?.fetchImpl || fetch;
  const allowedOrigins = parseAllowedOrigins(config?.allowedOrigins);
  const rateLimitWindowMs = toBoundedNumber(config?.rateLimitWindowMs, RATE_LIMIT_WINDOW_MS, 5 * 1000, 60 * 60 * 1000);
  const rateLimitMax = toBoundedNumber(config?.rateLimitMax, RATE_LIMIT_MAX, 1, 200);
  const rateLimitGlobalMax = toBoundedNumber(config?.rateLimitGlobalMax, GLOBAL_RATE_LIMIT_MAX, rateLimitMax, 2000);
  const inquiryRate = new Map();
  let lastSweepAt = 0;

  /**
   * @param {import("node:http").ServerResponse} res
   * @param {number} status
   * @param {Record<string, unknown>} payload
   */
  function sendJson(res, status, payload) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": API_CSP,
      ...SEC_HEADERS,
    });
    res.end(JSON.stringify(payload));
  }

  /**
   * @param {import("node:http").IncomingMessage} req
   */
  function getClientIp(req) {
    const xff = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (xff) return xff;
    return req.socket.remoteAddress || "unknown";
  }

  /**
   * @param {string} ip
   */
  function isRateLimited(ip, ua) {
    const now = Date.now();
    if (now - lastSweepAt >= RATE_LIMIT_SWEEP_INTERVAL_MS) {
      lastSweepAt = now;
      for (const [key, slot] of inquiryRate.entries()) {
        if (!slot || now > slot.resetAt) inquiryRate.delete(key);
      }
      if (inquiryRate.size > RATE_LIMIT_MAX_KEYS) {
        const overflow = inquiryRate.size - RATE_LIMIT_MAX_KEYS;
        const victims = Array.from(inquiryRate.entries())
          .sort((a, b) => (a[1]?.resetAt || 0) - (b[1]?.resetAt || 0))
          .slice(0, overflow);
        for (const [key] of victims) inquiryRate.delete(key);
      }
    }

    const clientKey = `${ip}|${hashToken(String(ua || "").slice(0, 160))}`;
    const globalKey = "__global__";

    const globalSlot = inquiryRate.get(globalKey);
    if (!globalSlot || now > globalSlot.resetAt) {
      inquiryRate.set(globalKey, { count: 1, resetAt: now + rateLimitWindowMs });
    } else {
      globalSlot.count += 1;
      if (globalSlot.count > rateLimitGlobalMax) return true;
    }

    const clientSlot = inquiryRate.get(clientKey);
    if (!clientSlot || now > clientSlot.resetAt) {
      inquiryRate.set(clientKey, { count: 1, resetAt: now + rateLimitWindowMs });
      return false;
    }
    clientSlot.count += 1;
    if (clientSlot.count > rateLimitMax) return true;
    return false;
  }

  /**
   * @param {import("node:http").IncomingMessage} req
   */
  function isOriginAllowed(req) {
    const requestOrigin = resolveRequestOrigin(req);
    if (!requestOrigin) return true;
    if (allowedOrigins.has(requestOrigin)) return true;
    const hostOrigin = resolveRequestHostOrigin(req);
    if (!hostOrigin) return false;
    if (requestOrigin === hostOrigin) return true;
    return isLoopbackOriginPair(requestOrigin, hostOrigin);
  }

  /**
   * @param {import("node:http").IncomingMessage} req
   * @param {number} [maxBytes]
   */
  function readJsonBody(req, maxBytes = 16 * 1024) {
    return new Promise((resolve, reject) => {
      let size = 0;
      let raw = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          reject(new Error("PAYLOAD_TOO_LARGE"));
          req.destroy();
          return;
        }
        raw += chunk;
      });
      req.on("end", () => {
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch {
          reject(new Error("INVALID_JSON"));
        }
      });
      req.on("error", () => reject(new Error("READ_FAILED")));
    });
  }

  /**
   * @param {unknown} value
   * @param {number} maxLen
   */
  function cleanText(value, maxLen) {
    return String(value || "")
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLen);
  }

  /**
   * @param {unknown} value
   * @param {number} maxLen
   */
  function cleanMessage(value, maxLen) {
    return String(value || "")
      .replace(/\r/g, "")
      .replace(/\u0000/g, "")
      .trim()
      .slice(0, maxLen);
  }

  /**
   * @param {string} value
   */
  function looksLikeEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  /**
   * @param {unknown} value
   */
  function hasSuspiciousMarkup(value) {
    return XSS_RE.test(String(value || ""));
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function validateInquiry(payload) {
    const email = cleanText(payload.email, 120);
    const subject = cleanText(payload.subject, 80);
    const message = cleanMessage(payload.message, 2000);
    const website = cleanText(payload.website, 200);
    const openedAt = Number(payload.openedAt || 0);
    const elapsedMs = Number.isFinite(openedAt) ? Date.now() - openedAt : 0;

    if (website) return { ok: false, code: 400, message: "잘못된 요청입니다." };
    if (!email || !subject || !message) {
      return { ok: false, code: 400, message: "이메일, 제목, 내용을 모두 입력해 주세요." };
    }
    if (subject.length < 2) return { ok: false, code: 400, message: "제목을 2자 이상 입력해 주세요." };
    if (message.length < 10) return { ok: false, code: 400, message: "내용을 10자 이상 입력해 주세요." };
    if (!looksLikeEmail(email)) return { ok: false, code: 400, message: "이메일 형식이 올바르지 않습니다." };
    if (hasSuspiciousMarkup(email) || hasSuspiciousMarkup(subject) || hasSuspiciousMarkup(message)) {
      return { ok: false, code: 400, message: "허용되지 않는 입력 형식이 포함되어 있습니다." };
    }
    if (!openedAt || elapsedMs < 1500 || elapsedMs > 60 * 60 * 1000) {
      return { ok: false, code: 400, message: "요청 검증에 실패했습니다. 다시 시도해 주세요." };
    }
    const urlCount = (message.match(/https?:\/\/|www\./gi) || []).length;
    if (urlCount > 3) return { ok: false, code: 400, message: "링크가 너무 많습니다." };

    return { ok: true, data: { email, subject, message } };
  }

  /**
   * @param {{email: string; subject: string; message: string; ip: string; ua: string;}} input
   */
  async function sendInquiryMail(input) {
    const safeEmail = input.email || "-";
    const body = [
      "[데구르르 문의]",
      "",
      `이메일: ${safeEmail}`,
      `IP: ${input.ip}`,
      `UA: ${input.ua || "-"}`,
      "",
      "내용:",
      input.message,
    ].join("\n");

    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject: `[데구르르 문의] ${input.subject}`,
        text: body,
        reply_to: input.email || undefined,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`RESEND_FAILED:${response.status}:${text.slice(0, 120)}`);
    }
  }

  /**
   * @param {import("node:http").IncomingMessage} req
   * @param {import("node:http").ServerResponse} res
   */
  return async function handleInquiry(req, res) {
    if (!toEmail || !resendApiKey) {
      sendJson(res, 503, { ok: false, message: "문의 전송이 아직 설정되지 않았습니다." });
      return;
    }

    if (!isOriginAllowed(req)) {
      sendJson(res, 403, { ok: false, message: "허용되지 않은 출처에서 요청했습니다." });
      return;
    }

    const clientIp = getClientIp(req);
    const ua = cleanText(String(req.headers["user-agent"] || ""), 200);
    if (isRateLimited(clientIp, ua)) {
      sendJson(res, 429, { ok: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." });
      return;
    }

    try {
      const payload = await readJsonBody(req);
      const validated = validateInquiry(payload);
      if (!validated.ok) {
        sendJson(res, validated.code, { ok: false, message: validated.message });
        return;
      }

      await sendInquiryMail({ ...validated.data, ip: clientIp, ua });
      sendJson(res, 200, { ok: true, message: "문의가 정상적으로 전송되었습니다." });
    } catch (err) {
      const message = err instanceof Error ? err.message : "UNKNOWN";
      if (message === "PAYLOAD_TOO_LARGE") {
        sendJson(res, 413, { ok: false, message: "요청 본문이 너무 큽니다." });
        return;
      }
      if (message === "INVALID_JSON") {
        sendJson(res, 400, { ok: false, message: "요청 형식이 올바르지 않습니다." });
        return;
      }
      console.error("[inquiry] send failed:", message);
      sendJson(res, 502, { ok: false, message: "문의 전송 중 오류가 발생했습니다." });
    }
  };
}
