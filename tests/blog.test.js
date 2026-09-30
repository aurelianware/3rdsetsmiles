import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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

function readSite(relPath) {
  return readFileSync(path.join(repoRoot, "_site", relPath), "utf8");
}

test("blog routes are generated", () => {
  ensureBuild();
  assert.equal(existsSync(path.join(repoRoot, "_site", "blog", "index.html")), true);
  assert.equal(existsSync(path.join(repoRoot, "_site", "blog", "all-on-4-candidacy", "index.html")), true);
  assert.equal(existsSync(path.join(repoRoot, "_site", "blog", "all-on-4-vs-implant-supported-dentures", "index.html")), true);
  assert.equal(existsSync(path.join(repoRoot, "_site", "blog", "authors", "dr-matthew-phillips", "index.html")), true);
});

test("blog article outputs canonical, dates, and Article structured data", () => {
  ensureBuild();
  const html = readSite(path.join("blog", "all-on-4-candidacy", "index.html"));

  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/www\.3rdsetsmiles\.com\/blog\/all-on-4-candidacy\/">/
  );
  assert.match(html, /Published\s+August\s+10,\s+2026/i);
  assert.match(html, /Updated\s+August\s+10,\s+2026/i);
  assert.match(html, /"@type": "BlogPosting"/);
  assert.match(html, /"headline": "Am I a Candidate for All-on-4\?/);
  assert.match(html, /"datePublished": "2026-08-10T09:00:00-07:00"/);
  assert.match(html, /"dateModified": "2026-08-10T09:00:00-07:00"/);
  assert.match(html, /"url": "https:\/\/www\.3rdsetsmiles\.com\/blog\/authors\/dr-matthew-phillips\//);
  assert.match(html, /"@type": "BreadcrumbList"/);
});

test("sitemap includes blog index and first article", () => {
  ensureBuild();
  const xml = readSite("sitemap.xml");
  assert.match(xml, /<loc>https:\/\/www\.3rdsetsmiles\.com\/blog\/</);
  assert.match(xml, /<loc>https:\/\/www\.3rdsetsmiles\.com\/blog\/all-on-4-candidacy\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/www\.3rdsetsmiles\.com\/blog\/all-on-4-vs-implant-supported-dentures\/<\/loc>/);
});

test("implant recovery post targets local intent without restructuring the ranking content", () => {
  ensureBuild();
  const html = readSite("blog/implant-recovery-and-maintenance/index.html");
  assert.ok(html.includes("<title>Dental Implant Recovery &amp; Maintenance | Tempe Implant Dentist</title>"));
  assert.match(html, /<meta name="description" content="[^"]*Tempe[^"]*Book online\.">/);
  // Visible H1 and intro line are unchanged.
  assert.ok(html.includes("<h1>Dental Implant Recovery Timeline and Long-Term Maintenance</h1>"));
  assert.ok(html.includes('<p class="lede">What healing after dental implant surgery actually looks like week by week'));
  for (const h2 of ["The First 24–72 Hours", "The First Two Weeks", "Osseointegration: The Quiet, Important Phase",
    "Signs Worth a Call", "Long-Term Maintenance: What Keeps Implants Lasting", "Bottom Line", "Implant Care in Tempe"])
    assert.ok(html.includes(`>${h2}</h2>`), h2);
  const closing = html.slice(html.indexOf(">Implant Care in Tempe</h2>"));
  assert.ok(closing.includes('href="/services/dental-implants/"') && closing.includes('href="/book/"'));
});
