// Verifica cobertura e integridade estrutural dos três idiomas sem alterar arquivos.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', '..');
const BASE = join(ROOT, 'i18n', 'locales');
const LANGS = ['pt-BR', 'en-US', 'es-ES'];
const errors = [];

const readJson = p => JSON.parse(readFileSync(p, 'utf8'));
const leaves = (value, prefix = '', out = new Map()) => {
  if (typeof value === 'string') out.set(prefix, value);
  else if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) leaves(child, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
};
const tokens = value => [...String(value).matchAll(/\{\{[^}]+\}\}|\{\d+\}/g)].map(m => m[0]).sort();
const tags = value => [...String(value).matchAll(/<\/?([a-z][\w-]*)\b[^>]*>/gi)].map(m => m[0].startsWith('</') ? `/${m[1]}` : m[1]);
const sameArray = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

const ptDir = join(BASE, 'pt-BR');
const files = readdirSync(ptDir).filter(f => f.endsWith('.json')).sort();
for (const file of files) {
  const pt = leaves(readJson(join(ptDir, file)));
  for (const lang of LANGS.slice(1)) {
    const target = join(BASE, lang, file);
    if (!existsSync(target)) {
      errors.push(`${lang}/${file}: arquivo ausente`);
      continue;
    }
    const translated = leaves(readJson(target));
    for (const [key, source] of pt) {
      if (!translated.has(key) || !translated.get(key).trim()) {
        errors.push(`${lang}/${file}:${key}: tradução ausente`);
        continue;
      }
      const value = translated.get(key);
      if (!sameArray(tokens(source), tokens(value))) errors.push(`${lang}/${file}:${key}: placeholders diferentes`);
      if (!sameArray(tags(source), tags(value))) errors.push(`${lang}/${file}:${key}: estrutura HTML diferente`);
    }
  }
}

let pages = 0;
for (const dir of ['', 'app']) {
  const abs = join(ROOT, dir);
  for (const file of readdirSync(abs).filter(f => f.endsWith('.html'))) {
    pages++;
    const rel = dir ? `${dir}/${file}` : file;
    const html = readFileSync(join(abs, file), 'utf8');
    if (!/\bi18n\/init\.js\b/.test(html)) errors.push(`${rel}: inicializador i18n ausente`);
    const ns = html.match(/data-i18n-ns="([^"]+)"/)?.[1].split(',').map(x => x.trim()).filter(Boolean) || [];
    if (!ns.length) errors.push(`${rel}: namespace i18n ausente`);
    for (const name of ns) {
      for (const lang of LANGS) {
        if (!existsSync(join(BASE, lang, `${name}.json`))) errors.push(`${rel}: namespace ${lang}/${name}.json ausente`);
      }
    }
    const defaultNs = ns.find(name => name !== 'common') || 'common';
    // Apenas atributos efetivamente traduzidos por i18n/init.js. Metadados como
    // data-i18n-ns, data-i18n-live e data-i18n-switcher nÃ£o sÃ£o chaves.
    const translatedAttributes = [
      'data-i18n', 'data-i18n-html', 'data-i18n-title',
      'data-i18n-placeholder', 'data-i18n-alt', 'data-i18n-value',
      'data-i18n-aria-label', 'data-i18n-content', 'data-i18n-label'
    ];
    const attrPattern = translatedAttributes.map(name => name.replace(/-/g, '\\-')).join('|');
    const refs = [...html.matchAll(new RegExp(`(?:${attrPattern})="([^"]+)"`, 'g'))].map(m => m[1]);
    for (const ref of refs) {
      const colon = ref.indexOf(':');
      const name = colon >= 0 ? ref.slice(0, colon) : defaultNs;
      const key = colon >= 0 ? ref.slice(colon + 1) : ref;
      for (const lang of LANGS) {
        const filePath = join(BASE, lang, `${name}.json`);
        if (!existsSync(filePath)) continue;
        if (!leaves(readJson(filePath)).has(key)) errors.push(`${rel}: chave ${lang}/${name}:${key} ausente`);
      }
    }
  }
}

if (errors.length) {
  console.error(`Auditoria i18n falhou (${errors.length} problema(s)):`);
  errors.slice(0, 200).forEach(e => console.error(`- ${e}`));
  if (errors.length > 200) console.error(`- ... e mais ${errors.length - 200}`);
  process.exit(1);
}

console.log(`i18n íntegro: ${pages} páginas · ${files.length} namespaces · ${LANGS.join(', ')}`);
