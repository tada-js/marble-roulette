import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

const TEXT_EXT = new Set([".js", ".mjs", ".html", ".css", ".md", ".yml", ".yaml", ".json"]);
const IGNORE_DIR = new Set([".git", "node_modules"]);

// High-confidence patterns only. Avoid noisy "SECRET"/"TOKEN" keywords.
const RULES = [
  {
    id: "pii-abs-path-macos",
    desc: "MacOS absolute user path",
    re: /\/Users\/[^/\s]+\/[^\s]*/g
  },
  {
    id: "pii-abs-path-win",
    desc: "Windows absolute user path",
    re: /[A-Za-z]:\\Users\\[^\\\s]+\\[^\s]*/g
  },
  {
    id: "secret-gh-token",
    desc: "GitHub token (ghp_/github_pat_...)",
    re: /\b(ghp_[0-9A-Za-z]{36}|github_pat_[0-9A-Za-z_]{60,})\b/g
  },
  {
    id: "secret-aws-access-key",
    desc: "AWS access key id (AKIA/ASIA...)",
    re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g
  },
  {
    id: "secret-slack-token",
    desc: "Slack token (xox*)",
    re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g
  },
  {
    id: "secret-google-api-key",
    desc: "Google API key (AIza...)",
    re: /\bAIza[0-9A-Za-z\-_]{35}\b/g
  },
  {
    id: "secret-private-key-block",
    desc: "Private key PEM block",
    re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g
  },
  {
    id: "xss-innerhtml-assign",
    desc: "innerHTML assignment (prefer replaceChildren/textContent)",
    re: /\.innerHTML\s*=/g
  },
  {
    id: "xss-insertadjacenthtml",
    desc: "insertAdjacentHTML usage",
    re: /\.insertAdjacentHTML\s*\(/g
  },
  {
    id: "danger-eval",
    desc: "eval/new Function usage",
    re: /\b(eval|Function)\s*\(/g
  }
];

function* walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) {
      if (IGNORE_DIR.has(e.name)) continue;
      yield* walk(path.join(dir, e.name));
    } else if (e.isFile()) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(REPO_ROOT, abs);
      const ext = path.extname(abs).toLowerCase();
      if (!TEXT_EXT.has(ext)) continue;
      yield { abs, rel };
    }
  }
}

function readText(abs) {
  // Ignore binary-ish files by catching utf8 decode issues.
  try {
    return fs.readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}

function lineOf(text, idx) {
  let line = 1;
  for (let i = 0; i < idx; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

const findings = [];
for (const f of walk(REPO_ROOT)) {
  const text = readText(f.abs);
  if (text == null) continue;
  for (const rule of RULES) {
    for (const m of text.matchAll(rule.re)) {
      const at = typeof m.index === "number" ? m.index : 0;
      findings.push({
        rule: rule.id,
        desc: rule.desc,
        file: f.rel,
        line: lineOf(text, at),
        match: String(m[0]).slice(0, 140)
      });
    }
  }
}

if (findings.length) {
  console.error("[security] failed: potential security/PII issues found");
  for (const f of findings) {
    console.error(`- ${f.rule}: ${f.file}:${f.line} (${f.desc}) -> ${f.match}`);
  }
  process.exit(1);
}

console.log("[security] ok");
