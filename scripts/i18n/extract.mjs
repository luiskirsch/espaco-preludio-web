// Marca texto estático de páginas HTML com data-i18n* e devolve as strings pt-BR.
// Uso: node extract.mjs <repoRoot> <arquivo relativo> [--write|--show]
import { parse } from "parse5";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";

const SKIP_TAGS = new Set(["script", "style", "noscript", "svg", "template", "textarea", "pre", "code", "math", "iframe", "canvas", "video", "audio"]);
const INLINE = new Set(["b", "strong", "em", "i", "a", "br", "small", "span", "sup", "sub", "u", "mark", "abbr", "time", "kbd", "s", "wbr"]);
const ATTRS = ["placeholder", "title", "aria-label", "alt"];
const NO_TRANSLATE = new Set(["espaço prelúdio", "prelúdio", "espaço", "ep", "lgpd", "pix", "nr-1", "crp", "crm", "whatsapp", "e-mail", "ok"]);

export let ROOT = ".";
export function setRoot(r) { ROOT = r; }

export function nsFor(rel) {
  return "p-" + rel.replace(/^staging\//, "").replace(/\.html$/, "").replace(/[\/\\]/g, "-");
}
const norm = s => s.replace(/\s+/g, " ").trim();
const hasWords = s => /[A-Za-zÀ-ÿ]{2,}/.test(s);
function slug(s) {
  return norm(s.replace(/<[^>]+>/g, " ")).normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").split("_").slice(0, 5).join("_") || "t";
}
export const keyFor = s => `${slug(s)}_${createHash("sha1").update(s).digest("hex").slice(0, 5)}`;
const attr = (n, name) => n.attrs?.find(a => a.name === name)?.value;
const isEl = n => !!n.tagName;
const isText = n => n.nodeName === "#text";

export function processHtml(src, rel) {
  const ns = nsFor(rel);
  const doc = parse(src, { sourceCodeLocationInfo: true });
  const strings = {};
  const edits = [];

  const scripts = [...src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join("\n");
  const extScripts = [...src.matchAll(/<script\b[^>]*\bsrc="([^"?#]+)/gi)]
    .map(m => m[1])
    .filter(u => !/^(https?:)?\/\//.test(u))
    .map(u => {
      const p = u.startsWith("/") ? join(ROOT, u) : join(ROOT, dirname(rel), u);
      try { return readFileSync(p, "utf8"); } catch { return ""; }
    }).join("\n");
  const allJs = scripts + "\n" + extScripts;

  // Ids que o JS preenche: traduzir na carga (assíncrona) poderia sobrescrever o dado real.
  const dynamicIds = new Set();
  for (const id of new Set([...src.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]))) {
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`["'\`#]${esc}["'\`][\\s\\S]{0,160}?(textContent|innerHTML|innerText|insertAdjacentHTML|replaceChildren)\\b`);
    if (re.test(allJs)) dynamicIds.add(id);
  }
  // Links só entram em bloco HTML se nenhum script prende eventos em <a>
  // (o innerHTML traduzido recria os elementos e perderia os listeners).
  const linkListeners = /querySelectorAll?\(\s*["'`][^"'`]*\ba\b|a\[href/.test(allJs);

  function addAttr(node, name, value) {
    let pos = node.sourceCodeLocation.startTag.endOffset - 1;
    if (src[pos - 1] === "/") pos -= 1;
    edits.push({ start: pos, end: pos, text: ` ${name}="${value.replace(/"/g, "&quot;")}"` });
  }
  function put(text) {
    const k = keyFor(text);
    strings[k] = text;
    return `${ns}:${k}`;
  }
  const skippable = t => !hasWords(t) || NO_TRANSLATE.has(t.toLowerCase()) || /^[\w.+-]+@[\w.-]+$/.test(t) || /^https?:/.test(t) || /\$\{|\{\{/.test(t);

  function attrsOf(node) {
    for (const a of ATTRS) {
      const v = attr(node, a);
      if (v && attr(node, `data-i18n-${a}`) === undefined && !skippable(norm(v))) addAttr(node, `data-i18n-${a}`, put(norm(v)));
    }
    if (node.tagName === "input" && /^(submit|button)$/i.test(attr(node, "type") || "")) {
      const v = attr(node, "value");
      if (v && attr(node, "data-i18n-value") === undefined && !skippable(norm(v))) addAttr(node, "data-i18n-value", put(norm(v)));
    }
  }
  const alreadyMarked = n => n.attrs?.some(a => a.name === "data-i18n" || a.name === "data-i18n-html");
  const noTranslate = n => attr(n, "translate") === "no" || attr(n, "data-no-i18n") !== undefined || /\b(a-skel|ep-skel)\b/.test(attr(n, "class") || "");

  function inlineSafe(n) {
    if (isText(n) || n.nodeName === "#comment") return true;
    if (!isEl(n) || !INLINE.has(n.tagName)) return false;
    if (n.tagName === "a" && linkListeners) return false;
    if (attr(n, "id") || alreadyMarked(n) || n.attrs.some(a => a.name.startsWith("data-") || a.name.startsWith("on"))) return false;
    return n.childNodes.every(inlineSafe);
  }
  function innerSrc(n) {
    const l = n.sourceCodeLocation;
    if (!l?.startTag || !l?.endTag) return null;
    return src.slice(l.startTag.endOffset, l.endTag.startOffset);
  }

  function walk(n, insideMarked) {
    if (!isEl(n) || SKIP_TAGS.has(n.tagName) || noTranslate(n) || !n.sourceCodeLocation) return;
    attrsOf(n);
    if (insideMarked || alreadyMarked(n)) { n.childNodes.forEach(c => walk(c, true)); return; }
    const id = attr(n, "id");
    const dynamic = id && dynamicIds.has(id);
    const children = n.childNodes.filter(c => c.nodeName !== "#comment");
    const hasElChildren = children.some(isEl);

    if (!dynamic && n.tagName !== "body" && n.tagName !== "select" && children.length && children.every(inlineSafe)) {
      const raw = hasElChildren ? innerSrc(n) : children.map(c => c.value || "").join("");
      if (raw == null) return;
      const value = norm(raw);
      if (skippable(norm(value.replace(/<[^>]+>/g, " ")))) return;
      addAttr(n, hasElChildren ? "data-i18n-html" : "data-i18n", put(value));
      return;
    }
    if (dynamic) { children.forEach(c => walk(c, false)); return; }
    for (const c of n.childNodes) {
      if (isText(c)) {
        const t = norm(c.value);
        if (!skippable(t) && hasElChildren && c.sourceCodeLocation && n.tagName !== "select") {
          const { startOffset, endOffset } = c.sourceCodeLocation;
          const rawText = src.slice(startOffset, endOffset);
          const lead = rawText.match(/^\s*/)[0], trail = rawText.match(/\s*$/)[0];
          edits.push({ start: startOffset, end: endOffset, text: `${lead}<span data-i18n="${put(t)}">${t}</span>${trail}` });
        }
      } else walk(c, false);
    }
  }

  const html = doc.childNodes.find(c => c.tagName === "html");
  const head = html.childNodes.find(c => c.tagName === "head");
  const body = html.childNodes.find(c => c.tagName === "body");
  const title = head?.childNodes.find(c => c.tagName === "title");
  if (title && !alreadyMarked(title) && title.sourceCodeLocation?.startTag) {
    const t = norm(title.childNodes.map(c => c.value || "").join(""));
    if (hasWords(t)) addAttr(title, "data-i18n", put(t));
  }
  for (const m of head?.childNodes.filter(c => c.tagName === "meta") || []) {
    const nm = attr(m, "name") || attr(m, "property");
    if (/^(description|og:title|og:description|twitter:title|twitter:description)$/.test(nm || "") && attr(m, "content") && attr(m, "data-i18n-content") === undefined && m.sourceCodeLocation) {
      addAttr(m, "data-i18n-content", put(norm(attr(m, "content"))));
    }
  }
  if (body) walk(body, false);

  edits.sort((a, b) => b.start - a.start);
  let out = src;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);

  if (Object.keys(strings).length) {
    const htmlTag = out.match(/<html\b[^>]*>/i)[0];
    let newTag = htmlTag;
    const nsAttr = htmlTag.match(/data-i18n-ns="([^"]*)"/);
    if (nsAttr) { if (!nsAttr[1].split(",").map(s => s.trim()).includes(ns)) newTag = htmlTag.replace(nsAttr[0], `data-i18n-ns="${nsAttr[1]},${ns}"`); }
    else newTag = htmlTag.replace(/>$/, ` data-i18n-ns="${ns}">`);
    out = out.replace(htmlTag, newTag);
    if (!/i18n\/init\.js/.test(out)) {
      const boot = `  <script>(function(){try{var l=null;try{l=new URLSearchParams(location.search).get("lang");}catch(_){}if(!l)l=localStorage.getItem("ep_lang");if(!l){var n=(navigator.language||"").toLowerCase();if(n.indexOf("en")===0)l="en-US";else if(n.indexOf("es")===0)l="es-ES";}if(l==="en-US"||l==="es-ES")document.documentElement.classList.add("ep-i18n-pending");}catch(e){}})();</script>\n  <style>html.ep-i18n-pending body{visibility:hidden}</style>\n  <script src="/i18n/init.js?v=2-0" defer></script>\n`;
      out = out.replace(/<\/head>/i, boot + "</head>");
    }
  }
  return { out, strings, ns, dynamic: [...dynamicIds] };
}

if (process.argv[1]?.endsWith("extract.mjs") && process.argv[3]) {
  const [root, rel, flag] = process.argv.slice(2);
  setRoot(root);
  const src = readFileSync(join(root, rel), "utf8");
  const r = processHtml(src, rel);
  if (flag === "--write") writeFileSync(join(root, rel), r.out);
  console.log(JSON.stringify({ ns: r.ns, count: Object.keys(r.strings).length, dynamic: r.dynamic.length }));
  if (flag === "--show") console.log(JSON.stringify(r.strings, null, 1));
}
