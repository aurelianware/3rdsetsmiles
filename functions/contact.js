// functions/contact.js — Cloudflare Pages Function for the appointment-request
// form. Handles POST /contact (the form's action). The static site itself
// lives at /contact/ (trailing slash), so this function only intercepts the
// form submission, never the page view.
//
// PHI-free by design: this endpoint accepts name, phone, email, a non-clinical
// reason, and a short message only. Do not add fields that invite medical
// history here or in the form template.
//
// Email delivery is wired through Resend (https://resend.com) when configured.
// Set these environment variables in the Cloudflare Pages dashboard:
//   RESEND_API_KEY  — Resend API key
//   CONTACT_TO      — destination inbox (e.g. info@3rdsetsmiles.com)
//   CONTACT_FROM    — verified sender (e.g. website@3rdsetsmiles.com)
// If RESEND_API_KEY is not set, the submission is accepted and logged but not
// emailed — so the form never POSTs into the void, and the build can ship
// before the mailbox is provisioned.

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function page(title, bodyHtml, status = 200) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>${escapeHtml(title)} | 3rd Set Smiles</title>
  <link rel="stylesheet" href="/assets/css/main.css">
</head>
<body>
  <main id="main">
    <section class="page-hero">
      <div class="container">
        <h1>${bodyHtml}</h1>
      </div>
    </section>
    <section class="section">
      <div class="container-narrow prose" style="text-align:center">
        <a class="btn-primary" href="/">Back to Home</a>
      </div>
    </section>
  </main>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function onRequestPost({ request, env }) {
  let form;
  try {
    form = await request.formData();
  } catch (err) {
    return page("Something went wrong", "We couldn&rsquo;t read your request. Please call us at (480) 334-2752.", 400);
  }

  // Honeypot: real users leave this empty. If it's filled, silently accept.
  if (form.get("company")) {
    return page("Thank you", "Thanks &mdash; we&rsquo;ll be in touch shortly.");
  }

  const name = (form.get("name") || "").toString().trim();
  const phone = (form.get("phone") || "").toString().trim();
  const email = (form.get("email") || "").toString().trim();
  const reason = (form.get("reason") || "").toString().trim();
  const message = (form.get("message") || "").toString().trim();

  if (!name || !phone) {
    return page("Missing details", "Please include at least your name and phone number, then try again. Or call us at (480) 334-2752.", 400);
  }

  const subject = `Website appointment request — ${name}`;
  const text = [
    `Name: ${name}`,
    `Phone: ${phone}`,
    `Email: ${email || "(not provided)"}`,
    `Reason: ${reason || "(not specified)"}`,
    "",
    "Message:",
    message || "(none)",
  ].join("\n");

  if (env && env.RESEND_API_KEY) {
    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.CONTACT_FROM || "website@3rdsetsmiles.com",
          to: env.CONTACT_TO || "info@3rdsetsmiles.com",
          reply_to: email || undefined,
          subject,
          text,
        }),
      });
      if (!resp.ok) {
        console.error("Resend error", resp.status, await resp.text());
        return page("Couldn&rsquo;t send", "We had trouble sending your request. Please call us at (480) 334-2752 and we&rsquo;ll help right away.", 502);
      }
    } catch (err) {
      console.error("Resend exception", err);
      return page("Couldn&rsquo;t send", "We had trouble sending your request. Please call us at (480) 334-2752 and we&rsquo;ll help right away.", 502);
    }
  } else {
    // No mail provider configured yet — log so nothing is silently lost.
    console.log("Contact form submission (no mailer configured):\n" + text);
  }

  return page("Thank you", "Thanks &mdash; your request is in. We&rsquo;ll get back to you within one business day.");
}
