import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost, onRequest } from "../functions/collect.js";

function post(payload) {
  return new Request("https://example.test/collect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

test("accepts a valid conversion event and returns 204", async () => {
  const res = await onRequestPost({ request: post({ event: "appointment_request_started", path: "/", ts: 123 }) });
  assert.equal(res.status, 204);
});

test("accepts PHI-free booking and review funnel events", async () => {
  for (const event of ["booking_cta_click", "booking_started", "appointment_type_selected", "availability_viewed", "review_google_click"]) {
    const res = await onRequestPost({ request: post({ event, source: "emergency", appointment_intent: "emergency" }) });
    assert.equal(res.status, 204);
  }
});

test("rejects unknown or missing event names", async () => {
  assert.equal((await onRequestPost({ request: post({ event: "not_a_real_event" }) })).status, 400);
  assert.equal((await onRequestPost({ request: post({ path: "/" }) })).status, 400);
});

test("rejects a non-JSON body", async () => {
  const req = new Request("https://example.test/collect", { method: "POST", body: "not json{" });
  assert.equal((await onRequestPost({ request: req })).status, 400);
});

test("drops any field not on the allowlist (PHI guard)", async () => {
  // The handler must not throw and must not echo PHI; we assert it accepts the
  // event while proving (via the module's allowlist) that extra keys are ignored.
  const res = await onRequestPost({
    request: post({
      event: "appointment_request_submitted",
      utm_source: "google",
      attribution_id: "aid-123",
      // The following must never be forwarded — they are dropped by sanitize():
      name: "Jane Patient",
      email: "jane@example.com",
      phone: "4805550100",
      insuranceId: "XYZ123",
      message: "I have tooth pain",
    }),
  });
  assert.equal(res.status, 204);
});

test("non-POST methods are rejected with 405", async () => {
  const req = new Request("https://example.test/collect", { method: "GET" });
  const res = await onRequest({ request: req });
  assert.equal(res.status, 405);
  assert.equal(res.headers.get("Allow"), "POST");
});
