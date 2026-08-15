# Insurance Verification (Website)

The "Check My Insurance" experience lets a visitor share their dental plan so
the practice can verify benefits **before the visit**. It is intentionally
**accurate about what is and isn't automated**: the website records a request
and never returns a real-time coverage decision. Verifying benefits and
estimating patient responsibility is done by staff today, and by a future
CloudHealthOffice / CloudDentalOffice eligibility service later.

## Flow

- **Page:** [`src/insurance-check.njk`](../src/insurance-check.njk) → `/insurance-check/`.
  The homepage "Check My Insurance" CTA links here (and fires the
  `insurance_check_started` analytics event); the form submit fires
  `insurance_check_submitted`.
- **Handler:** [`functions/insurance-check.js`](../functions/insurance-check.js)
  validates and builds an `InsuranceVerificationRequest`, records it (eligibility
  seam and/or practice email), and returns an honest, non-committal confirmation.

## What we collect (and don't)

Collected: carrier (required), plan/network (optional), name (required), one
contact method (phone or email), and whether they also want an appointment,
plus non-PHI marketing attribution.

**Not** collected: member/subscriber IDs, group numbers, or any clinical/health
detail. The form says so explicitly. If IDs are needed, staff collect them
through a secure channel.

## Accuracy guardrails

The site must **not** claim any of the following unless a real eligibility
service actually provides them:

- real-time coverage, guaranteed benefits, guaranteed reimbursement, or an
  exact patient responsibility.

The confirmation shown today says only that we've **received** the details and
will verify and follow up before the visit. A message like *"Coverage
information found — we'll confirm your specific benefits and estimated
responsibility before treatment"* may be shown **only when** backed by real
eligibility data (i.e. a `CoverageFound` result from the service below).

## `InsuranceVerificationRequest` model

Posted to the eligibility seam and mirrored in the practice email:

```jsonc
{
  "requestId": "uuid",
  "status": "Received",
  "createdAt": "ISO-8601",
  "carrier": "Delta Dental",
  "plan": "Delta Dental PPO | null",
  "name": "Full name",
  "phone": "phone as entered (trimmed, not normalized) | null",
  "email": "email | null",
  "requestingAppointment": "Yes | No | null",
  "source": "utm_source | referral | direct",
  "campaign": "utm_campaign | null",
  "attribution": { "utm_source": "...", "attribution_id": "...", "...": "..." }
}
```

## Result lifecycle (future service)

The handler sets `status: "Received"`. A future eligibility service advances it:

| Status | Meaning |
| --- | --- |
| `Received` | Request captured; not yet processed. *(only state used today)* |
| `VerificationPending` | Submitted to the payer / being checked. |
| `CoverageFound` | Active coverage located; benefits summarized. |
| `AdditionalInformationNeeded` | Missing/mismatched details; staff follow up. |
| `UnableToVerify` | Could not verify automatically; staff handle manually. |

## Integration contract (future)

Set these in the Cloudflare Pages dashboard when a service is reachable:

| Variable | Purpose |
| --- | --- |
| `CLOUDHEALTH_ELIGIBILITY_API_BASE` | Base URL of the eligibility service. |
| `CLOUDHEALTH_ELIGIBILITY_API_KEY` | Bearer token for the endpoint. |
| `CLOUDHEALTH_ELIGIBILITY_PATH` | Optional; defaults to `/api/public/eligibility-requests`. |
| `CLOUDHEALTH_TIMEOUT_MS` | Optional request timeout (default 8000). |

Expected endpoint: `POST {base}{path}` accepting the `InsuranceVerificationRequest`
body and returning `202 Accepted` (optionally echoing a `status`). Even if the
service returns `CoverageFound`, the website does **not** display coverage to the
visitor until the practice decides to surface confirmed benefits — the request
handler only records the outcome. When Resend is configured, the practice also
receives an email copy so nothing is missed.

The `attribution_id` ties an insurance check to the same visitor as their
appointment request (see [`docs/analytics.md`](./analytics.md)).
