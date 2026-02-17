import Toastify from "toastify-js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const XSS_RE = /<[^>]*>|javascript:|on\w+\s*=|data:text\/html/i;

export const INQUIRY_LIMITS = Object.freeze({
  email: 120,
  subject: 80,
  message: 2000,
  website: 200,
});

/**
 * @param {unknown} value
 * @param {number} maxLen
 */
export function sanitizeSingleLine(value, maxLen) {
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
export function sanitizeMultiLine(value, maxLen) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLen);
}

/**
 * @param {unknown} value
 */
export function hasSuspiciousMarkup(value) {
  return XSS_RE.test(String(value || ""));
}

/**
 * @param {{email: unknown; subject: unknown; message: unknown; website?: unknown;}} input
 * @returns {{ok: true; data: {email: string; subject: string; message: string; website: string}} | {ok: false; field: "email" | "subject" | "message"; message: string}}
 */
export function validateInquiryInput(input) {
  const email = sanitizeSingleLine(input?.email, INQUIRY_LIMITS.email).toLowerCase();
  const subject = sanitizeSingleLine(input?.subject, INQUIRY_LIMITS.subject);
  const message = sanitizeMultiLine(input?.message, INQUIRY_LIMITS.message);
  const website = sanitizeSingleLine(input?.website, INQUIRY_LIMITS.website);

  if (!email) return { ok: false, field: "email", message: "이메일을 입력해 주세요." };
  if (!EMAIL_RE.test(email)) return { ok: false, field: "email", message: "이메일 형식이 올바르지 않습니다." };
  if (!subject) return { ok: false, field: "subject", message: "제목을 입력해 주세요." };
  if (!message) return { ok: false, field: "message", message: "내용을 입력해 주세요." };

  const fieldChecks = [
    ["email", email],
    ["subject", subject],
    ["message", message],
  ];
  const firstBadField = fieldChecks.find((entry) => hasSuspiciousMarkup(entry[1]))?.[0];
  if (firstBadField) {
    return { ok: false, field: firstBadField, message: "허용되지 않는 입력 형식이 포함되어 있습니다." };
  }

  return {
    ok: true,
    data: { email, subject, message, website },
  };
}

/**
 * @param {{email: string; subject: string; message: string; website: string; openedAt: number;}} payload
 * @param {{endpoint?: string}} [opts]
 */
export async function submitInquiry(payload, opts = {}) {
  const endpoint = opts.endpoint || "/api/inquiry";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.ok) {
    return {
      ok: false,
      message: result?.message || "문의 전송에 실패했습니다.",
    };
  }
  return { ok: true, message: String(result?.message || "문의가 정상적으로 전송되었습니다.") };
}

/**
 * @param {string} message
 * @param {"success" | "error"} [type]
 * @param {number} [durationMs]
 */
export function showInquiryToast(message, type = "success", durationMs = 2200) {
  const makeToast = typeof Toastify === "function" ? Toastify : null;
  if (!makeToast) return;
  const isError = type === "error";
  makeToast({
    text: message,
    duration: durationMs,
    gravity: "bottom",
    position: "right",
    stopOnFocus: true,
    close: false,
    className: `dg-toast ${isError ? "dg-toast--error" : "dg-toast--success"}`,
    offset: { x: 18, y: 18 },
  }).showToast();
}
