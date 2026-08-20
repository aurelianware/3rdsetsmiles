import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const booking = createRequire(import.meta.url)(path.join(root, "src", "_data", "booking.js"));
const PROVIDER_URL = "https://www.zocdoc.com/booking-link/dentist/matthew-phillips-dds-617189";
const PHONE = "4803342752";
const OLD_PHONE = /933[\s.-]?0434/; // retired number, separator-agnostic (space/dot/hyphen/none)

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Match an <a> that carries ALL the given attribute snippets, in any order, so
// a harmless template reformat doesn't break the assertion.
const anchorWith = (...attrs) =>
  new RegExp("<a\\b" + attrs.map((a) => `(?=[^>]*${escapeRe(a)})`).join("") + "[^>]*>");

let built = false;
function page(rel) {
  if (!built) { execSync("npm run build", { cwd: root, stdio: "pipe" }); built = true; }
  return readFileSync(path.join(root, "_site", rel), "utf8");
}

// ── Office ("Take a Look Around") route ──
test("the /office/ route builds with a single h1", () => {
  const html = page("office/index.html");
  assert.ok(html.length > 0);
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
});

test("office page uses only real practice photos, lazy-loaded with descriptive alt", () => {
  const html = page("office/index.html");
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  const gallery = imgs.filter((t) => t.includes("/assets/office/"));
  assert.equal(gallery.length, 3, "expected the three authentic office photos");
  for (const tag of gallery) {
    assert.match(tag, /loading="lazy"/, "office images must lazy-load");
    const alt = tag.match(/alt="([^"]*)"/);
    assert.ok(alt && alt[1].trim().length > 15, "office images need descriptive alt text");
    assert.match(tag, /width="\d+"[^>]*height="\d+"|height="\d+"[^>]*width="\d+"/, "images need intrinsic dimensions (CLS)");
  }
  // No stock/placeholder imagery.
  assert.doesNotMatch(html, /unsplash|shutterstock|istockphoto|placeholder|stock-photo/i);
});

test("office page has a provider booking CTA and the canonical phone, never the retired one", () => {
  const html = page("office/index.html");
  assert.match(html, anchorWith(`href="${PROVIDER_URL}"`, 'data-action="zocdoc-booking"', 'data-booking-source="office"'));
  assert.match(html, new RegExp(`href="tel:${PHONE}"`));
  assert.doesNotMatch(html, OLD_PHONE);
});

// ── Homepage provider ("Meet Dr. Phillips") trust section ──
test("homepage Meet-the-dentist section books with Dr. Phillips and shows the canonical phone", () => {
  const html = page("index.html");
  assert.match(html, /Why Dr\. Phillips\?/);
  assert.equal(booking.primaryProviderBookingUrl, PROVIDER_URL); // config sanity
  assert.match(html, anchorWith(`href="${PROVIDER_URL}"`, 'data-booking-source="doctor_section"'));
  assert.match(html, new RegExp(`href="tel:${PHONE}"`));
  // Homepage links into the office tour and the full provider story.
  assert.ok(html.includes('href="/office/"'));
  assert.ok(html.includes('href="/about/"'));
});

// ── No vanity statistics anywhere in the build ──
test("no unsupported vanity statistics are present", () => {
  for (const rel of ["index.html", "about/index.html", "office/index.html", "new-patients/index.html"]) {
    const html = page(rel);
    assert.doesNotMatch(html, /smiles?\s+transformed/i, `${rel} must not claim "smiles transformed"`);
    assert.doesNotMatch(html, /\b\d[\d,]{2,}\s*\+?\s*(smiles|happy patients|patients served|procedures)\b/i, `${rel} must not carry invented patient/procedure counts`);
  }
});

// ── Structured data: provider ↔ practice linkage stays consistent ──
test("provider and practice schema entities are consistently linked", () => {
  const home = page("index.html");
  const homeLd = [...home.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const dentist = homeLd.find((o) => o["@type"] === "Dentist");
  assert.ok(dentist, "Dentist node present");
  assert.equal(dentist["@id"], "https://www.3rdsetsmiles.com/#dentist");
  assert.equal(dentist.founder["@id"], "https://www.3rdsetsmiles.com/#dr-phillips");
  // Booking action stays wired to Zocdoc; entity url stays canonical.
  assert.equal(dentist.potentialAction.target, PROVIDER_URL);
  assert.equal(dentist.url, "https://www.3rdsetsmiles.com/");
  // Office photos strengthen the practice node as an image array (no aggregateRating).
  assert.ok(Array.isArray(dentist.image));
  assert.ok(dentist.image.some((u) => u.includes("/assets/office/")));
  assert.equal(dentist.aggregateRating, undefined, "must not fabricate aggregateRating");

  const about = page("about/index.html");
  const aboutLd = [...about.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const person = aboutLd.find((o) => o["@type"] === "Person");
  assert.equal(person["@id"], "https://www.3rdsetsmiles.com/#dr-phillips");
  assert.equal(person.worksFor["@id"], "https://www.3rdsetsmiles.com/#dentist");
});

// ── Office is discoverable from navigation, phone stays canonical ──
test("Our Office is linked in the footer and the office page carries no retired number", () => {
  const html = page("office/index.html");
  assert.ok((html.match(/href="\/office\/"/g) || []).length >= 1, "footer links to /office/");
  assert.doesNotMatch(html, OLD_PHONE);
});
