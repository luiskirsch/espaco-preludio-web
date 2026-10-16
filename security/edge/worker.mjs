// Cloudflare Route Worker: fetch(request) goes to the existing zone origin.
// Never use a workers.dev URL as a replacement for the website origin.
import legacyWaf from "./legacy-waf.mjs";
const HOSTS = new Set(["espacopreludio.com.br", "www.espacopreludio.com.br"]);

export function portalPolicy(pathname, { strict = false } = {}) {
  const staging = pathname.startsWith("/staging/");
  const backend = staging
    ? "https://osl-video-server-staging.up.railway.app"
    : "https://osl-video-server-production.up.railway.app";
  const firebase = staging ? "sextolugar-staging" : "osextolugar-game";
  const scripts = ["'self'", "'wasm-unsafe-eval'", "'inline-speculation-rules'",
    "https://www.gstatic.com", "https://cdn.jsdelivr.net", "https://esm.sh",
    "https://cdn.socket.io", "https://browser.sentry-cdn.com"];
  // Existing HTML uses inline scripts and handlers. The strict policy is
  // Report-Only until these have been migrated and authenticated flows tested.
  if (!strict) scripts.push("'unsafe-inline'");
  return [
    "default-src 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self' https://www.mercadopago.com.br https://www.asaas.com",
    "script-src " + scripts.join(" "),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https://firebasestorage.googleapis.com https://storage.googleapis.com https://lh3.googleusercontent.com https://api.qrserver.com",
    "media-src 'self' blob: https://firebasestorage.googleapis.com https://storage.googleapis.com",
    "connect-src 'self' " + backend + " " + backend.replace("https:", "wss:") +
      " https://identitytoolkit.googleapis.com https://securetoken.googleapis.com" +
      " https://firestore.googleapis.com https://firebaseinstallations.googleapis.com" +
      " https://firebasestorage.googleapis.com https://storage.googleapis.com" +
      " https://www.gstatic.com https://cdn.jsdelivr.net https://esm.sh" +
      " https://*.livekit.cloud wss://*.livekit.cloud https://*.ingest.sentry.io",
    `frame-src 'self' blob: https://${firebase}.firebaseapp.com https://${firebase}.web.app`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "upgrade-insecure-requests"
  ].join("; ");
}

export function applyPortalHeaders(response, request) {
  const url = new URL(request.url);
  const headers = new Headers(response.headers);
  if (!headers.has("Strict-Transport-Security")) {
    headers.set("Strict-Transport-Security", "max-age=31536000");
  }
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(self), microphone=(self), fullscreen=(self), autoplay=(self), geolocation=(), payment=(), usb=(), browsing-topics=()");
  headers.delete("X-Powered-By");
  if ((headers.get("Content-Type") || "").toLowerCase().includes("text/html")) {
    headers.set("Content-Security-Policy", portalPolicy(url.pathname));
    headers.set("Content-Security-Policy-Report-Only", portalPolicy(url.pathname, { strict: true }));
    // Shells may contain invitation/reset links in their query string.
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.delete("CDN-Cache-Control");
    headers.delete("Cloudflare-CDN-Cache-Control");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export async function handleRequest(request, fetchOrigin = fetch) {
  const url = new URL(request.url);
  if (!HOSTS.has(url.hostname)) return new Response("Unknown host", { status: 421 });
  if (url.protocol !== "https:") {
    url.protocol = "https:";
    return new Response(null, { status: 308, headers: { Location: url.href, "Cache-Control": "no-store" } });
  }
  const response = await fetchOrigin(request);
  return applyPortalHeaders(response, request);
}

export default {
  fetch: (request, env, ctx) => handleRequest(request,
    original => legacyWaf.fetch(original, env, ctx))
};
