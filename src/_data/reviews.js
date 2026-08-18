// reviews.js — real, verified patient reviews for on-page social proof.
//
// Source: the practice's public Yelp listing (yelp.com/biz/3rd-set-smiles-tempe-3),
// 5.0 average across 5 reviews at time of capture. Quotes are the reviewers'
// own words, lightly trimmed for length (ellipses mark any trim) with the
// practice name normalized. `featured` selects which appear on the homepage.
//
// IMPORTANT — no rating/aggregateRating structured data is generated from this.
// Google does not surface review rich results for self-serving LocalBusiness
// markup, and these are third-party (Yelp) reviews, so schema markup would earn
// no rich result and risks a policy flag. These are displayed as attributed
// testimonials only. See src/testimonials.njk.
module.exports = [
  {
    author: "Mark P.",
    location: "Tempe, AZ",
    date: "2026-08-17",
    source: "Yelp",
    rating: 5,
    featured: true,
    quote:
      "Great visit and outcome. The staff was organized and Dr. Phillips really knows what he is doing.",
  },
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
    featured: true,
    quote:
      "I wish I could give more stars! Dr. Matthew Phillips is extremely talented and does incredible work. He and his staff are such genuine people — insanely intelligent, and they gave educated answers to all of my questions. They sincerely care for each patient and made accommodations for me every time. I will not be going anywhere else, and neither should you!",
  },
  {
    author: "Sunshine S.",
    location: "Bonners Ferry, ID",
    date: "2025-08-14",
    source: "Yelp",
    rating: 5,
    featured: false,
    quote:
      "Dr. Phillips and his team are wonderful! My husband will only go to him. Thank you so much — I highly recommend him!",
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
];
