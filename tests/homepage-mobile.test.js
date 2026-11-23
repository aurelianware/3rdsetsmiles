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
  return readFileSync(path.join(root, file), "utf8");
}

test("fade-in only hides content once JS has marked the page", () => {
  const css = read("src/assets/css/main.css");
  assert.match(css, /\.js \.fade-in \{ opacity: 0/);
  assert.doesNotMatch(css, /^\.fade-in \{[^}]*opacity: 0/m);
  const html = read("_site/index.html");
  const head = html.slice(0, html.indexOf("</head>"));
  assert.match(head, /document\.documentElement\.classList\.add\("js"\)/);
});

test("homepage hero paints without waiting for the fade-in", () => {
  const html = read("_site/index.html");
  const hero = html.slice(html.indexOf('<section class="hero"'), html.indexOf("</section>", html.indexOf('<section class="hero"')));
  assert.doesNotMatch(hero, /fade-in/);
  assert.doesNotMatch(hero, /hero-logo/);
  assert.match(hero, /<h1>/);
  // Two primary actions, then the $49 offer as a link.
  assert.equal((hero.match(/<a [^>]*class="btn-/g) || []).length, 2);
  assert.match(hero, /class="hero-offer"><a href="\/special-offers\/" data-action="new-patient-offer"/);
  // Text comes before the photo in source order (and the CSS no longer reorders it).
  assert.ok(hero.indexOf("<h1>") < hero.indexOf("hero-photo"));
  assert.doesNotMatch(read("src/assets/css/main.css"), /\.hero-photo \{[^}]*order: -1/);
});

test("every homepage appointment request goes to /book/", () => {
  const html = read("_site/index.html");
  const requests = [...html.matchAll(/<a [^>]*data-action="request-appointment"[^>]*>/g)].map((m) => m[0]);
  assert.ok(requests.length > 0);
  for (const a of requests) assert.match(a, /href="\/book\//, a);
});
