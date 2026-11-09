// Ponte com o app Espaço Prelúdio (Android/iOS).
//
// Dentro do app, a página roda numa WebView e quem tem a sessão do Firebase
// é o app nativo. Em vez de pedir login de novo, a página pede ao app um ID
// token a cada chamada à API. A sessão de 2FA do app é colocada no
// sessionStorage antes do carregamento, então installClinicalFetch a envia
// normalmente.
//
// Fora do app nada muda: sem window.ReactNativeWebView e sem a identificação
// injetada pelo app, nativeAccount() devolve null.
const TOKEN_TIMEOUT_MS = 15000;

export function nativeAccount(scope = globalThis) {
  const native = scope.ReactNativeWebView;
  const boot = scope.__EP_NATIVE__;
  if (!native || typeof native.postMessage !== 'function' || !boot || typeof boot.uid !== 'string' || !boot.uid) return null;
  let sequence = 0;
  const waiting = new Map();
  scope.__epNativeReply = (id, token) => {
    const entry = waiting.get(id);
    if (!entry) return;
    waiting.delete(id); clearTimeout(entry.timer);
    if (typeof token === 'string' && token) entry.resolve(token);
    else entry.reject(new Error('TOKEN_NAO_INFORMADO'));
  };
  const send = message => native.postMessage(JSON.stringify(message));
  return {
    uid: boot.uid,
    displayName: typeof boot.displayName === 'string' ? boot.displayName : '',
    email: typeof boot.email === 'string' ? boot.email : '',
    photoURL: null,
    native: true,
    getIdToken() {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { if (waiting.delete(id)) reject(new Error('TOKEN_TIMEOUT')); }, TOKEN_TIMEOUT_MS);
        waiting.set(id, { resolve, reject, timer });
        send({ type: 'ep:id-token', id });
      });
    },
    close() { send({ type: 'ep:close' }); }
  };
}
