import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createInquiryApiHandler } from "../scripts/inquiry-api.mjs";

function makeReq(payload, headers = {}) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload || {});
  const req = Readable.from([body]);
  req.headers = {
    host: "127.0.0.1:5173",
    ...headers,
  };
  req.socket = { remoteAddress: "127.0.0.1" };
  req.method = "POST";
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

test("inquiry api returns 503 when env config is missing", async () => {
  const handler = createInquiryApiHandler({ toEmail: "", fromEmail: "", resendApiKey: "" });
  const req = makeReq({});
  const res = makeRes();

  await handler(req, res);
  const payload = JSON.parse(res.data.body);

  assert.equal(res.data.status, 503);
  assert.equal(payload.ok, false);
});

test("inquiry api sends mail for a valid request", async () => {
  const sent = [];
  const handler = createInquiryApiHandler({
    toEmail: "receiver@example.com",
    fromEmail: "sender@example.com",
    resendApiKey: "re_test_key",
    fetchImpl: async (url, init) => {
      sent.push({ url, init });
      return {
        ok: true,
        text: async () => "ok",
      };
    },
  });

  const req = makeReq({
    email: "tester@example.com",
    subject: "문의 제목",
    message: "문의 본문은 최소 열 글자 이상입니다.",
    website: "",
    openedAt: Date.now() - 2500,
  }, {
    "user-agent": "node-test",
  });
  const res = makeRes();

  await handler(req, res);
  const payload = JSON.parse(res.data.body);

  assert.equal(res.data.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(sent.length, 1);
});

test("inquiry api rejects disallowed origin", async () => {
  const handler = createInquiryApiHandler({
    toEmail: "receiver@example.com",
    fromEmail: "sender@example.com",
    resendApiKey: "re_test_key",
    fetchImpl: async () => ({ ok: true, text: async () => "ok" }),
  });
  const req = makeReq(
    {
      email: "tester@example.com",
      subject: "문의 제목",
      message: "문의 본문은 최소 열 글자 이상입니다.",
      website: "",
      openedAt: Date.now() - 2500,
    },
    {
      origin: "https://evil.example",
      "user-agent": "node-test",
    }
  );
  const res = makeRes();

  await handler(req, res);
  const payload = JSON.parse(res.data.body);

  assert.equal(res.data.status, 403);
  assert.equal(payload.ok, false);
});

test("inquiry api rate limits repeated requests from same client fingerprint", async () => {
  const handler = createInquiryApiHandler({
    toEmail: "receiver@example.com",
    fromEmail: "sender@example.com",
    resendApiKey: "re_test_key",
    fetchImpl: async () => ({ ok: true, text: async () => "ok" }),
    rateLimitMax: 2,
    rateLimitGlobalMax: 10,
    rateLimitWindowMs: 10 * 60 * 1000,
  });

  const payload = {
    email: "tester@example.com",
    subject: "문의 제목",
    message: "문의 본문은 최소 열 글자 이상입니다.",
    website: "",
    openedAt: Date.now() - 2500,
  };

  const firstRes = makeRes();
  await handler(
    makeReq(payload, {
      origin: "http://127.0.0.1:5173",
      "user-agent": "node-test",
    }),
    firstRes
  );
  assert.equal(firstRes.data.status, 200);

  const secondRes = makeRes();
  await handler(
    makeReq(payload, {
      origin: "http://127.0.0.1:5173",
      "user-agent": "node-test",
    }),
    secondRes
  );
  assert.equal(secondRes.data.status, 200);

  const thirdRes = makeRes();
  await handler(
    makeReq(payload, {
      origin: "http://127.0.0.1:5173",
      "user-agent": "node-test",
    }),
    thirdRes
  );
  assert.equal(thirdRes.data.status, 429);
});
