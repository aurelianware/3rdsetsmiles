#!/usr/bin/env node
// seo-audit.js — crawl the BUILT site (_site/) and report on-page SEO problems.
//
// Usage: npm run build && node scripts/seo-audit.js [--json]
//
// Checks, per HTML page: exactly one canonical / <title> / meta description /
// <h1>; canonical is self-referencing on the www host with a trailing slash;
// titles and descriptions are unique; every JSON-LD block parses; internal
// links point at canonical URLs that exist in the build. Also checks the
// sitemap lists only canonical, indexable, existing pages. Exits non-zero on
// any error so it can gate CI.
const fs = require("fs");
const path = require("path");

const SITE = path.resolve(__dirname, "..", "_site");
const CANON = "https://www.3rdsetsmiles.com";
const HOST_RE = /^(?:https?:)?\/\/(?:www\.)?3rdsetsmiles\.com/i;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : [p];
  });
}

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">");

function urlFor(file) {
  const rel = path.relative(SITE, file).split(path.sep).join("/");
  if (rel === "index.html") return "/";
  if (rel.endsWith("/index.html")) return "/" + rel.slice(0, -"index.html".length);
  return "/" + rel;
}

const files = walk(SITE);
const htmlFiles = files.filter((f) => f.endsWith(".html"));
// Every path the static host would answer with 200.
const existing = new Set(files.map(urlFor));

const errors = [];
const pages = [];
const err = (url, msg) => errors.push(`${url}: ${msg}`);

for (const file of htmlFiles) {
  const url = urlFor(file);
  const html = fs.readFileSync(file, "utf8");
  const head = html.slice(0, html.indexOf("</head>"));
  const is404 = url === "/404.html";
  const noindex = /<meta name="robots" content="[^"]*noindex/i.test(head);

  const canon = [...head.matchAll(/<link rel="canonical" href="([^"]*)"/g)].map((m) => m[1]);
  const titles = [...head.matchAll(/<title>([\s\S]*?)<\/title>/g)].map((m) => decode(m[1].trim()));
  const descs = [...head.matchAll(/<meta name="description" content="([^"]*)"/g)].map((m) => decode(m[1]));
  const h1s = [...html.matchAll(/<h1[\s>][\s\S]*?<\/h1>/g)].map((m) => m[0].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()).map(decode);

  if (titles.length !== 1) err(url, `${titles.length} <title> tags`);
  if (descs.length !== 1) err(url, `${descs.length} meta descriptions`);
  if (h1s.length !== 1) err(url, `${h1s.length} <h1> tags`);
  if (!is404) {
    if (canon.length !== 1) err(url, `${canon.length} canonical tags`);
    else if (canon[0] !== CANON + url) err(url, `canonical ${canon[0]} is not self-referencing (${CANON + url})`);
  }

  // JSON-LD must parse.
  const types = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const obj = JSON.parse(m[1]);
      const graph = obj["@graph"] || [obj];
      graph.forEach((o) => types.push(o["@type"]));
    } catch (e) {
      err(url, `invalid JSON-LD: ${e.message}`);
    }
  }

  // Internal links: canonical host form, trailing slash, and target exists.
  for (const m of html.matchAll(/<a\s[^>]*href="([^"]*)"/g)) {
    let href = decode(m[1]);
    if (/^(mailto:|tel:|sms:|#|javascript:)/i.test(href)) continue;
    if (/^https?:\/\//i.test(href) || href.startsWith("//")) {
      if (!HOST_RE.test(href)) continue; // external
      if (!href.startsWith(CANON + "/") && href !== CANON) err(url, `non-canonical absolute link ${href}`);
      href = href.replace(HOST_RE, "") || "/";
    }
    if (!href.startsWith("/")) { err(url, `relative link ${href}`); continue; }
    const p = href.split(/[?#]/)[0];
    const isFile = /\/[^/]+\.[a-z0-9]+$/i.test(p);
    if (!isFile && !p.endsWith("/")) err(url, `link without trailing slash ${href}`);
    else if (!existing.has(p)) err(url, `broken internal link ${href}`);
  }
  if (/http:\/\/(?:www\.)?3rdsetsmiles\.com/i.test(html)) err(url, "http:// reference to own domain");
  if (/(?:https?:)?\/\/3rdsetsmiles\.com/i.test(html)) err(url, "apex-domain reference");

  pages.push({ url, title: titles[0], description: descs[0], h1: h1s[0], noindex, types, is404 });
}

// Uniqueness across indexable pages.
for (const key of ["title", "description"]) {
  const seen = new Map();
  for (const p of pages.filter((p) => !p.is404)) {
    if (seen.has(p[key])) err(p.url, `duplicate ${key} (also on ${seen.get(p[key])}): ${p[key]}`);
    else seen.set(p[key], p.url);
  }
}

// Sitemap: canonical, indexable, existing URLs only; no demo pages.
const xml = fs.readFileSync(path.join(SITE, "sitemap.xml"), "utf8");
const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const byUrl = new Map(pages.map((p) => [p.url, p]));
for (const loc of locs) {
  if (!loc.startsWith(CANON + "/")) { err("sitemap", `non-canonical loc ${loc}`); continue; }
  const p = loc.slice(CANON.length);
  if (/\/(?:hero-demo|demo|drafts?|test|staging)(?:[-/]|$)/i.test(p)) err("sitemap", `test/demo URL ${loc}`);
  if (!byUrl.has(p)) err("sitemap", `loc does not exist in build ${loc}`);
  else if (byUrl.get(p).noindex) err("sitemap", `noindex page listed ${loc}`);
}
for (const p of pages) {
  if (!p.noindex && !p.is404 && !locs.includes(CANON + p.url)) err("sitemap", `indexable page missing: ${p.url}`);
}
const robots = fs.readFileSync(path.join(SITE, "robots.txt"), "utf8");
if (!robots.includes(`Sitemap: ${CANON}/sitemap.xml`)) err("robots.txt", "missing Sitemap line");
if (/Disallow:\s*\/(assets|\S*\.(css|js))/i.test(robots)) err("robots.txt", "blocks CSS/JS assets");

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ pages, sitemap: locs, errors }, null, 2));
} else {
  console.log(`Audited ${pages.length} HTML pages, ${locs.length} sitemap URLs.`);
  for (const p of pages) {
    console.log(`\n${p.url}${p.noindex ? "  [noindex]" : ""}\n  title (${(p.title || "").length}): ${p.title}\n  desc  (${(p.description || "").length}): ${p.description}\n  h1: ${p.h1}\n  ld+json: ${p.types.join(", ")}`);
  }
  console.log(errors.length ? `\n${errors.length} problem(s):\n  ${errors.join("\n  ")}` : "\nNo problems found.");
}
process.exit(errors.length ? 1 : 0);
