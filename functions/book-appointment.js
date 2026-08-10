// Cloudflare Pages Function — handles the online booking form POST.
// Route: /book-appointment  (the /book/ page form posts here).
//
// This is the integration point with Cloud Dental Office
// (https://github.com/aurelianware/clouddentaloffice) — an open-source dental
// practice-management platform whose SchedulingService exposes:
//
//     POST {base}/api/appointments   →  201 Created + the new Appointment
//
// with a JSON body shaped like CreateAppointmentRequest:
//   { patientId, providerId, locationId, startTime, endTime,
//     procedureCodes, notes, operatory }
//
// Because Cloud Dental Office is self-hosted (no public URL by default) and a
// website visitor has no PatientId/ProviderId/LocationId, this function is
// driven entirely by environment variables. Configure these in the Cloudflare
// Pages dashboard once you have a reachable Cloud Dental Office deployment:
//
//   CLOUDDENTAL_API_BASE     — base URL of the SchedulingService or ApiGateway,
//                              e.g. https://api.yourpractice.com  (no trailing
//                              /api/appointments — that path is appended here).
//   CLOUDDENTAL_PROVIDER_ID  — GUID of the default provider (Dr. Phillips).
//   CLOUDDENTAL_LOCATION_ID  — GUID of the Tempe location.
//   CLOUDDENTAL_PATIENT_ID   — GUID used for unregistered web intakes
//                              (a shared "Web Booking" placeholder patient).
//                              Optional; defaults to the all-zero GUID.
//   CLOUDDENTAL_API_KEY       — optional; sent as `Authorization: Bearer …` if set.
//   CLOUDDENTAL_APPT_MINUTES  — optional appointment length in minutes (default 60).
//
// Regardless of the above, if Resend is configured the practice also gets an
// email copy of every booking so nothing is missed:
//   RESEND_API_KEY / CONTACT_TO_EMAIL / CONTACT_FROM_EMAIL
//
// Delivery precedence:
//   1. If CLOUDDENTAL_API_BASE is set, create the appointment in Cloud Dental
//      Office (and additionally email a copy when Resend is configured).
//   2. Else if Resend is configured, email the booking request.
//   3. Else, be honest and ask the visitor to call.
//
// Keep this form PHI-free — it collects only name, phone, email, a preferred
// date/time, a non-clinical reason, and a short message.

const ESCAPE = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => ESCAPE[c]);

const ZERO_GUID = "00000000-0000-0000-0000-000000000000";

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

// Build ISO 8601 start/end timestamps from the visitor's preferred date + time.
// 3rd Set Smiles is in Tempe, AZ, which does not observe daylight saving time,
// so the offset is a fixed -07:00 (MST) year-round.
function buildTimes(dateStr, timeStr, minutes) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  if (!/^\d{2}:\d{2}$/.test(timeStr)) return null;
  const start = new Date(`${dateStr}T${timeStr}:00-07:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + minutes * 60000);
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

async function createInCloudDental(env, appt) {
  const base = env.CLOUDDENTAL_API_BASE.replace(/\/+$/, "");
  const headers = { "Content-Type": "application/json" };
  if (env.CLOUDDENTAL_API_KEY) headers.Authorization = `Bearer ${env.CLOUDDENTAL_API_KEY}`;

  const res = await fetch(`${base}/api/appointments`, {
    method: "POST",
    headers,
    body: JSON.stringify(appt),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Cloud Dental Office responded ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`);
  }
  return res.json().catch(() => ({}));
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
  const reason = (form.get("reason") || "").toString().trim();
  const date = (form.get("date") || "").toString().trim();
  const time = (form.get("time") || "").toString().trim();
  const message = (form.get("message") || "").toString().trim();

  if (!name || !phone || !date || !time) {
    return page({
      title: "Missing information",
      heading: "We need a little more",
      body: `<p>Please include your name, a phone number, and a preferred date and time, then try again. You can also call us directly at <a href="tel:+14803342752">(480) 334-2752</a>.</p>`,
      status: 400,
    });
  }

  const prettyWhen = `${date} at ${time}`;
  const notes = [
    "WEB BOOKING REQUEST — please confirm with patient before finalizing.",
    `Name: ${name}`,
    `Phone: ${phone}`,
    email ? `Email: ${email}` : null,
    reason ? `Reason: ${reason}` : null,
    `Preferred: ${prettyWhen} (America/Phoenix)`,
    message ? `Message: ${message}` : null,
  ].filter(Boolean).join("\n");

  const hasCloudDental = Boolean(env.CLOUDDENTAL_API_BASE);
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
    const times = buildTimes(date, time, Number(env.CLOUDDENTAL_APPT_MINUTES) || 60);
    if (!times) {
      return page({
        title: "Check the date and time",
        heading: "That date or time looks off",
        body: `<p>Please pick a valid date and time and try again, or call us at <a href="tel:+14803342752">(480) 334-2752</a>.</p>`,
        status: 400,
      });
    }

    const appt = {
      patientId: (env.CLOUDDENTAL_PATIENT_ID || ZERO_GUID),
      providerId: (env.CLOUDDENTAL_PROVIDER_ID || ZERO_GUID),
      locationId: (env.CLOUDDENTAL_LOCATION_ID || ZERO_GUID),
      startTime: times.startTime,
      endTime: times.endTime,
      procedureCodes: null,
      notes,
      operatory: null,
    };

    try {
      await createInCloudDental(env, appt);
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
        ? (cloudDentalOk ? "Created in Cloud Dental Office." : "NOT created in Cloud Dental Office — please book manually.")
        : "Cloud Dental Office not connected — please book manually.";
      await emailBooking(env, {
        subject: `New online booking — ${name} (${prettyWhen})`,
        text: `New online booking from the 3rd Set Smiles website:\n\n${notes}\n\nScheduling system: ${status}\n`,
        replyTo: email,
      });
      // A delivered email is a durable record of the request, so when Cloud
      // Dental Office isn't the delivery path, treat email success as success.
      if (!hasCloudDental) cloudDentalOk = true;
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
      heading: "You're on the list — we'll confirm shortly",
      body: `<p>Thanks, ${esc(name)}. We've received your request for <strong>${esc(prettyWhen)}</strong> and will call or email to confirm the exact time within one business day. If it's urgent, call us at <a href="tel:+14803342752">(480) 334-2752</a>.</p>`,
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
