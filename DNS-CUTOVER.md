# DNS cutover runbook — 3rdsetsmiles.com → Cloudflare Pages

Repoint the live domain from its current **Vercel** host to the new
**Cloudflare Pages** deployment (`3rdsetsmiles.pages.dev`), without breaking
email. Run `sh scripts/verify-domain.sh` before and after each stage.

---

## What the domain looks like today (observed)

- **Registrar / DNS:** GoDaddy. Nameservers `ns71.domaincontrol.com` /
  `ns72.domaincontrol.com`.
- **Current website host:** **Vercel.** Apex `A @ → 216.150.1.1` and
  `www CNAME → 3rdsetsmiles.com` both resolve to a Vercel deployment
  (`server: Vercel`, HTTP 200). The site you are replacing is on Vercel, not
  Cloudflare — this is a host migration.
- **New site:** this repo, built by Eleventy, deployed to Cloudflare Pages,
  live and correct at <https://3rdsetsmiles.pages.dev>. Canonical domain in
  the code is `https://www.3rdsetsmiles.com` (apex is expected to 301 → www).

### Full current GoDaddy zone (13 records)

| Type  | Name                         | Data                                          | Purpose |
|-------|------------------------------|-----------------------------------------------|---------|
| A     | `@`                          | `216.150.1.1` (TTL 600)                       | **Website → Vercel. This is what we repoint.** |
| CNAME | `www`                        | `3rdsetsmiles.com`                            | **Website → apex → Vercel. Repoint this too.** |
| NS    | `@`                          | `ns71.domaincontrol.com` / `ns72...`          | GoDaddy DNS |
| SOA   | `@`                          | `ns71.domaincontrol.com`                      | GoDaddy DNS |
| MX    | `@`                          | `smtp.google.com` (priority 1)                | **Email — Google Workspace. PRESERVE.** |
| TXT   | `google._domainkey`          | `v=DKIM1; k=rsa; p=MIIBIjANBgkqhki...`        | **Email — Google DKIM. PRESERVE.** |
| TXT   | `20251216184748pm._domainkey`| `k=rsa; p=MIGfMA0GCSq...`                     | **Email — Postmark DKIM. PRESERVE.** |
| CNAME | `pm-bounces`                 | `pm.mtasv.net`                                | **Email — Postmark bounces. PRESERVE.** |
| TXT   | `_dmarc`                     | `v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;` | **Email — DMARC. PRESERVE.** |
| TXT   | `@`                          | `protonmail-verification=73847a2a...`         | ProtonMail verification. Preserve unless Proton is retired. |
| CNAME | `pay`                        | `paylinks.commerce.godaddy.com`               | GoDaddy pay links. Preserve if used, else drop. |
| CNAME | `_domainconnect`             | `_domainconnect.gd.domaincontrol.com`         | GoDaddy DomainConnect. Only relevant while on GoDaddy DNS. |

> ⚠️ **The five email records — MX, both DKIM TXT, `pm-bounces`, and
> `_dmarc` — are live and must survive the move untouched.** A nameserver
> migration that silently drops them takes down mail delivery. `verify-domain.sh`
> checks for all of them.
>
> ℹ️ **No SPF record exists.** Google Workspace normally wants a
> `TXT @  v=spf1 include:_spf.google.com ~all`. Its absence weakens
> deliverability and DMARC alignment. Consider adding it during this window.
> Also note both a Google MX **and** a ProtonMail verification are present —
> confirm which mail provider is actually authoritative.

---

## Recommended approach: move the zone to Cloudflare

The repo's README already assumes a **Cloudflare zone Redirect Rule** for
apex → www. That rule only exists if the zone is on Cloudflare. Moving DNS to
Cloudflare also gives apex CNAME flattening (GoDaddy can't CNAME an apex),
automatic Pages TLS, and one place to manage everything.

### Step 1 — Add the site to Cloudflare (nothing goes live yet)
1. Cloudflare dashboard → **Add a site** → `3rdsetsmiles.com` (Free plan is fine).
2. Cloudflare scans and **imports existing records**. **Stop and verify the
   import against the 13-record table above** — especially the five email
   records. Manually add anything that didn't come across.
3. Cloudflare shows you two assigned nameservers, e.g. `x.ns.cloudflare.com`
   and `y.ns.cloudflare.com`. Note them.

### Step 2 — Point the Pages project at the domain
In the Cloudflare **Pages** project (`3rdsetsmiles`) → **Custom domains**:
1. Add `www.3rdsetsmiles.com`. Cloudflare creates/updates
   `www CNAME → 3rdsetsmiles.pages.dev` (proxied).
2. Add `3rdsetsmiles.com` (apex). Cloudflare creates a flattened
   `@ CNAME → 3rdsetsmiles.pages.dev` (proxied).
3. **Delete the old `A @ → 216.150.1.1` (Vercel) record** so it can't conflict.

### Step 3 — Apex → www redirect (per README)
Cloudflare → the zone → **Rules → Redirect Rules → Create**:
- When: `http.host eq "3rdsetsmiles.com"`
- Then: **Dynamic** 301 to
  `concat("https://www.3rdsetsmiles.com", http.request.uri.path)`
- **Preserve query string:** on.

### Step 4 — Flip nameservers at GoDaddy
GoDaddy → domain → **Nameservers → Change → I'll use my own** → enter the two
Cloudflare nameservers from Step 1. Save. Lower TTLs beforehand if you want a
faster fallback, but the NS change is what actually cuts over.

Propagation is usually well under an hour but can take up to 24–48h. Email
keeps flowing throughout **because you preserved the MX/DKIM/DMARC records in
Step 1.**

### Step 5 — Verify
```sh
sh scripts/verify-domain.sh
```
Green when: nameservers on Cloudflare, `www` and apex resolve to Cloudflare
(not `216.150.1.1`, not `server: Vercel`), apex 301s → www, CSP header
present, and all email records still resolve. Also spot-check by hand:
- <https://www.3rdsetsmiles.com/> loads the new site.
- <https://3rdsetsmiles.com/> 301-redirects to www.
- <https://www.3rdsetsmiles.com/does-not-exist> returns a real **404**.
- <https://www.3rdsetsmiles.com/sitemap.xml> and `/robots.txt` load.
- Send/receive a test email.

---

## Alternative: keep GoDaddy DNS (no nameserver change)

Only if you do **not** want to move nameservers. GoDaddy cannot CNAME an apex,
so:
1. Pages → Custom domains → add `www.3rdsetsmiles.com`.
2. GoDaddy: change `www CNAME` from `3rdsetsmiles.com` → `3rdsetsmiles.pages.dev`.
3. Apex: use GoDaddy **domain forwarding** → 301 `3rdsetsmiles.com` to
   `https://www.3rdsetsmiles.com` (GoDaddy manages the apex A record for
   forwarding — remove the `216.150.1.1` Vercel A record).
4. All email records stay exactly as they are (you never touched DNS hosting).

Downside: no Cloudflare apex proxying and the apex→www redirect is GoDaddy's
forwarder instead of the Redirect Rule the README documents. Functional, but
less clean; `verify-domain.sh` will WARN that nameservers are still GoDaddy.

---

## Post-cutover housekeeping (from the README)
- Confirm Pages **Single Page Application** not-found handling is **off** (we
  ship a real `404.html`).
- Google Search Console: resubmit `https://www.3rdsetsmiles.com/sitemap.xml`;
  watch the coverage report for 404 spikes for a week or two.
- Decommission the old Vercel project once the new site is confirmed live, so
  it can't accidentally reclaim the domain.
