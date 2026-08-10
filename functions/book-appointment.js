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
// with a PublicBookingRequest body:
//   { name, phone, email, patientRelationship, preferredStart, durationMinutes, reason, message }
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

// Office hours, in Arizona local minutes-since-midnight. Latest start is 17:00
// so a 60-minute default appointment still ends by the 18:00 close. Kept in
// sync with the slot list in src/book.njk.
const OPEN_MINUTES = 10 * 60; // 10:00
const LAST_START_MINUTES = 17 * 60; // 17:00

// Validate the visitor's preferred date + time server-side, independent of the
// delivery path (Cloud Dental Office or email). 3rd Set Smiles is in Tempe, AZ,
// which does not observe daylight saving time, so the offset is a fixed -07:00
// (MST) year-round; the requested wall-clock date/time IS Arizona local.
// Returns { startIso } on success, or { error } with a visitor-facing reason.
function validateWhen(dateStr, timeStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !/^\d{2}:\d{2}$/.test(timeStr)) {
    return { error: "Please choose a valid date and time." };
  }
  const start = new Date(`${dateStr}T${timeStr}:00-07:00`);
  if (Number.isNaN(start.getTime())) {
    return { error: "Please choose a valid date and time." };
  }
  if (start.getTime() <= Date.now()) {
    return { error: "Please choose a date and time in the future." };
  }
  // Day-of-week for the Arizona calendar date (07:00Z is the same calendar day).
  const dow = new Date(`${dateStr}T00:00:00-07:00`).getUTCDay();
  if (dow === 0 || dow === 6) {
    return { error: "We're open Monday through Friday — please choose a weekday." };
  }
  const [hh, mm] = timeStr.split(":").map(Number);
  const minutes = hh * 60 + mm;
  if (minutes < OPEN_MINUTES || minutes > LAST_START_MINUTES || (mm !== 0 && mm !== 30)) {
    return { error: "Please choose a time during office hours (10:00 AM – 5:00 PM)." };
  }
  return { startIso: start.toISOString() };
}

async function createInCloudDental(env, booking) {
  const base = env.CLOUDDENTAL_API_BASE.replace(/\/+$/, "");
  const path = env.CLOUDDENTAL_BOOKING_PATH || DEFAULT_BOOKING_PATH;
  const headers = { "Content-Type": "application/json" };
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
      throw new Error(`Cloud Dental Office responded ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`);
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

  const name = (form.get("name") || "").toString().trim();
  const phone = (form.get("phone") || "").toString().trim();
  const email = (form.get("email") || "").toString().trim();
  const patientRelationship = (form.get("patientRelationship") || "").toString().trim();
  const reason = (form.get("reason") || "").toString().trim();
  const date = (form.get("date") || "").toString().trim();
  const time = (form.get("time") || "").toString().trim();
  const message = (form.get("message") || "").toString().trim();

  if (!name || !phone || !date || !time || !["New", "Existing"].includes(patientRelationship)) {
    return page({
      title: "Missing information",
      heading: "We need a little more",
      body: `<p>Please include your name, phone number, whether you've visited us before, and a preferred date and time, then try again. You can also call us directly at <a href="tel:+14803342752">(480) 334-2752</a>.</p>`,
      status: 400,
    });
  }

  // Validate the requested date/time server-side for EVERY delivery path (not
  // just Cloud Dental Office) — future, a weekday, and within office hours.
  const when = validateWhen(date, time);
  if (when.error) {
    return page({
      title: "Check the date and time",
      heading: "That date or time looks off",
      body: `<p>${esc(when.error)} You can also call us at <a href="tel:+14803342752">(480) 334-2752</a>.</p>`,
      status: 400,
    });
  }

  const prettyWhen = `${date} at ${time}`;
  const notes = [
    "WEB BOOKING REQUEST — please confirm with patient before finalizing.",
    `Name: ${name}`,
    `Phone: ${phone}`,
    email ? `Email: ${email}` : null,
    `Patient relationship: ${patientRelationship}`,
    reason ? `Reason: ${reason}` : null,
    `Preferred: ${prettyWhen} (America/Phoenix)`,
    message ? `Message: ${message}` : null,
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
    const booking = {
      name,
      phone,
      email: email || null,
      patientRelationship,
      preferredStart: when.startIso,
      durationMinutes: Number(env.CLOUDDENTAL_APPT_MINUTES) || undefined,
      reason: reason || null,
      message: message || null,
    };

    try {
      await createInCloudDental(env, booking);
      cloudDentalOk = true;
    } catch (e) {
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
