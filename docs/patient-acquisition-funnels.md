# Patient acquisition funnels

This site reduces friction between a patient landing page and the existing
CloudDentalOffice booking-request workflow. It does not maintain appointment
types, schedules, or availability independently.

## Booking architecture

```text
Google, Maps, social, or direct visit
  → service or offer page
  → intent-specific /book/ CTA
  → live CloudDentalOffice availability
  → patient chooses a returned appointment type and slot
  → booking request
  → CloudDentalOffice revalidates the selection
```

Public intent slugs are suggestions, not CloudDentalOffice identifiers:

| Landing context | Booking URL |
| --- | --- |
| Emergency | `/book/?appointmentType=emergency&source=emergency` |
| Implants/full arch | `/book/?appointmentType=implant-consult&source=implants` |
| Cosmetic/veneers/whitening | `/book/?appointmentType=cosmetic-consult&source=cosmetic` |
| $49 new-patient offer | `/book/?appointmentType=new-patient&source=new-patient-offer` |
| Homepage | `/book/?source=homepage` |
| Google Business Profile | `/book/?source=google-business` |

The browser matches intent only against public appointment type codes and names
returned with current availability. An unknown or unavailable intent is never
submitted, silently substituted, or allowed to reserve a slot. The patient can
choose another returned type or call the configured practice number.

The `source` and `appointmentType` analytics contexts are enumerated in code.
Unknown values are dropped by both the browser and collector. Never add patient
names, contact details, appointment reasons, diagnoses, insurance information,
or free text to booking or review URLs.

## Measured stages

The existing first-party/GA4 event layer measures safe, non-PHI stages:

```text
CTA click → booking_started → appointment_type_selected
          → availability_viewed → appointment_request_submitted
```

The event payload may include an enumerated acquisition source and public
appointment intent. It never includes form field values.

## Review acquisition

```text
Completed patient visit
  → future CloudDentalOffice email/SMS containing /review/?source=post-visit
  → 3rd Set Smiles review destination
  → centrally configured Google review page
```

`/review/` is a PHI-free, noindex destination contract for future outreach. It
does not ask whether the patient was satisfied and does not divert negative
feedback into a private form. Every patient receives equal access to the same
Google review button. CloudDentalOffice remains responsible for post-visit
outreach; this website does not implement an email or SMS platform.

The Google destination is configured once at `site.review.googleUrl` in
`src/_data/site.json`. The QR asset on the testimonials/review pages must be
regenerated if that URL changes.

## Before-and-after cases

The current gallery remains `noindex` while the office confirms documentation
for every displayed case. Patient imagery may be published only with appropriate
written authorization covering public web use. Case records should contain only
a non-identifying title, treatment category, image paths, short factual
description, sort order, and publication state—never patient identity or
clinical-record data. Do not add placeholder or fabricated cases.
