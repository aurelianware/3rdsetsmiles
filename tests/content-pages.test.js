// content-pages.test.js — author page trust copy, visible homepage FAQ,
// wisdom teeth / extraction / emergency landing pages, footer tagline, and the
// Meet the Team section contract.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
let built = false;
function page(rel) {
  if (!built) { execSync("npm run build", { cwd: root, stdio: "pipe" }); built = true; }
  return readFileSync(path.join(root, "_site", rel), "utf8");
}
const visible = (html) => html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<!--[\s\S]*?-->/g, "");
const words = (html) => {
  const start = html.indexOf('<section class="section">');
  return visible(html.slice(start, html.indexOf("</section>", start))).replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
};

test("author page shows a real bio and review disclosure, not the internal checklist", () => {
  const html = visible(page("blog/authors/dr-matthew-phillips/index.html"));
  assert.doesNotMatch(html, /Information Requiring Confirmation|Trust Signals Visible|license number/i);
  assert.match(html, /New York University College of Dentistry in 2004/);
  assert.match(html, /reviewed and approved by Dr\. Phillips/);
  assert.match(html, /drafted with the help of writing tools/, "AI assistance stays disclosed");
  const listed = (html.match(/<li><a href="\/blog\/[a-z0-9-]+\/">/g) || []).length;
  assert.ok(listed >= 11, `author page lists ${listed} articles`);
});

test("homepage FAQ is visible and matches the FAQPage JSON-LD exactly", () => {
  const html = page("index.html");
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1])).find((o) => o["@type"] === "FAQPage");
  const shown = [...visible(html).matchAll(/<button class="faq-btn"[^>]*>\s*<span>([^<]+)<\/span>/g)]
    .map((m) => m[1].replace(/&#39;/g, "'").replace(/&amp;/g, "&"));
  assert.deepEqual(shown, ld.mainEntity.map((q) => q.name));
  assert.ok(shown.includes("Why is the practice called 3rd Set Smiles?"));
});

test("wisdom teeth, extraction and emergency pages are substantive and cross-linked", () => {
  const wisdom = page("services/wisdom-teeth-removal/index.html");
  assert.ok(wisdom.includes("<title>Wisdom Teeth Removal in Tempe, AZ | 3rd Set Smiles</title>"));
  assert.ok(wisdom.includes('href="/book/?appointmentType=wisdom-teeth-consult&amp;source=wisdom-teeth-offer"'));
  for (const [file, min] of [["services/wisdom-teeth-removal/index.html", 400],
    ["services/tooth-extractions/index.html", 400], ["services/emergency-dentistry/index.html", 350]]) {
    const n = words(page(file));
    assert.ok(n >= min, `${file} has ${n} words`);
  }
  assert.ok(page("services/tooth-extractions/index.html").includes('href="/services/wisdom-teeth-removal/"'));
  assert.ok(page("services/emergency-dentistry/index.html").includes('href="/services/wisdom-teeth-removal/"'));
  assert.ok(page("blog/wisdom-teeth-removal/index.html").includes('href="/services/wisdom-teeth-removal/"'));
  const footer = page("contact/index.html").split('<footer class="site-footer">')[1];
  assert.ok(footer.includes('href="/services/wisdom-teeth-removal/"'));
});

test("footer tagline leads with implants and dentures", () => {
  assert.ok(page("index.html").includes('<p class="footer-tagline">Implants, Dentures &amp; Family Dentistry in Tempe, AZ</p>'));
});

test("Meet the Team renders nothing until team.js has entries", () => {
  const team = require(path.join(root, "src", "_data", "team.js"));
  const html = page("about/index.html");
  if (team.length === 0) assert.ok(!html.includes("team-grid"));
  else for (const m of team) assert.ok(html.includes(m.name), `team member ${m.name} shown`);
});
