// Avisa os buscadores compatíveis com IndexNow (Bing, Yandex, Seznam, Naver…)
// sobre páginas publicadas. Uso: node scripts/seo/indexnow.mjs [arquivo.html ...]
// Sem argumentos, ou com sitemap.xml na lista, envia todas as URLs do sitemap.
import { readFileSync } from "node:fs";

const HOST = "espacopreludio.com.br";
const KEY = "ddde45fdfbad5c8aad4da2af89d890cc";
const BASE = `https://${HOST}/`;

const sitemap = [...readFileSync("sitemap.xml", "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
const changed = process.argv.slice(2);

let urls;
if (!changed.length || changed.includes("sitemap.xml")) {
  urls = sitemap;
} else {
  const toUrl = f => BASE + (f === "index.html" ? "" : f.replace(/(^|\/)index\.html$/, "$1"));
  urls = changed.map(toUrl).filter(u => sitemap.includes(u));
}

if (!urls.length) {
  console.log("Nenhuma página do sitemap mudou. Nada a enviar.");
  process.exit(0);
}

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `${BASE}${KEY}.txt`, urlList: urls }),
});
console.log(`IndexNow: HTTP ${res.status} para ${urls.length} URL(s)`);
urls.forEach(u => console.log("  " + u));
// 200 = aceito, 202 = aceito e chave ainda em validação.
if (res.status !== 200 && res.status !== 202) {
  console.log(await res.text());
  process.exit(1);
}
