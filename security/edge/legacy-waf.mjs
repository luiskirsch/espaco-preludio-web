// waf-worker.js
var CLONER_UA = /\b(httrack|winhttrack|websave|sitesuck(?:er)?|teleport[\s\-.]pro|black[\s\-]widow|webcopier|webzip|webstrip(?:per)?|offline[\s\-.]explorer|surfoffline|netattach|webwhacker|wwwoffle)\b/i;
var SEC_BASE = {
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload"
};
var FRAME_ANCESTORS = "frame-ancestors 'self'";
var NOINDEX_JOGO = /* @__PURE__ */ new Set([
  "/sala.html",
  "/entrada.html",
  "/painel.html",
  "/cadastro.html",
  "/login.html",
  "/deck-builder.html",
  "/encontro-marcado.html"
]);
var waf_worker_default = {
  async fetch(request) {
    const ua = request.headers.get("User-Agent") || "";
    if (CLONER_UA.test(ua)) {
      return new Response("Acesso negado.", {
        status: 403,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }
    let response;
    try {
      response = await fetch(request);
    } catch (_) {
      return new Response("Bad Gateway", { status: 502 });
    }
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(SEC_BASE)) headers.set(k, v);
    headers.set("Content-Security-Policy", FRAME_ANCESTORS);
    const url = new URL(request.url);
    const host = url.hostname;
    const path = url.pathname;
    if (!host.includes("espacopreludio") && NOINDEX_JOGO.has(path)) {
      headers.set("X-Robots-Tag", "noindex, nofollow");
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
export {
  waf_worker_default as default
};
//# sourceMappingURL=waf-worker.js.map
