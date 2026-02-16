const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const XSS_RE = /<[^>]*>|javascript:|on\w+\s*=|data:text\/html/i;

/**
 * Create an inquiry API handler closure.
 *
 * @param {{
 *   toEmail: string;
 *   fromEmail: string;
 *   resendApiKey: string;
 *   fetchImpl?: typeof fetch;
 * }} config
 */
export function createInquiryApiHandler(config) {
  const toEmail = String(config?.toEmail || "").trim();
  const fromEmail = String(config?.fromEmail || "onboarding@resend.dev").trim();
  const resendApiKey = String(config?.resendApiKey || "").trim();
  const fetchImpl = config?.fetchImpl || fetch;
  const inquiryRate = new Map();

  /**
   * @param {import("node:http").ServerResponse} res
   * @param {number} status
   * @param {Record<string, unknown>} payload
   */
  function sendJson(res, status, payload) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
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
  function isRateLimited(ip) {
    const now = Date.now();
    const slot = inquiryRate.get(ip);
    if (!slot || now > slot.resetAt) {
      inquiryRate.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
      return false;
    }
    slot.count += 1;
    if (slot.count > RATE_LIMIT_MAX) return true;
    return false;
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
    const name = cleanText(payload.name, 40);
    const email = cleanText(payload.email, 120);
    const subject = cleanText(payload.subject, 80);
    const message = cleanMessage(payload.message, 2000);
    const website = cleanText(payload.website, 200);
    const openedAt = Number(payload.openedAt || 0);
    const elapsedMs = Number.isFinite(openedAt) ? Date.now() - openedAt : 0;

    if (website) return { ok: false, code: 400, message: "잘못된 요청입니다." };
    if (!name || !email || !subject || !message) {
      return { ok: false, code: 400, message: "이름, 이메일, 제목, 내용을 모두 입력해 주세요." };
    }
    if (subject.length < 2) return { ok: false, code: 400, message: "제목을 2자 이상 입력해 주세요." };
    if (message.length < 10) return { ok: false, code: 400, message: "내용을 10자 이상 입력해 주세요." };
    if (!looksLikeEmail(email)) return { ok: false, code: 400, message: "이메일 형식이 올바르지 않습니다." };
    if (hasSuspiciousMarkup(name) || hasSuspiciousMarkup(email) || hasSuspiciousMarkup(subject) || hasSuspiciousMarkup(message)) {
      return { ok: false, code: 400, message: "허용되지 않는 입력 형식이 포함되어 있습니다." };
    }
    if (!openedAt || elapsedMs < 1500 || elapsedMs > 60 * 60 * 1000) {
      return { ok: false, code: 400, message: "요청 검증에 실패했습니다. 다시 시도해 주세요." };
    }
    const urlCount = (message.match(/https?:\/\/|www\./gi) || []).length;
    if (urlCount > 3) return { ok: false, code: 400, message: "링크가 너무 많습니다." };

    return { ok: true, data: { name, email, subject, message } };
  }

  /**
   * @param {{name: string; email: string; subject: string; message: string; ip: string; ua: string;}} input
   */
  async function sendInquiryMail(input) {
    const safeName = input.name || "-";
    const safeEmail = input.email || "-";
    const body = [
      "[데구르르 문의]",
      "",
      `이름: ${safeName}`,
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

    const clientIp = getClientIp(req);
    if (isRateLimited(clientIp)) {
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

      const ua = cleanText(String(req.headers["user-agent"] || ""), 200);
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
