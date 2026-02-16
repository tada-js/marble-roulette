import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const BASE_REF = String(process.env.GITHUB_BASE_REF || "main").trim() || "main";

const SCAN_EXT = new Set([".js", ".mjs", ".jsx", ".ts", ".tsx", ".css", ".html"]);
const IGNORE_PREFIXES = ["node_modules/", "dist-vite/", ".next/", "output/"];

const FAILURE_RULES = [
  {
    id: "conflict-marker",
    desc: "git conflict marker",
    re: /^(<<<<<<<|=======|>>>>>>>)( .*)?$/gm,
  },
  {
    id: "xss-innerhtml",
    desc: "innerHTML assignment",
    re: /\.innerHTML\s*=/g,
  },
  {
    id: "danger-eval",
    desc: "eval/new Function usage",
    re: /\b(eval|Function)\s*\(/g,
  },
];

const WARNING_RULES = [
  {
    id: "debug-console-log",
    desc: "console.log usage",
    re: /\bconsole\.log\s*\(/g,
  },
  {
    id: "todo-left",
    desc: "TODO/FIXME left in code",
    re: /\b(TODO|FIXME)\b/g,
  },
];

function runGit(args) {
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function lineOf(text, idx) {
  let line = 1;
  for (let i = 0; i < idx; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

function shouldScan(rel) {
  if (!rel) return false;
  if (IGNORE_PREFIXES.some((prefix) => rel.startsWith(prefix))) return false;
  return SCAN_EXT.has(path.extname(rel).toLowerCase());
}

function collectChangedFiles() {
  try {
    execFileSync("git", ["fetch", "--no-tags", "--depth=1", "origin", BASE_REF], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    // ignore fetch errors and try with whatever refs are available.
  }

  const out = runGit(["diff", "--name-only", "--diff-filter=ACMRTUXB", `origin/${BASE_REF}...HEAD`]);
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(shouldScan);
}

function scanFiles(files) {
  const failures = [];
  const warnings = [];

  for (const rel of files) {
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const text = fs.readFileSync(abs, "utf8");

    for (const rule of FAILURE_RULES) {
      for (const m of text.matchAll(rule.re)) {
        failures.push({
          rule: rule.id,
          desc: rule.desc,
          file: rel,
          line: lineOf(text, m.index || 0),
        });
      }
    }

    for (const rule of WARNING_RULES) {
      for (const m of text.matchAll(rule.re)) {
        warnings.push({
          rule: rule.id,
          desc: rule.desc,
          file: rel,
          line: lineOf(text, m.index || 0),
        });
      }
    }
  }

  return { failures, warnings };
}

function printFindings(label, items) {
  if (!items.length) return;
  console.log(`${label} (${items.length})`);
  for (const item of items) {
    console.log(`- ${item.rule}: ${item.file}:${item.line} (${item.desc})`);
  }
}

const changed = collectChangedFiles();
console.log(`[senior-review] base=${BASE_REF}, scanned=${changed.length}`);

const { failures, warnings } = scanFiles(changed);
printFindings("[senior-review] warnings", warnings);

if (failures.length) {
  printFindings("[senior-review] failures", failures);
  process.exit(1);
}

console.log("[senior-review] passed");
