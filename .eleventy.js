const { execFileSync } = require("child_process");

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

  // Look up the category object (for label/blurb) by its key.
  eleventyConfig.addFilter("findCategory", function (categories, key) {
    return (categories || []).find((c) => c.key === key);
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
