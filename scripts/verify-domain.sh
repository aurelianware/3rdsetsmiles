#!/usr/bin/env sh
# verify-domain.sh — post-cutover DNS + endpoint checks for 3rdsetsmiles.com.
#
# Confirms the domain has been repointed from the old Vercel host to the new
# Cloudflare Pages deployment, WITHOUT breaking email. Uses Cloudflare
# DNS-over-HTTPS (no `dig` dependency) plus curl for live HTTP/TLS checks.
#
# Usage:
#   sh scripts/verify-domain.sh
#
# Exit code is 0 only if every REQUIRED check passes.

set -u

APEX="3rdsetsmiles.com"
WWW="www.3rdsetsmiles.com"
PAGES="3rdsetsmiles.pages.dev"

pass=0
fail=0
warn=0

ok()   { printf '  \033[32mPASS\033[0m  %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; fail=$((fail+1)); }
note() { printf '  \033[33mWARN\033[0m  %s\n' "$1"; warn=$((warn+1)); }
head() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# doh <name> <type> -> prints the record data lines
doh() {
  curl -s "https://cloudflare-dns.com/dns-query?name=$1&type=$2" \
    -H "accept: application/dns-json" 2>/dev/null |
    python3 -c "import sys,json;d=json.load(sys.stdin);[print(a.get('data','')) for a in d.get('Answer',[])]" 2>/dev/null
}

head "Nameservers ($APEX)"
NS="$(doh "$APEX" NS)"
printf '%s\n' "$NS" | sed 's/^/        /'
if printf '%s' "$NS" | grep -qi 'ns.cloudflare.com'; then
  ok "Nameservers are on Cloudflare"
elif printf '%s' "$NS" | grep -qi 'domaincontrol.com'; then
  note "Still on GoDaddy nameservers (OK if you chose to keep GoDaddy DNS + forwarding)"
else
  note "Unrecognised nameservers"
fi

head "www.3rdsetsmiles.com"
# Two valid ways www can point at the Pages site:
#   (a) zone NOT on Cloudflare: a plain CNAME -> 3rdsetsmiles.pages.dev
#   (b) zone ON Cloudflare (our case): the Pages custom domain is proxied, so
#       the CNAME is hidden and www flattens to Cloudflare anycast A records.
# Accept either; the real proof (serves 200 from Cloudflare) is checked below.
WWW_CNAME="$(doh "$WWW" CNAME)"
WWW_A="$(doh "$WWW" A)"
printf '        CNAME -> %s\n' "${WWW_CNAME:-<none>}"
printf '        A     -> %s\n' "$(printf '%s' "$WWW_A" | tr '\n' ' ')"
if printf '%s' "$WWW_CNAME" | grep -qi "$PAGES"; then
  ok "www CNAME points at $PAGES"
elif printf '%s' "$WWW_A" | grep -qE '^(104\.|172\.6[0-9]\.|172\.7[0-9]\.|188\.114\.)'; then
  ok "www is a proxied Cloudflare Pages custom domain (flattened to anycast)"
else
  bad "www does not resolve to the Pages site (CNAME: ${WWW_CNAME:-none}, A: ${WWW_A:-none})"
fi

head "Apex A record ($APEX)"
APEX_A="$(doh "$APEX" A)"
printf '        A -> %s\n' "$(printf '%s' "$APEX_A" | tr '\n' ' ')"
if printf '%s' "$APEX_A" | grep -q '216.150.1.1'; then
  bad "Apex still points at the OLD Vercel host (216.150.1.1) — repoint not yet live"
elif printf '%s' "$APEX_A" | grep -qE '^(104\.|172\.6[0-9]\.|172\.7[0-9]\.|188\.114\.)'; then
  ok "Apex resolves to Cloudflare anycast space"
else
  note "Apex A is ${APEX_A:-empty} — verify this is the intended target"
fi

head "Live HTTP / TLS"
for host in "$WWW" "$APEX"; do
  line="$(curl -sSI --max-time 20 "https://$host" 2>/dev/null | tr -d '\r')"
  code="$(printf '%s' "$line" | awk '/^HTTP/{c=$2} END{print c}')"
  server="$(printf '%s' "$line" | awk -F': ' 'tolower($1)=="server"{s=$2} END{print s}')"
  printf '        https://%s -> HTTP %s (server: %s)\n' "$host" "${code:-?}" "${server:-?}"
  if printf '%s' "$server" | grep -qi vercel; then
    bad "https://$host is still served by Vercel"
  elif printf '%s' "$server" | grep -qi cloudflare; then
    ok "https://$host served by Cloudflare"
  else
    note "https://$host server header: ${server:-unknown}"
  fi
done

head "Apex -> www canonicalization (REQUIRED)"
# www.3rdsetsmiles.com is the single canonical host. Every apex request MUST
# permanently redirect to the SAME path (and query) on www. These are hard
# failures: a 200 at the apex means stale apex-host content can be indexed and
# served alongside the canonical site. Path + query preservation is checked so
# deep links stay deep links.

# apex_redirect <path> -> prints "<http_code> <location>" for a single hop.
# HEAD (-I) is enough for the status line + Location; no body is fetched.
apex_redirect() {
  curl -sS -I -o /dev/null --max-time 20 -w '%{http_code} %{redirect_url}' "https://$APEX$1" 2>/dev/null
}

check_apex() { # <path> <expected full www url>
  _path="$1"; _expect="$2"
  _res="$(apex_redirect "$_path")"
  _code="${_res%% *}"; _loc="${_res#* }"
  if [ "$_code" != "301" ] && [ "$_code" != "308" ]; then
    bad "apex ${_path} returned HTTP ${_code:-none} — must be a 301/308 redirect, not a 200 page"
  elif [ "$_loc" != "$_expect" ]; then
    bad "apex ${_path} redirected to '${_loc:-none}' — expected '${_expect}' (host/path/query must be preserved)"
  else
    ok "apex ${_path} -> ${_loc}"
  fi
}

# Homepage, a known deep path, and query-string preservation.
check_apex "/"                        "https://$WWW/"
check_apex "/new-patients/"           "https://$WWW/new-patients/"
check_apex "/new-patients/?vd=canary" "https://$WWW/new-patients/?vd=canary"

# Following the redirect must land on www with a 200 and no loop.
LOOP="$(curl -sSI -L -o /dev/null --max-time 20 --max-redirs 5 \
  -w '%{url_effective} %{http_code}' "https://$APEX/new-patients/" 2>/dev/null)"
LOOP_URL="${LOOP% *}"; LOOP_CODE="${LOOP##* }"
case "$LOOP_URL" in
  "https://$WWW/new-patients/"*)
    if [ "$LOOP_CODE" = "200" ]; then
      ok "apex deep link resolves to www 200 with no redirect loop"
    else
      bad "apex deep link ended at $LOOP_URL with HTTP ${LOOP_CODE:-none} (possible loop)"
    fi ;;
  *)
    bad "apex deep link did not resolve to www (ended at ${LOOP_URL:-none}, HTTP ${LOOP_CODE:-none}) — redirect loop or wrong target"
    ;;
esac

# Security header sanity (from src/_headers)
CSP="$(curl -sSI --max-time 20 "https://$WWW" 2>/dev/null | tr -d '\r' | grep -i 'content-security-policy')"
[ -n "$CSP" ] && ok "CSP header present on www" || note "No CSP header on www yet (check _headers deployed)"

head "Email records MUST survive the cutover"
MX="$(doh "$APEX" MX)"
printf '        MX -> %s\n' "${MX:-<none>}"
printf '%s' "$MX" | grep -qi 'google.com' && ok "Google MX present" || bad "Google MX MISSING — email is broken"

for rec in "google._domainkey:DKIM (Google)" \
           "20251216184748pm._domainkey:DKIM (Postmark)" \
           "_dmarc:DMARC"; do
  name="${rec%%:*}"; label="${rec#*:}"
  val="$(doh "$name.$APEX" TXT)"
  [ -n "$val" ] && ok "$label record present ($name)" || bad "$label record MISSING ($name)"
done

PROTON="$(doh "$APEX" TXT | grep -i protonmail)"
[ -n "$PROTON" ] && ok "protonmail-verification TXT present" || note "protonmail-verification TXT missing (OK if Proton no longer used)"

SPF="$(doh "$APEX" TXT | grep -i 'v=spf1')"
[ -n "$SPF" ] && ok "SPF record present" || note "No SPF (v=spf1) record — Google Workspace normally wants 'v=spf1 include:_spf.google.com ~all'"

printf '\n\033[1mSummary:\033[0m %d pass, %d warn, %d fail\n' "$pass" "$warn" "$fail"
[ "$fail" -eq 0 ]
