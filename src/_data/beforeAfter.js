// Before & After gallery cases.
// To add a new case: drop the two photos in src/assets/before-after/ and add
// an entry here. `before` / `after` are paths under /assets/. Keep captions
// accurate to the actual treatment, and never store patient identity here —
// only a non-identifying title, treatment category, image paths, a short
// factual description, sort order, and publication state. `published: true`
// marks a case that has been approved/waived for public web display.
module.exports = [
  {
    id: "case-1",
    title: "Restored Front Tooth & Refreshed Smile",
    treatmentCategory: "restorative",
    description: "Replaced a missing front tooth and rejuvenated the surrounding smile.",
    sortOrder: 10,
    published: true,
    before: "/assets/before-after/case1-before.webp",
    after: "/assets/before-after/case1-after.webp",
  },
  {
    id: "case-2",
    title: "Cosmetic Smile Makeover",
    treatmentCategory: "cosmetic",
    description: "Evened, brightened, and rejuvenated a worn smile.",
    sortOrder: 20,
    published: true,
    before: "/assets/before-after/case2-before.webp",
    after: "/assets/before-after/case2-after.webp",
  },
  {
    id: "case-3",
    title: "Rebuilt a Worn, Damaged Smile",
    treatmentCategory: "restorative",
    description: "Restored worn and damaged upper teeth into an even, natural-looking smile.",
    sortOrder: 30,
    published: true,
    before: "/assets/before-after/case3-before.webp",
    after: "/assets/before-after/case3-after.webp",
  },
  {
    id: "case-4",
    title: "Full-Arch Implant Restoration",
    treatmentCategory: "implants",
    description: "A complete new set of fixed teeth — from a collapsed bite to a full, confident smile.",
    sortOrder: 40,
    published: true,
    before: "/assets/before-after/case4-before.webp",
    after: "/assets/before-after/case4-after.webp",
  },
];
