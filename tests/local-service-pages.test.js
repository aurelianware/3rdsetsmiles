// local-service-pages.test.js — the two Tempe tooth-replacement landing pages
// (dentures, dental implants) carry unique local metadata, substantive copy,
// the required conversion links, and inbound links from key pages.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let built = false;
function page(rel) {
  if (!built) { execSync("npm run build", { cwd: root, stdio: "pipe" }); built = true; }
  return readFileSync(path.join(root, "_site", rel), "utf8");
}
const bodyWords = (html) => {
  const start = html.indexOf('<section class="section">');
  const body = html.slice(start, html.indexOf("</section>", start));
  return body.replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
};

const PAGES = [
  ["services/dentures/index.html", "Dentures in Tempe, AZ | 3rd Set Smiles", /<h1>Dentures in <span>Tempe, AZ<\/span><\/h1>/],
  ["services/dental-implants/index.html", "Dental Implants in Tempe, AZ | 3rd Set Smiles", /<h1>Dental Implants <span>in Tempe, AZ<\/span><\/h1>/],
];

test("dentures and dental-implants pages have local titles, H1s, 400-700 words and conversion links", () => {
  for (const [file, title, h1] of PAGES) {
    const html = page(file);
    assert.ok(html.includes(`<title>${title}</title>`), `${file} title`);
    assert.match(html, h1, `${file} H1`);
    const words = bodyWords(html);
    assert.ok(words >= 400 && words <= 700, `${file} has ${words} words`);
    for (const href of ["/insurance-financing/", "/special-offers/", "/book/"])
      assert.match(html, new RegExp(`href="${href.replace(/\//g, "\\/")}[^"]*"`), `${file} links ${href}`);
  }
});

test("homepage, services hub, footer and related posts link to both pages", () => {
  for (const file of ["index.html", "services/index.html", "blog/all-on-4-candidacy/index.html",
    "blog/same-day-extractions-and-implants/index.html", "blog/implant-recovery-and-maintenance/index.html"]) {
    const html = page(file);
    assert.ok(html.includes('href="/services/dental-implants/"'), `${file} -> dental implants`);
    if (!file.includes("implant-recovery")) assert.ok(html.includes('href="/services/dentures/"'), `${file} -> dentures`);
  }
  const footer = page("contact/index.html").split('<footer class="site-footer">')[1];
  assert.ok(footer.includes('href="/services/dentures/"') && footer.includes('href="/services/dental-implants/"'));
});
