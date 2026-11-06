import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPRESA_ASSET_FILES, createEmpresaOrigin } from '../security/edge/empresa-assets.mjs';
import legacyWaf from '../security/edge/legacy-waf.mjs';
import { handleRequest } from '../security/edge/worker.mjs';

test('direct HR delivery only serves the explicit public bundle and preserves Pages for other paths', async () => {
  const served=[], origin=[];
  const empresaOrigin=createEmpresaOrigin();
  const env={EMPRESA_ASSETS:{fetch:async request=>{served.push(new URL(request.url).pathname);return new Response('asset');}}};
  const fallback=async request=>{origin.push(new URL(request.url).pathname);return new Response('origin');};
  for(const path of ['/empresa-painel.html','/staging/js/empresa-gestao.js?h=fixture'])
    assert.equal(await (await empresaOrigin(new Request('https://espacopreludio.com.br'+path),env,fallback)).text(),'asset');
  for(const path of ['/index.html','/.env','/security/edge/worker.mjs','/empresa-painel.html/extra'])
    assert.equal(await (await empresaOrigin(new Request('https://espacopreludio.com.br'+path),env,fallback)).text(),'origin');
  assert.equal(await (await empresaOrigin(new Request('https://espacopreludio.com.br/empresa-painel.html',{method:'POST'}),env,fallback)).text(),'origin');
  assert.equal(served.length,2);assert.ok(origin.includes('/index.html'));assert.ok(origin.includes('/.env'));
  assert.ok(EMPRESA_ASSET_FILES.every(path=>!path.includes('..')&&!path.startsWith('.')));
});

test('direct HTML keeps fresh CSP nonces, no-store and the existing cloner protection', async () => {
  let served=0;
  const empresaOrigin=createEmpresaOrigin();
  const env={EMPRESA_ASSETS:{fetch:async()=>{served++;return new Response('<script>trusted()</script>',{headers:{'Content-Type':'text/html',ETag:'old'}});}}};
  const source=request=>legacyWaf.fetch(request,env,{},next=>empresaOrigin(next,env,async()=>new Response('old Pages version')));
  const nonce='fresh-test-nonce-32-characters';
  class Rewriter { on(selector,handler){handler.element({setAttribute:(name,value)=>{assert.equal(name,'nonce');assert.equal(value,nonce);}});return this;} transform(r){return r;} }
  const normal=await handleRequest(new Request('https://espacopreludio.com.br/empresa-painel.html'),source,{HtmlRewriter:Rewriter,nonceFactory:()=> nonce});
  assert.equal(normal.status,200);assert.match(normal.headers.get('Content-Security-Policy'),/nonce-fresh-test-nonce-32-characters/);
  assert.match(normal.headers.get('Cache-Control'),/no-store/);assert.equal(normal.headers.get('ETag'),null);
  const denied=await handleRequest(new Request('https://espacopreludio.com.br/empresa-painel.html',{headers:{'User-Agent':'HTTrack'}}),source,{HtmlRewriter:Rewriter,nonceFactory:()=> nonce});
  assert.equal(denied.status,403);assert.equal(served,1);
});

test('Pages automatically resumes serving the panel and newer dependencies after it recovers', async()=>{
  let time=1, ready=false;
  const empresaOrigin=createEmpresaOrigin({now:()=>time});
  const env={EMPRESA_ASSETS:{fetch:async()=>new Response('fallback')}};
  const origin=async request=>new Response(new URL(request.url).searchParams.has('__ep_empresa_release')
    ? ready?'<script src="js/empresa-gestao.js"></script>':'old panel' : 'new Pages content');
  const request=new Request('https://espacopreludio.com.br/js/empresa-gestao.js?h=newer');
  assert.equal(await (await empresaOrigin(request,env,origin)).text(),'fallback');
  ready=true;time+=11000;
  assert.equal(await (await empresaOrigin(request,env,origin)).text(),'new Pages content');
});
