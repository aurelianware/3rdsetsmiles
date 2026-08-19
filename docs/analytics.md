# Website Conversion Analytics

Privacy-conscious, first-party measurement for 3rd Set Smiles. The goal is to
understand which website actions generate patients — the funnel
**Visitor → Inquiry → Appointment → Arrived Patient → Treatment** — without
third-party trackers and without ever collecting protected health information
(PHI).

## How it works

- **Client:** [`src/assets/js/analytics.js`](../src/assets/js/analytics.js) is a
  tiny, dependency-free module loaded on every page from
  [`base.njk`](../src/_includes/layouts/base.njk). It:
  - captures **UTM attribution** + landing page + referrer once per session,
  - mints a durable, random **`attribution_id`** (identifies a browser, not a
    person; no personal data),
  - auto-wires declarative CTAs via `data-action` attributes and the shared
    appointment-request form,
  - pushes every event to `window.dataLayer` (so a future GA4/GTM tag consumes
    them with no code change), and
  - when a same-origin endpoint is configured, sends a `navigator.sendBeacon`
    to the first-party collector.
- **Collector:** [`functions/collect.js`](../functions/collect.js) is a
  Cloudflare Pages Function that validates and **allowlists** known fields
  (dropping anything else as a PHI safeguard) and acknowledges. It is a seam —
  wire it to a real sink when ready (see [Connecting a sink](#connecting-a-sink)).

The first-party beacon is same-origin **by design**: it must go to a path on
this site (e.g. `/collect`), never a third-party host. Its collector processes
the events. The Content-Security-Policy in `src/_headers` also permits the
Google Analytics / Tag Manager hosts, but those are contacted **only when GA4
is enabled** (see [Google Analytics 4](#google-analytics-4-recommended)); with
GA4 off, no external analytics host is contacted.

## Enabling the beacon

Events push to `window.dataLayer` **always**. The first-party beacon is **off by
default**. To turn it on, set the endpoint in
[`src/_data/site.json`](../src/_data/site.json):

```json
"analytics": { "endpoint": "/collect" }
```

Leave `endpoint` empty (`""`) to keep only the `dataLayer` layer active.

## Google Analytics 4 (recommended)

The fastest way to get real dashboards is a free GA4 property. The site loads
`gtag.js` and forwards every conversion event to GA4 automatically — you only
provide a Measurement ID.

1. Create a free GA4 property at <https://analytics.google.com> →
   **Admin → Data streams → Web** → add your site.
2. Copy the **Measurement ID** — it looks like `G-XXXXXXXX`.
3. Set it in [`src/_data/site.json`](../src/_data/site.json):

   ```json
   "analytics": { "ga4Id": "G-XXXXXXXX" }
   ```

That's the only change needed. When `ga4Id` is set:

- `base.njk` loads `gtag.js` (from `googletagmanager.com`) and runs
  `gtag('config', …)`. When it's empty, **no GA script loads and no requests
  are made** — GA4 is fully off.
- `analytics.js` forwards each conversion via `gtag('event', <event>, …)` with
  the non-PHI params `action`, `form`, and `attribution_id`, so your CTAs show
  up as GA4 events (mark the important ones as **Key events / conversions** in
  the GA4 UI, and register `attribution_id` as a custom dimension if you want it
  on reports).
- GA4 captures UTM source/medium/campaign from the URL automatically.

The Content-Security-Policy in [`src/_headers`](../src/_headers) already
allows the Google Analytics / Tag Manager hosts, so no CSP change is needed to
turn GA4 on. GA4 and the first-party beacon are independent — you can run
either, both, or neither.

## Tracked events

Event names are centralized in `EVENTS` in `analytics.js` and mirrored in
`collect.js`. Keep all three (code + this doc) in sync.

| Event | Fires when |
| --- | --- |
| `appointment_request_started` | A "Request an Appointment" CTA is clicked (`data-action="request-appointment"`) |
| `appointment_request_submitted` | The shared request form (`.contact-form` / `#contact` / `#book`) is submitted |
| `new_patient_offer_clicked` | The $49 new-patient offer CTA is clicked (`data-action="new-patient-offer"`) |
| `insurance_check_started` | A "Check My Insurance" CTA is clicked (`data-action="insurance-check"`) |
| `insurance_check_submitted` | The dedicated insurance-verification form is submitted *(reserved for the Prompt 6 insurance workflow; emit via `window.track(window.ANALYTICS_EVENTS.INSURANCE_CHECK_SUBMITTED)` when that form ships)* |
| `emergency_phone_clicked` | An emergency phone link is clicked (`data-action="call-emergency"`) |
| `google_review_clicked` | A "Leave a Google Review" CTA is clicked (`data-action="google-review"`) |
| `directions_clicked` | A "Get Directions" link is clicked (`data-action="directions"`) |
| `page_not_found` | A visitor lands on the 404 page. The event's `path` is the missing URL they requested (Cloudflare serves `404.html` at the original path), so you can see *which* URLs 404 in GA4 by breaking the event down by page path. |
| `book_online_click` | A general service-page online booking CTA is clicked. |
| `emergency_booking_click` | An emergency appointment-times CTA is clicked. |
| `new_patient_offer_booking_click` | The $49 offer's online booking CTA is clicked. |
| `implant_booking_click` | An implant-consultation booking CTA is clicked. |
| `phone_click` | Any non-emergency phone link is clicked (an unmapped `data-action="call-*"`). |

### Attribution attached to every event

`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`,
`landing_page`, `referrer` (only when off-site), `attribution_id`, plus the
event `ts` and `path`.

## What is intentionally NOT tracked

To stay privacy-conscious and avoid PHI, the client **never** sends:

- names, emails, or phone numbers,
- appointment reasons, messages, or any free-text field value,
- insurance carrier, member/subscriber IDs, or any insurance detail,
- health information of any kind.

The collector independently **drops any key not on its allowlist**, so even a
future client bug cannot leak these fields.

## Adding a new event

1. Add the constant to `EVENTS` in `analytics.js` (and the string to `EVENTS`
   in `collect.js`).
2. Either add a `data-action` to the CTA (and map it in `ACTION_EVENTS`), or
   call `window.track(window.ANALYTICS_EVENTS.YOUR_EVENT)` from a handler.
3. Document the row in the table above.

## Verifying conversions

- **dataLayer:** open DevTools console on any page and run
  `window.dataLayer` — clicking a CTA appends an event object.
- **Beacon:** with `endpoint` set, open the Network tab, filter to `collect`,
  and click a CTA; you should see a `204` POST whose payload contains the event
  and attribution (and **no** personal fields).
- **UTM:** load a page with `?utm_source=google&utm_medium=cpc&utm_campaign=test`,
  then trigger an event on a later page — the UTM values persist for the session.

## Connecting a sink

`collect.js` currently validates and acknowledges. To persist/report, forward
the sanitized `record` inside the `TODO(analytics sink)` block to one of:

- **GA4 Measurement Protocol** — POST to the GA4 endpoint using
  `env.GA4_MEASUREMENT_ID` / `env.GA4_API_SECRET` (set in the Pages dashboard).
- **Cloudflare KV/D1** — write first-party rows for in-house reporting.
- **CloudDentalOffice analytics ingest** — see below.

## Matching website acquisition to CloudDentalOffice patients

The `attribution_id` is the join key between a website visitor and a future
patient record:

1. The browser mints `attribution_id` on first visit and includes it with every
   event, including `appointment_request_submitted`.
2. The appointment-request forms carry the same `attribution_id` and UTM fields
   in hidden inputs (populated by `analytics.js`), and
   [`functions/book-appointment.js`](../functions/book-appointment.js) already
   forwards them to CloudDentalOffice on the `AppointmentRequest` (as
   `attribution`, plus derived `source` / `campaign`). CloudDentalOffice just
   needs to persist them on the request record.
3. As the request moves through the CloudDentalOffice lifecycle
   (Submitted → … → Confirmed → Arrived → Treatment), each stage can report back
   keyed by `attribution_id`, closing the loop from **acquisition source →
   arrived patient → treatment** without exposing PHI to the analytics layer.
