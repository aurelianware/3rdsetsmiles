import test from "node:test";
import assert from "node:assert/strict";
import { execSync, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

let built = false;
function ensureBuild() {
  if (built) return;
  execSync("npm run build", { cwd: repoRoot, stdio: "pipe" });
  built = true;
}

function readSitemap() {
  return readFileSync(path.join(repoRoot, "_site", "sitemap.xml"), "utf8");
}

// Pull the <lastmod> out of the <url> block whose <loc> ends with `urlPath`.
function lastmodFor(xml, urlPath) {
  const block = xml
    .split(/<url>/)
    .find((b) => b.includes(`<loc>https://www.3rdsetsmiles.com${urlPath}</loc>`));
  assert.ok(block, `sitemap has no <url> block for ${urlPath}`);
  const m = block.match(/<lastmod>(.*?)<\/lastmod>/);
  assert.ok(m, `sitemap <url> for ${urlPath} has no <lastmod>`);
  return m[1];
}

function lastmodOrNull(xml, urlPath) {
  const block = xml
    .split(/<url>/)
    .find((b) => b.includes(`<loc>https://www.3rdsetsmiles.com${urlPath}</loc>`));
  assert.ok(block, `sitemap has no <url> block for ${urlPath}`);
  const m = block.match(/<lastmod>(.*?)<\/lastmod>/);
  return m ? m[1] : null;
}

const git = (...args) => execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();

// The date the sitemap should report for a git-dated file, or null when the
// file's last commit is a shallow-clone boundary (date unknowable, so the
// sitemap must omit <lastmod> rather than repeat the boundary date).
function gitLastCommitDate(relFile) {
  const [hash, date] = git("log", "-1", "--format=%H %cs", "--", relFile).split(" ");
  const shallowFile = path.resolve(repoRoot, git("rev-parse", "--git-path", "shallow"));
  let boundaries = "";
  try { boundaries = readFileSync(shallowFile, "utf8"); } catch (e) { /* full clone */ }
  return boundaries.includes(hash) ? null : date;
}

// Guards the sitemap <lastmod> rules: an explicit front-matter date wins
// (blog posts carry `dateUpdated`), otherwise the file's last git commit, never
// filesystem mtime — mtime collapses to the build day on a fresh CI checkout.
test("blog post <lastmod> is its dateUpdated front matter", () => {
  ensureBuild();
  const xml = readSitemap();
  const src = readFileSync(path.join(repoRoot, "src/blog/all-on-4-candidacy.md"), "utf8");
  const updated = src.match(/^dateUpdated: (\d{4}-\d{2}-\d{2})/m)[1];
  assert.equal(lastmodFor(xml, "/blog/all-on-4-candidacy/"), updated);
});

test("sitemap <lastmod> values are not all the build date (mtime regression guard)", () => {
  ensureBuild();
  const xml = readSitemap();
  const dates = [...xml.matchAll(/<lastmod>(.*?)<\/lastmod>/g)].map((m) => m[1]);
  assert.ok(dates.length > 1, "expected multiple sitemap entries");

  const today = new Date().toISOString().slice(0, 10);
  const distinct = new Set(dates);
  // Real per-file commit history yields several distinct dates; an mtime/build
  // regression would stamp every entry with a single (usually today's) date.
  assert.ok(
    distinct.size > 1,
    `expected varied <lastmod> dates, got one value: ${[...distinct]}`
  );
  assert.ok(
    !(distinct.size === 1 && distinct.has(today)),
    "every <lastmod> is today's build date — lastmod fell back to mtime"
  );
});

test("sitemap lists the Tempe dentures and dental-implants pages with git-based lastmod", () => {
  ensureBuild();
  const xml = readSitemap();
  for (const [url, file] of [["/services/dentures/", "src/services/dentures.njk"],
    ["/services/dental-implants/", "src/services/dental-implants.njk"]])
    assert.equal(lastmodOrNull(xml, url), gitLastCommitDate(file), url);
  assert.ok(!xml.includes("/review/"), "noindex /review/ is excluded");
  assert.ok(!xml.includes("404"), "404 page is excluded");
});

test("robots.txt references the sitemap and blocks no assets or indexable pages", () => {
  ensureBuild();
  const robots = readFileSync(path.join(repoRoot, "_site", "robots.txt"), "utf8");
  assert.match(robots, /^Sitemap: https:\/\/www\.3rdsetsmiles\.com\/sitemap\.xml$/m);
  const disallowed = [...robots.matchAll(/^Disallow:\s*(\S+)/gm)].map((m) => m[1]);
  const locs = [...readSitemap().matchAll(/<loc>https:\/\/www\.3rdsetsmiles\.com([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const rule of disallowed) {
    assert.ok(!"/assets/css/main.css".startsWith(rule) && !"/assets/js/main.js".startsWith(rule), `robots blocks assets: ${rule}`);
    for (const loc of locs) assert.ok(!loc.startsWith(rule), `robots blocks indexable ${loc}`);
  }
});

test("sitemap never lists demo, test or preview routes", () => {
  ensureBuild();
  const locs = [...readSitemap().matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  for (const loc of locs)
    assert.doesNotMatch(loc, /^\/(?:hero-demo|demos?|tests?|previews?|drafts?|staging)(?:[-/]|$)/i, loc);
});
