// Cloudflare Pages Function — handles the online booking form POST.
// Route: /book-appointment  (the /book/ page form posts here).
//
// This is the integration point with Cloud Dental Office
// (https://github.com/aurelianware/clouddentaloffice) — an open-source dental
// practice-management platform. It posts to that platform's dedicated,
// authenticated public booking endpoint:
//
//     POST {base}/api/public/booking-requests   →  202 Accepted
//
// with an AppointmentRequest body (data-minimized; no clinical detail, no
// member/subscriber IDs):
//   { requestId, status, createdAt, patientRelationship, name, phone, email,
//     preferredContact, preferredStart, alternateStart, durationMinutes, reason,
//     message, insuranceIntent, insuranceCarrier, source, campaign, attribution }
//
// Cloud Dental Office staff own patient matching and appointment approval. This
// function sends no patient, provider, location, or appointment identifiers.
//
// Configure these in the Cloudflare Pages dashboard once you have a reachable
// Cloud Dental Office deployment (fronted by its ApiGateway):
//
//   CLOUDDENTAL_API_BASE      — base URL of the ApiGateway, e.g.
//                               https://api.yourpractice.com (the booking path
//                               below is appended to it).
//   CLOUDDENTAL_API_KEY       — the PublicBooking API key; sent as
//                               `Authorization: Bearer …`. Required by the
//                               endpoint once it's enabled.
//   CLOUDDENTAL_BOOKING_PATH  — optional; defaults to
//                               /api/public/booking-requests.
//   CLOUDDENTAL_APPT_MINUTES  — optional appointment length in minutes (default 60).
//   CLOUDDENTAL_TIMEOUT_MS    — optional request timeout in ms (default 8000). If
//                               IntakeService is unreachable, the request aborts
//                               and the email fallback (if configured) takes over.
//
// Regardless of the above, if Resend is configured the practice also gets an
// email copy of every booking so nothing is missed:
//   RESEND_API_KEY / CONTACT_TO_EMAIL / CONTACT_FROM_EMAIL
//
// Delivery precedence:
//   1. If CLOUDDENTAL_API_BASE is set, create the booking request in Cloud Dental
//      Office (and additionally email a copy when Resend is configured).
//   2. Else if Resend is configured, email the booking request.
//   3. Else, be honest and ask the visitor to call.
//
// Keep the intake data-minimized: it collects only the information necessary
// for staff to review an appointment request and has no access to patient or
// clinical systems.

const ESCAPE = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => ESCAPE[c]);

const DEFAULT_BOOKING_PATH = "/api/public/booking-requests";

function page({ title, heading, body, status = 200 }) {
  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>${esc(title)} | 3rd Set Smiles</title>
<link rel="stylesheet" href="/assets/css/main.css">
</head><body class="page-contact">
<main id="main"><section class="error-wrap"><div>
<h1 style="font-size:2.2rem">${esc(heading)}</h1>
${body}
<div class="btn-row" style="justify-content:center;margin-top:24px">
  <a href="/" class="btn-primary">Back to home</a>
  <a href="tel:+14803342752" class="btn-outline btn-outline-dark">Call (480) 334-2752</a>
</div>
</div></section></main>
</body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function createInCloudDental(env, booking) {
  const base = env.CLOUDDENTAL_API_BASE.replace(/\/+$/, "");
  const path = env.CLOUDDENTAL_BOOKING_PATH || DEFAULT_BOOKING_PATH;
  const headers = {
    "Content-Type": "application/json",
    // requestId is created once in the browser form and survives transport
    // retries. Never mint an idempotency key inside a fetch retry attempt.
    "Idempotency-Key": booking.requestId,
  };
  if (env.CLOUDDENTAL_API_KEY) headers.Authorization = `Bearer ${env.CLOUDDENTAL_API_KEY}`;

  // Bound the wait so an unreachable/slow IntakeService fails fast to the email
  // fallback rather than making the visitor sit through a long hang.
  const controller = new AbortController();
  const timeoutMs = Number(env.CLOUDDENTAL_TIMEOUT_MS) || 8000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path.startsWith("/") ? "" : "/"}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(booking),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      const error = new Error(`Cloud Dental Office responded ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`);
      error.status = res.status;
      throw error;
    }
    return res.json().catch(() => ({}));
  } finally {
    clearTimeout(timer);
  }
}

async function emailBooking(env, { subject, text, replyTo }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.CONTACT_FROM_EMAIL,
      to: [env.CONTACT_TO_EMAIL],
      reply_to: replyTo || undefined,
      subject,
      text,
    }),
  });
  if (!res.ok) throw new Error(`Resend responded ${res.status}`);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let form;
  try {
    form = await request.formData();
  } catch (e) {
    return page({
      title: "Something went wrong",
      heading: "We couldn't read your request",
      body: `<p>Please try again, or call us at <a href="tel:+14803342752">(480) 334-2752</a>.</p>`,
      status: 400,
    });
  }

  // Honeypot — silently accept (so bots think they succeeded) but do nothing.
  if (form.get("company")) {
    return page({
      title: "Request received",
      heading: "Thank you",
      body: `<p>Your booking request has been received.</p>`,
    });
  }

  const str = (key, max = 200) => (form.get(key) || "").toString().trim().slice(0, max);
  const oneOf = (key, allowed) => (allowed.includes(str(key)) ? str(key) : null);

  const name = str("name");
  const phone = str("phone");
  const email = str("email");
  const patientRelationship = str("patientRelationship");
  const reason = str("reason");
  const preferredStart = str("preferredStart", 100);
  const availabilityToken = str("availabilityToken", 4096);
  const message = str("message", 1000);
  const submittedRequestId = str("requestId", 128);

  // Optional structured fields (Prompt 3). All are lenient — a missing or
  // invalid value simply isn't attached; it never blocks the request.
  const preferredContact = oneOf("preferredContact", ["Phone", "Text", "Email"]);
  const insuranceIntent = oneOf("insuranceIntent", ["Yes", "No", "Not sure"]);
  // Carrier is only meaningful when the visitor said they'll use insurance.
  const insuranceCarrier = insuranceIntent === "Yes" ? (str("insuranceCarrier", 120) || null) : null;

  // Marketing attribution (no PHI) — populated client-side by analytics.js.
  const attribution = {};
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "landing_page", "referrer", "attribution_id"]) {
    const val = str(key, 200);
    if (val) attribution[key] = val;
  }

  // A live availability token is used when the scheduling backend is connected,
  // but it isn't required: before Cloud Dental Office is wired up (or when it's
  // unreachable/has no online times) the page submits a general request with a
  // preferred date/time and no token. Staff confirm every request either way,
  // so require only the fields we truly need to follow up.
  if (!name || !phone || !preferredStart || !["New", "Existing"].includes(patientRelationship)) {
    return page({
      title: "Missing information",
      heading: "We need a little more",
      body: `<p>Please include your name and phone number, tell us whether you're a new or existing patient, then choose a preferred appointment date and time. You can also call us directly at <a href="tel:+14803342752">(480) 334-2752</a>.</p>`,
      status: 400,
    });
  }

  const start = new Date(preferredStart);
  if (Number.isNaN(start.getTime()) || start.getTime() <= Date.now()) {
    return page({
      title: "Check the date and time",
      heading: "That date or time looks off",
      body: `<p>Please choose an available future time. You can also call us at <a href="tel:+14803342752">(480) 334-2752</a>.</p>`,
      status: 400,
    });
  }

  const prettyWhen = start.toLocaleString("en-US", { timeZone: "America/Phoenix", dateStyle: "medium", timeStyle: "short" });

  // A clean AppointmentRequest model (Prompt 3) — the shape CloudDentalOffice
  // can adopt directly. Data-minimized: no clinical detail, no member IDs.
  const appointmentRequest = {
    // Older/non-JS clients remain supported. Modern browsers submit the UUID
    // generated when the form was loaded, so resubmitting the same POST reuses
    // the identifier and the downstream Idempotency-Key.
    requestId: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submittedRequestId)
      ? submittedRequestId
      : crypto.randomUUID(),
    status: "Submitted",
    createdAt: new Date().toISOString(),
    patientRelationship,
    name,
    phone,
    email: email || null,
    preferredContact: preferredContact || null,
    preferredStart: start.toISOString(),
    availabilityToken: availabilityToken || null,
    alternateStart: null,
    durationMinutes: Number(env.CLOUDDENTAL_APPT_MINUTES) || undefined,
    reason: reason || null,
    message: message || null,
    insuranceIntent: insuranceIntent || null,
    insuranceCarrier,
    source: attribution.utm_source || (attribution.referrer ? "referral" : "direct"),
    campaign: attribution.utm_campaign || null,
    attribution: Object.keys(attribution).length ? attribution : null,
  };

  const notes = [
    "WEB BOOKING REQUEST — please confirm with patient before finalizing.",
    `Request ID: ${appointmentRequest.requestId}`,
    `Name: ${name}`,
    `Phone: ${phone}`,
    email ? `Email: ${email}` : null,
    preferredContact ? `Preferred contact: ${preferredContact}` : null,
    `Patient relationship: ${patientRelationship}`,
    reason ? `Reason: ${reason}` : null,
    `Preferred: ${prettyWhen} (America/Phoenix)`,
    insuranceIntent ? `Insurance: ${insuranceIntent}${insuranceCarrier ? ` — ${insuranceCarrier}` : ""}` : null,
    message ? `Message: ${message}` : null,
    `Source: ${appointmentRequest.source}${appointmentRequest.campaign ? ` / ${appointmentRequest.campaign}` : ""}`,
    attribution.attribution_id ? `Attribution ID: ${attribution.attribution_id}` : null,
  ].filter(Boolean).join("\n");

  // The public booking endpoint requires an API key, so treat Cloud Dental as
  // configured only when both are present — otherwise every call would 401.
  const hasCloudDental = Boolean(env.CLOUDDENTAL_API_BASE && env.CLOUDDENTAL_API_KEY);
  const hasEmail = Boolean(env.RESEND_API_KEY && env.CONTACT_TO_EMAIL && env.CONTACT_FROM_EMAIL);

  // Neither delivery path configured — be honest rather than dropping the request.
  if (!hasCloudDental && !hasEmail) {
    return page({
      title: "Please call us",
      heading: "Let's book by phone",
      body: `<p>Thanks, ${esc(name)}. Our online booking isn't fully connected yet, so the fastest way to lock in ${esc(prettyWhen)} is a quick call.</p>
<p>Call <a href="tel:+14803342752">(480) 334-2752</a> or email <a href="mailto:info@3rdsetsmiles.com">info@3rdsetsmiles.com</a> and we'll get you on the schedule.</p>`,
    });
  }

  let cloudDentalOk = false;

  if (hasCloudDental) {
    try {
      await createInCloudDental(env, appointmentRequest);
      cloudDentalOk = true;
    } catch (e) {
      if (e && e.status === 409) {
        return page({
          title: "Choose another time", heading: "That time was just taken",
          body: `<p>Sorry, ${esc(name)} — that appointment time is no longer available. Please return to the booking page and choose another available time.</p>`, status: 409,
        });
      }
      // Fall through: a configured Resend path below still records the request.
    }
  }

  // Email the practice a copy when Resend is configured — either as the primary
  // delivery path (no Cloud Dental Office) or as a belt-and-suspenders notice.
  if (hasEmail) {
    try {
      const status = hasCloudDental
        ? (cloudDentalOk ? "Accepted by Cloud Dental Office for staff review — not yet confirmed." : "NOT accepted by Cloud Dental Office — please follow up manually.")
        : "Cloud Dental Office not connected — please follow up manually.";
      await emailBooking(env, {
        subject: `New online booking — ${name} (${prettyWhen})`,
        text: `New online booking from the 3rd Set Smiles website:\n\n${notes}\n\nScheduling system: ${status}\n`,
        replyTo: email,
      });
      // A delivered email is a durable fallback record of the request even when
      // Cloud Dental Office was configured but temporarily unavailable.
      cloudDentalOk = true;
    } catch (e) {
      // Email failed. If Cloud Dental also failed (or wasn't configured), report failure.
      if (!cloudDentalOk) {
        return page({
          title: "Couldn't send",
          heading: "Your booking didn't go through",
          body: `<p>Sorry, ${esc(name)} — something went wrong sending your booking. Please call us at <a href="tel:+14803342752">(480) 334-2752</a> or email <a href="mailto:info@3rdsetsmiles.com">info@3rdsetsmiles.com</a> and we'll take care of you.</p>`,
          status: 502,
        });
      }
    }
  }

  if (cloudDentalOk) {
    return page({
      title: "Booking requested",
      heading: "We've received your appointment request",
      body: `<p>Thanks, ${esc(name)}. Our team will review the requested time of <strong>${esc(prettyWhen)}</strong> and contact you to confirm your appointment within one business day. If it's urgent, call us at <a href="tel:+14803342752">(480) 334-2752</a>.</p>`,
    });
  }

  // Cloud Dental Office was the only path and it failed, with no email fallback.
  return page({
    title: "Couldn't book online",
    heading: "Your booking didn't go through",
    body: `<p>Sorry, ${esc(name)} — our booking system didn't accept the request just now. Please call us at <a href="tel:+14803342752">(480) 334-2752</a> or email <a href="mailto:info@3rdsetsmiles.com">info@3rdsetsmiles.com</a> and we'll get you scheduled.</p>`,
    status: 502,
  });
}

// A direct GET to the handler just sends people back to the booking page.
export async function onRequestGet() {
  return Response.redirect("https://www.3rdsetsmiles.com/book/", 302);
}
