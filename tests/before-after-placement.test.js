// before-after-placement.test.js — before-and-after photos are featured
// prominently (homepage, primary nav, service pages), stay lazy-loaded with
// descriptive alt text, carry a consent note, and only authorized photos deploy.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
let built = false;
function page(rel) {
  if (!built) {
    // Clean build: Eleventy never deletes stale output, and the deploy check
    // below must see exactly what a fresh Cloudflare Pages build would ship.
    rmSync(path.join(root, "_site"), { recursive: true, force: true });
    execSync("npm run build", { cwd: root, stdio: "pipe" });
    built = true;
  }
  return readFileSync(path.join(root, "_site", rel), "utf8");
}
const published = require(path.join(root, "src/_data/beforeAfter.js")).filter((c) => c.published === true);

test("homepage features a Real Results section high on the page", () => {
  const html = page("index.html");
  const results = html.indexOf('id="results-heading"');
  assert.ok(results > 0, "homepage has the results section");
  // Placed above the fold-adjacent trust sections (before the Dr. Phillips bio and reviews).
  assert.ok(results < html.indexOf('id="drphillips-heading"'));
  assert.ok(results < html.indexOf('id="reviews-heading"'));
  const section = html.slice(results, html.indexOf("</section>", results));
  assert.equal((section.match(/class="ba-card/g) || []).length, Math.min(4, published.length));
  assert.match(section, /href="\/before-after-gallery\/"/);
  assert.match(section, /class="ba-consent"/);
});

test("every before/after image is lazy-loaded with descriptive alt text and dimensions", () => {
  for (const rel of ["index.html", "before-after-gallery/index.html", "services/dental-implants/index.html", "services/cosmetic-dentistry/index.html"]) {
    const imgs = page(rel).match(/<img[^>]+\/assets\/before-after\/[^>]+>/g) || [];
    assert.ok(imgs.length > 0, `${rel} shows before/after photos`);
    for (const img of imgs) {
      assert.match(img, /loading="lazy"/, `${rel}: ${img}`);
      assert.match(img, /alt="(Before|After): [^"]{8,}"/, `${rel}: ${img}`);
      assert.match(img, /width="\d+" height="\d+"/, `${rel}: ${img}`);
    }
  }
});

test("the gallery is in the primary nav on desktop and mobile", () => {
  const html = page("about/index.html");
  const nav = html.slice(html.indexOf('<header class="nav"'), html.indexOf("</header>"));
  assert.ok((nav.match(/href="\/before-after-gallery\/"/g) || []).length >= 2);
  assert.match(nav, />\s*Gallery\s*</);
});

test("implant and cosmetic service pages show matching cases and link to the gallery", () => {
  for (const rel of ["services/dental-implants/index.html", "services/cosmetic-dentistry/index.html"]) {
    const html = page(rel);
    assert.match(html, /class="ba-card/, rel);
    assert.match(html, /class="ba-consent"/, rel);
    assert.match(html, /href="\/before-after-gallery\/" data-action="view-gallery"/, rel);
  }
});

test("the gallery page carries the consent / results-vary note", () => {
  assert.match(page("before-after-gallery/index.html"), /documented authorization\. Individual results vary\./);
});

test("only photos referenced by a published case are deployed", () => {
  page("index.html");
  const allowed = new Set(published.flatMap((c) => [c.before, c.after]).map((p) => path.basename(p)));
  const dir = path.join(root, "_site/assets/before-after");
  const deployed = existsSync(dir) ? readdirSync(dir) : [];
  for (const f of deployed) assert.ok(allowed.has(f), `${f} is deployed without a published case`);
  for (const f of allowed) assert.ok(deployed.includes(f), `${f} (published) is missing from the build`);
});
