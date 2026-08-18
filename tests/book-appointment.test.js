import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "../functions/book-appointment.js";

function request(relationship = "Existing") {
  const form = new FormData();
  form.set("name", "Sam Example");
  form.set("phone", "4805550100");
  form.set("email", "sam@example.test");
  form.set("patientRelationship", relationship);
  form.set("preferredStart", "2030-08-12T17:00:00.000Z");
  form.set("availabilityToken", "opaque-signed-slot");
  form.set("reason", "Exam");
  return new Request("https://example.test/book-appointment", { method: "POST", body: form });
}

test("posts relationship without internal identifiers and uses request language", async () => {
  let posted;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    posted = JSON.parse(init.body);
    return new Response(JSON.stringify({ status: "requested" }), { status: 202, headers: { "Content-Type": "application/json" } });
  };
  try {
    const response = await onRequestPost({ request: request("Existing"), env: { CLOUDDENTAL_API_BASE: "https://intake.test", CLOUDDENTAL_API_KEY: "secret" } });
    const html = await response.text();
    assert.equal(posted.patientRelationship, "Existing");
    assert.equal(posted.patientId, undefined);
    assert.equal(posted.providerId, undefined);
    assert.equal(posted.locationId, undefined);
    assert.match(html, /received your appointment request/i);
    assert.doesNotMatch(html, /appointment (is|has been) (confirmed|scheduled)/i);
  } finally { globalThis.fetch = originalFetch; }
});

test("requires a valid patient relationship", async () => {
  const response = await onRequestPost({ request: request("Unknown"), env: {} });
  assert.equal(response.status, 400);
  assert.match(await response.text(), /new or existing patient/i);
});

test("uses Resend fallback when Cloud Dental intake fails", async () => {
  const originalFetch = globalThis.fetch;
  let resendCalled = false;
  globalThis.fetch = async (url) => {
    if (String(url).includes("api.resend.com")) { resendCalled = true; return new Response("{}", { status: 200 }); }
    throw new Error("intake unavailable");
  };
  try {
    const response = await onRequestPost({ request: request("New"), env: {
      CLOUDDENTAL_API_BASE: "https://intake.test", CLOUDDENTAL_API_KEY: "secret",
      RESEND_API_KEY: "resend", CONTACT_TO_EMAIL: "office@example.test", CONTACT_FROM_EMAIL: "web@example.test"
    } });
    assert.equal(response.status, 200);
    assert.equal(resendCalled, true);
  } finally { globalThis.fetch = originalFetch; }
});

test("uses the stable website request ID as the CDO idempotency key", async () => {
  const formRequest = request("New");
  const form = await formRequest.formData();
  form.set("requestId", "11111111-1111-4111-8111-111111111111");
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, init) => {
    calls.push(init);
    return new Response(JSON.stringify({ status: "requested" }), { status: 202, headers: { "Content-Type": "application/json" } });
  };
  try {
    const env = { CLOUDDENTAL_API_BASE: "https://intake.test", CLOUDDENTAL_API_KEY: "secret" };
    for (let i = 0; i < 2; i++) {
      const replay = new Request("https://example.test/book-appointment", { method: "POST", body: form });
      assert.equal((await onRequestPost({ request: replay, env })).status, 200);
    }
    assert.deepEqual(calls.map((call) => call.headers["Idempotency-Key"]), [
      "11111111-1111-4111-8111-111111111111",
      "11111111-1111-4111-8111-111111111111",
    ]);
    assert.deepEqual(calls.map((call) => JSON.parse(call.body).requestId), [
      "11111111-1111-4111-8111-111111111111",
      "11111111-1111-4111-8111-111111111111",
    ]);
  } finally { globalThis.fetch = originalFetch; }
});

// Builds a request with the optional Prompt 3 fields set.
function richRequest(extra = {}) {
  const form = new FormData();
  form.set("name", "Sam Example");
  form.set("phone", "4805550100");
  form.set("email", "sam@example.test");
  form.set("patientRelationship", "New");
  form.set("preferredStart", "2030-08-12T17:00:00.000Z");
  form.set("availabilityToken", "opaque-signed-slot");
  form.set("reason", "Dental implants consultation");
  form.set("preferredContact", "Text");
  form.set("insuranceIntent", "Yes");
  form.set("insuranceCarrier", "Delta Dental");
  form.set("utm_source", "google");
  form.set("utm_campaign", "implants");
  form.set("attribution_id", "aid-abc-123");
  for (const [k, v] of Object.entries(extra)) v === null ? form.delete(k) : form.set(k, v);
  return new Request("https://example.test/book-appointment", { method: "POST", body: form });
}

async function capturePosted(request) {
  let posted;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    posted = JSON.parse(init.body);
    return new Response(JSON.stringify({ status: "requested" }), { status: 202, headers: { "Content-Type": "application/json" } });
  };
  try {
    await onRequestPost({ request, env: { CLOUDDENTAL_API_BASE: "https://intake.test", CLOUDDENTAL_API_KEY: "secret" } });
  } finally { globalThis.fetch = originalFetch; }
  return posted;
}

test("posts a structured AppointmentRequest with status Submitted and no PHI identifiers", async () => {
  const posted = await capturePosted(richRequest());
  assert.match(posted.requestId, /[0-9a-f-]{16,}/i);
  assert.equal(posted.status, "Submitted");
  assert.ok(!Number.isNaN(Date.parse(posted.createdAt)));
  assert.equal(posted.preferredContact, "Text");
  assert.equal(posted.patientId, undefined);
  assert.equal(posted.providerId, undefined);
  assert.equal(posted.locationId, undefined);
});

test("forwards insurance intent and carrier, but drops carrier unless intent is Yes", async () => {
  const yes = await capturePosted(richRequest());
  assert.equal(yes.insuranceIntent, "Yes");
  assert.equal(yes.insuranceCarrier, "Delta Dental");

  const no = await capturePosted(richRequest({ insuranceIntent: "No" }));
  assert.equal(no.insuranceIntent, "No");
  assert.equal(no.insuranceCarrier, null); // carrier not attached when not using insurance
});

test("captures marketing attribution and derives source/campaign", async () => {
  const posted = await capturePosted(richRequest());
  assert.equal(posted.source, "google");
  assert.equal(posted.campaign, "implants");
  assert.equal(posted.attribution.attribution_id, "aid-abc-123");
  assert.equal(posted.attribution.utm_source, "google");
});

test("posts the opaque availability selection without internal identifiers", async () => {
  const posted = await capturePosted(richRequest());
  assert.equal(posted.availabilityToken, "opaque-signed-slot");
  assert.equal(posted.providerId, undefined);
  assert.equal(posted.locationId, undefined);
  assert.equal(posted.appointmentTypeId, undefined);
});

test("shows a friendly conflict and does not email a stale slot", async () => {
  const originalFetch = globalThis.fetch;
  let emailCalled = false;
  globalThis.fetch = async (url) => {
    if (String(url).includes("api.resend.com")) { emailCalled = true; return new Response("{}", { status: 200 }); }
    return new Response(JSON.stringify({ message: "no longer available" }), { status: 409 });
  };
  try {
    const response = await onRequestPost({ request: request("New"), env: {
      CLOUDDENTAL_API_BASE: "https://intake.test", CLOUDDENTAL_API_KEY: "secret",
      RESEND_API_KEY: "resend", CONTACT_TO_EMAIL: "office@example.test", CONTACT_FROM_EMAIL: "web@example.test"
    } });
    assert.equal(response.status, 409); assert.equal(emailCalled, false);
    assert.match(await response.text(), /time is no longer available|time was just taken/i);
  } finally { globalThis.fetch = originalFetch; }
});

test("practice email says accepted for review rather than created or confirmed", async () => {
  const originalFetch = globalThis.fetch;
  let emailBody;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("api.resend.com")) {
      emailBody = JSON.parse(init.body);
      return new Response("{}", { status: 200 });
    }
    return new Response(JSON.stringify({ status: "requested" }), { status: 202, headers: { "Content-Type": "application/json" } });
  };
  try {
    await onRequestPost({ request: request("Existing"), env: {
      CLOUDDENTAL_API_BASE: "https://intake.test", CLOUDDENTAL_API_KEY: "secret",
      RESEND_API_KEY: "resend", CONTACT_TO_EMAIL: "office@example.test", CONTACT_FROM_EMAIL: "web@example.test"
    } });
    assert.match(emailBody.text, /accepted by Cloud Dental Office for staff review/i);
    assert.doesNotMatch(emailBody.text, /created in Cloud Dental Office/i);
  } finally { globalThis.fetch = originalFetch; }
});
