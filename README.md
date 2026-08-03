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

## Manual steps Cloudflare does NOT handle for you

These are out-of-band tasks the human operator must perform — this repo and
this build do not (and cannot) do them:

1. **Cloudflare Pages → Settings:** confirm that any "Single Page Application"
   not-found handling is disabled. With our `_redirects` and a real
   `404.html`, Cloudflare should return a true 404 for unknown paths. Verify
   after deploy by visiting a fake URL such as
   `https://www.3rdsetsmiles.com/does-not-exist` and confirming a 404 status.
2. **Cloudflare zone Redirect Rule (apex → www, 301):**
   `http.host eq "3rdsetsmiles.com"` →
   `concat("https://www.3rdsetsmiles.com", http.request.uri.path)`,
   preserving query string.
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

`/patient-resources` is 301-redirected to `/new-patients`. `/hero-demo` and
`/hero-demo/*` (prior dev junk paths) are explicitly 404'd via `_redirects`.

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
