import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'parse5';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
function nodes(node, tag) {
  return [ ...(node.tagName === tag ? [node] : []), ...(node.childNodes || []).flatMap(n => nodes(n, tag)) ];
}
const attr = (node, key) => node.attrs?.find(a => a.name === key)?.value;
const text = node => node.nodeName === '#text' ? node.value : (node.childNodes || []).map(text).join('');
const pages = ['gestores-escolares.html', 'psicologo-para-escolas.html', 'lei-13935-psicologia-nas-escolas.html', 'telepsicologia-redes-municipais.html', 'saude-mental-estudantes.html'];

test('public guides are crawlable, linked and included in the sitemap', () => {
  const sitemap = read('sitemap.xml');
  const home = read('index.html');
  for (const page of pages) {
    const html = read(page);
    const doc = parse(html);
    assert.equal(attr(nodes(doc, 'html')[0], 'lang'), 'pt-BR');
    assert.equal(nodes(doc, 'h1').length, 1);
    assert.match(html, /charset="UTF-8"/);
    assert.doesNotMatch(html, /[A-Za-zÀ-ÿ]\?[A-Za-zÀ-ÿ]{2,}|\uFFFD/);
    const canonical = nodes(doc, 'link').find(n => attr(n, 'rel') === 'canonical');
    assert.equal(attr(canonical, 'href'), `https://espacopreludio.com.br/${page}`);
    assert.ok(nodes(doc, 'p').some(n => text(n).length > 120));
    assert.ok(sitemap.includes(`https://espacopreludio.com.br/${page}`));
    assert.ok(home.includes(`./${page}`));
    for (const script of nodes(doc, 'script').filter(n => attr(n, 'type') === 'application/ld+json')) JSON.parse(text(script));
    assert.equal(read(`staging/${page}`), html);
  }
});

test('FAQ schema matches every visible question and answer', () => {
  for (const prefix of ['', 'staging/']) {
    const doc = parse(read(`${prefix}index.html`));
    const schema = nodes(doc, 'script').filter(n => attr(n, 'type') === 'application/ld+json').map(n => JSON.parse(text(n))).find(s => s['@type'] === 'FAQPage');
    const section = nodes(doc, 'section').find(n => attr(n, 'id') === 'duvidas');
    const entries = nodes(section, 'details').map(n => ({ question: text(nodes(n, 'summary')[0]).trim(), answer: text(nodes(n, 'p')[0]).trim() }));
    assert.equal(entries.length, 6);
    assert.deepEqual(schema.mainEntity.map(q => ({ question: q.name, answer: q.acceptedAnswer.text })), entries);
    for (const img of nodes(doc, 'img')) assert.equal(attr(img, 'alt'), 'Espaço Prelúdio');
  }
});

test('app login is excluded from indexing and flags remain decorative', () => {
  for (const prefix of ['', 'staging/']) {
    const doc = parse(read(`${prefix}app/login.html`));
    const robots = nodes(doc, 'meta').find(n => attr(n, 'name') === 'robots');
    assert.equal(attr(robots, 'content'), 'noindex, nofollow');
    assert.match(read(`${prefix}i18n/init.js`), /height="13" alt=""/);
  }
});
