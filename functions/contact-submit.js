// Cloudflare Pages Function — handles the appointment-request form POST.
// Route: /contact-submit  (the contact form posts here).
//
// Delivery is via Resend (https://resend.com) when the following environment
// variables are configured in the Cloudflare Pages dashboard:
//   RESEND_API_KEY   — Resend API key
//   CONTACT_TO_EMAIL — where appointment requests are delivered (e.g. info@3rdsetsmiles.com)
//   CONTACT_FROM_EMAIL — a verified sender on your Resend domain (e.g. forms@3rdsetsmiles.com)
//
// If those vars are NOT set, the form does not silently POST into the void:
// the visitor gets an honest message asking them to call or email instead.
// Keep this form PHI-free — it intentionally collects only name, phone, email,
// a non-clinical reason, and a short message.

const ESCAPE = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => ESCAPE[c]);

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
      body: `<p>Your request has been received.</p>`,
    });
  }

  const str = (key, max = 200) => (form.get(key) || "").toString().trim().slice(0, max);
  const name = str("name");
  const phone = str("phone");
  const email = str("email");
  const reason = str("reason");
  const message = str("message", 1000);

  // Marketing attribution (no PHI) — populated client-side by analytics.js.
  const source = str("utm_source") || (str("referrer") ? "referral" : "direct");
  const campaign = str("utm_campaign");
  const attributionId = str("attribution_id");

  if (!name || !phone) {
    return page({
      title: "Missing information",
      heading: "We need a little more",
      body: `<p>Please include at least your name and a phone number so we can reach you, then try again. You can also call us directly at <a href="tel:+14803342752">(480) 334-2752</a>.</p>`,
      status: 400,
    });
  }

  // No delivery configured yet — be honest rather than dropping the request.
  if (!env.RESEND_API_KEY || !env.CONTACT_TO_EMAIL || !env.CONTACT_FROM_EMAIL) {
    return page({
      title: "Please call us",
      heading: "Let's connect by phone",
      body: `<p>Thanks, ${esc(name)}. Our online request handler isn't fully configured yet, so the fastest way to reach us right now is by phone or email.</p>
<p>Call <a href="tel:+14803342752">(480) 334-2752</a> or email <a href="mailto:info@3rdsetsmiles.com">info@3rdsetsmiles.com</a> and we'll get you scheduled.</p>`,
    });
  }

  const lines = [
    `Name: ${name}`,
    `Phone: ${phone}`,
    email ? `Email: ${email}` : null,
    reason ? `Reason: ${reason}` : null,
    message ? `Message: ${message}` : null,
    `Source: ${source}${campaign ? ` / ${campaign}` : ""}`,
    attributionId ? `Attribution ID: ${attributionId}` : null,
  ].filter(Boolean).join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.CONTACT_FROM_EMAIL,
        to: [env.CONTACT_TO_EMAIL],
        reply_to: email || undefined,
        subject: `New appointment request — ${name}`,
        text: `New appointment request from the 3rd Set Smiles website:\n\n${lines}\n`,
      }),
    });

    if (!res.ok) throw new Error(`Resend responded ${res.status}`);
  } catch (e) {
    return page({
      title: "Couldn't send",
      heading: "Your request didn't go through",
      body: `<p>Sorry, ${esc(name)} — something went wrong sending your request. Please call us at <a href="tel:+14803342752">(480) 334-2752</a> or email <a href="mailto:info@3rdsetsmiles.com">info@3rdsetsmiles.com</a> and we'll take care of you.</p>`,
      status: 502,
    });
  }

  return page({
    title: "Request received",
    heading: "Thank you — we'll be in touch",
    body: `<p>Thanks, ${esc(name)}. Your appointment request is in, and we'll get back to you within one business day. If it's urgent, call us at <a href="tel:+14803342752">(480) 334-2752</a>.</p>`,
  });
}

// A direct GET to the handler just sends people back to the contact page.
export async function onRequestGet() {
  return Response.redirect("https://www.3rdsetsmiles.com/contact/", 302);
}
