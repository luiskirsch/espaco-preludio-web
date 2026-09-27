import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (path) => readFile(join(root, path), 'utf8');

function luminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/gi).map((value) => parseInt(value, 16) / 255);
  const linear = channels.map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
}

function contrast(foreground, background) {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + .05) / (dark + .05);
}

test('dark theme keeps primary and secondary copy above WCAG AA contrast', () => {
  assert.ok(contrast('#f8f4e9', '#1b211e') >= 4.5);
  assert.ok(contrast('#d2c8b5', '#1b211e') >= 4.5);
  assert.ok(contrast('#aa9d87', '#1b211e') >= 4.5);
  assert.ok(contrast('#171006', '#e4b85f') >= 4.5);
});

test('only the professional platform imports the shared dark foundation', async () => {
  const professional = await read('css/espaco-preludio.css');
  assert.match(professional.slice(0, 100), /dark-mode\.css/);

  const lightOnlyStylesheets = [
    'css/profissional-institucional.css',
    'css/nr1.css',
    'css/instituicao.css',
    'css/rt.css',
    'css/escolas.css',
    'app/app.css'
  ];
  for (const stylesheet of lightOnlyStylesheets) {
    const source = await read(stylesheet);
    assert.doesNotMatch(source, /dark-mode\.css/, `${stylesheet} must stay light-only`);
  }
});

test('saved dark preference is restored only on professional pages', async () => {
  const entries = await readdir(root, { recursive: true });
  const pages = entries
    .map((entry) => String(entry).replaceAll('\\', '/'))
    .filter((entry) => entry.endsWith('.html'));

  for (const page of pages) {
    const source = await read(page);
    assert.doesNotMatch(source, /<html[^>]*data-theme=["']dark["']/i, `${page} must not force dark mode`);
    if (!source.includes('ep:theme')) continue;
    const body = source.match(/<body[^>]*>/i)?.[0] || '';
    assert.match(body, /ep-has-sidebar|ep-consult/, `${page} must not inherit the professional theme`);
  }

  for (const patientGuardPath of ['js/patient-auth-guard.js', 'staging/js/patient-auth-guard.js']) {
    const patientGuard = await read(patientGuardPath);
    assert.doesNotMatch(patientGuard, /theme-toggle|mountThemeToggle/);
  }
});

test('dark conversation surfaces do not retain white incoming bubbles', async () => {
  const source = await read('css/dark-mode.css');
  assert.match(source, /\.ep-pro-msg--theirs\{background:#242b27!important/);
  assert.match(source, /\.ep-chat-bubble--theirs\{background:#242b27!important/);
});

test('pending appointment badges use a vivid coral treatment in dark mode', async () => {
  const source = await read('css/dark-mode.css');
  assert.match(source, /\.ep-badge\.ep-badge--overdue/);
  assert.match(source, /color:#ffad91/);
  assert.match(source, /border-color:rgba\(255,126,88,\.72\)/);
});
