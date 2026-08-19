import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { onRequestGet } from "../functions/booking-availability.js";

test("availability proxy authenticates server-side and forwards only allowed filters", async () => {
  const originalFetch = globalThis.fetch; let captured;
  globalThis.fetch = async (url, init) => { captured = { url: String(url), init }; return Response.json([{ availabilityToken: "opaque" }]); };
  try {
    const request = new Request("https://site.test/booking-availability?patientRelationship=New&from=2030-01-01T00:00:00Z&to=2030-01-02T00:00:00Z&tenantId=evil");
    const response = await onRequestGet({ request, env: { CLOUDDENTAL_API_BASE: "https://intake.test", CLOUDDENTAL_API_KEY: "server-secret" } });
    assert.equal(response.status, 200); assert.equal(captured.init.headers.Authorization, "Bearer server-secret");
    assert.doesNotMatch(captured.url, /tenantId/); assert.doesNotMatch(await response.text(), /server-secret/);
  } finally { globalThis.fetch = originalFetch; }
});

test("availability errors are visitor-safe", async () => {
  const originalFetch = globalThis.fetch; globalThis.fetch = async () => new Response("raw upstream details", { status: 503 });
  try {
    const response = await onRequestGet({ request: new Request("https://site.test/booking-availability"), env: { CLOUDDENTAL_API_BASE: "https://intake.test", CLOUDDENTAL_API_KEY: "secret" } });
    assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /raw upstream/);
  } finally { globalThis.fetch = originalFetch; }
});

test("booking controls have labels, live status, and required hidden selection fields", async () => {
  const page = await readFile(new URL("../src/book.njk", import.meta.url), "utf8");
  const script = await readFile(new URL("../src/assets/js/booking.js", import.meta.url), "utf8");
  for (const id of ["book-reason", "book-provider", "book-location", "book-date", "book-time"]) assert.match(page, new RegExp(`for="${id}"`));
  assert.match(page, /role="status" aria-live="polite"/);
  assert.match(page, /id="book-availability-retry"/);
  assert.match(page, /name="availabilityToken"/); assert.match(page, /name="preferredStart"/);
  assert.match(script, /fetch\("\/booking-availability\?/);
  assert.match(script, /patientRelationship/);
  assert.match(script, /couldn't load online availability/i);
  assert.match(script, /timeZone: "America\/Phoenix"/);
  assert.match(script, /time\._availableSlots = \[\]/);
  assert.match(script, /That visit type isn't available online right now/);
  assert.match(script, /retry\.addEventListener\("click", load\)/);
  assert.match(script, /type\.addEventListener\("change"/);
});
