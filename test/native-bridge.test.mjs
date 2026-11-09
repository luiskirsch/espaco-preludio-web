import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeAccount } from '../js/native-bridge.js';

function appScope(boot = { uid: 'u1', displayName: 'Ana', email: 'ana@example.com' }) {
  const sent = [];
  return { sent, scope: { ReactNativeWebView: { postMessage: message => sent.push(JSON.parse(message)) }, __EP_NATIVE__: boot } };
}

test('fora do app a ponte não existe e a página segue com o login do site', () => {
  assert.equal(nativeAccount({}), null);
  assert.equal(nativeAccount({ __EP_NATIVE__: { uid: 'u1' } }), null, 'identificação sem a WebView do app');
  assert.equal(nativeAccount({ ReactNativeWebView: { postMessage() {} } }), null, 'WebView sem identificação');
  assert.equal(nativeAccount({ ReactNativeWebView: { postMessage() {} }, __EP_NATIVE__: { uid: '' } }), null);
});

test('no app, cada token é pedido ao app e entregue à chamada certa', async () => {
  const { sent, scope } = appScope();
  const account = nativeAccount(scope);
  assert.equal(account.uid, 'u1');
  assert.equal(account.displayName, 'Ana');
  const first = account.getIdToken(), second = account.getIdToken();
  assert.deepEqual(sent, [{ type: 'ep:id-token', id: 1 }, { type: 'ep:id-token', id: 2 }]);
  scope.__epNativeReply(2, 'token-2');
  scope.__epNativeReply(1, 'token-1');
  assert.equal(await first, 'token-1');
  assert.equal(await second, 'token-2');
  scope.__epNativeReply(1, 'repetido'); // resposta duplicada é ignorada
});

test('resposta vazia do app rejeita a chamada em vez de enviar pedido sem token', async () => {
  const { scope } = appScope();
  const account = nativeAccount(scope);
  const pending = account.getIdToken();
  scope.__epNativeReply(1, '');
  await assert.rejects(pending, /TOKEN_NAO_INFORMADO/);
});
