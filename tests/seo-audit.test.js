// seo-audit.test.js — runs scripts/seo-audit.js against a fresh build so every
// on-page SEO invariant (one canonical/title/description/H1 per page, unique
// titles and descriptions, valid JSON-LD, canonical internal links with no
// 404s, sitemap = canonical indexable pages) gates the test suite.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("built site passes the SEO crawl audit", () => {
  execSync("npm run build", { cwd: root, stdio: "pipe" });
  const run = spawnSync(process.execPath, ["scripts/seo-audit.js"], { cwd: root, encoding: "utf8" });
  const summary = run.stdout.slice(run.stdout.lastIndexOf("\n\n"));
  assert.equal(run.status, 0, summary);
});
