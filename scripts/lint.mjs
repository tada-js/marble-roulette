import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { transformSync } from "esbuild";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const exts = new Set([".js", ".mjs", ".jsx", ".ts", ".tsx"]);

function walk(dir, out) {
  for (const ent of readdirSync(dir)) {
    if (ent === "node_modules" || ent === ".git" || ent === "output" || ent === "dist-vite" || ent === ".next") continue;
    const p = path.join(dir, ent);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (exts.has(path.extname(p))) out.push(p);
  }
}

const files = [];
walk(root, files);

let ok = true;
for (const f of files) {
  try {
    const ext = path.extname(f);
    if (ext === ".jsx" || ext === ".tsx" || ext === ".ts") {
      const source = readFileSync(f, "utf8");
      const loader = ext === ".jsx" ? "jsx" : ext === ".tsx" ? "tsx" : "ts";
      transformSync(source, { loader, format: "esm" });
    } else {
      execFileSync(process.execPath, ["--check", f], { stdio: "pipe" });
    }
  } catch (e) {
    ok = false;
    const msg = e?.stderr?.toString?.() || e?.message || String(e);
    console.error(`[lint] node --check failed: ${f}\n${msg}`);
  }
}

if (!ok) process.exit(1);
console.log(`[lint] ok (${files.length} files)`);
