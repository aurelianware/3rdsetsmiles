// reviews.js — real, verified patient reviews for on-page social proof.
//
// Sources: the practice's public Yelp and Google Business Profile listings.
// Quotes are the reviewers' own words, lightly trimmed for length (with the
// practice name normalized). `featured: true` selects the homepage subset.
// Google `date` values are approximate (Google shows relative dates like
// "a year ago"), so the site displays month + year only, not an exact day.
//
// IMPORTANT — no rating/aggregateRating/Review structured data is generated
// from this. Google does not surface review rich results for self-serving
// LocalBusiness markup, and these are third-party (Yelp/Google) reviews, so
// schema markup would earn no rich result and risks a policy flag. These are
// displayed as attributed testimonials only. See src/testimonials.njk.
module.exports = [
  // ── Yelp ──────────────────────────────────────────────────────────────
  {
    author: "Erika H.",
    location: "Las Vegas, NV",
    date: "2024-02-02",
    source: "Yelp",
    rating: 5,
    featured: true,
    quote:
      "I was very lucky to have found 3rd Set Smiles. They are really nice people and family owned. I got the All-on-4 and I am very pleased with the results — they look exactly how I wanted them to look and really exceeded my expectations. If you need serious dental work, see Dr. Phillips at 3rd Set Smiles.",
  },
  {
    author: "Willow F.",
    location: "Chandler, AZ",
    date: "2023-10-11",
    source: "Yelp",
    rating: 5,
    featured: false,
    quote:
      "I wish I could give more stars! Dr. Matthew Phillips is extremely talented and does incredible work. He and his staff are such genuine people — insanely intelligent, and they gave educated answers to all of my questions. They sincerely care for each patient and made accommodations for me every time. I will not be going anywhere else, and neither should you!",
  },
  {
    author: "Mark P.",
    location: "Tempe, AZ",
    date: "2026-08-17",
    source: "Yelp",
    rating: 5,
    featured: false,
    quote:
      "Great visit and outcome. The staff was organized and Dr. Phillips really knows what he is doing.",
  },
  {
    author: "Cindy P.",
    location: "Mesa, AZ",
    date: "2022-06-28",
    source: "Yelp",
    rating: 5,
    featured: false,
    quote:
      "Dr. Phillips is a great, professional dentist with an excellent sense of humor. He makes you feel comfortable, explains everything, and discusses all your options. Follow-up after treatment is great — he really cares. I highly recommend this office.",
  },

  // ── Google ────────────────────────────────────────────────────────────
  {
    author: "Jonathan Duke",
    date: "2025-08-01",
    source: "Google",
    rating: 5,
    featured: true,
    quote:
      "Dr. Phillips and his staff are top notch, honest, caring, and take time to answer all questions. I have had an extraction, implant, and whitening — all excellent results. I highly recommend 3rd Set Smiles!",
  },
  {
    author: "Christine Hamilton-Ottis",
    date: "2024-08-01",
    source: "Google",
    rating: 5,
    featured: true,
    quote:
      "Dr. Phillips is amazing! My husband was sent here by the VA because he needed to have 4 teeth pulled. A prior experience with a different dentist didn't go well and left him terrified it would happen again. Dr. Phillips was so kind and understanding. I would highly recommend him!",
  },
  {
    author: "Brendan Trajanowski",
    date: "2026-06-01",
    source: "Google",
    rating: 5,
    featured: false,
    quote:
      "I am so happy with my new implant — it looks identical to my existing teeth, and it was affordable compared to quotes from other dentists. My new go-to dentist!",
  },
  {
    author: "Grace H.",
    date: "2023-08-01",
    source: "Google",
    rating: 5,
    featured: false,
    quote:
      "I had my wisdom teeth out and had no pain after! Dr. Phillips listened and explained everything in detail, making sure to give me all the information and reduce my anxiety. I was put to sleep for surgery and it was a positive experience!",
  },
  {
    author: "James Wilson",
    date: "2025-09-01",
    source: "Google",
    rating: 5,
    featured: false,
    quote:
      "Dr. Phillips is an awesome dentist who really cares about his patients! Maya, the dental hygienist, is a magician with the teeth whitening — I can't believe how well my teeth whitened in just one visit!",
  },
  {
    author: "Kirk Black",
    date: "2023-08-01",
    source: "Google",
    rating: 5,
    featured: false,
    quote:
      "Dr. Phillips is a caring, professional dentist. He performed an implant for my wife and did an excellent job. We would highly recommend Dr. Phillips to the community, and especially to our close family and friends.",
  },
];
