// Sincronização automática de traduções (pt-BR → en-US / es-ES).
//
// Roda no GitHub Actions a cada push e diariamente:
//   1. marca com data-i18n todo texto fixo novo das páginas (extract.mjs) e
//      grava o pt-BR em i18n/locales/pt-BR/p-<página>.json;
//   2. coleta os textos montados por JavaScript e os conteúdos do servidor
//      (trilhas) para o dicionário dinâmico (i18n/locales/{lng}/js.json);
//   3. pede ao servidor a tradução do que ainda falta e grava en-US/es-ES;
//   4. espelha os arquivos de idioma em staging/.
//
// Variáveis: I18N_CI_TOKEN (obrigatória para traduzir), I18N_API (opcional).
// Sem token, só marca as páginas e lista o que falta (modo local de conferência).
import { parse } from "acorn";
import { simple } from "acorn-walk";
import { parse as parseHtml } from "parse5";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, copyFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { createHash } from "node:crypto";
import { processHtml, setRoot } from "./extract.mjs";

const ROOT = join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..", "..");
const API = process.env.I18N_API || "https://osl-video-server-production.up.railway.app";
const TOKEN = process.env.I18N_CI_TOKEN || "";
const LANGS = ["en-US", "es-ES"];
const loc = (l, f) => join(ROOT, "i18n", "locales", l, f);
const readJson = (p, d = {}) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : d);
const writeJson = (p, o, pretty = true) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(o, null, pretty ? 2 : 0) + (pretty ? "\n" : "")); };
const norm = s => s.replace(/\s+/g, " ").trim();
setRoot(ROOT);

// ─── Tradução via servidor ────────────────────────────────────────────────
const PH = /\{\d+\}/g;
function placeholdersOk(pt, tr) {
  const allowed = new Set(pt.match(PH) || []);
  if ((tr.match(PH) || []).some(x => !allowed.has(x))) return false;
  return !(allowed.has("{0}") && !tr.includes("{0}"));
}
async function translate(strings) {
  const out = { "en-US": {}, "es-ES": {} };
  for (let i = 0; i < strings.length; i += 80) {
    const batch = strings.slice(i, i + 80);
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const r = await fetch(`${API}/i18n/translate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-I18N-Token": TOKEN },
          body: JSON.stringify({ strings: batch })
        });
        const d = await r.json();
        if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
        for (const pt of batch) {
          if (d.en[pt] && placeholdersOk(pt, d.en[pt])) out["en-US"][pt] = d.en[pt];
          if (d.es[pt] && placeholdersOk(pt, d.es[pt])) out["es-ES"][pt] = d.es[pt];
        }
        break;
      } catch (err) {
        console.warn(`  lote ${i / 80 + 1} tentativa ${attempt}: ${err.message}`);
        if (attempt === 3) throw err;
      }
    }
  }
  return out;
}

// ─── 1. Páginas: marcação + pt-BR ─────────────────────────────────────────
const pages = [];
for (const dir of ["", "app", "staging", "staging/app"]) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) continue;
  for (const f of readdirSync(abs)) if (f.endsWith(".html")) pages.push(dir ? `${dir}/${f}` : f);
}
const newByNs = {};
for (const rel of pages) {
  const src = readFileSync(join(ROOT, rel), "utf8");
  const r = processHtml(src, rel);
  if (!Object.keys(r.strings).length) continue;
  writeFileSync(join(ROOT, rel), r.out);
  Object.assign((newByNs[r.ns] ||= {}), r.strings);
  console.log(`marcado: ${rel} (+${Object.keys(r.strings).length})`);
}
for (const [ns, strings] of Object.entries(newByNs)) {
  const p = loc("pt-BR", `${ns}.json`);
  writeJson(p, { ...readJson(p), ...strings });
}

// Chaves pt-BR sem tradução (inclui namespaces antigos que ganharam textos).
const pending = []; // { ns, key, pt }
for (const f of readdirSync(join(ROOT, "i18n", "locales", "pt-BR")).filter(f => /^p-.*\.json$/.test(f))) {
  const ns = f.replace(/\.json$/, "");
  const pt = readJson(loc("pt-BR", f));
  const have = LANGS.map(l => readJson(loc(l, f)));
  for (const [key, text] of Object.entries(pt)) if (have.some(h => !(key in h))) pending.push({ ns, key, pt: text });
}

// ─── 2. Textos de JavaScript e do servidor ───────────────────────────────
const PT_HINT = /[ãõçáéíóúâêôàÃÕÇÁÉÍÓÚÂÊÔ]|\b(de|do|da|dos|das|não|para|com|sua|seu|você|uma|um|ao|na|no|em|por|que|ou|os|as|é|está|foi|ser|sem|mais|já|até|pelo|pela)\b/i;
function looksHuman(s) {
  const t = norm(s);
  if (t.length < 2 || !/[A-Za-zÀ-ÿ]{2,}/.test(t)) return false;
  if (/^(https?:|\/|\.\/|#|data:|mailto:|tel:|\[)/.test(t)) return false;
  if (/\{\d+\}\/|\/\{\d+\}|\/[a-z]+\//i.test(t)) return false;
  const bare = t.replace(/\{\d+\}/g, "");
  if (!/\s/.test(bare.trim()) && (/[\/:_]/.test(bare) || /[a-z]-[a-z{]/i.test(t))) return false;
  if (/^[a-z0-9_.-]+$/.test(t) && !PT_HINT.test(t)) return false;
  if (/[{};=<>]|=>|\(\)|\bfunction\b|\bvar\b|\bconst\b/.test(bare)) return false;
  if (/^[A-Z0-9_]+$/.test(t) || /^(GET|POST|PATCH|PUT|DELETE)$/.test(t)) return false;
  if (/^(application|text|image|audio|video)\//.test(t)) return false;
  if (/^[\w.-]+\.(js|css|json|png|jpg|svg|html|webp)(\?.*)?$/.test(t)) return false;
  if (/^(rgba?|hsla?|var|calc|translate|url)\(/.test(t)) return false;
  if (/^[\d\s.,:%+-]+(px|em|rem|vh|vw|ms|s)?$/.test(t)) return false;
  if (/--|__|\bep-|^[a-z]+-[a-z-]+( [a-z]+-[a-z-]+)*$/.test(t)) return false;
  return PT_HINT.test(t) || /^[A-ZÀ-Ý][a-zà-ÿ]+/.test(t) || /\s/.test(t);
}
const STOP = new Set(["de", "do", "da", "dos", "das", "e", "em", "no", "na", "a", "o", "as", "os", "um", "uma", "por", "para", "com", "ou", "ao", "à", "às"]);
function weakPattern(s) {
  if (!/\{\d+\}/.test(s)) return false;
  const words = s.replace(/\{\d+\}/g, " ").split(/[^A-Za-zÀ-ÿ]+/).filter(Boolean);
  return words.filter(w => !STOP.has(w.toLowerCase())).join("").length < 3;
}
function templateFragments(node) {
  // Caractere a caractere: tags podem conter ${} (ex.: <button class="${c}">Salvar</button>),
  // então o estado "dentro de tag" atravessa os pedaços do template.
  const parts = [];
  let buf = "", idx = 0, inTag = false;
  const flush = () => { if (buf.trim()) parts.push(buf); buf = ""; idx = 0; };
  node.quasis.forEach((q, i) => {
    for (const ch of (q.value.cooked ?? q.value.raw)) {
      if (inTag) { if (ch === ">") inTag = false; continue; }
      if (ch === "<") { flush(); inTag = true; continue; }
      buf += ch;
    }
    if (i < node.expressions.length && !inTag) buf += `{${idx++}}`;
  });
  flush();
  return parts.map(norm).filter(p => /[A-Za-zÀ-ÿ]{2,}/.test(p.replace(/\{\d+\}/g, " ")) && looksHuman(p) && looksHuman(p.replace(/\{\d+\}/g, " x ")));
}
function jsStrings(code, isModule, out) {
  let ast;
  for (const sourceType of isModule ? ["module", "script"] : ["script", "module"]) {
    try { ast = parse(code, { ecmaVersion: "latest", sourceType, allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true }); break; } catch { /* outro tipo */ }
  }
  if (!ast) return;
  const skip = new Set();
  const mark = node => { simple(node, { Literal: x => skip.add(x), TemplateLiteral: x => skip.add(x) }); skip.add(node); };
  simple(ast, {
    CallExpression(n) { if (n.callee.type === "MemberExpression" && n.callee.object.name === "console") n.arguments.forEach(mark); },
    ImportDeclaration(n) { skip.add(n.source); },
    ImportExpression(n) { skip.add(n.source); },
    ExportNamedDeclaration(n) { if (n.source) skip.add(n.source); },
    Property(n) { if (!n.computed && n.key.type === "Literal") skip.add(n.key); }
  });
  simple(ast, {
    Literal(n) {
      if (skip.has(n) || typeof n.value !== "string") return;
      if (/<[a-z][^>]*>/i.test(n.value)) { for (const p of n.value.split(/<[^>]*>/)) if (looksHuman(p)) out.add(norm(p)); return; }
      if (looksHuman(n.value)) out.add(norm(n.value));
    },
    TemplateLiteral(n) { if (!skip.has(n)) templateFragments(n).forEach(f => out.add(f)); }
  });
}
function walkFiles(dir, acc = []) {
  for (const f of readdirSync(dir)) {
    if (["node_modules", ".git", "staging", "i18n", "test", "scripts", "assets", "fonts", "vendor", ".github"].includes(f)) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walkFiles(p, acc);
    else if (/\.(html|js|mjs)$/.test(f) && !/\.min\.js$/.test(f)) acc.push(p);
  }
  return acc;
}
const dynamic = new Set();
for (const file of walkFiles(ROOT)) {
  const src = readFileSync(file, "utf8");
  if (file.endsWith(".html")) {
    for (const m of src.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/\bsrc=/.test(m[1]) || (/\btype=/.test(m[1]) && !/type=["'](module|text\/javascript)["']/.test(m[1]))) continue;
      jsStrings(m[2], /type=["']module["']/.test(m[1]), dynamic);
    }
    // Textos fixos sem marcação (o JS sobrescreve o elemento — ex.: "Carregando…").
    const SKIP = new Set(["script", "style", "noscript", "svg", "template", "textarea", "pre", "code"]);
    (function walk(n, marked) {
      if (n.tagName && SKIP.has(n.tagName)) return;
      const isMarked = marked || n.attrs?.some(a => a.name === "data-i18n" || a.name === "data-i18n-html" || a.name === "data-no-i18n");
      for (const c of n.childNodes || []) {
        if (c.nodeName === "#text") { const t = norm(c.value); if (!isMarked && looksHuman(t)) dynamic.add(t); }
        else walk(c.content || c, isMarked);
      }
    })(parseHtml(src), false);
  } else {
    jsStrings(src, true, dynamic);
  }
}
if (TOKEN) {
  try {
    const r = await fetch(`${API}/i18n/server-strings`, { headers: { "X-I18N-Token": TOKEN } });
    const d = await r.json();
    if (d.ok) d.strings.forEach(s => dynamic.add(norm(s)));
  } catch (err) { console.warn("conteúdo do servidor indisponível:", err.message); }
}
const known = new Set(readJson(join(ROOT, "i18n", "locales", "js-source.json"), []));
const newDynamic = [...dynamic].filter(s => !known.has(s) && !weakPattern(s) && /[A-Za-zÀ-ÿ]{2,}/.test(s));

console.log(`pendentes: ${pending.length} textos de página, ${newDynamic.length} textos dinâmicos`);
if (!TOKEN) {
  if (pending.length || newDynamic.length) console.log("I18N_CI_TOKEN ausente — tradução não executada.");
  process.exit(0);
}

// ─── 3. Tradução ─────────────────────────────────────────────────────────
const allPt = [...new Set([...pending.map(p => p.pt), ...newDynamic])];
const tr = allPt.length ? await translate(allPt) : { "en-US": {}, "es-ES": {} };

const touched = new Set();
for (const { ns, key, pt } of pending) {
  for (const l of LANGS) {
    const p = loc(l, `${ns}.json`);
    const cur = readJson(p);
    if (key in cur || !tr[l][pt]) continue;
    cur[key] = tr[l][pt];
    writeJson(p, cur);
    touched.add(`${l}/${ns}`);
  }
}
for (const l of LANGS) {
  const p = loc(l, "js.json");
  const dict = readJson(p);
  for (const pt of newDynamic) if (tr[l][pt] && tr[l][pt] !== pt) dict[pt] = tr[l][pt];
  writeJson(p, dict, false);
}
newDynamic.forEach(s => known.add(s));
writeJson(join(ROOT, "i18n", "locales", "js-source.json"), [...known].sort(), false);

// ─── 4. Versão dos arquivos de idioma + espelho em staging ───────────────
const hash = createHash("sha1");
for (const l of ["pt-BR", ...LANGS]) for (const f of readdirSync(join(ROOT, "i18n", "locales", l)).sort()) hash.update(readFileSync(loc(l, f)));
const version = "a" + hash.digest("hex").slice(0, 8);
for (const initPath of [join(ROOT, "i18n", "init.js"), join(ROOT, "staging", "i18n", "init.js")]) {
  if (!existsSync(initPath)) continue;
  const s = readFileSync(initPath, "utf8").replace(/const I18N_VERSION = '[^']*';/, `const I18N_VERSION = '${version}';`);
  writeFileSync(initPath, s);
}
for (const l of ["pt-BR", ...LANGS]) {
  const src = join(ROOT, "i18n", "locales", l);
  const dst = join(ROOT, "staging", "i18n", "locales", l);
  if (!existsSync(join(ROOT, "staging", "i18n"))) break;
  mkdirSync(dst, { recursive: true });
  for (const f of readdirSync(src)) copyFileSync(join(src, f), join(dst, f));
}
console.log(`traduzidos: ${allPt.length} · arquivos: ${touched.size} · versão ${version}`);
