// serviceCategories.js — Single source of truth for the services-hub grouping.
//
// The services hub (src/services/index.njk) iterates this list in order and
// renders one section per category. Each service file sets a stable `key`
// (NOT a display string) in its front-matter `serviceMeta.category`, e.g.
// `general-family`. Driving the hub from this list — instead of matching
// category display strings inline — means a typo can't silently drop a
// service: anything whose key doesn't match a category below falls into the
// "Uncategorized" group rendered by the hub, so it's visible in the build.
//
// `key`   — the stable identifier used in serviceMeta.category
// `label` — the section heading shown on the hub
// `blurb` — the short line under the heading
module.exports = [
  {
    key: "implant",
    label: "Implant Dentistry",
    blurb: "Single implants, full-arch reconstruction, and implant-supported dentures.",
  },
  {
    key: "general-family",
    label: "General & Family Dentistry",
    blurb: "Preventive care, fillings, crowns, extractions, and more.",
  },
  {
    key: "cosmetic",
    label: "Cosmetic Dentistry",
    blurb: "Veneers, whitening, and clear aligner orthodontics.",
  },
  {
    key: "specialized",
    label: "Specialized Care",
    blurb: "Sedation options, emergency visits, and TMJ / night-guard therapy.",
  },
];
