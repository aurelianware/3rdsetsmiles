const CANONICAL_HOST = "www.3rdsetsmiles.com";
const PRODUCTION_HOSTS = new Set([CANONICAL_HOST, "3rdsetsmiles.com"]);
// Retired URLs from the previous site that must drop out of Google's index.
// They answer 410 Gone (a stronger, faster removal signal than 404) directly,
// with no slash redirect first, and are deliberately NOT redirected to the
// homepage, which Google treats as a soft 404.
const GONE = /^\/hero-demo(?:\/|$)/;
const FILE_OR_ENDPOINT = /(?:\/[^/]+\.[^/]+|^\/(?:booking-availability|book-appointment|contact-submit|insurance-check|collect))\/?$/;

// Keep one production URL for every public page. Cloudflare Pages runs this
// middleware before static assets and Pages Functions, so host, scheme, path,
// and query-string normalization happen in a single permanent redirect.
export async function onRequest(context) {
  const incoming = new URL(context.request.url);
  const productionHost = PRODUCTION_HOSTS.has(incoming.hostname);
  const needsHostOrScheme = productionHost &&
    (incoming.hostname !== CANONICAL_HOST || incoming.protocol !== "https:");
  if (GONE.test(incoming.pathname)) return gone(context, incoming);

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

  const response = await context.next();

  // The *.pages.dev hosts (production alias and branch previews) serve the same
  // pages as www. The canonical tag already points at www, but a noindex header
  // keeps those duplicates out of the index outright. Local dev is left alone.
  if (incoming.hostname.endsWith(".pages.dev")) {
    const tagged = new Response(response.body, response);
    tagged.headers.set("X-Robots-Tag", "noindex");
    return tagged;
  }
  return response;
}

async function gone(context, incoming) {
  const headers = { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex" };
  try {
    // Reuse the site's real 404 page as the body so visitors get navigation.
    const page = await context.env.ASSETS.fetch(new URL("/404.html", incoming));
    if (page.ok) return new Response(page.body, { status: 410, headers });
  } catch (e) {
    // No ASSETS binding (unit tests, local tooling): fall through.
  }
  return new Response("<!doctype html><title>Gone</title><p>This page has been removed. <a href=\"/\">Go to the 3rd Set Smiles home page</a>.</p>", { status: 410, headers });
}
