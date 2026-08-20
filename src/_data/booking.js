// Zocdoc online-booking configuration — the single source of truth for booking
// URLs, provider identity, and which link is the primary destination. Exposed
// to templates as the `booking` global (e.g. booking.primaryBookingUrl).
//
// `primaryBookingUrl` is DERIVED from `primaryScope`, never stored twice, so it
// can never drift from the provider/practice links. Every consumer resolves the
// same way from this one file: the visible CTAs (partials/booking-cta.njk), the
// JSON-LD ReserveAction targets (base.njk, about.njk), and the generic
// service-page CTAs (layouts/service.njk).
//
// Provider vs. practice: while Dr. Phillips is the only provider, the
// provider-level link is primary because it drops the patient straight onto his
// availability. The practice-level link is kept for future multi-provider
// support. To make the practice link the site-wide default later, change
// `primaryScope` to "practice" here — one line, no template edits. A single CTA
// can still force a scope (e.g. the About page pins scope: "provider").

const PROVIDER_BOOKING_URL = "https://www.zocdoc.com/booking-link/dentist/matthew-phillips-dds-617189";
const PRACTICE_BOOKING_URL = "https://www.zocdoc.com/booking-link/practice/3rd-set-smiles-137227";

const primaryScope = "provider"; // "provider" | "practice"

const urlForScope = (scope) => (scope === "practice" ? PRACTICE_BOOKING_URL : PROVIDER_BOOKING_URL);

module.exports = {
  bookingPlatform: "Zocdoc",
  bookingProviderName: "Dr. Matthew Phillips",
  bookingProviderType: "Dentist",
  primaryScope,
  primaryProviderBookingUrl: PROVIDER_BOOKING_URL,
  practiceBookingUrl: PRACTICE_BOOKING_URL,
  // Derived — always matches primaryScope, so CTAs and structured data agree.
  primaryBookingUrl: urlForScope(primaryScope),
};
