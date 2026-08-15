import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "../functions/insurance-check.js";

function request(extra = {}) {
  const form = new FormData();
  form.set("carrier", "Delta Dental");
  form.set("plan", "Delta Dental PPO");
  form.set("name", "Sam Example");
  form.set("email", "sam@example.test");
  form.set("requestingAppointment", "Yes");
  form.set("utm_source", "google");
  form.set("utm_campaign", "insurance");
  form.set("attribution_id", "aid-xyz-789");
  for (const [k, v] of Object.entries(extra)) v === null ? form.delete(k) : form.set(k, v);
  return new Request("https://example.test/insurance-check", { method: "POST", body: form });
}

async function capturePosted(req) {
  let posted;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    posted = JSON.parse(init.body);
    return new Response(JSON.stringify({ status: "Received" }), { status: 202, headers: { "Content-Type": "application/json" } });
  };
  try {
    var res = await onRequestPost({ request: req, env: { CLOUDHEALTH_ELIGIBILITY_API_BASE: "https://elig.test", CLOUDHEALTH_ELIGIBILITY_API_KEY: "secret" } });
  } finally { globalThis.fetch = originalFetch; }
  return { posted, res };
}

test("posts an InsuranceVerificationRequest with status Received and no member IDs", async () => {
  const { posted } = await capturePosted(request());
  assert.match(posted.requestId, /[0-9a-f-]{16,}/i);
  assert.equal(posted.status, "Received");
  assert.ok(!Number.isNaN(Date.parse(posted.createdAt)));
  assert.equal(posted.carrier, "Delta Dental");
  assert.equal(posted.plan, "Delta Dental PPO");
  assert.equal(posted.requestingAppointment, "Yes");
  // never forwards subscriber/member identifiers or clinical fields
  assert.equal(posted.memberId, undefined);
  assert.equal(posted.subscriberId, undefined);
  assert.equal(posted.groupNumber, undefined);
});

test("captures attribution and derives source/campaign", async () => {
  const { posted } = await capturePosted(request());
  assert.equal(posted.source, "google");
  assert.equal(posted.campaign, "insurance");
  assert.equal(posted.attribution.attribution_id, "aid-xyz-789");
});

test("confirmation never claims real-time or found coverage", async () => {
  const { res } = await capturePosted(request());
  const html = await res.text();
  assert.match(html, /received your insurance details/i);
  // Explicitly disclaims a real-time decision (honest framing must be present).
  assert.match(html, /isn't a real-time coverage decision/i);
  // Never makes a positive/guaranteed coverage claim.
  assert.doesNotMatch(html, /coverage (found|information found)/i);
  assert.doesNotMatch(html, /guaranteed/i);
  assert.doesNotMatch(html, /(benefits are|coverage is|coverage has been) confirmed/i);
});

test("requires carrier, name, and a contact method", async () => {
  const env = {};
  assert.equal((await onRequestPost({ request: request({ carrier: null }), env })).status, 400);
  assert.equal((await onRequestPost({ request: request({ name: null }), env })).status, 400);
  assert.equal((await onRequestPost({ request: request({ email: null, phone: null }), env })).status, 400);
});

test("honeypot is silently accepted and nothing is sent", async () => {
  let called = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { called = true; return new Response("{}", { status: 202 }); };
  try {
    const res = await onRequestPost({ request: request({ company: "bot" }), env: { CLOUDHEALTH_ELIGIBILITY_API_BASE: "https://elig.test", CLOUDHEALTH_ELIGIBILITY_API_KEY: "secret" } });
    assert.equal(res.status, 200);
    assert.equal(called, false);
  } finally { globalThis.fetch = originalFetch; }
});

test("emails the practice as a fallback when the eligibility seam fails", async () => {
  const originalFetch = globalThis.fetch;
  let emailBody;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("api.resend.com")) { emailBody = JSON.parse(init.body); return new Response("{}", { status: 200 }); }
    throw new Error("eligibility unavailable");
  };
  try {
    const res = await onRequestPost({ request: request(), env: {
      CLOUDHEALTH_ELIGIBILITY_API_BASE: "https://elig.test", CLOUDHEALTH_ELIGIBILITY_API_KEY: "secret",
      RESEND_API_KEY: "resend", CONTACT_TO_EMAIL: "office@example.test", CONTACT_FROM_EMAIL: "web@example.test",
    } });
    assert.equal(res.status, 200);
    assert.match(emailBody.text, /Status: Received/i);
    assert.doesNotMatch(emailBody.text, /coverage found/i);
  } finally { globalThis.fetch = originalFetch; }
});
