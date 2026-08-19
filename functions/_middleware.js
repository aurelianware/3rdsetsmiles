const CANONICAL_HOST = "www.3rdsetsmiles.com";
const PRODUCTION_HOSTS = new Set([CANONICAL_HOST, "3rdsetsmiles.com"]);
const FILE_OR_ENDPOINT = /(?:\/[^/]+\.[^/]+|^\/(?:booking-availability|book-appointment|contact-submit|insurance-check|collect))\/?$/;

// Keep one production URL for every public page. Cloudflare Pages runs this
// middleware before static assets and Pages Functions, so host, scheme, path,
// and query-string normalization happen in a single permanent redirect.
export async function onRequest(context) {
  const incoming = new URL(context.request.url);
  const productionHost = PRODUCTION_HOSTS.has(incoming.hostname);
  const needsHostOrScheme = productionHost &&
    (incoming.hostname !== CANONICAL_HOST || incoming.protocol !== "https:");
  const needsSlash = incoming.pathname !== "/" &&
    !incoming.pathname.endsWith("/") &&
    !FILE_OR_ENDPOINT.test(incoming.pathname);

  if (needsHostOrScheme || needsSlash) {
    const target = new URL(incoming);
    if (productionHost) {
      target.protocol = "https:";
      target.hostname = CANONICAL_HOST;
      target.port = "";
    }
    if (needsSlash) target.pathname += "/";
    return Response.redirect(target.toString(), 301);
  }

  return context.next();
}
