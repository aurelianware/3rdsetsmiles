// functions/collect.js — first-party analytics collector (Cloudflare Pages Function).
//
// Receives conversion events beaconed by /assets/js/analytics.js from the same
// origin (CSP: connect-src 'self'). This is intentionally a thin, provider-
// agnostic SEAM: it validates and allowlists fields, then acknowledges. Wire a
// real sink (GA4 Measurement Protocol, a KV/D1 store, or the CloudDentalOffice
// analytics API) where marked TODO below.
//
// Privacy: only an allowlist of known, non-PHI keys is accepted. Anything else
// a client sends — names, emails, phones, notes, insurance details — is dropped
// here as defense-in-depth, even though the client is built never to send it.

// Keys we accept. Everything else is discarded.
const ALLOWED = new Set([
  'event', 'ts', 'path', 'landing_page', 'referrer',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'attribution_id', 'action', 'form', 'source', 'appointment_intent',
  'cta_position'
]);

// The canonical event names (keep in sync with analytics.js / docs/analytics.md).
const EVENTS = new Set([
  'appointment_request_started', 'appointment_request_submitted',
  'phone_cta_clicked', 'new_patient_offer_clicked',
  'insurance_check_started', 'insurance_check_submitted',
  'emergency_phone_clicked', 'implant_consultation_clicked',
  'google_review_clicked', 'directions_clicked', 'page_not_found',
  'book_online_click', 'emergency_booking_click',
  'new_patient_offer_booking_click', 'implant_booking_click', 'phone_click',
  'booking_cta_click', 'implant_consult_click', 'cosmetic_consult_click',
  'review_google_click', 'booking_started', 'appointment_type_selected',
  'availability_viewed', 'full_arch_page_view', 'implant_phone_click',
  'implant_financing_click', 'implant_candidate_article_click'
]);
const SOURCES = new Set(['homepage', 'emergency', 'implants', 'full-arch', 'implant-candidacy', 'implant-cost', 'cosmetic', 'new-patient-offer', 'google-business', 'post-visit', 'testimonials']);
const APPOINTMENT_INTENTS = new Set(['emergency', 'implant-consult', 'implant-consultation', 'cosmetic-consult', 'cosmetic-consultation', 'new-patient', 'new-patient-exam', 'patient-selected']);
const CTA_POSITIONS = new Set(['hero', 'education', 'financing', 'resources', 'bottom']);

function sanitize(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const key of Object.keys(input)) {
    if (!ALLOWED.has(key)) continue;               // drop unknown keys (PHI guard)
    const value = input[key];
    if (key === 'source' && !SOURCES.has(value)) continue;
    if (key === 'appointment_intent' && !APPOINTMENT_INTENTS.has(value)) continue;
    if (key === 'cta_position' && !CTA_POSITIONS.has(value)) continue;
    if (typeof value === 'string') out[key] = value.slice(0, 200);
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

export async function onRequestPost({ request, env }) {
  void env; // reserved for the analytics sink wired in the TODO block below
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  const record = sanitize(body);
  if (!record.event || !EVENTS.has(record.event)) {
    return new Response(null, { status: 400 });
  }

  // TODO(analytics sink): forward `record` to the real destination, e.g.
  //   • GA4 Measurement Protocol (env.GA4_MEASUREMENT_ID / GA4_API_SECRET)
  //   • Cloudflare KV/D1 for first-party reporting
  //   • CloudDentalOffice analytics ingest, matched by record.attribution_id
  // Until one is configured this endpoint simply acknowledges receipt.

  // 204: nothing to return to a sendBeacon() caller.
  return new Response(null, { status: 204 });
}

// Reject non-POST methods cleanly. Forward the full context so onRequestPost
// receives env/params (needed once the analytics sink is wired).
export async function onRequest(context) {
  if (context.request.method === 'POST') return onRequestPost(context);
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}
