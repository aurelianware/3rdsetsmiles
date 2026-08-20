import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = JSON.parse(readFileSync(path.join(root, "src", "_data", "site.json"), "utf8"));

const PROVIDER_URL = "https://www.zocdoc.com/booking-link/dentist/matthew-phillips-dds-617189";
const PRACTICE_URL = "https://www.zocdoc.com/booking-link/practice/3rd-set-smiles-137227";

let built = false;
function page(relative) {
  if (!built) { execSync("npm run build", { cwd: root, stdio: "pipe" }); built = true; }
  return readFileSync(path.join(root, "_site", relative), "utf8");
}

// ── Configuration ──
test("booking config holds the exact Zocdoc provider and practice URLs", () => {
  assert.equal(site.booking.primaryProviderBookingUrl, PROVIDER_URL);
  assert.equal(site.booking.practiceBookingUrl, PRACTICE_URL);
  // Provider is the primary destination while he is the only provider.
  assert.equal(site.booking.primaryBookingUrl, PROVIDER_URL);
  assert.equal(site.booking.primaryScope, "provider");
  assert.equal(site.booking.bookingProviderName, "Dr. Matthew Phillips");
  assert.equal(site.booking.bookingProviderType, "Dentist");
  assert.equal(site.booking.bookingPlatform, "Zocdoc");
});

test("no placeholder or malformed Zocdoc booking URLs are configured", () => {
  const urls = [site.booking.primaryProviderBookingUrl, site.booking.practiceBookingUrl, site.booking.primaryBookingUrl];
  for (const url of urls) {
    assert.match(url, /^https:\/\/www\.zocdoc\.com\/booking-link\/(dentist|practice)\/[a-z0-9-]+$/);
    assert.doesNotMatch(url, /example|placeholder|TODO|xxxx/i);
  }
});

// ── Primary CTAs resolve to the provider link ──
test("primary booking CTAs across the site resolve to the provider Zocdoc link", () => {
  const checks = [
    ["index.html", "hero"],
    ["index.html", "header"],
    ["index.html", "homepage"],
    ["contact/index.html", "contact"],
    ["about/index.html", "provider_profile"],
    ["book/index.html", "appointment_page"],
    ["services/family-dentistry/index.html", "service_page"],
  ];
  for (const [file, source] of checks) {
    const html = page(file);
    const re = new RegExp(`<a href="${PROVIDER_URL.replace(/[.\/]/g, "\\$&")}"[^>]*data-booking-source="${source}"`);
    assert.match(html, re, `${file} should have a provider booking CTA with source=${source}`);
  }
});

test("provider-page CTA is bound to Dr. Phillips' provider link", () => {
  const html = page("about/index.html");
  assert.match(html, /Book with Dr\. Matthew Phillips/);
  assert.ok(html.includes(`href="${PROVIDER_URL}"`));
});

// ── The practice URL is stored but never the visible CTA yet ──
test("practice-level link is configured but not used as a visible CTA while single-provider", () => {
  for (const file of ["index.html", "contact/index.html", "about/index.html", "book/index.html"]) {
    assert.ok(!page(file).includes(PRACTICE_URL), `${file} must not surface the practice link yet`);
  }
});

// ── External-link safety + accessibility ──
test("every Zocdoc booking link is a safe, accessible external link", () => {
  const html = page("index.html");
  const anchors = [...html.matchAll(/<a[^>]*data-action="zocdoc-booking"[^>]*>(.*?)<\/a>/g)];
  assert.ok(anchors.length >= 3, "homepage should carry multiple Zocdoc CTAs (nav, hero, footer, sticky)");
  for (const [tag, label] of anchors) {
    assert.match(tag, /rel="noopener"/, "external booking link must set rel=noopener");
    // Accessible name: visible text or an aria-label — never an empty control.
    const hasName = label.replace(/<[^>]*>/g, "").trim().length > 0 || /aria-label="[^"]+"/.test(tag);
    assert.ok(hasName, "booking link must have an accessible name");
  }
});

// ── Non-booking CTAs are preserved ──
test("phone, directions, and the appointment request form are preserved", () => {
  const home = page("index.html");
  assert.match(home, /href="tel:4803342752"/); // call CTAs remain
  const contact = page("contact/index.html");
  assert.match(contact, /data-action="directions"/); // Get Directions remains
  const book = page("book/index.html");
  assert.match(book, /id="book"[^>]*action="\/book-appointment"/); // request form remains
});

// ── Specialized consult funnels are NOT hijacked ──
test("consult funnels still use the on-site appointment-type flow, not Zocdoc", () => {
  const cases = [
    ["services/dental-implants/index.html", "/book/?appointmentType=implant-consult&amp;source=implants"],
    ["services/cosmetic-dentistry/index.html", "/book/?appointmentType=cosmetic-consult&amp;source=cosmetic"],
    ["services/emergency-dentistry/index.html", "/book/?appointmentType=emergency&amp;source=emergency"],
    ["special-offers/index.html", "/book/?appointmentType=new-patient&amp;source=new-patient-offer"],
  ];
  for (const [file, funnel] of cases) assert.ok(page(file).includes(`href="${funnel}"`), `${file} keeps ${funnel}`);
});

// ── Structured data wiring ──
test("ReserveAction booking targets point at Zocdoc, not the canonical site URL", () => {
  const home = page("index.html");
  const ld = [...home.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const dentist = ld.find((o) => o["@type"] === "Dentist");
  assert.equal(dentist.potentialAction.target, PROVIDER_URL);
  // Canonical entity URL is untouched.
  assert.equal(dentist.url, "https://www.3rdsetsmiles.com/");

  const about = page("about/index.html");
  const aboutLd = [...about.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const person = aboutLd.find((o) => o["@type"] === "Person");
  assert.equal(person.potentialAction.target, PROVIDER_URL);
});

// ── Analytics abstraction, no PHI ──
test("analytics defines a zocdoc_booking_click event with non-PHI booking metadata", () => {
  const js = page("assets/js/analytics.js");
  assert.match(js, /zocdoc_booking_click/);
  assert.match(js, /'zocdoc-booking':\s*EVENTS\.ZOCDOC_BOOKING_CLICK/);
  // booking_scope / booking_source are allowlisted, bounded, non-PHI props.
  assert.match(js, /booking_scope:\s*true/);
  assert.match(js, /booking_source:\s*true/);
  assert.match(js, /SAFE_BOOKING_SCOPES/);
  assert.match(js, /SAFE_BOOKING_SOURCES/);
});
