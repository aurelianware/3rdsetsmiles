# Local SEO: off-site checklist

The site's technical and on-page SEO is in good shape. As of the 27 Oct 2026
Search Console review, the broad Tempe searches ("dental implants tempe",
"emergency dentist tempe", "dentist tempe") still sit at positions 25 to 50.
That points to local authority, which comes from outside the website. This
checklist covers that work. None of it can be done from the code.

Use this exact name, address and phone everywhere (it matches `src/_data/site.json`):

```
3rd Set Smiles
2600 E Southern Ave, Suite B1, Tempe, AZ 85282
(480) 334-2752
https://www.3rdsetsmiles.com/
```

## 1. Google Business Profile (this week)

- [ ] Primary category: **Dentist**.
- [ ] Secondary categories, only for what the office really offers: Cosmetic Dentist, Emergency Dental Service, Denture Care Center, Dental Implants Provider, Teeth Whitening Service.
- [ ] Services: add every service on the website, with prices where published ($49 new-patient exam and X-rays, $59 emergency visit, and the four full-mouth packages).
- [ ] Hours match the site (Mon–Fri 10am–6pm). Add holiday hours before each holiday.
- [ ] Website link with a UTM tag so GA4 can separate profile traffic:
      `https://www.3rdsetsmiles.com/?utm_source=google&utm_medium=organic&utm_campaign=gbp`
- [ ] Appointment link: the Zocdoc booking link or `https://www.3rdsetsmiles.com/book/`.
- [ ] Attributes: veteran-owned, wheelchair accessible (if true), online appointments.
- [ ] Photos: 20 or more real ones, including the exterior and sign, the waiting room, treatment rooms, Dr. Phillips, and the team. Add a few new ones each month.
- [ ] Description (750 characters max) that mentions Tempe, implants, dentures, the $49 offer and veteran ownership.
- [ ] Posts: one a week. Rotate the $49 offer, the emergency visit, full-mouth pricing and a link to a blog post.
- [ ] Q&A: post and answer the common questions yourself (insurance, emergencies, sedation, cost of dentures).

## 2. Reviews (start now, then every week)

- [ ] Ask every happy patient at checkout. Use the QR code and `https://www.3rdsetsmiles.com/review/`.
- [ ] Send a text with the review link the same day as the visit.
- [ ] Goal: a few new Google reviews every week, steadily, rather than a burst.
- [ ] Reply to every review within a few days. Thank them by first name only, and never confirm someone is a patient or mention treatment details (HIPAA).
- [ ] Don't offer incentives for reviews and don't filter who gets asked. Both break Google's rules.

## 3. Listings and citations (next 30 days)

Claim or create each one with the exact name, address and phone above. Fix any listing that shows an old address, phone or business name.

- [ ] Bing Places for Business
- [ ] Apple Business Connect (Apple Maps)
- [ ] Yelp (already linked; check details)
- [ ] Facebook (already linked; check details)
- [ ] Zocdoc (already linked; check details)
- [ ] Healthgrades
- [ ] WebMD Care / Vitals
- [ ] ADA Find-a-Dentist (through ADA membership)
- [ ] Arizona Dental Association member directory
- [ ] Better Business Bureau
- [ ] Tempe Chamber of Commerce
- [ ] Nextdoor business page
- [ ] NPI Registry: confirm the practice address on Dr. Phillips' and the practice's NPI records

## 4. Links only this practice can earn (ongoing)

- [ ] Veteran-owned business directories (for example VetBiz, local veteran chambers).
- [ ] NYU Dentistry alumni news or directory.
- [ ] Local sponsorships: a Tempe or Mesa school team, a 5K, a veterans' event. Ask for a link on their sponsor page.
- [ ] Local news or community blogs: the $49 visit for uninsured patients and the published full-mouth prices are both newsworthy, since few practices publish prices.
- [ ] Partners who refer patients (physicians, specialists, denture labs) linking to the site.

## 5. Measure (late November 2026)

- [ ] In Search Console, use a **Domain** property so http, the bare domain and www report together.
- [ ] Compare 18 Oct–15 Nov 2026 with the 28 days before, filtered to **United States** and excluding queries that contain "3rd", "set smiles" or "phillips".
- [ ] In Google Business Profile, check Performance: calls, direction requests, website clicks and bookings.
- [ ] In GA4, check visits tagged `utm_campaign=gbp` and phone-click events.
