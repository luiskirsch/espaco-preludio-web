// Only these public files can be delivered directly while Pages is delayed.
// Keep the list shared with the bundle builder: never upload a whole checkout.
const files = [
  'empresa-painel.html', 'css/empresa-gestao.css',
  'js/empresa-gestao.js', 'js/corporate-csv.js', 'i18n/init.js',
  ...['pt-BR', 'en-US', 'es-ES'].flatMap(lang => [
    `i18n/locales/${lang}/p-empresa-painel.json`, ...(lang === 'pt-BR' ? [] : [`i18n/locales/${lang}/js.json`])
  ])
];
export const EMPRESA_ASSET_FILES = Object.freeze([...files, ...files.map(file => 'staging/' + file)]);
const paths = new Set(EMPRESA_ASSET_FILES.map(file => '/' + file));
export function createEmpresaOrigin({ now = Date.now } = {}) {
  const freshness = new Map();
  return async function(request, env, fetchOrigin = fetch) {
    const url = new URL(request.url);
    if (!env?.EMPRESA_ASSETS || !['GET', 'HEAD'].includes(request.method) || !paths.has(url.pathname)) return fetchOrigin(request);
    const prefix = url.pathname.startsWith('/staging/') ? '/staging' : '';
    const key = url.origin + prefix;
    let cached = freshness.get(key);
    if (!cached || cached.until <= now()) {
      const probe = new URL(prefix + '/empresa-painel.html?__ep_empresa_release=1', url.origin);
      const ready = (async () => {
        try {
          const response = await fetchOrigin(new Request(probe, { headers: { 'Cache-Control': 'no-cache' } }),
            { cf: { cacheTtl: 5, cacheEverything: true } });
          return response.ok && (await response.text()).includes('empresa-gestao.js');
        } catch { return false; }
      })();
      cached = { until: now() + 10000, ready };
      freshness.set(key, cached);
    }
    // Stop overriding the page and its dependencies as soon as Pages catches up.
    // Future edits can then follow the ordinary GitHub publication workflow.
    return await cached.ready ? fetchOrigin(request) : env.EMPRESA_ASSETS.fetch(request);
  };
}
export const empresaOrigin = createEmpresaOrigin();
