import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('plans page separates plan value from secure activation', async () => {
  const html = await read('planos.html');
  assert.match(html, /css\/planos\.css\?v=20260926a/);
  assert.match(html, /class="ep-plan-card__content"/);
  assert.match(html, /class="ep-plan-checkout"/);
  assert.match(html, /id="subscribeEmpresaBtn"/);
  assert.match(html, /id="empresaPayerEmail"/);
});

test('institutional-only state uses the full grid width and remains responsive', async () => {
  const css = await read('css/planos.css');
  assert.match(css, /#tiersGrid:has\(#profCard\[style\*="display: none"\]\)/);
  assert.match(css, /#tiersGrid:has\([^}]+\.ep-plan-card--institutional\s*\{[^}]*grid-template-columns/s);
  assert.match(css, /@media \(max-width: 1080px\)[\s\S]*#tiersGrid:has\([^}]+\.ep-plan-card--institutional\s*\{\s*grid-template-columns: 1fr/);
  assert.match(css, /@media \(max-width: 720px\)/);
});
