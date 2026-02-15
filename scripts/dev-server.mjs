import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const port = Number(process.env.PORT || 5173);

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

function safePath(p) {
  const decoded = decodeURIComponent(p.split("?")[0]);
  const clean = decoded.replaceAll("\\", "/");
  const joined = path.join(root, clean);
  if (!joined.startsWith(root)) return null;
  return joined;
}

const server = http.createServer((req, res) => {
  const url = req.url || "/";
  const reqPath = url === "/" ? "/index.html" : url;
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

