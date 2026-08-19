# 3rd Set Smiles — Cloudflare Pages site

Static multi-page site for **3rd Set Smiles**, a dental practice in Tempe, AZ.
Built with [Eleventy (11ty)](https://www.11ty.dev/) + Nunjucks; deployed on
**Cloudflare Pages**.

---

## Architecture

| Thing | Where |
|-------|-------|
| Source | `src/` (Nunjucks templates + data) |
| Output | `_site/` (static HTML + assets, ignored by git) |
| Build  | `npx @11ty/eleventy` |
| Single source of truth for NAP (Name/Address/Phone) | `src/_data/site.json` |
| Shared `<head>`, nav, footer, `Dentist` JSON-LD | `src/_includes/layouts/base.njk` |
| Service-detail layout | `src/_includes/layouts/service.njk` |
| Cloudflare config (passthrough copy) | `src/_headers`, `src/_redirects`, `src/robots.txt` |
| Sitemap | Generated at `_site/sitemap.xml` from `src/sitemap.njk` |
| 404 page | `src/404.njk` → `_site/404.html` |

Every page extends `base.njk`, which injects the centralized `Dentist`
schema.org JSON-LD on every URL. **Never hardcode the phone number, address,
or hours in a page template** — edit `src/_data/site.json` and it propagates
automatically.

## Local development

```bash
# install
npm install

# build once
npm run build

# build + watch + serve at http://localhost:8080
npm start
```

## Booking request idempotency

The booking page creates one UUID when the form is loaded and posts it as
`requestId`. The Pages Function forwards that same value in both the JSON body
and the `Idempotency-Key` header. Replaying the same form POST is therefore an
idempotent success in Cloud Dental Office, while a newly loaded form receives a
new ID. The key is never regenerated inside a delivery attempt. If CDO is
unavailable, the existing Resend delivery path remains the durable fallback.

Output goes to `_site/`. Serve `_site/` with any static HTTP server to test the
production build:

```bash
npx http-server _site -p 8000
```

## Cloudflare Pages settings

The build output directory is set in [`wrangler.toml`](wrangler.toml)
(`pages_build_output_dir = "_site"`) so Cloudflare reads it from the repo. The
**build command** must be set once in the dashboard — Cloudflare Pages does
not allow it to be specified in `wrangler.toml`.

In the Cloudflare Pages dashboard for this project, open
**Settings → Builds & deployments → Build configurations** and set:

| Setting | Value |
|---------|-------|
| Framework preset | None |
| Build command | `npx @11ty/eleventy` |
| Build output directory | `_site` *(also enforced by `wrangler.toml`)* |
| Root directory | (leave blank — repo root) |
| Node version | 20 (env var `NODE_VERSION=20`) |

If a previous deploy used build output `app`, that value MUST be changed to
`_site` (or cleared, so `wrangler.toml` wins). An empty build command will
cause builds to fail with `Error: Output directory "_site" not found.`

`src/_headers` and `src/_redirects` are passthrough-copied into the output so
Cloudflare picks them up automatically. `src/robots.txt` is published at
`/robots.txt`. The sitemap is published at `/sitemap.xml`.

## Online booking & Cloud Dental Office integration

The `/book/` page ([`src/book.njk`](src/book.njk)) lets visitors submit an
appointment request by picking a preferred date and time and indicating whether
they have visited the practice before. It POSTs to the Cloudflare
Pages Function [`functions/book-appointment.js`](functions/book-appointment.js),
which integrates with **Cloud Dental Office**
(<https://github.com/aurelianware/clouddentaloffice>) — the practice's
open-source scheduling backend.

The page loads live, canonical CloudDentalOffice availability through the same
scheduling engine used by external scheduling channels. The browser calls the
same-origin `/booking-availability` Pages Function; that server-side proxy keeps
`CLOUDDENTAL_API_KEY` private and returns only public labels, times, and an opaque
selection token. No scheduling rules are duplicated in JavaScript.

On submission, IntakeService revalidates the token. HTTP `409` means the slot
was taken after it was displayed; the page asks the visitor to choose another
time and does not send a misleading fallback email. This remains
**request-based website booking**: successful submission creates a staff-reviewable
BookingRequest, not an Appointment. Confirmed marketplace bookings such as
Zocdoc use a separate authenticated confirmed-booking workflow.

Use `https://www.3rdsetsmiles.com/book/?source=google-business` as the Google
Business Profile booking link. `source` is a controlled, non-PHI acquisition
label; the page canonical remains `/book/`. Service-intent mappings, funnel
events, and the post-visit review destination are documented in
[`docs/patient-acquisition-funnels.md`](docs/patient-acquisition-funnels.md).

The function posts to Cloud Dental Office's dedicated **public IntakeService** —
`POST {base}/api/public/booking-requests` — added for this integration
([details](https://github.com/aurelianware/clouddentaloffice)). That service is
the only internet-facing component: it authenticates the request, validates it,
and publishes an event for a private consumer to persist as a staff-reviewable
`BookingRequest`. It has no database or read access to patient or clinical records, and the website
never holds any practice identifiers. A successful submit returns `202 Accepted`.

Delivery precedence in the function:

1. **Cloud Dental Office** — used when `CLOUDDENTAL_API_BASE` is set. Booking
   requests are delivered directly to the staff work queue.
2. **Email (Resend)** — used as the delivery path when Cloud Dental Office
   isn't configured, and as an additional copy when it is. Reuses the same
   `RESEND_*`/`CONTACT_*` variables as the contact form.
3. **Honest fallback** — if neither is configured, the visitor is asked to
   call, rather than the request being dropped.

**Resilience:** a Cloud Dental Office outage never breaks the page. If the
SchedulingService is down, the IntakeService still accepts the booking and it
queues on the message bus. If the IntakeService/bus itself is unreachable, the
request times out fast (`CLOUDDENTAL_TIMEOUT_MS`) and the email path takes over.
**Configure `RESEND_*` so there is always a delivery path** — then no single
backend outage can leave a visitor without a confirmation.

Configure these in **Cloudflare Pages → Settings → Environment variables**
once Cloud Dental Office is reachable from the public internet (it is
self-hosted and has no public URL by default):

| Variable | Required | Purpose |
|----------|----------|---------|
| `CLOUDDENTAL_API_BASE` | to enable direct booking | Base URL of the public IntakeService, e.g. `https://book.yourpractice.com` (the booking path is appended automatically). |
| `CLOUDDENTAL_API_KEY` | with `CLOUDDENTAL_API_BASE` | The `PublicBooking` API key; sent as `Authorization: Bearer …`. Required by the endpoint once it's enabled. |
| `CLOUDDENTAL_BOOKING_PATH` | optional | Override the endpoint path (default `/api/public/booking-requests`). |
| `CLOUDDENTAL_AVAILABILITY_PATH` | optional | Override the availability endpoint (default `/api/public/availability`). |
| `CLOUDDENTAL_APPT_MINUTES` | optional | Appointment length in minutes (default `60`). |
| `CLOUDDENTAL_TIMEOUT_MS` | optional | Request timeout in ms (default `8000`). If the IntakeService is unreachable, the request aborts and the email fallback takes over. |

Patient matching and approval happen only in **Cloud Dental Office**. The public
page displays provider/location/type aliases supplied by CloudDentalOffice and
never receives their internal identifiers. Times are displayed in
`America/Phoenix` and submitted as UTC ISO-8601 with the opaque selection token.
The Function performs only structural validation; SchedulingService owns all
working-hours, duration, eligibility, lead-time, horizon, and collision rules.

> **Note:** Only the Cloud Dental Office **IntakeService** should face the
> internet (with TLS + the `PublicBooking` API key). It has no database or read
> access to patient/clinical systems —
> it publishes booking events to a private message bus. Keep `SchedulingService`,
> the API gateway, and all other services on the private network. No CORS changes
> are needed: this function calls the IntakeService server-to-server.

### Rollout order (safe to launch before Cloud Dental Office is ready)

The site only calls Cloud Dental Office when **both** `CLOUDDENTAL_API_BASE` and
`CLOUDDENTAL_API_KEY` are set. Until then `/book/` behaves exactly like the
contact form. So you can ship the page first and wire the backend later:

1. **Deploy with the `CLOUDDENTAL_*` variables unset.** `/book/` and the
   "Book Online" links go live and route bookings through email.
2. **Set `RESEND_API_KEY` / `CONTACT_TO_EMAIL` / `CONTACT_FROM_EMAIL`** (the same
   variables the contact form uses) so those interim bookings are actually
   delivered rather than shown a "please call" page.
3. **Build, deploy, and verify Cloud Dental Office** (IntakeService + Service Bus
   + SchedulingService) at your own pace — nothing on the site depends on it yet.
4. **Set `CLOUDDENTAL_API_BASE` + `CLOUDDENTAL_API_KEY`** (pointing at the
   deployed IntakeService) and **redeploy the Pages project.** Bookings now flow
   to the message bus, with email kept as the fallback/copy.

Env-var changes take effect on the next Pages deploy, so steps 1 and 4 are
config changes you can flip (or roll back) without touching code. A Cloud Dental
Office outage after step 4 still can't break the page — see **Resilience** above.

## DNS cutover (pointing the real domain at this site)

The domain `3rdsetsmiles.com` currently resolves to the **old Vercel** site.
To bring this Cloudflare Pages build online at the real domain, follow
[`DNS-CUTOVER.md`](DNS-CUTOVER.md) — it inventories the live GoDaddy zone
(including the email records that must be preserved) and gives the exact
step-by-step. After each stage, check progress with:

```bash
npm run verify:domain   # scripts/verify-domain.sh
```

## Manual steps Cloudflare does NOT handle for you

These are out-of-band tasks the human operator must perform — this repo and
this build do not (and cannot) do them:

1. **Cloudflare Pages → Settings:** confirm that any "Single Page Application"
   not-found handling is disabled. With our `_redirects` and a real
   `404.html`, Cloudflare should return a true 404 for unknown paths. Verify
   after deploy by visiting a fake URL such as
   `https://www.3rdsetsmiles.com/does-not-exist` and confirming a 404 status.
2. **Canonical redirect verification:** root Pages middleware now redirects the
   apex host, HTTP requests, and slashless page routes directly to their final
   `https://www.3rdsetsmiles.com/path/` URL while preserving the query string.
   Keep both the apex and `www` custom domains attached to the Pages project so
   requests reach that middleware; an equivalent zone rule may remain as
   defense in depth, but must target the same final URL to avoid a chain.
3. **Google Business Profile:** confirm phone is **(480) 334-2752**, remove any
   "VA Community Care Provider" or veteran-specific language, confirm hours
   Mon–Fri 10am–6pm (matching `src/_data/site.json`).
4. **Directories (Yelp, Facebook, Apple Maps, Healthgrades, Bing Places, etc.):**
   correct the phone number wherever the previous tracking-number variant
   (the incorrect `480` number ending in `0434`) still appears. NAP consistency
   matters for local SEO.
5. **Google Search Console:** resubmit `https://www.3rdsetsmiles.com/sitemap.xml`
   after the new site goes live, and monitor the Pages coverage report for
   404 spikes for a week or two.

## URL structure (mirrors the prior live site for SEO equity)

```
/
/about
/contact
/services
/services/dental-implants
/services/all-on-4
/services/implant-supported-dentures
/services/dentures
/services/family-dentistry
/services/cosmetic-dentistry
/services/veneers
/services/teeth-whitening
/services/clear-aligners
/services/crowns-bridges
/services/root-canal-therapy
/services/tooth-extractions
/services/dental-fillings
/services/gum-disease-treatment
/services/preventive-care
/services/sedation-dentistry
/services/emergency-dentistry
/services/tmj-night-guards
/new-patients
/insurance-financing
/special-offers
/testimonials
/before-after-gallery       (noindex until populated with real photos)
/privacy
/terms
/accessibility
```

`/patient-resources` is 301-redirected to `/new-patients/`. `/hero-demo` and
`/hero-demo/*` have no production route and return the site's real 404 response;
they are not redirected to the homepage or included in the sitemap.

## Editing content

* **Update phone / address / hours / email / social links:** `src/_data/site.json`
* **Add or reorder nav links:** `src/_data/nav.js`
* **Add a new service page:** create `src/services/your-service.njk` modeled
  on an existing service page; include `serviceMeta: { label, category, order, shortBlurb }`
  so it appears in the services collection.
* **Add a FAQ block to a page:** add a `faq:` array in the front matter (see
  `src/services/dental-implants.njk` for the format). `FAQPage` JSON-LD is
  emitted automatically.
* **Mark a page noindex:** add `noindex: true` to the front matter; the page
  will be omitted from `sitemap.xml` and a `<meta name="robots" content="noindex, follow">`
  tag will be added.

## CONFIRM markers in the bio

The `About` page contains `<!-- CONFIRM: ... -->` HTML comments next to each
specific credential preserved from the prior site. Each one should be
documented (or removed) before launch per Arizona dental board advertising
rules. See `src/about.njk`.

## TODO markers

Visible in the source as `<!-- TODO: ... -->` comments. Currently:

* Real patient reviews on `/` and `/testimonials/`
* Before/after photos on `/before-after-gallery/`
* Wire the contact form to a real backend (Cloudflare Pages Function,
  Formspree, etc.)
* Confirm currently-active special offers on `/special-offers/`
* List of accepted PPO insurance carriers on `/insurance-financing/`
* Hosted new-patient intake form link on `/new-patients/`

---

Veteran-owned. Tempe, AZ. **(480) 334-2752.**
