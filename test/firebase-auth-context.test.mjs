import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';
import { parse } from 'acorn';
import { isRtAuthContext, isCollaboratorAuthContext } from '../js/twofa-session.js';

const original = readFileSync(new URL('../js/firebase-config.js', import.meta.url), 'utf8');
const ast = parse(original, { ecmaVersion: 'latest', sourceType: 'module' });
const edits = ast.body.flatMap(node => node.type === 'ImportDeclaration' ? [[node.start, node.end]]
  : node.type === 'ExportNamedDeclaration' ? [[node.start, node.declaration.start]] : []);
let source = original;
for (const [start, end] of edits.sort((a, b) => b[0] - a[0])) source = source.slice(0, start) + source.slice(end);
source += '\nglobalThis.result={auth,AUTH_CONTEXT,getProfessionalAuth,getPatientAuth,getInstitutionAuth,getRtAuth};';

function browser(persisted = new Map()) {
  const apps = new Map(), auths = new Map();
  const sdk = {
    getApps: () => [...apps.values()], getApp: name => apps.get(name),
    initializeApp(config, name = '[DEFAULT]') { const app = { name, options: config }; apps.set(name, app); return app; },
    initializeAuth(app, { persistence }) {
      assert.equal(persistence.length, 3, 'Local persistence and its fallbacks remain enabled');
      if (auths.has(app.name)) throw new Error('already initialized');
      const auth = { app, get currentUser() { return persisted.get(app.name) || null; }, set currentUser(user) { persisted.set(app.name, user); } };
      auths.set(app.name, auth); return auth;
    },
    getAuth: app => auths.get(app.name), indexedDBLocalPersistence: 'indexed-db', browserLocalPersistence: 'local', browserSessionPersistence: 'session',
  };
  return {
    persisted,
    get authCount() { return auths.size; },
    page(path, document) {
      const url = new URL(path, 'https://espacopreludio.com.br');
      const scope = createContext({ ...sdk, location: url, URLSearchParams, isRtAuthContext, isCollaboratorAuthContext,
        document, installClinicalFetch: () => {}, console: { info() {} } });
      return new Script('(async()=>{' + source + ';return globalThis.result;})()').runInContext(scope);
    }
  };
}

test('collaborator pages retain their own account when a professional or another portal signs out', async () => {
  const b = browser();
  const portal = await b.page('/app/login.html'), professional = await b.page('/painel.html');
  portal.auth.currentUser = { uid: 'collaborator-user' };
  professional.auth.currentUser = { uid: 'professional-user' };
  assert.equal(portal.AUTH_CONTEXT, 'collaborator');
  assert.equal(portal.auth.app.name, 'collaborator');
  assert.notEqual(portal.auth, professional.auth);
  professional.auth.currentUser = null;
  for (const path of ['/app/home.html', '/app/diario.html', '/app/perfil.html', '/2fa-verify.html?redirect=./app/diario.html']) {
    assert.equal((await b.page(path)).auth.currentUser.uid, 'collaborator-user', path);
  }
  const patient = await b.page('/paciente-painel.html'); patient.auth.currentUser = { uid: 'patient-user' };
  portal.auth.currentUser = null;
  assert.equal(patient.auth.currentUser.uid, 'patient-user');
  assert.equal((await b.page('/app/home.html')).auth.currentUser, null, 'An explicit portal logout is respected');
  const restored = browser(b.persisted);
  assert.equal((await restored.page('/app/home.html')).auth.currentUser, null, 'Another area cannot silently sign the portal back in');
});

test('role separation also holds in staging and preserves the existing portal identities', async () => {
  const b = browser();
  for (const [path, context, app] of [
    ['/staging/app/home.html', 'collaborator', 'collaborator'],
    ['/staging/2fa-verify.html?redirect=./app/chat.html', 'collaborator', 'collaborator'],
    ['/aluno-diario.html', 'patient', 'patient'], ['/paciente-painel.html', 'patient', 'patient'],
    ['/instituicao-painel.html', 'institution', 'institution'], ['/rt-painel.html', 'rt', 'responsavel-tecnico'],
    ['/2fa-verify.html?context=rt', 'rt', 'responsavel-tecnico'], ['/painel.html', 'professional', '[DEFAULT]']
  ]) {
    const page = await b.page(path);
    assert.equal(page.AUTH_CONTEXT, context, path); assert.equal(page.auth.app.name, app, path);
  }
});

test('an invisible prerender cannot initialize portal authentication or run its login redirects', async () => {
  const b = browser(); let activate;
  const document = { prerendering: true, addEventListener(type, callback) { assert.equal(type, 'prerenderingchange'); activate = callback; } };
  const pending = b.page('/app/perfil.html', document);
  assert.equal(b.authCount, 0, 'Prerender waits before touching persisted authentication');
  document.prerendering = false; activate();
  assert.equal((await pending).AUTH_CONTEXT, 'collaborator');
  assert.equal(b.authCount, 1);
});

const loginModule = readFileSync(new URL('../app/login.html', import.meta.url), 'utf8').match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const restoreNode = parse(loginModule, { ecmaVersion: 'latest', sourceType: 'module' }).body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'resumeSession');
const restoreSource = loginModule.slice(restoreNode.start, restoreNode.end);
function restoreFixture(verify) {
  const user = { uid: 'existing-user' }, auth = { currentUser: user }, location = { href: '/app/login.html' };
  const elements = new Map();
  const document = { getElementById(id) {
    if (!elements.has(id)) elements.set(id, { disabled: false, textContent: '', classList: { remove() {} } });
    return elements.get(id);
  } };
  const scope = createContext({ auth, document, window: { location }, ensureMfa: verify, redirectTo: './home.html', signingIn: false, resumingSession: false, isReauth: false });
  new Script(restoreSource + ';globalThis.restore=resumeSession;').runInContext(scope);
  return { auth, user, location, elements, restore: scope.restore };
}
test('temporary verification failures preserve the login and allow retry without entering the password again', async () => {
  let attempts = 0;
  const f = restoreFixture(async () => { if (++attempts === 1) throw new TypeError('Failed to fetch'); });
  await f.restore(f.user);
  assert.equal(f.auth.currentUser, f.user);
  assert.equal(f.location.href, '/app/login.html');
  assert.ok(f.elements.get('erroEntrar').textContent);
  assert.equal(f.elements.get('resumeSessionButton').disabled, false);
  await f.restore(f.user);
  assert.equal(attempts, 2); assert.equal(f.location.href, './home.html');
});
test('a restored session never skips MFA or redirects a different account after an asynchronous verification', async () => {
  let finish;
  const f = restoreFixture(() => new Promise(resolve => { finish = resolve; }));
  const pending = f.restore(f.user);
  assert.equal(f.location.href, '/app/login.html');
  f.auth.currentUser = { uid: 'changed-user' }; finish(); await pending;
  assert.equal(f.location.href, '/app/login.html');
});
