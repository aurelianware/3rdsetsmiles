import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let built = false;
function read(file) {
  if (!built) { execSync("npm run build", { cwd: root, stdio: "pipe" }); built = true; }
  return readFileSync(path.join(root, "_site", file), "utf8");
}

test("full-arch landing page has intentional metadata and one patient-first H1", () => {
  const html = read("services/all-on-4/index.html");
  assert.match(html, /<title>Full-Arch Dental Implants in Tempe, AZ \| 3rd Set Smiles<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.3rdsetsmiles\.com\/services\/all-on-4\/">/);
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
  assert.match(html, /<h1>Full-Arch Dental Implants <span>in Tempe<\/span><\/h1>/);
  assert.match(html, /many teeth are missing or failing/i);
});

test("consultation CTAs use the CDO-validated intent and preserve full-arch source", () => {
  const html = read("services/all-on-4/index.html");
  const href = 'href="/book/?appointmentType=implant-consult&amp;source=full-arch"';
  assert.ok((html.match(new RegExp(href.replace(/[?]/g, "\\?"), "g")) || []).length >= 3);
  for (const position of ["hero", "education", "financing", "bottom"])
    assert.ok(html.includes(`data-position="${position}"`));

  const booking = read("assets/js/booking.js");
  assert.match(booking, /slots\.find\(intentMatch\)/);
  assert.match(booking, /type\.value = intendedSlot\.appointmentTypeCode/);
  assert.match(booking, /That visit type isn't available online right now/);
  assert.doesNotMatch(booking, /appointmentTypeId/);
});

test("page links the existing implant education, financing, and provider journey", () => {
  const html = read("services/all-on-4/index.html");
  for (const href of [
    "/services/dental-implants/",
    "/services/implant-supported-dentures/",
    "/blog/all-on-4-candidacy/",
    "/blog/full-mouth-implant-cost-arizona/",
    "/insurance-financing/?source=full-arch",
    "/about/",
  ]) assert.ok(html.includes(`href="${href.replace("&", "&amp;")}"`));
});

test("FAQ content is visible and represented by existing FAQ structured data", () => {
  const html = read("services/all-on-4/index.html");
  for (const question of [
    "What are full-arch dental implants?",
    "What is the difference between All-on-4 and All-on-X?",
    "How much does full-arch treatment cost?",
    "Does dental insurance cover implants?",
    "How do I start?",
  ]) {
    assert.ok(html.includes(question));
    assert.ok(html.indexOf(question) !== html.lastIndexOf(question), `${question} should be visible and in JSON-LD`);
  }
  assert.match(html, /"@type": "FAQPage"/);
});

test("zero authorized implant cases renders no results or placeholder clinical imagery", () => {
  const html = read("services/all-on-4/index.html");
  assert.doesNotMatch(html, /Authorized implant treatment results/);
  assert.doesNotMatch(html, /class="ba-card/);
  assert.doesNotMatch(html, /case4-(?:before|after)/);
});

test("implant funnel analytics are controlled and PHI-free", () => {
  const client = read("assets/js/analytics.js");
  const collector = readFileSync(path.join(root, "functions/collect.js"), "utf8");
  for (const event of ["full_arch_page_view", "implant_consult_click", "implant_phone_click", "implant_financing_click", "implant_candidate_article_click"])
    assert.ok(client.includes(event) || collector.includes(event));
  assert.match(client, /SAFE_SOURCES = new Set\([^\n]+full-arch/);
  assert.match(client, /SAFE_POSITIONS = new Set/);
  assert.match(collector, /CTA_POSITIONS = new Set/);
  for (const key of ["patientName", "diagnosis", "medicalHistory", "insuranceMemberId"])
    assert.doesNotMatch(client, new RegExp(`${key}\\s*:`));
});

test("existing candidacy and cost articles end in the consultation journey", () => {
  const candidacy = read("blog/all-on-4-candidacy/index.html");
  const cost = read("blog/full-mouth-implant-cost-arizona/index.html");
  assert.ok(candidacy.includes("appointmentType=implant-consult&amp;source=implant-candidacy"));
  assert.ok(cost.includes("appointmentType=implant-consult&amp;source=implant-cost"));
});

test("implant-supported dentures retain their distinct implants attribution", () => {
  const html = read("services/implant-supported-dentures/index.html");
  assert.ok(html.includes('href="/book/?appointmentType=implant-consult&amp;source=implants"'));
  assert.ok(!html.includes('href="/book/?appointmentType=implant-consult&amp;source=full-arch"'));
});
