const serviceCategories = require("./src/_data/serviceCategories.js");

module.exports = function (eleventyConfig) {
  // Passthrough copy: files that should land in the output root verbatim.
  eleventyConfig.addPassthroughCopy({ "src/_headers": "_headers" });
  eleventyConfig.addPassthroughCopy({ "src/_redirects": "_redirects" });
  eleventyConfig.addPassthroughCopy({ "src/robots.txt": "robots.txt" });
  eleventyConfig.addPassthroughCopy({ "src/static": "/" });
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/images": "images" });

  // Filters
  eleventyConfig.addFilter("absUrl", function (path, base) {
    const root = (base || "https://www.3rdsetsmiles.com").replace(/\/$/, "");
    if (!path) return root + "/";
    return root + (path.startsWith("/") ? path : "/" + path);
  });

  eleventyConfig.addFilter("year", function () {
    return new Date().getFullYear();
  });

  // Resolve a stable service-category key (e.g. "general-family") to its
  // display label (e.g. "General & Family Dentistry"). Falls back to the raw
  // value so an unknown key is visible rather than silently blank.
  eleventyConfig.addFilter("categoryLabel", function (key) {
    const match = serviceCategories.find((c) => c.key === key);
    return match ? match.label : key;
  });

  // JSON helper for inline JSON-LD (Eleventy ships a built-in `dump` filter but
  // we want pretty 2-space output for diff-friendly HTML).
  eleventyConfig.addFilter("jsonStringify", function (obj) {
    return JSON.stringify(obj, null, 2);
  });

  // Collection of every service page, ordered by `order` in the data file.
  eleventyConfig.addCollection("services", function (collectionApi) {
    return collectionApi
      .getFilteredByGlob("src/services/**/*.njk")
      .filter((item) => item.data.serviceMeta)
      .sort((a, b) => (a.data.serviceMeta.order || 0) - (b.data.serviceMeta.order || 0));
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
