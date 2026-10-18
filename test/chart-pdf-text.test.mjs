import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutPdfText } from '../js/chart-pdf-text.js';

test('PDF layout preserves paragraphs and wraps long record IDs inside the page', () => {
  const result = layoutPdfText('First paragraph\n\nSecond paragraph\n' + 'a'.repeat(100), value => value.length, 20);
  assert.deepEqual(result.lines.slice(0, 3), ['First paragraph', '', 'Second paragraph']);
  assert.ok(result.lines.every(line => line.length <= 20));
  assert.equal(result.lines.slice(3).join(''), 'a'.repeat(100));
});

test('PDF text retains unsupported characters by exact code point', () => {
  const measure = value => {
    if ([...value].some(character => character.codePointAt(0) > 255)) throw new Error('Unsupported glyph');
    return value.length;
  };
  const result = layoutPdfText('Ação 🧠 漢', measure, 50);
  assert.equal(result.lines.join('\n'), 'Ação [U+1F9E0] [U+6F22]');
  assert.deepEqual(result.escapedCodepoints, ['1F9E0', '6F22']);
});
