# Search Console validation after deployment

This release consolidates production URLs on `https://www.3rdsetsmiles.com`,
uses trailing slashes for patient-facing HTML pages, removes the former
homepage redirects for `/hero-demo/*`, and routes high-intent calls to action
through `/book/`. These are technical SEO and conversion improvements, not a
guarantee of ranking changes.

## Before requesting indexing

1. Confirm these requests resolve in one `301` to the corresponding final URL,
   preserving a harmless test query such as `?utm_source=validation`:
   `http://3rdsetsmiles.com/special-offers`,
   `http://www.3rdsetsmiles.com/special-offers`, and
   `https://3rdsetsmiles.com/special-offers`.
2. Confirm `/special-offers` redirects once to `/special-offers/` and that the
   final page returns `200`.
3. Confirm `/hero-demo/variation-10` and `/hero-demo/variation-12` return a real
   `404` and do not redirect to the homepage.
4. Open `/sitemap.xml`; verify every entry uses the canonical host and trailing
   slash, and that no demo, API, redirect, or duplicate URL is present.

## URL Inspection

Use Google Search Console URL Inspection to test the live URL and confirm the
user-declared canonical equals the inspected URL for:

- `https://www.3rdsetsmiles.com/`
- `https://www.3rdsetsmiles.com/special-offers/`
- `https://www.3rdsetsmiles.com/services/emergency-dentistry/`
- `https://www.3rdsetsmiles.com/services/cosmetic-dentistry/`
- `https://www.3rdsetsmiles.com/services/dental-implants/`

For the former demo URLs, confirm Google sees `404`, then use **Validate Fix**
for the applicable indexing issue. Do not block those URLs in `robots.txt`;
Google must be able to crawl the removal response.

Finally, submit `https://www.3rdsetsmiles.com/sitemap.xml` again. Request
indexing for the four priority landing pages above where Search Console offers
that action, then monitor canonical selection, indexed-page counts, clicks to
booking, and mobile behavior after deployment.

## Booking checks

On a phone-sized viewport, test each priority page's main CTA. The offer should
open `/book/?appointmentType=new-patient-exam`; emergency, cosmetic, and implant
pages should pass their corresponding human-readable intent. The booking page
may preselect only an appointment type returned by live CloudDentalOffice
availability. Select a real slot and verify the normal request/revalidation
flow remains intact. No query parameter should create or reserve a booking.
