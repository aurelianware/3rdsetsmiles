import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { onRequest as canonicalize } from "../functions/_middleware.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let built = false;
function page(relative) {
  if (!built) { execSync("npm run build", { cwd: root, stdio: "pipe" }); built = true; }
  return readFileSync(path.join(root, "_site", relative), "utf8");
}

async function redirected(url) {
  return canonicalize({ request: new Request(url), next: () => new Response("ok") });
}

test("canonical middleware normalizes host, HTTPS, slash, path, and query in one 301", async () => {
  const response = await redirected("http://3rdsetsmiles.com/special-offers?utm_source=test");
  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "https://www.3rdsetsmiles.com/special-offers/?utm_source=test");
});

test("canonical middleware leaves canonical pages and function endpoints alone", async () => {
  assert.equal((await redirected("https://www.3rdsetsmiles.com/services/dental-implants/")).status, 200);
  assert.equal((await redirected("https://www.3rdsetsmiles.com/booking-availability?from=x")).status, 200);
});

const priorities = [
  ["special-offers/index.html", "$49 New Patient Dental Special in Tempe, AZ", "$49 New Patient Dental", "/book/?appointmentType=new-patient&amp;source=new-patient-offer"],
  ["services/emergency-dentistry/index.html", "Emergency Dentist in Tempe, AZ", "Emergency Dentist in", "/book/?appointmentType=emergency&amp;source=emergency"],
  ["services/cosmetic-dentistry/index.html", "Cosmetic Dentist in Tempe, AZ", "Cosmetic Dentistry", "/book/?appointmentType=cosmetic-consult&amp;source=cosmetic"],
  ["services/dental-implants/index.html", "Dental Implants in Tempe, AZ", "Dental Implants", "/book/?appointmentType=implant-consult&amp;source=implants"],
];

test("priority pages have unique intent metadata, self-canonicals, one H1, and booking CTAs", () => {
  const titles = new Set();
  for (const [file, title, h1, booking] of priorities) {
    const html = page(file);
    assert.ok(html.includes(`<title>${title} | 3rd Set Smiles</title>`));
    assert.match(html, /<meta name="description" content="[^"]+">/);
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
    assert.ok(html.includes(h1));
    assert.ok(html.includes(`href="${booking}"`));
    assert.match(html, /<link rel="canonical" href="https:\/\/www\.3rdsetsmiles\.com\/.+\/">/);
    titles.add(title);
  }
  assert.equal(titles.size, priorities.length);
});

test("sitemap contains canonical priority URLs and excludes demo or redirect URLs", () => {
  const xml = page("sitemap.xml");
  for (const url of ["/special-offers/", "/services/emergency-dentistry/", "/services/cosmetic-dentistry/", "/services/dental-implants/"])
    assert.ok(xml.includes(`<loc>https://www.3rdsetsmiles.com${url}</loc>`));
  assert.ok(!xml.includes("/hero-demo"));
  assert.ok(!xml.includes("/patient-resources"));
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
  assert.equal(new Set(urls).size, urls.length);
  assert.ok(urls.every((url) => url.startsWith("https://www.3rdsetsmiles.com/") && (url.endsWith("/") || url.endsWith(".xml"))));
});

test("demo content has no generated production page or redirect", () => {
  const redirects = page("_redirects");
  assert.ok(!redirects.includes("hero-demo"));
  assert.throws(() => readFileSync(path.join(root, "_site", "hero-demo", "variation-10", "index.html")));
});

test("booking intent is matched only against live appointment types", () => {
  const script = page("assets/js/booking.js");
  assert.ok(script.includes('get("appointmentType")'));
  assert.ok(script.includes("slots.find(intentMatch)"));
  assert.ok(script.includes("type.value = intendedSlot.appointmentTypeCode"));
  assert.ok(!script.includes("appointmentTypeId"));
});
