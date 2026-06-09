// Single source of truth for the services-hub groupings.
// Each service's front-matter `serviceMeta.category` must equal one of these
// `key` values. The hub (src/services/index.njk) iterates this list in order,
// so adding/reordering a group happens here — not in template markup.
// Any service whose category key is missing from this list is surfaced in an
// "Uncategorized" group on the hub rather than silently dropped.
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
