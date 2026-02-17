import { createInquiryApiHandler } from "../scripts/inquiry-api.mjs";

const API_CSP = "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
const METHOD_ERROR_HEADERS = Object.freeze({
  Allow: "POST",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Content-Security-Policy": API_CSP,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
});

const handleInquiry = createInquiryApiHandler({
  toEmail: String(process.env.INQUIRY_TO_EMAIL || "").trim(),
  fromEmail: String(process.env.INQUIRY_FROM_EMAIL || "onboarding@resend.dev").trim(),
  resendApiKey: String(process.env.RESEND_API_KEY || "").trim(),
  allowedOrigins: String(process.env.INQUIRY_ALLOWED_ORIGINS || "").trim(),
});

/**
 * Vercel Node.js Function for /api/inquiry
 *
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export default async function inquiryApi(req, res) {
  const method = String(req.method || "GET").toUpperCase();
  if (method !== "POST") {
    res.writeHead(405, METHOD_ERROR_HEADERS);
    res.end(JSON.stringify({ ok: false, message: "허용되지 않는 메서드입니다." }));
    return;
  }

  try {
    await handleInquiry(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    console.error("[api/inquiry] unexpected failure:", message);
    res.writeHead(500, METHOD_ERROR_HEADERS);
    res.end(JSON.stringify({ ok: false, message: "문의 전송 중 오류가 발생했습니다." }));
  }
}
