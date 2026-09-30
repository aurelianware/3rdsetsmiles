// structured-data.test.js — every JSON-LD block parses, page types carry the
// expected schema.org types, and the Dentist / Person / BlogPosting nodes link
// to each other by @id so Google resolves one practice and one dentist.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CANON = "https://www.3rdsetsmiles.com";
let built = false;
function page(rel) {
  if (!built) { execSync("npm run build", { cwd: root, stdio: "pipe" }); built = true; }
  return readFileSync(path.join(root, "_site", rel), "utf8");
}
const ld = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .map((m) => JSON.parse(m[1]));
const types = (html) => ld(html).map((o) => o["@type"]);
const slugs = (dir) => readdirSync(path.join(root, "src", dir))
  .filter((f) => /\.(njk|md)$/.test(f) && f !== "index.njk").map((f) => f.replace(/\.(njk|md)$/, ""));

test("sitewide Dentist node carries NAP, geo, hours, logo, image and sameAs", () => {
  const dentist = ld(page("index.html")).find((o) => o["@type"] === "Dentist");
  assert.equal(dentist["@id"], `${CANON}/#dentist`);
  for (const key of ["name", "url", "logo", "image", "telephone", "address", "geo", "openingHoursSpecification", "priceRange", "sameAs"])
    assert.ok(dentist[key], `Dentist.${key}`);
  assert.equal(dentist.address.streetAddress, "2600 E Southern Ave, Suite B1");
  assert.equal(dentist.address.addressLocality, "Tempe");
  assert.equal(dentist.address.postalCode, "85282");
  assert.equal(dentist.telephone, "+14803342752");
});

test("every service page has MedicalProcedure and a 3-level BreadcrumbList", () => {
  for (const slug of slugs("services")) {
    const html = page(`services/${slug}/index.html`);
    assert.ok(types(html).includes("MedicalProcedure"), slug);
    const crumbs = ld(html).find((o) => o["@type"] === "BreadcrumbList");
    assert.ok(crumbs, `${slug} BreadcrumbList`);
    assert.deepEqual(crumbs.itemListElement.map((i) => i.item),
      [`${CANON}/`, `${CANON}/services/`, `${CANON}/services/${slug}/`]);
  }
});

test("every blog post has BlogPosting authored by the shared Person node, plus breadcrumbs", () => {
  for (const slug of slugs("blog")) {
    const html = page(`blog/${slug}/index.html`);
    const post = ld(html).find((o) => o["@type"] === "BlogPosting");
    assert.ok(post, slug);
    assert.equal(post.author["@id"], `${CANON}/#dr-phillips`, slug);
    assert.equal(post.publisher["@id"], `${CANON}/#dentist`, slug);
    assert.match(post.datePublished, /^\d{4}-\d{2}-\d{2}T/, slug);
    assert.match(post.dateModified, /^\d{4}-\d{2}-\d{2}T/, slug);
    assert.ok(types(html).includes("BreadcrumbList"), slug);
    assert.ok(html.includes('href="/blog/authors/dr-matthew-phillips/" rel="author"'), `${slug} byline links to author page`);
  }
});

test("About and author pages describe the same Person, work for the Dentist, and link to each other", () => {
  const about = page("about/index.html");
  const author = page("blog/authors/dr-matthew-phillips/index.html");
  const person = ld(about).find((o) => o["@type"] === "Person");
  const profile = ld(author).find((o) => o["@type"] === "ProfilePage");
  assert.equal(person["@id"], `${CANON}/#dr-phillips`);
  assert.equal(profile.mainEntity["@id"], person["@id"]);
  assert.equal(person.worksFor["@id"], `${CANON}/#dentist`);
  assert.ok(person.jobTitle);
  assert.equal(person.alumniOf.name, "New York University College of Dentistry");
  assert.equal(person.hasCredential.recognizedBy.name, person.alumniOf.name);
  assert.doesNotMatch(about, /B\.S\.[^<]*(Arizona State|Brigham Young)|degree (at|from) (Arizona State|Brigham Young)/, "BYU/ASU were coursework, not degrees");
  assert.doesNotMatch(about.replace(/<!--[\s\S]*?-->/g, ""), /Brigham Young|coursework/i, "coursework is not listed on the site");
  assert.doesNotMatch(about.replace(/<!--[\s\S]*?-->/g, ""), /MBA/, "unfinished MBA is not listed");
  assert.ok(about.includes("Mountain View High School in 1994"), "local high school is in the bio");
  assert.doesNotMatch(JSON.stringify(person), /Arizona State|Brigham Young/, "only conferred degrees are in the markup");
  assert.ok(about.includes('href="/blog/authors/dr-matthew-phillips/"'), "About links to author page");
  assert.ok(author.includes('href="/about/"'), "author page links to About");
});

test("no page claims a specialty the site does not state", () => {
  const html = readdirSync(path.join(root, "_site"), { recursive: true })
    .filter((f) => f.endsWith(".html")).map((f) => readFileSync(path.join(root, "_site", f), "utf8")).join("\n");
  assert.doesNotMatch(html, /prosthodontist/i);
  assert.doesNotMatch(html, /\bspecialist\b/i);
});
