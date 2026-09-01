import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = path.join(root, "_site");

// Cherry / Blee compliance: any page that mentions Cherry must carry the
// financing-partners disclosure, and the disclosure link must be present and
// clickable. Guards the remediation flagged for /before-after-gallery.
// See: https://withcherry.com/financing-partners

// The two disclosure sentences Cherry accepts (financing- OR lending-partners).
// The URL is rendered as a clickable <a>, so the sentence text stops at the
// colon; DISCLOSURE_LINK verifies the destination separately.
const DISCLOSURE = /Payment options through Cherry Technologies, Inc\. are issued by (its financing partners|the following lending partners):/;
// The disclosure URL must also appear as a real, clickable link.
const DISCLOSURE_LINK = /<a\b[^>]*href="https:\/\/withcherry\.com\/(financing|lending)-partners"/;

let built = false;
function page(rel) {
  if (!built) { execSync("npm run build", { cwd: root, stdio: "pipe" }); built = true; }
  return readFileSync(path.join(site, rel), "utf8");
}

// Recursively collect every built index.html so the guard covers the whole site.
function htmlPages(dir = site, out = []) {
  if (!built) { execSync("npm run build", { cwd: root, stdio: "pipe" }); built = true; }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) htmlPages(full, out);
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

test("the flagged /before-after-gallery/ page carries the Cherry disclosure and link", () => {
  const html = page("before-after-gallery/index.html");
  assert.match(html, DISCLOSURE, "before-after-gallery must show the exact Cherry disclosure sentence");
  assert.match(html, DISCLOSURE_LINK, "the withcherry.com disclosure URL must be a clickable link");
});

test("every page that mentions Cherry also carries the financing disclosure", () => {
  const offenders = [];
  for (const file of htmlPages()) {
    const html = readFileSync(file, "utf8");
    if (!/\bCherry\b/.test(html)) continue;      // page never mentions Cherry → no disclosure needed
    if (DISCLOSURE.test(html) && DISCLOSURE_LINK.test(html)) continue; // compliant
    offenders.push(path.relative(site, file));
  }
  assert.deepEqual(offenders, [], `pages mention Cherry without the required disclosure: ${offenders.join(", ")}`);
});
