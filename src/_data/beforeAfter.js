// Before & After gallery cases.
// To add a new case: drop the two photos in src/assets/before-after/ and add
// an entry here. `before` / `after` are paths under /assets/. Keep captions
// accurate to the actual treatment. A case MUST remain `published: false` until
// the office has documented patient authorization for public web use and has
// verified the category and description. Do not store patient identity here.
module.exports = [
  {
    id: "case-1",
    title: "Restored Front Tooth & Refreshed Smile",
    // CONFIRM exact treatment (implant, bridge, crown + whitening?) with the office.
    treatmentCategory: "restorative",
    description: "Replaced a missing front tooth and rejuvenated the surrounding smile.",
    sortOrder: 10,
    published: false,
    before: "/assets/before-after/case1-before.webp",
    after: "/assets/before-after/case1-after.webp",
  },
  {
    id: "case-2",
    title: "Cosmetic Smile Makeover",
    // CONFIRM exact treatment (veneers, bonding, whitening, alignment?) with the office.
    treatmentCategory: "cosmetic",
    description: "Evened, brightened, and rejuvenated a worn smile.",
    sortOrder: 20,
    published: false,
    before: "/assets/before-after/case2-before.webp",
    after: "/assets/before-after/case2-after.webp",
  },
  {
    id: "case-3",
    title: "Rebuilt a Worn, Damaged Smile",
    // CONFIRM exact treatment (crowns, bridge, partial, implants?) with the office.
    treatmentCategory: "restorative",
    description: "Restored worn and damaged upper teeth into an even, natural-looking smile.",
    sortOrder: 30,
    published: false,
    before: "/assets/before-after/case3-before.webp",
    after: "/assets/before-after/case3-after.webp",
  },
  {
    id: "case-4",
    title: "Full-Arch Implant Restoration",
    // CONFIRM exact treatment (All-on-4 / All-on-X, upper and/or lower?) with the office.
    treatmentCategory: "implants",
    description: "A complete new set of fixed teeth — from a collapsed bite to a full, confident smile.",
    sortOrder: 40,
    published: false,
    before: "/assets/before-after/case4-before.webp",
    after: "/assets/before-after/case4-after.webp",
  },
];
