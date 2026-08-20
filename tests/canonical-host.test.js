// canonical-host.test.js — guards the single canonical hostname.
//
// www.3rdsetsmiles.com is the ONE public host; the apex (3rdsetsmiles.com)
// must only ever be a redirect source, never a canonical/sitemap/schema/OG
// destination. These assertions run against the BUILT _site output (not the
// repo), so legitimate apex strings in docs and in scripts/verify-domain.sh
// (which must reference both hosts to test them) never trip the guard.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = createRequire(import.meta.url)(path.join(root, "src", "_data", "site.json"));

const CANON = "https://www.3rdsetsmiles.com";
// Apex host WITHOUT the www. label. `//3rdsetsmiles.com` can never match
// `//www.3rdsetsmiles.com`, so this flags only true apex references.
const APEX = /https?:\/\/3rdsetsmiles\.com/;

let built = false;
function out(rel) {
  if (!built) { execSync("npm run build", { cwd: root, stdio: "pipe" }); built = true; }
  return readFileSync(path.join(root, "_site", rel), "utf8");
}

test("site config canonical domain is the www host", () => {
  assert.equal(site.domain, CANON);
});

// A spread of page types: home, deep content, service, provider, office.
const PAGES = [
  "index.html",
  "new-patients/index.html",
  "services/dental-implants/index.html",
  "about/index.html",
  "office/index.html",
];

test("no built page references the apex host (canonical, OG, schema, links)", () => {
  for (const p of PAGES) {
    const html = out(p);
    assert.doesNotMatch(html, APEX, `${p} must not reference the apex host`);
  }
});

test("every page's canonical + og:url use the www host", () => {
  for (const p of PAGES) {
    const html = out(p);
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/);
    assert.ok(canonical, `${p} has a canonical tag`);
    assert.ok(canonical[1].startsWith(CANON + "/"), `${p} canonical uses www: ${canonical[1]}`);
    const og = html.match(/<meta property="og:url" content="([^"]+)"/);
    assert.ok(og && og[1].startsWith(CANON + "/"), `${p} og:url uses www: ${og && og[1]}`);
  }
});

test("structured data entity/image URLs use the www host", () => {
  const ld = [...out("index.html").matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1]));
  const dentist = ld.find((o) => o["@type"] === "Dentist");
  assert.ok(dentist, "Dentist JSON-LD present");
  assert.ok(String(dentist.url).startsWith(CANON), "Dentist.url is www");
  assert.ok(String(dentist["@id"]).startsWith(CANON), "Dentist @id is www");
  for (const img of [].concat(dentist.image || [])) {
    assert.ok(String(img).startsWith(CANON), `Dentist image is www: ${img}`);
  }
});

test("sitemap contains only www URLs, no apex, and excludes robots.txt", () => {
  const xml = out("sitemap.xml");
  assert.doesNotMatch(xml, APEX, "sitemap has no apex URL");
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.length > 10, "sitemap has entries");
  for (const loc of locs) assert.ok(loc.startsWith(CANON + "/"), `loc uses www: ${loc}`);
  assert.ok(!locs.some((l) => l.endsWith("/robots.txt")), "robots.txt is not a sitemap entry");
});

test("robots.txt points at the canonical www sitemap and no apex", () => {
  const robots = out("robots.txt");
  assert.doesNotMatch(robots, APEX, "robots.txt has no apex URL");
  assert.match(robots, new RegExp(`^Sitemap: ${CANON.replace(/[.]/g, "\\.")}/sitemap\\.xml$`, "m"));
});
