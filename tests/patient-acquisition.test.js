import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let built = false;
function ensureBuild() {
  if (built) return;
  execSync("npm run build", { cwd: root, stdio: "pipe" });
  built = true;
}
function read(file) {
  ensureBuild();
  return readFileSync(path.join(root, "_site", file), "utf8");
}

test("priority CTAs carry controlled intent and source", () => {
  const cases = [
    ["services/emergency-dentistry/index.html", "appointmentType=emergency&amp;source=emergency"],
    ["services/dental-implants/index.html", "appointmentType=implant-consult&amp;source=implants"],
    ["services/cosmetic-dentistry/index.html", "appointmentType=cosmetic-consult&amp;source=cosmetic"],
    ["special-offers/index.html", "appointmentType=new-patient&amp;source=new-patient-offer"],
  ];
  for (const [page, query] of cases) assert.ok(read(page).includes(query), `${page} should include ${query}`);
});

test("emergency page exposes accessible call and booking actions on mobile", () => {
  const html = read("services/emergency-dentistry/index.html");
  assert.match(html, /class="emergency-mobile-actions" aria-label="Emergency dental actions"/);
  assert.match(html, /href="tel:\+14803342752" data-action="call-emergency"/);
  assert.match(html, />Book Online<\/a>/);
});

test("review destination is configured once, ungated, and PHI-free", () => {
  const site = JSON.parse(readFileSync(path.join(root, "src/_data/site.json"), "utf8"));
  assert.match(site.review.googleUrl, /^https:\/\//);
  assert.equal(JSON.stringify(site).match(/googleReview/g)?.length || 0, 0);

  const html = read("review/index.html");
  assert.ok(html.includes(`href="${site.review.googleUrl}"`));
  assert.match(html, /data-action="google-review"/);
  assert.match(html, /<meta name="robots" content="noindex, follow">/);
  assert.doesNotMatch(html, /<form[ >]/);
  assert.doesNotMatch(html, /patient(?:Id|Name)|diagnosis|appointmentReason/i);
});

test("review route is excluded from the sitemap and testimonials reuse the configured CTA", () => {
  assert.ok(!read("sitemap.xml").includes("/review/"));
  const testimonials = read("testimonials/index.html");
  const site = JSON.parse(readFileSync(path.join(root, "src/_data/site.json"), "utf8"));
  assert.ok(testimonials.includes(`href="${site.review.googleUrl}"`));
  assert.match(testimonials, />Leave Us a Google Review<\/a>/);
  assert.match(testimonials, /data-source="testimonials"/);
});

test("booking analytics accepts only controlled source and intent labels", () => {
  const script = read("assets/js/analytics.js");
  assert.match(script, /SAFE_SOURCES = new Set/);
  assert.match(script, /SAFE_INTENTS = new Set/);
  assert.match(script, /!SAFE_SOURCES\.has\(val\)/);
  assert.match(script, /!SAFE_INTENTS\.has\(val\)/);
  for (const prohibited of ["patient_name", "email", "phone", "diagnosis", "insurance"]) {
    assert.ok(!script.includes(`${prohibited}: payload`));
  }
});

test("gallery publishes only explicitly authorized cases", () => {
  const html = read("before-after-gallery/index.html");
  assert.match(html, /Authorized patient cases are being prepared/);
  assert.doesNotMatch(html, /class="ba-card/);
  const data = readFileSync(path.join(root, "src/_data/beforeAfter.js"), "utf8");
  assert.match(data, /published: false/);
  assert.match(data, /documented patient authorization/);
});
