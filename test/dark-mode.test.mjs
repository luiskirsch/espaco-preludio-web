import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

test('every visual system imports the shared dark foundation', async () => {
  const stylesheets = [
    'css/espaco-preludio.css',
    'css/profissional-institucional.css',
    'css/nr1.css',
    'css/instituicao.css',
    'css/rt.css',
    'css/escolas.css',
    'app/app.css'
  ];
  for (const stylesheet of stylesheets) {
    const source = await read(stylesheet);
    assert.match(source.slice(0, 100), /dark-mode\.css/, `${stylesheet} must import dark-mode.css first`);
  }
});

test('standalone portals restore the saved theme before rendering', async () => {
  const pages = [
    'admin-nr1.html', 'empresa-nr1.html', 'paciente-nr1.html',
    'instituicao-login.html', 'instituicao-painel.html',
    'rt-login.html', 'rt-painel.html', 'index.html',
    'app/login.html', 'app/home.html', 'app/chat.html', 'app/perfil.html'
  ];
  for (const page of pages) {
    const source = await read(page);
    assert.match(source, /localStorage\.getItem\("ep:theme"\)/, `${page} must restore ep:theme`);
  }
});

test('dark conversation surfaces do not retain white incoming bubbles', async () => {
  const source = await read('css/dark-mode.css');
  assert.match(source, /\.ep-pro-msg--theirs\{background:#242b27!important/);
  assert.match(source, /\.ep-chat-bubble--theirs\{background:#242b27!important/);
});
