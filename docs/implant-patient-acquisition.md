# Full-arch implant patient acquisition

The implant funnel connects existing educational content to the existing
CloudDentalOffice-backed consultation workflow:

```text
Search, Maps, referral, or internal content
  → /services/all-on-4/
  → education + provider context + cost/financing information
  → /book/?appointmentType=implant-consult&source=full-arch
  → live CloudDentalOffice availability
  → appointment request
  → CloudDentalOffice revalidation and practice confirmation
```

## Content architecture

`/services/dental-implants/` remains the broad implant hub and explains
single-tooth replacement. `/services/all-on-4/` is the one substantial
full-arch landing page and explains All-on-4 and All-on-X terminology without
creating competing keyword routes. It links to existing pages for
implant-supported dentures, candidacy, cost factors, financing, and provider
background.

The public `implant-consult` value is a human-readable intent, not an internal
appointment type ID. The booking UI may preselect only a matching public type
returned with current CDO availability. Patients can change the selection, and
CDO revalidates the opaque slot token when the request is submitted.

## Measurement

The desired reporting sequence is:

```text
full_arch_page_view
  → implant_consult_click (with cta_position)
  → booking_started (source=full-arch, appointment_intent=implant-consult)
  → availability_viewed
  → appointment_request_submitted
```

Supporting events measure implant phone, financing, and candidacy-article
clicks. `source`, `appointment_intent`, and `cta_position` are enumerated in
both the browser and collector. Website analytics must not infer treatment
revenue or contain patient names, contact details, diagnoses, medical history,
free-form concerns, X-rays, medications, or insurance identifiers.

## Clinical and privacy boundaries

- Landing-page information is educational and cannot determine candidacy.
- The site does not collect clinical history or treatment-planning files.
- Cost and insurance language does not promise a price, coverage, or financing
  approval.
- Provisional same-phase teeth are described only as a possibility when
  clinically appropriate, never as guaranteed permanent teeth in one day.
- CloudDentalOffice remains authoritative for appointment types and times.
- Clinical before-and-after photographs may only be published when the practice
  has appropriate authorization for that use. Image files alone are not proof
  of consent. The landing page renders only explicitly published implant or
  full-arch cases and renders no placeholder when none are authorized.
