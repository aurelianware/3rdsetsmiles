// Cloudflare Pages Function — handles the "Check My Insurance" form POST.
// Route: /insurance-check  (the /insurance-check/ page form posts here).
//
// This records an InsuranceVerificationRequest for staff review and is the
// integration point for a future CloudHealthOffice / CloudDentalOffice
// eligibility service. It NEVER returns a real-time coverage decision to the
// visitor — verifying benefits and estimating patient responsibility is done
// by staff (or a future automated workflow) and confirmed before the visit.
//
// Future eligibility result lifecycle (documented in docs/insurance-verification.md):
//   Received → VerificationPending → CoverageFound
//                                  → AdditionalInformationNeeded
//                                  → UnableToVerify
// Only "Received" is used today. A message like "Coverage information found…"
// must NOT be shown until supported by real eligibility data.
//
// Configure in the Cloudflare Pages dashboard when a service is reachable:
//   CLOUDHEALTH_ELIGIBILITY_API_BASE — base URL of the eligibility service.
//   CLOUDHEALTH_ELIGIBILITY_API_KEY  — sent as `Authorization: Bearer …`.
//   CLOUDHEALTH_ELIGIBILITY_PATH     — optional; defaults to /api/public/eligibility-requests.
//   CLOUDHEALTH_TIMEOUT_MS           — optional request timeout (default 8000).
// Regardless, if Resend is configured the practice also gets an email copy:
//   RESEND_API_KEY / CONTACT_TO_EMAIL / CONTACT_FROM_EMAIL
//
// Data-minimized: collects carrier/plan, name, and one contact method. It does
// NOT collect member/subscriber IDs or any clinical detail.

const ESCAPE = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => ESCAPE[c]);

const DEFAULT_ELIGIBILITY_PATH = "/api/public/eligibility-requests";

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

async function createEligibilityRequest(env, verification) {
  const base = env.CLOUDHEALTH_ELIGIBILITY_API_BASE.replace(/\/+$/, "");
  const path = env.CLOUDHEALTH_ELIGIBILITY_PATH || DEFAULT_ELIGIBILITY_PATH;
  const headers = { "Content-Type": "application/json" };
  if (env.CLOUDHEALTH_ELIGIBILITY_API_KEY) headers.Authorization = `Bearer ${env.CLOUDHEALTH_ELIGIBILITY_API_KEY}`;

  const controller = new AbortController();
  const timeoutMs = Number(env.CLOUDHEALTH_TIMEOUT_MS) || 8000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path.startsWith("/") ? "" : "/"}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(verification),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Eligibility service responded ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`);
    }
    return res.json().catch(() => ({}));
  } finally {
    clearTimeout(timer);
  }
}

async function emailPractice(env, { subject, text, replyTo }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
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
    return page({ title: "Request received", heading: "Thank you", body: `<p>Your request has been received.</p>` });
  }

  const str = (key, max = 200) => (form.get(key) || "").toString().trim().slice(0, max);
  const oneOf = (key, allowed) => (allowed.includes(str(key)) ? str(key) : null);

  const carrier = str("carrier", 120);
  const plan = str("plan", 120);
  const name = str("name");
  const phone = str("phone");
  const email = str("email");
  const requestingAppointment = oneOf("requestingAppointment", ["Yes", "No"]);

  // Need the plan, who they are, and one way to reach them.
  if (!carrier || !name || (!phone && !email)) {
    return page({
      title: "Missing information",
      heading: "We need a little more",
      body: `<p>Please include your insurance carrier, your name, and a phone number or email so we can reach you, then try again. You can also call us directly at <a href="tel:+14803342752">(480) 334-2752</a>.</p>`,
      status: 400,
    });
  }

  // Marketing attribution (no PHI) — populated client-side by analytics.js.
  const attribution = {};
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "landing_page", "referrer", "attribution_id"]) {
    const val = str(key, 200);
    if (val) attribution[key] = val;
  }

  // The InsuranceVerificationRequest model — the shape a future CloudHealthOffice
  // eligibility service can adopt directly. Status starts at "Received"; the
  // service (or staff) advances it. No member IDs, no clinical detail.
  const verification = {
    requestId: crypto.randomUUID(),
    status: "Received",
    createdAt: new Date().toISOString(),
    carrier,
    plan: plan || null,
    name,
    phone: phone || null,
    email: email || null,
    requestingAppointment: requestingAppointment || null,
    source: attribution.utm_source || (attribution.referrer ? "referral" : "direct"),
    campaign: attribution.utm_campaign || null,
    attribution: Object.keys(attribution).length ? attribution : null,
  };

  const notes = [
    "WEBSITE INSURANCE CHECK — verify benefits and follow up before the visit.",
    `Request ID: ${verification.requestId}`,
    `Name: ${name}`,
    phone ? `Phone: ${phone}` : null,
    email ? `Email: ${email}` : null,
    `Carrier: ${carrier}`,
    plan ? `Plan/network: ${plan}` : null,
    requestingAppointment ? `Also requesting an appointment: ${requestingAppointment}` : null,
    `Source: ${verification.source}${verification.campaign ? ` / ${verification.campaign}` : ""}`,
    attribution.attribution_id ? `Attribution ID: ${attribution.attribution_id}` : null,
  ].filter(Boolean).join("\n");

  const hasEligibility = Boolean(env.CLOUDHEALTH_ELIGIBILITY_API_BASE && env.CLOUDHEALTH_ELIGIBILITY_API_KEY);
  const hasEmail = Boolean(env.RESEND_API_KEY && env.CONTACT_TO_EMAIL && env.CONTACT_FROM_EMAIL);

  // Neither path configured — be honest rather than dropping the request.
  if (!hasEligibility && !hasEmail) {
    return page({
      title: "Please call us",
      heading: "Let's check by phone",
      body: `<p>Thanks, ${esc(name)}. Our online insurance check isn't fully connected yet, so the fastest way to verify your ${esc(carrier)} benefits is a quick call.</p>
<p>Call <a href="tel:+14803342752">(480) 334-2752</a> or email <a href="mailto:info@3rdsetsmiles.com">info@3rdsetsmiles.com</a> and our team will help.</p>`,
    });
  }

  let recorded = false;

  // Record the request in the eligibility service when configured. Note: we do
  // NOT surface any coverage result to the visitor, even if the service returns
  // one — benefits are confirmed by staff before the visit.
  if (hasEligibility) {
    try {
      await createEligibilityRequest(env, verification);
      recorded = true;
    } catch (e) {
      // Fall through to the email path if configured.
    }
  }

  if (hasEmail) {
    try {
      await emailPractice(env, {
        subject: `Website insurance check — ${name} (${carrier})`,
        text: `New insurance check from the 3rd Set Smiles website:\n\n${notes}\n\nStatus: Received — verify benefits and follow up before the visit.\n`,
        replyTo: email,
      });
      recorded = true;
    } catch (e) {
      if (!recorded) {
        return page({
          title: "Couldn't send",
          heading: "Your request didn't go through",
          body: `<p>Sorry, ${esc(name)} — something went wrong sending your request. Please call us at <a href="tel:+14803342752">(480) 334-2752</a> or email <a href="mailto:info@3rdsetsmiles.com">info@3rdsetsmiles.com</a> and we'll help.</p>`,
          status: 502,
        });
      }
    }
  }

  if (recorded) {
    // Honest, non-committal confirmation — never claims coverage was found.
    return page({
      title: "Insurance check received",
      heading: "Thanks — we've received your insurance details",
      body: `<p>Thanks, ${esc(name)}. Our team will verify your ${esc(carrier)} benefits and follow up${requestingAppointment === "Yes" ? " to help schedule your visit" : " before your visit"}. We'll confirm your specific coverage and any estimated responsibility with you — this isn't a real-time coverage decision. If it's urgent, call <a href="tel:+14803342752">(480) 334-2752</a>.</p>`,
    });
  }

  return page({
    title: "Couldn't submit",
    heading: "Your request didn't go through",
    body: `<p>Sorry, ${esc(name)} — our system didn't accept the request just now. Please call us at <a href="tel:+14803342752">(480) 334-2752</a> or email <a href="mailto:info@3rdsetsmiles.com">info@3rdsetsmiles.com</a> and we'll help.</p>`,
    status: 502,
  });
}

// A direct GET to the handler just sends people back to the insurance-check page.
export async function onRequestGet() {
  return Response.redirect("https://www.3rdsetsmiles.com/insurance-check/", 302);
}
