import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";

function makeReq(payload, method = "POST", headers = {}) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload || {});
  const req = Readable.from([body]);
  req.headers = {
    host: "127.0.0.1:5173",
    ...headers,
  };
  req.socket = { remoteAddress: "127.0.0.1" };
  req.method = method;
  req.url = "/api/inquiry";
  return req;
}

function makeRes() {
  const data = { status: 0, headers: {}, body: "" };
  return {
    data,
    writeHead(status, headers) {
      data.status = status;
      data.headers = headers || {};
    },
    end(body = "") {
      data.body = String(body);
    },
  };
}

test("vercel inquiry function rejects non-POST methods", async () => {
  delete process.env.INQUIRY_TO_EMAIL;
  delete process.env.INQUIRY_FROM_EMAIL;
  delete process.env.RESEND_API_KEY;
  delete process.env.INQUIRY_ALLOWED_ORIGINS;

  const { default: inquiryApi } = await import(`../api/inquiry.mjs?test=${Date.now()}`);
  const req = makeReq({}, "GET");
  const res = makeRes();

  await inquiryApi(req, res);
  const payload = JSON.parse(res.data.body);

  assert.equal(res.data.status, 405);
  assert.equal(payload.ok, false);
});

test("vercel inquiry function returns 503 when env is missing", async () => {
  delete process.env.INQUIRY_TO_EMAIL;
  delete process.env.INQUIRY_FROM_EMAIL;
  delete process.env.RESEND_API_KEY;
  delete process.env.INQUIRY_ALLOWED_ORIGINS;

  const { default: inquiryApi } = await import(`../api/inquiry.mjs?test=${Date.now()}-2`);
  const req = makeReq({
    email: "tester@example.com",
    subject: "문의 제목",
    message: "문의 본문은 최소 열 글자 이상입니다.",
    website: "",
    openedAt: Date.now() - 2500,
  });
  const res = makeRes();

  await inquiryApi(req, res);
  const payload = JSON.parse(res.data.body);

  assert.equal(res.data.status, 503);
  assert.equal(payload.ok, false);
});
