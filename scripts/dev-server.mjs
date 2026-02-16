import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInquiryApiHandler } from "./inquiry-api.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

loadDotEnv(path.join(root, ".env"));
loadDotEnv(path.join(root, ".env.local"));

const port = Number(process.env.PORT || 5173);
const inquiryToEmail = String(process.env.INQUIRY_TO_EMAIL || "").trim();
const inquiryFromEmail = String(process.env.INQUIRY_FROM_EMAIL || "onboarding@resend.dev").trim();
const resendApiKey = String(process.env.RESEND_API_KEY || "").trim();
const handleInquiry = createInquiryApiHandler({
  toEmail: inquiryToEmail,
  fromEmail: inquiryFromEmail,
  resendApiKey,
});

const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"]
]);

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith("\"") && val.endsWith("\"")) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function safePath(p) {
  const decoded = decodeURIComponent(p.split("?")[0]);
  const clean = decoded.replaceAll("\\", "/");
  const joined = path.join(root, clean);
  if (!joined.startsWith(root)) return null;
  return joined;
}

const server = http.createServer(async (req, res) => {
  const method = req.method || "GET";
  const url = req.url || "/";
  const pathname = url.split("?")[0];

  if (method === "POST" && pathname === "/api/inquiry") {
    await handleInquiry(req, res);
    return;
  }

  const reqPath = pathname === "/" ? "/index.html" : url;
  const abs = safePath(reqPath);
  if (!abs) {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }

  fs.readFile(abs, (err, buf) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(abs).toLowerCase();
    res.writeHead(200, {
      "Content-Type": mime.get(ext) || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(buf);
  });
});

server.listen(port, "127.0.0.1", () => {
  // Keep output minimal; CI/dev tooling can parse it.
  console.log(`dev server: http://127.0.0.1:${port}`);
});
