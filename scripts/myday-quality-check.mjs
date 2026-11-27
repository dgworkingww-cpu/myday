import { readdir, readFile } from "node:fs/promises";
import { join, relative, extname } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const ignored = new Set([".git", "node_modules", "vendor", "dist", "build"]);
const files = [];

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignored.has(entry.name)) await walk(join(dir, entry.name));
    } else if (entry.isFile() && extname(entry.name) === ".js") {
      files.push(join(dir, entry.name));
    }
  }
}

await walk(root);
const htmlPath = join(root, "index.html");
const html = await readFile(htmlPath, "utf8");
const inlineScripts = [...html.matchAll(/<script\\b([^>]*)>([\\s\\S]*?)<\\/script>/gi)]
  .filter(([, attrs, body]) => !/\\bsrc\\s*=/.test(attrs) && body.trim())
  .map(([, , body]) => body);

if (!inlineScripts.length) {
  console.error("Quality check failed: no inline JavaScript found in index.html.");
  process.exit(1);
}

const checks = [
  ...files.map((file) => ({ label: relative(root, file), source: await readFile(file, "utf8") })),
  ...inlineScripts.map((source, index) => ({ label: `index.html inline script #${index + 1}`, source })),
];

let failed = false;
for (const check of checks) {
  const result = spawnSync(process.execPath, ["--check"], { input: check.source, encoding: "utf8" });
  if (result.status !== 0) {
    failed = true;
    console.error(`\\n[FAIL] ${check.label}\\n${result.stderr || result.stdout}`);
  } else {
    console.log(`[PASS] ${check.label}`);
  }
}

if (failed) process.exit(1);
console.log(`\\nMYDAY quality gate passed: ${checks.length} JavaScript syntax checks.`);
