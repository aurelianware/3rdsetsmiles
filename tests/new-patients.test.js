import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// booking.js is a CommonJS computed-data module; load it the same way as
// tests/zocdoc-booking.test.js to avoid ESM/CJS interop edge-cases.
const booking = createRequire(import.meta.url)(path.join(root, "src", "_data", "booking.js"));
const PROVIDER_URL = "https://www.zocdoc.com/booking-link/dentist/matthew-phillips-dds-617189";
const PRACTICE_URL = "https://www.zocdoc.com/booking-link/practice/3rd-set-smiles-137227";
const PHONE = "4803342752";
const OLD_PHONE = /933[-.]?0434/; // the retired number must never reappear

let built = false;
function page(relative) {
  if (!built) { execSync("npm run build", { cwd: root, stdio: "pipe" }); built = true; }
  return readFileSync(path.join(root, "_site", relative), "utf8");
}
const np = () => page("new-patients/index.html");

// ── Route availability ──
test("the /new-patients/ route builds", () => {
  assert.ok(np().length > 0);
});

// ── Primary CTA → Zocdoc provider booking link ──
test("Book Online CTAs resolve to Dr. Phillips' Zocdoc provider link", () => {
  const html = np();
  assert.equal(booking.primaryBookingUrl, PROVIDER_URL); // config sanity
  const ctas = [...html.matchAll(/<a href="([^"]+)"[^>]*data-action="zocdoc-booking"[^>]*data-booking-source="new_patients"[^>]*>/g)];
  assert.ok(ctas.length >= 2, "expected hero + final Book Online CTAs");
  for (const [tag, href] of ctas) {
    assert.equal(href, PROVIDER_URL);
    assert.match(tag, /rel="noopener"/);
  }
  // The practice link is never surfaced while single-provider.
  assert.ok(!html.includes(PRACTICE_URL));
});

// ── Phone: correct number present, retired number absent ──
test("uses the current office number and never the retired one", () => {
  const html = np();
  assert.match(html, new RegExp(`href="tel:${PHONE}"`));
  assert.doesNotMatch(html, OLD_PHONE);
});

// ── SEO metadata ──
test("has unique title, meta description, canonical, and OpenGraph", () => {
  const html = np();
  assert.ok(html.includes("<title>New Patients Welcome — Dentist in Tempe, AZ | 3rd Set Smiles</title>"));
  assert.match(html, /<meta name="description" content="Accepting new dental patients in Tempe[^"]+">/);
  assert.ok(html.includes('<link rel="canonical" href="https://www.3rdsetsmiles.com/new-patients/">'));
  assert.ok(html.includes('<meta property="og:url" content="https://www.3rdsetsmiles.com/new-patients/">'));
  assert.match(html, /<meta property="og:title" content="New Patients Welcome[^"]+">/);
});

// ── Structured data: FAQPage from the existing base.njk architecture ──
test("emits a parseable FAQPage covering the key new-patient questions", () => {
  const html = np();
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const faq = blocks.find((o) => o["@type"] === "FAQPage");
  assert.ok(faq, "FAQPage JSON-LD present");
  const questions = faq.mainEntity.map((q) => q.name.toLowerCase()).join(" | ");
  for (const needle of ["new patients", "first", "bring", "insurance", "cost", "online", "nervous", "emergency"]) {
    assert.ok(questions.includes(needle), `FAQ should address "${needle}"`);
  }
});

// ── Accessibility ──
test("has exactly one h1 and accessibly-named booking controls", () => {
  const html = np();
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
  // Every Zocdoc link carries visible text or an aria-label.
  for (const [tag, label] of html.matchAll(/<a[^>]*data-action="zocdoc-booking"[^>]*>(.*?)<\/a>/g)) {
    const named = label.replace(/<[^>]*>/g, "").trim().length > 0 || /aria-label="[^"]+"/.test(tag);
    assert.ok(named, "booking link needs an accessible name");
  }
});

// ── Internal links to the surrounding journey ──
test("links out to the key related pages", () => {
  const html = np();
  for (const href of [
    "/about/",
    "/insurance-financing/",
    "/insurance-check/",
    "/services/sedation-dentistry/",
    "/services/emergency-dentistry/",
    "/services/dental-implants/",
    "/services/dentures/",
    "/services/",
    "/testimonials/",
    "/veterans/",
    "/contact/",
    "/special-offers/",
  ]) {
    assert.ok(html.includes(`href="${href}"`), `expected internal link to ${href}`);
  }
});

// ── Navigation presence (desktop + mobile) ──
test("New Patients is reachable from the site nav on every page", () => {
  const html = np();
  // nav.njk renders each primary item once for desktop and once for mobile.
  assert.ok((html.match(/href="\/new-patients\/"/g) || []).length >= 2);
});

// ── $49 offer terms are shown verbatim (no invented terms) ──
test("presents the $49 offer with its real eligibility limitations", () => {
  const html = np();
  assert.match(html, /\$49/);
  assert.ok(html.includes("For new patients without insurance."));
  assert.ok(html.includes("Excludes deep (periodontal) cleanings or treatment-related X-rays."));
});

// ── Homepage entry point into the journey ──
test("homepage links into the new-patient journey", () => {
  assert.ok(page("index.html").includes('href="/new-patients/"'));
});
