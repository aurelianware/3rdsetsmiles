import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "../functions/book-appointment.js";

function request(relationship = "Existing") {
  const form = new FormData();
  form.set("name", "Sam Example");
  form.set("phone", "4805550100");
  form.set("email", "sam@example.test");
  form.set("patientRelationship", relationship);
  form.set("date", "2030-08-12");
  form.set("time", "10:00");
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
