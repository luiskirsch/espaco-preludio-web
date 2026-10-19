// Otimizações de carregamento aplicadas a todas as páginas do site.
//
//   1. Fontes do próprio domínio: o CSS do Google Fonts vira fonts/<variante>.css
//      (mesmas famílias e faixas de peso que a página pedia), sem as duas origens
//      externas (fonts.googleapis.com e fonts.gstatic.com) no caminho crítico.
//   2. Bloco ep:perf no <head>: preconnect só para as origens que a página usa,
//      preload da fonte do texto e modulepreload de todo o grafo estático de
//      módulos — a cascata HTML → firebase-config → firebase-auth → firebase-app
//      passa a ser baixada em paralelo.
//   3. Versão pelo conteúdo: toda referência local a JS/CSS/imagem/fonte recebe
//      ?h=<hash>. Mudou o arquivo, muda a URL; o Worker serve essas URLs com
//      cache de 1 ano (security/edge/worker.mjs) e os service workers as leem
//      direto do cache.
//
// Uso: node scripts/perf/build.mjs           → aplica (idempotente)
//      node scripts/perf/build.mjs --check   → só verifica; sai com 1 se algo mudaria
// O sync do staging roda este script antes de espelhar; o CI também.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, extname, join, posix, relative, resolve } from "node:path";
import { parse as parseHtml } from "parse5";
import * as acorn from "acorn";
import * as walk from "acorn-walk";

const ROOT = resolve(import.meta.dirname, "..", "..");
const CHECK = process.argv.includes("--check");
const QUIET = process.argv.includes("--quiet");

// Pastas que não são páginas do site (ou são espelhos/ferramentas).
const SKIP_DIRS = new Set(["node_modules", "staging", ".git", ".github", "assets", "test", "scripts", "security", "docs", "i18n"]);
// Arquivos de texto que não são alcançados por <script>/<link>, mas têm ?h= a manter.
const EXTRA_ROOTS = ["sw.js", "sw-app.js"];
const HASHABLE = new Set([".js", ".mjs", ".css", ".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".svg", ".woff2", ".woff", ".ttf"]);
const TEXT_ASSET = new Set([".js", ".mjs", ".css"]);
// Arquivos com versão própria que muda a cada rodada do CI (I18N_VERSION):
// versioná-los pelo conteúdo reescreveria as 125 páginas a cada tradução.
const UNHASHED = new Set(["i18n/init.js"]);
const HASH_LEN = 10;
const API_ORIGIN = "https://api.espacopreludio.com.br";

// ─── Sistema de arquivos com sobreposição (nada é gravado antes do fim) ──
const overlay = new Map();
const toPosix = p => p.split("\\").join("/");
const abs = rel => join(ROOT, rel);
function exists(rel) { return overlay.has(rel) || (existsSync(abs(rel)) && statSync(abs(rel)).isFile()); }
function readText(rel) { return overlay.has(rel) ? overlay.get(rel) : readFileSync(abs(rel), "utf8"); }
function readBytes(rel) { return overlay.has(rel) ? Buffer.from(overlay.get(rel)) : readFileSync(abs(rel)); }
const sha = data => createHash("sha256").update(data).digest("hex").slice(0, HASH_LEN);

function listPages() {
  const out = [];
  (function walkDir(dir) {
    for (const entry of readdirSync(abs(dir), { withFileTypes: true })) {
      if (entry.name.startsWith(".") && entry.name !== ".well-known") continue;
      const rel = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) walkDir(rel); }
      else if (entry.name.endsWith(".html") && !entry.name.startsWith("__")) out.push(rel);
    }
  })("");
  return out.sort();
}

// Resolve uma referência local; devolve o caminho relativo à raiz ou null.
function resolveLocal(spec, fromDir) {
  if (typeof spec !== "string" || !spec || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(spec) || spec.includes("${")) return null;
  const pathPart = spec.split(/[?#]/)[0];
  if (!pathPart || !HASHABLE.has(extname(pathPart).toLowerCase())) return null;
  const target = toPosix(relative(ROOT, pathPart.startsWith("/") ? join(ROOT, pathPart) : join(abs(fromDir), pathPart)));
  if (!target || target.startsWith("..") || target.startsWith("staging/") || !exists(target)) return null;
  return target;
}
// Só reescreve consultas vazias ou de versão (?v= / ?h=); qualquer outra fica intacta.
function versionedSpec(spec, hash) {
  const hashIdx = spec.indexOf("#");
  const frag = hashIdx >= 0 ? spec.slice(hashIdx) : "";
  const noFrag = hashIdx >= 0 ? spec.slice(0, hashIdx) : spec;
  const q = noFrag.indexOf("?");
  const path = q >= 0 ? noFrag.slice(0, q) : noFrag;
  const query = q >= 0 ? noFrag.slice(q + 1) : "";
  if (query && !/^(?:v|h)=[^&]*$/.test(query)) return null;
  return `${path}?h=${hash}${frag}`;
}

// ─── Referências em JS (acorn) ────────────────────────────────────────────
const OPT_IN = /^(?:\.{1,2}\/|\/)[^\s?#'"`]+\.[a-z0-9]+\?(?:v|h)=[^&#'"`]*$/i;
function parseJs(code) {
  const opts = { ecmaVersion: "latest", allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, allowImportExportEverywhere: true };
  try { return acorn.parse(code, { ...opts, sourceType: "module" }); }
  catch { try { return acorn.parse(code, { ...opts, sourceType: "script" }); } catch { return null; } }
}
// kind: "static" (import/export from), "dynamic" (import()), "url" (new URL(.., import.meta.url)), "literal" (opt-in ?v=/?h=)
function jsRefs(code) {
  const ast = parseJs(code);
  if (!ast) return { refs: [], parsed: false };
  const refs = [], seen = new Set();
  const add = (node, kind) => {
    if (!node || node.type !== "Literal" || typeof node.value !== "string" || seen.has(node.start)) return;
    seen.add(node.start);
    refs.push({ start: node.start + 1, end: node.end - 1, spec: node.value, kind });
  };
  walk.full(ast, node => {
    if (node.type === "ImportDeclaration" || node.type === "ExportAllDeclaration" || (node.type === "ExportNamedDeclaration" && node.source)) add(node.source, "static");
    else if (node.type === "ImportExpression") add(node.source, "dynamic");
    else if (node.type === "NewExpression" && node.callee.type === "Identifier" && node.callee.name === "URL" && node.arguments.length >= 2) {
      const base = node.arguments[1];
      if (base.type === "MemberExpression" && base.object.type === "MetaProperty" && base.property.name === "url") add(node.arguments[0], "url");
    }
  });
  walk.full(ast, node => {
    if (node.type === "Literal" && typeof node.value === "string" && !seen.has(node.start) && OPT_IN.test(node.value)) add(node, "literal");
  });
  // Os offsets do acorn contam unidades UTF-16 — iguais aos índices de string do JS.
  return { refs, parsed: true };
}

// ─── Referências em CSS ───────────────────────────────────────────────────
function cssRefs(code) {
  const masked = code.replace(/\/\*[\s\S]*?\*\//g, m => " ".repeat(m.length));
  const refs = [];
  for (const m of masked.matchAll(/url\(\s*(['"]?)([^'")\s]+)\1\s*\)/g)) {
    const start = m.index + m[0].indexOf(m[2], 4);
    refs.push({ start, end: start + m[2].length, spec: m[2], kind: "css" });
  }
  for (const m of masked.matchAll(/@import\s+(['"])([^'"]+)\1/g)) {
    const start = m.index + m[0].indexOf(m[2]);
    refs.push({ start, end: start + m[2].length, spec: m[2], kind: "css" });
  }
  return refs;
}

// ─── Referências em HTML (parse5, com posições) ───────────────────────────
const SKIP_LINK_REL = /\b(?:icon|apple-touch-icon|mask-icon|manifest|canonical|alternate|author|license|me)\b/i;
function htmlRefs(html) {
  const doc = parseHtml(html, { sourceCodeLocationInfo: true });
  const refs = [], scripts = [], styles = [];
  const attrRef = (el, name) => {
    const loc = el.sourceCodeLocation?.attrs?.[name];
    if (!loc) return;
    const raw = html.slice(loc.startOffset, loc.endOffset);
    const eq = raw.indexOf("=");
    if (eq < 0) return;
    let vs = eq + 1; while (/\s/.test(raw[vs])) vs++;
    const quote = raw[vs] === '"' || raw[vs] === "'" ? raw[vs] : "";
    const valueStart = loc.startOffset + vs + (quote ? 1 : 0);
    const valueEnd = quote ? loc.startOffset + raw.lastIndexOf(quote) : loc.endOffset;
    const value = html.slice(valueStart, valueEnd);
    if (name === "srcset") {
      let offset = 0;
      for (const part of value.split(",")) {
        const lead = part.match(/^\s*/)[0].length;
        const url = part.trim().split(/\s+/)[0];
        if (url) refs.push({ start: valueStart + offset + lead, end: valueStart + offset + lead + url.length, spec: url, kind: "attr" });
        offset += part.length + 1;
      }
    } else refs.push({ start: valueStart, end: valueEnd, spec: value.replace(/&amp;/g, "&"), raw: value, kind: "attr" });
  };
  (function visit(node) {
    for (const child of node.childNodes || []) {
      if (child.nodeName === "#comment") continue;
      const tag = child.tagName;
      if (tag) {
        const attrs = Object.fromEntries((child.attrs || []).map(a => [a.name, a.value]));
        if (tag === "script") {
          if (attrs.src) attrRef(child, "src");
          else if (child.childNodes?.[0]?.sourceCodeLocation) {
            const t = child.childNodes[0];
            const type = (attrs.type || "").toLowerCase();
            if (!type || type === "module" || type === "text/javascript") scripts.push({ start: t.sourceCodeLocation.startOffset, end: t.sourceCodeLocation.endOffset, module: type === "module" });
          }
        } else if (tag === "link") {
          if (attrs.href && !SKIP_LINK_REL.test(attrs.rel || "")) attrRef(child, "href");
        } else if (tag === "img" || tag === "source" || tag === "audio" || tag === "video" || tag === "track") {
          if (attrs.src) attrRef(child, "src");
          if (attrs.srcset) attrRef(child, "srcset");
          if (attrs.poster) attrRef(child, "poster");
        } else if (tag === "style" && child.childNodes?.[0]?.sourceCodeLocation) {
          const t = child.childNodes[0];
          styles.push({ start: t.sourceCodeLocation.startOffset, end: t.sourceCodeLocation.endOffset });
        }
        if (tag === "template" && child.content) visit(child.content);
      }
      visit(child);
    }
  })(doc);
  for (const s of scripts) {
    const code = html.slice(s.start, s.end);
    for (const r of jsRefs(code).refs) refs.push({ ...r, start: r.start + s.start, end: r.end + s.start, inScript: true });
  }
  for (const s of styles) {
    for (const r of cssRefs(html.slice(s.start, s.end))) refs.push({ ...r, start: r.start + s.start, end: r.end + s.start });
  }
  return { refs, scripts };
}

function refsOf(rel) {
  const ext = extname(rel).toLowerCase();
  const text = readText(rel);
  if (ext === ".html") return htmlRefs(text).refs;
  if (ext === ".css") return cssRefs(text);
  const r = jsRefs(text);
  if (!r.parsed) warn(`não consegui analisar ${rel} (sintaxe); referências mantidas`);
  return r.refs;
}
// Literais opt-in em arquivos JS podem ser relativos à página (raiz) e não ao módulo.
function resolveRef(ref, rel) {
  const dir = posix.dirname(rel) === "." ? "" : posix.dirname(rel);
  const own = resolveLocal(ref.spec, dir);
  if (own || ref.kind !== "literal" || ref.inScript || extname(rel) === ".html") return own;
  return resolveLocal(ref.spec, "");
}

const warnings = new Set();
function warn(msg) { warnings.add(msg); }

// ─── 1. Fontes ────────────────────────────────────────────────────────────
const FONT_META = JSON.parse(readFileSync(abs("fonts/fonts.json"), "utf8"));
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
function fontVariant(url) {
  const u = new URL(url.replace(/&amp;/g, "&"));
  const display = u.searchParams.get("display") || "swap";
  const families = u.searchParams.getAll("family").map(spec => {
    const [name, axesPart] = spec.split(":");
    const family = name.replace(/\+/g, " ");
    let min = 400, max = 400, names = [];
    if (axesPart) {
      const [axes, tuples] = axesPart.split("@");
      names = axes.split(",");
      const wi = names.indexOf("wght");
      if (wi >= 0) {
        const weights = tuples.split(";").flatMap(t => t.split(",")[wi].split("..").map(Number));
        min = Math.min(...weights); max = Math.max(...weights);
      }
    }
    if (!FONT_META[family]) throw new Error(`Fonte sem arquivo local: ${family} (${url}). Baixe-a para fonts/ e atualize fonts/fonts.json.`);
    // Sem opsz no pedido, o Google entrega outro arquivo (tamanho óptico fixo, menor).
    const noOpsz = FONT_META[family].opsz && !names.includes("opsz");
    if (noOpsz && !FONT_META[family].noOpszFiles) throw new Error(`Fonte sem a variante sem opsz: ${family} (${url}). Baixe-a para fonts/ e atualize fonts/fonts.json.`);
    return { family, min, max, noOpsz };
  });
  const name = families.map(f => slug(f.family) + (f.noOpsz ? "-noopsz" : "") + f.min + (f.max !== f.min ? "-" + f.max : "")).join("_") + (display !== "swap" ? "_" + display : "") + ".css";
  return { name, families, display };
}
function fontCss(variant) {
  let css = "/* Gerado por scripts/perf/build.mjs — fontes servidas pelo próprio site (SIL Open Font License). */\n";
  for (const { family, min, max, noOpsz } of variant.families) {
    for (const { file, unicodeRange } of Object.values(FONT_META[family][noOpsz ? "noOpszFiles" : "files"])) {
      css += `@font-face{font-family:'${family}';font-style:normal;font-weight:${min === max ? min : `${min} ${max}`};font-display:${variant.display};src:url(./${file}) format('woff2');unicode-range:${unicodeRange}}\n`;
    }
  }
  return css;
}
const GOOGLE_FONT_LINK = /<link\b[^>]*href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"[^>]*>/g;
function applyFonts(rel, html) {
  const prefix = rel.includes("/") ? "../".repeat(rel.split("/").length - 1) : "./";
  const used = [];
  html = html.replace(GOOGLE_FONT_LINK, (_m, url) => {
    const variant = fontVariant(url);
    overlay.set(`fonts/${variant.name}`, fontCss(variant));
    used.push(variant);
    return `<link rel="stylesheet" href="${prefix}fonts/${variant.name}">`;
  });
  return { html, fonts: used };
}

// ─── 2. Bloco de dicas no <head> ───────────────────────────────────────────
const MANAGED_HINT = /^[ \t]*<link\b[^>]*>[ \t]*\r?\n/gm;
const MANAGED_ORIGINS = /^https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|firestore\.googleapis\.com|www\.gstatic\.com|api\.espacopreludio\.com\.br|cdn\.jsdelivr\.net|esm\.sh)\/?$/;
const BLOCK = /(?:\r?\n(?=[ \t]*<!-- ep:perf))?[ \t]*<!-- ep:perf[\s\S]*?<!-- \/ep:perf -->[ \t]*\r?\n?/;
function isManagedHint(tag) {
  const rel = (tag.match(/\brel="([^"]+)"/) || [])[1] || "";
  const href = (tag.match(/\bhref="([^"]+)"/) || [])[1] || "";
  if ((rel === "preconnect" || rel === "dns-prefetch") && MANAGED_ORIGINS.test(href)) return true;
  return rel === "modulepreload" && !/^https?:/.test(href);
}
function removeManagedHints(html) {
  html = html.replace(BLOCK, "");
  // Tag sozinha na linha: some a linha inteira; em HTML minificado, só a tag.
  html = html.replace(MANAGED_HINT, line => isManagedHint(line) ? "" : line);
  return html.replace(/<link\b[^>]*>/g, tag => isManagedHint(tag) ? "" : tag);
}
const FIREBASE_DEPS = { "firebase-auth.js": ["firebase-app.js"] };
const AUTH_ACTIONS = /\b(?:signInWith[A-Za-z]+|createUserWithEmailAndPassword|sendPasswordResetEmail|confirmPasswordReset|verifyPasswordResetCode|applyActionCode|checkActionCode|sendEmailVerification|updatePassword|verifyBeforeUpdateEmail|reauthenticateWithCredential)\s*\(/;
function moduleGraph(rel, html) {
  const { scripts } = htmlRefs(html);
  const local = [], external = [], seen = new Set();
  let actionsCode = "";
  const addExternal = url => {
    if (seen.has(url)) return; seen.add(url);
    const fb = url.match(/^(https:\/\/www\.gstatic\.com\/firebasejs\/[^/]+\/)([a-z-]+\.js)$/);
    if (fb) for (const dep of FIREBASE_DEPS[fb[2]] || []) addExternal(fb[1] + dep);
    external.push(url);
  };
  const visitModule = (file, depth) => {
    if (seen.has(file)) return; seen.add(file);
    if (depth > 0) local.push(file);
    const code = readText(file);
    if (depth === 0) actionsCode += code;
    for (const r of jsRefs(code).refs) {
      if (r.kind !== "static") continue;
      if (/^https:\/\//.test(r.spec)) { addExternal(r.spec); continue; }
      const dep = resolveLocal(r.spec, posix.dirname(file) === "." ? "" : posix.dirname(file));
      if (dep && /\.m?js$/.test(dep)) visitModule(dep, depth + 1);
    }
  };
  const dir = posix.dirname(rel) === "." ? "" : posix.dirname(rel);
  // Módulos inline: imports estáticos. Módulos externos (<script type=module src>) são
  // achados pelo preload scanner; só as dependências deles entram no bloco.
  for (const s of scripts.filter(s => s.module)) {
    const code = html.slice(s.start, s.end);
    actionsCode += code;
    for (const r of jsRefs(code).refs) {
      if (r.kind !== "static") continue;
      if (/^https:\/\//.test(r.spec)) { addExternal(r.spec); continue; }
      const dep = resolveLocal(r.spec, dir);
      if (dep && /\.m?js$/.test(dep)) visitModule(dep, 1);
    }
  }
  for (const m of html.matchAll(/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"[^>]*>|<script\b[^>]*\bsrc="([^"]+)"[^>]*\btype="module"[^>]*>/g)) {
    const entry = resolveLocal(m[1] || m[2], dir);
    if (entry) visitModule(entry, 0);
  }
  for (const s of scripts.filter(s => !s.module)) actionsCode += html.slice(s.start, s.end);
  const classicCdn = [...html.matchAll(/<script\b(?![^>]*type="module")[^>]*\bsrc="(https:\/\/cdn\.jsdelivr\.net\/[^"]+)"/g)].length > 0;
  return { local, external, authActions: AUTH_ACTIONS.test(actionsCode), classicCdn };
}
function hintBlock(rel, html, fonts) {
  const prefix = rel.includes("/") ? "../".repeat(rel.split("/").length - 1) : "./";
  const g = moduleGraph(rel, html);
  const firebase = g.external.some(u => u.startsWith("https://www.gstatic.com/firebasejs/"));
  const backend = g.local.includes("js/firebase-config.js");
  const preconnect = [];
  if (firebase) preconnect.push(["https://www.gstatic.com", true]);
  if (backend) preconnect.push([API_ORIGIN, true]);
  if (firebase && g.authActions) preconnect.push(["https://identitytoolkit.googleapis.com", true]);
  else if (firebase && backend) preconnect.push(["https://securetoken.googleapis.com", true]);
  if (g.external.some(u => u.startsWith("https://esm.sh/"))) preconnect.push(["https://esm.sh", true]);
  if (g.classicCdn) preconnect.push(["https://cdn.jsdelivr.net", false]);
  const lines = [];
  for (const [origin, cors] of preconnect.slice(0, 4)) lines.push(`<link rel="preconnect" href="${origin}"${cors ? " crossorigin" : ""}>`);
  // Sem preload de fonte: no 4G ele disputa banda com o CSS e atrasa o primeiro
  // desenho (medido: index 1184 → 2120 ms). Com font-display: swap o texto já sai.
  for (const url of g.external) lines.push(`<link rel="modulepreload" href="${url}">`);
  for (const file of g.local) lines.push(`<link rel="modulepreload" href="${prefix}${file}">`);
  if (!lines.length) return "";
  const eol = html.includes("\r\n") ? "\r\n" : "\n";
  return ["<!-- ep:perf · gerado por scripts/perf/build.mjs, não editar à mão -->", ...lines, "<!-- /ep:perf -->"].map(l => "  " + l + eol).join("");
}
function applyHints(rel, html, fonts) {
  html = removeManagedHints(html);
  const block = hintBlock(rel, html, fonts);
  if (!block) return html;
  // Páginas minificadas (uma linha só) também recebem o bloco, logo após a tag.
  const anchor = html.match(/<meta\b[^>]*name="viewport"[^>]*>(?:[ \t]*\r?\n)?/) || html.match(/<meta\b[^>]*charset[^>]*>(?:[ \t]*\r?\n)?/) || html.match(/<head\b[^>]*>(?:[ \t]*\r?\n)?/);
  if (!anchor) { warn(`${rel}: sem <head> para o bloco ep:perf`); return html; }
  const at = anchor.index + anchor[0].length;
  const lead = anchor[0].endsWith("\n") ? "" : (html.includes("\r\n") ? "\r\n" : "\n");
  return html.slice(0, at) + lead + block + html.slice(at);
}

// ─── 3. Versão pelo conteúdo (Merkle; ciclos via Tarjan) ──────────────────
function rewrite(rel, text, hashOf) {
  const refs = refsOf(rel).map(r => ({ ...r, target: resolveRef(r, rel) })).filter(r => r.target && r.target !== rel && !UNHASHED.has(r.target));
  refs.sort((a, b) => b.start - a.start);
  let out = text;
  for (const r of refs) {
    const hash = hashOf(r.target);
    if (!hash) continue;
    const next = versionedSpec(r.spec, hash);
    if (!next) { warn(`${rel}: consulta não versionável em ${r.spec}`); continue; }
    out = out.slice(0, r.start) + (r.raw !== undefined ? next.replace(/&/g, "&amp;") : next) + out.slice(r.end);
  }
  return out;
}
function buildHashes(rootFiles) {
  const edges = new Map();
  const nodes = [];
  const visit = rel => {
    if (edges.has(rel)) return;
    const deps = TEXT_ASSET.has(extname(rel).toLowerCase()) || rel.endsWith(".html") || EXTRA_ROOTS.includes(rel)
      ? [...new Set(refsOf(rel).map(r => resolveRef(r, rel)).filter(t => t && t !== rel && !UNHASHED.has(t)))]
      : [];
    edges.set(rel, deps);
    nodes.push(rel);
    deps.forEach(visit);
  };
  rootFiles.forEach(visit);
  // Tarjan: componentes saem com as dependências antes dos dependentes.
  let index = 0; const idx = new Map(), low = new Map(), onStack = new Set(), stack = [], sccs = [];
  const strong = v => {
    idx.set(v, index); low.set(v, index); index++; stack.push(v); onStack.add(v);
    for (const w of edges.get(v)) {
      if (!idx.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) { const c = []; let w; do { w = stack.pop(); onStack.delete(w); c.push(w); } while (w !== v); sccs.push(c); }
  };
  for (const n of nodes) if (!idx.has(n)) strong(n);
  const hashes = new Map(), output = new Map();
  const isText = rel => TEXT_ASSET.has(extname(rel).toLowerCase()) || rel.endsWith(".html") || EXTRA_ROOTS.includes(rel);
  for (const comp of sccs) {
    if (comp.length === 1 && !edges.get(comp[0]).includes(comp[0])) {
      const rel = comp[0];
      if (isText(rel)) { const text = rewrite(rel, readText(rel), t => hashes.get(t)); output.set(rel, text); hashes.set(rel, sha(text)); }
      else hashes.set(rel, sha(readBytes(rel)));
      continue;
    }
    const members = new Set(comp);
    const provisional = comp.sort().map(rel => rel + "\0" + rewrite(rel, readText(rel), t => members.has(t) ? "0".repeat(HASH_LEN) : hashes.get(t))).join("\0");
    const group = sha(provisional);
    for (const rel of comp) hashes.set(rel, group);
    for (const rel of comp) output.set(rel, rewrite(rel, readText(rel), t => hashes.get(t)));
  }
  return { hashes, output };
}

// ─── Execução ─────────────────────────────────────────────────────────────
const pages = listPages();
let fontPages = 0;
for (const rel of pages) {
  const original = readText(rel);
  const { html: withFonts, fonts } = applyFonts(rel, original);
  if (fonts.length) fontPages++;
  // Páginas já convertidas: descobre a variante pelo link local para refazer o preload.
  const localFonts = fonts.length ? fonts : [...withFonts.matchAll(/href="(?:\.\.?\/)+fonts\/([a-z0-9_-]+\.css)(?:\?[^"]*)?"/g)].map(m => {
    const families = m[1].replace(/\.css$/, "").replace(/_(?:block|fallback|optional|auto)$/, "").split("_").map(token => {
      const fam = Object.keys(FONT_META).find(f => token.startsWith(slug(f)) && /^\d/.test(token.slice(slug(f).length)));
      return fam ? { family: fam } : null;
    }).filter(Boolean);
    return { families };
  });
  overlay.set(rel, applyHints(rel, withFonts, localFonts));
}
// Páginas que já usavam as fontes locais mantêm os CSS de variante gerados.
for (const rel of pages) for (const m of readText(rel).matchAll(/href="(?:\.\.?\/)+fonts\/([a-z0-9_-]+\.css)(?:\?[^"]*)?"/g)) {
  const name = m[1];
  if (overlay.has(`fonts/${name}`)) continue;
  const parts = name.replace(/\.css$/, "").split("_");
  const display = ["block", "fallback", "optional", "auto"].includes(parts.at(-1)) ? parts.pop() : "swap";
  const families = parts.map(token => {
    const fam = Object.keys(FONT_META).find(f => token.startsWith(slug(f)) && /^(?:-noopsz)?\d/.test(token.slice(slug(f).length)));
    if (!fam) throw new Error(`Variante de fonte desconhecida: ${name}`);
    let rest = token.slice(slug(fam).length);
    const noOpsz = rest.startsWith("-noopsz");
    if (noOpsz) rest = rest.slice("-noopsz".length);
    const [min, max] = rest.split("-").map(Number);
    return { family: fam, min, max: max || min, noOpsz };
  });
  overlay.set(`fonts/${name}`, fontCss({ families, display }));
}
const roots = [...pages, ...EXTRA_ROOTS.filter(exists)];
const { output } = buildHashes(roots);
for (const [rel, text] of output) overlay.set(rel, text);

const changed = [];
for (const [rel, content] of overlay) {
  const current = existsSync(abs(rel)) ? readFileSync(abs(rel), "utf8") : null;
  if (current === content) continue;
  changed.push(rel);
  if (!CHECK) { mkdirSync(dirname(abs(rel)), { recursive: true }); writeFileSync(abs(rel), content); }
}
for (const w of warnings) console.warn("aviso:", w);
if (CHECK && changed.length) {
  console.error(`${changed.length} arquivo(s) desatualizado(s) pelas otimizações de carregamento:\n  ${changed.slice(0, 30).join("\n  ")}\nRode: node scripts/perf/build.mjs`);
  process.exit(1);
}
if (!QUIET) console.log(CHECK ? `Otimizações de carregamento em dia (${pages.length} páginas).` : `${changed.length} arquivo(s) atualizado(s); ${pages.length} páginas (${fontPages} trocaram Google Fonts por fontes locais).`);
