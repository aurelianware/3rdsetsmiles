// Same-origin, secret-hiding proxy to CloudDentalOffice IntakeService.
const allowed = new Set(["patientRelationship", "from", "to", "appointmentType", "provider", "location"]);

export async function onRequestGet({ request, env }) {
  if (!env.CLOUDDENTAL_API_BASE || !env.CLOUDDENTAL_API_KEY) {
    return json({ message: "Online availability is not configured." }, 503);
  }
  const incoming = new URL(request.url);
  const target = new URL(env.CLOUDDENTAL_AVAILABILITY_PATH || "/api/public/availability",
    `${env.CLOUDDENTAL_API_BASE.replace(/\/+$/, "")}/`);
  for (const [key, value] of incoming.searchParams) if (allowed.has(key)) target.searchParams.set(key, value.slice(0, 200));
  try {
    const response = await fetch(target, {
      headers: { Authorization: `Bearer ${env.CLOUDDENTAL_API_KEY}`, Accept: "application/json" },
    });
    if (!response.ok) return json({ message: response.status === 429 ? "Please wait a moment and try again." : "Availability is temporarily unavailable." }, response.status);
    return new Response(await response.text(), {
      status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=30" },
    });
  } catch {
    return json({ message: "Availability is temporarily unavailable." }, 503);
  }
}

function json(value, status) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
