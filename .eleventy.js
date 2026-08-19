const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

module.exports = function (eleventyConfig) {
  // Passthrough copy: files that should land in the output root verbatim.
  eleventyConfig.addPassthroughCopy({ "src/_headers": "_headers" });
  eleventyConfig.addPassthroughCopy({ "src/_redirects": "_redirects" });
  eleventyConfig.addPassthroughCopy({ "src/robots.txt": "robots.txt" });
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });

  // Filters
  eleventyConfig.addFilter("absUrl", function (path, base) {
    const root = (base || "https://www.3rdsetsmiles.com").replace(/\/$/, "");
    if (!path) return root + "/";
    return root + (path.startsWith("/") ? path : "/" + path);
  });

  eleventyConfig.addFilter("year", function () {
    return new Date().getFullYear();
  });

  eleventyConfig.addFilter("isoDate", function (value) {
    const d = value ? new Date(value) : new Date();
    return d.toISOString().slice(0, 10);
  });

  // Cache-busting for HTML-referenced local assets. `/assets/*` is served
  // `immutable` for 30 days (see src/_headers), which means browsers and the
  // CDN never revalidate a cached file during that window. With stable, unhashed
  // URLs that would pin every visitor to the deployed-at-first-visit version of
  // our JS/CSS — so a fix like the booking page never reaches returning users.
  // Append a short content hash (?v=…) so the URL changes whenever the file's
  // bytes change, which is exactly the condition under which `immutable` is
  // safe. Hash is computed once per build and cached per path.
  const bustCache = new Map();
  const srcRoot = path.join(__dirname, "src");
  eleventyConfig.addFilter("bust", function (assetPath) {
    if (!assetPath || typeof assetPath !== "string" || !assetPath.startsWith("/")) return assetPath;
    if (bustCache.has(assetPath)) return bustCache.get(assetPath);
    // Hash only the path portion; a query/fragment isn't part of the file on disk.
    const clean = assetPath.split(/[?#]/)[0];
    let out = clean;
    const file = path.resolve(srcRoot, "." + clean);
    // Never let a crafted path (e.g. "..") read outside the source tree, even if
    // a future caller passes variable input rather than a string literal.
    if (file !== srcRoot && !file.startsWith(srcRoot + path.sep)) {
      console.warn(`[bust] refusing out-of-tree asset path: ${assetPath}`);
    } else {
      try {
        const hash = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 8);
        out = `${clean}?v=${hash}`;
      } catch (e) {
        // Don't fail the build, but surface the problem so a typo'd template path
        // (which would silently defeat cache-busting) is visible in build output.
        console.warn(`[bust] could not read asset for cache-busting: ${clean} (${e.code || e.message})`);
      }
    }
    bustCache.set(assetPath, out);
    return out;
  });

  // Sitemap <lastmod>: honest, stable per-file date from the last git commit
  // that touched the source file (YYYY-MM-DD). File mtime is unreliable — a
  // fresh CI clone stamps every file with the checkout time, so mtime-based
  // lastmods flip to "build day" on each deploy and train Google to ignore the
  // signal. The git commit date only moves when the page's content actually
  // changes, which is exactly what lastmod should report. Falls back to the
  // page's Eleventy date if git is unavailable or the file is uncommitted.
  const gitDateCache = new Map();
  eleventyConfig.addFilter("gitLastmod", function (inputPath, fallback) {
    const fb = (fallback ? new Date(fallback) : new Date()).toISOString().slice(0, 10);
    if (!inputPath) return fb;
    if (gitDateCache.has(inputPath)) return gitDateCache.get(inputPath);
    let out = fb;
    try {
      const d = execFileSync("git", ["log", "-1", "--format=%cs", "--", inputPath], {
        encoding: "utf8",
      }).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) out = d;
    } catch (e) {
      // git unavailable (e.g. non-git build context) — keep the fallback.
    }
    gitDateCache.set(inputPath, out);
    return out;
  });

  eleventyConfig.addFilter("isoDateTime", function (value) {
    const d = value ? new Date(value) : new Date();
    return d.toLocaleString("sv-SE", {
      timeZone: "America/Phoenix",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).replace(" ", "T") + "-07:00";
  });

  // Month + year only (e.g. "August 2025"). Parses YYYY-MM-DD from its parts to
  // avoid timezone drift, so a date-only string never slips to the prior month.
  // Used for review dates, where the day is approximate.
  eleventyConfig.addFilter("monthYear", function (value) {
    const months = ["January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"];
    if (!value) return String(value ?? "");
    const m = String(value).match(/^(\d{4})-(\d{2})/);
    if (m) {
      const month = months[parseInt(m[2], 10) - 1];
      if (month) return month + " " + m[1];
    }
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return months[d.getMonth()] + " " + d.getFullYear();
  });

  eleventyConfig.addFilter("humanDate", function (value) {
    const d = value ? new Date(value) : new Date();
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "America/Phoenix",
    });
  });

  // JSON helper for inline JSON-LD (Eleventy ships a built-in `dump` filter but
  // we want pretty 2-space output for diff-friendly HTML).
  eleventyConfig.addFilter("jsonStringify", function (obj) {
    return JSON.stringify(obj, null, 2);
  });

  // Sanitize a Google Analytics 4 Measurement ID to its strict format
  // (e.g. "G-XXXXXXXX"). Returns "" for anything that doesn't match, so a
  // misconfigured value can never break the GA <script> tag or inline config
  // (and simply keeps GA4 off) — no escaping concerns downstream.
  eleventyConfig.addFilter("ga4Id", function (value) {
    return /^G-[A-Z0-9]+$/.test(value || "") ? value : "";
  });

  // Service-hub grouping helpers. Categories are defined once in
  // src/_data/serviceCategories.js and matched against each service's
  // serviceMeta.category KEY (e.g. "general-family"), never a display string.
  eleventyConfig.addFilter("servicesInCategory", function (services, key) {
    return (services || []).filter(
      (s) => s.data.serviceMeta && s.data.serviceMeta.category === key
    );
  });

  // Any service whose category key matches none of the defined categories.
  // Surfaced in an "Uncategorized" hub group so a typo never silently drops
  // a service from the page.
  eleventyConfig.addFilter("uncategorizedServices", function (services, categories) {
    const keys = (categories || []).map((c) => c.key);
    return (services || []).filter(
      (s) => s.data.serviceMeta && !keys.includes(s.data.serviceMeta.category)
    );
  });

  // Before/after cases are public only after the office records authorization.
  // `published` is an explicit opt-in, never inferred from the presence of files.
  eleventyConfig.addFilter("publishedCases", function (cases) {
    return (cases || []).filter((item) => item.published === true)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  });

  eleventyConfig.addFilter("casesInCategory", function (cases, categories) {
    const allowed = new Set(categories || []);
    return (cases || []).filter((item) => allowed.has(item.treatmentCategory));
  });

  // Look up the category object (for label/blurb) by its key.
  eleventyConfig.addFilter("findCategory", function (categories, key) {
    return (categories || []).find((c) => c.key === key);
  });

  // Service helper: sibling services in the same category, excluding the
  // current page, ordered by `order` (the collection is already sorted) and
  // capped. Powers the "Related treatments" block in the service layout.
  eleventyConfig.addFilter("relatedServices", function (services, key, currentUrl, limit = 5) {
    return (services || [])
      .filter(
        (s) =>
          s.data.serviceMeta &&
          s.data.serviceMeta.category === key &&
          s.url !== currentUrl
      )
      .slice(0, limit);
  });

  // Service helper: blog posts relevant to a service, matched when the post's
  // tags include the service slug (e.g. the /services/dental-implants/ page
  // surfaces posts tagged "dental-implants"). Newest first, capped. Powers the
  // "Related reading" block; renders nothing when a service has no matching post.
  eleventyConfig.addFilter("relatedPostsForService", function (posts, slug, limit = 3) {
    return (posts || [])
      .filter((p) => (p.data.tags || []).includes(slug))
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, limit);
  });

  // Blog helper: get posts in a category key from src/_data/blogCategories.js
  eleventyConfig.addFilter("postsInCategory", function (posts, key) {
    return (posts || []).filter((p) => p.data.blogCategory === key);
  });

  // Blog helper: related posts based on overlapping tags.
  eleventyConfig.addFilter("relatedBlogPosts", function (posts, currentUrl, tags, limit = 3) {
    const currentTags = new Set((tags || []).filter((t) => t !== "blog"));
    return (posts || [])
      .filter((p) => p.url !== currentUrl)
      .map((p) => {
        const postTags = new Set((p.data.tags || []).filter((t) => t !== "blog"));
        let overlap = 0;
        currentTags.forEach((tag) => {
          if (postTags.has(tag)) overlap += 1;
        });
        return { post: p, overlap };
      })
      .filter((x) => x.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap || new Date(b.post.date) - new Date(a.post.date))
      .slice(0, limit)
      .map((x) => x.post);
  });

  // Collection of every service page, ordered by `order` in the data file.
  eleventyConfig.addCollection("services", function (collectionApi) {
    return collectionApi
      .getFilteredByGlob("src/services/**/*.njk")
      .filter((item) => item.data.serviceMeta)
      .sort((a, b) => (a.data.serviceMeta.order || 0) - (b.data.serviceMeta.order || 0));
  });

  // Collection of published blog articles.
  eleventyConfig.addCollection("blog", function (collectionApi) {
    return collectionApi
      .getFilteredByGlob("src/blog/**/*.md")
      .filter((item) => item.data.permalink && !item.data.draft)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    templateFormats: ["njk", "html", "md", "11ty.js"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
    pathPrefix: "/",
  };
};
