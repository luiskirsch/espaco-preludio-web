import test from 'node:test';
import assert from 'node:assert/strict';
import { stagingGate, stagingProxy } from '../security/edge/staging-gateway.mjs';
import { handleRequest, applyPortalHeaders } from '../security/edge/worker.mjs';
import { isPublicSiteFile } from '../scripts/build-public-site.mjs';
import { publicPhotoUrl } from '../js/public-profile.js';
import { createClinicalFetch } from '../js/twofa-session.js';
const env={STAGING_BASIC_PASSWORD:'synthetic-password-only-123456789000',STAGING_BASIC_USER:'preludio',STAGING_API_TOKEN:'synthetic-server-token-only-1234567890'};
test('staging requires authentication and only a valid login issues a secure scoped cookie',async()=>{
 const url='https://espacopreludio.com.br/staging/painel.html';
 assert.equal((await stagingGate(new Request(url),env)).response.status,401);
 assert.equal((await stagingGate(new Request(url),{})).response.status,503);
 const login=await stagingGate(new Request(url,{headers:{Authorization:'Basic '+btoa('preludio:'+env.STAGING_BASIC_PASSWORD)}}),env);
 assert.ok(login.allowed);assert.match(login.cookie,/Path=\/staging\//);assert.match(login.cookie,/HttpOnly; SameSite=Strict/);
 const cookie=login.cookie.split(';')[0];
 assert.equal((await stagingGate(new Request(url,{headers:{Cookie:cookie,Authorization:'Bearer firebase-identity'}}),env)).allowed,true);
 assert.equal((await stagingGate(new Request(url,{headers:{Cookie:cookie+'tampered'}}),env)).allowed,false);
 assert.equal((await stagingGate(new Request(url,{headers:{Cookie:cookie}}),env,Date.now()+9*3600_000)).allowed,false);
});
test('staging proxy preserves Firebase identity but never exposes its server credential',async()=>{
 const request=new Request('https://espacopreludio.com.br/staging/api/therapy/profissional/me',{headers:{Authorization:'Bearer firebase-identity',Cookie:'private-cookie','X-Staging-Token':'forged'}});
 const response=await stagingProxy(request,env,async(req,options)=>{
   assert.equal(req.url,'https://api-staging.espacopreludio.com.br/therapy/profissional/me');
   assert.equal(options.headers.get('Authorization'),'Bearer firebase-identity');
   assert.equal(options.headers.get('X-Staging-Token'),env.STAGING_API_TOKEN);assert.equal(options.headers.has('Cookie'),false);
   return new Response('{"ok":true}',{headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
 });
 assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);assert.equal(response.headers.has('X-Staging-Token'),false);
});
test('repository-only files are excluded from deployment and denied at the edge',async()=>{
 for(const path of ['package.json','package-lock.json','staging/package.json','scripts/sync-staging.mjs','test/spec.test.mjs','security/edge/worker.mjs','.env','.github/workflows/publish.yml']){
  assert.equal(isPublicSiteFile(path),false,path);
  const response=await handleRequest(new Request('https://espacopreludio.com.br/'+path),()=>{throw Error('must not fetch private source');});
  assert.equal(response.status,404,path);
 }
 for(const path of ['index.html','staging/app/buscar.html','js/firebase-config.js','i18n/locales/pt-BR/perfil.json','fonts/inter.woff2'])assert.equal(isPublicSiteFile(path),true,path);
 const result=applyPortalHeaders(new Response('css',{headers:{'Content-Type':'text/css','Access-Control-Allow-Origin':'*'}}),new Request('https://espacopreludio.com.br/css/app.css'));
 assert.equal(result.headers.has('Access-Control-Allow-Origin'),false);
});
test('public photos accept only signed API paths',()=>{
 assert.equal(publicPhotoUrl({photoUrl:'/public/profissionais/synthetic/foto?t=valid.token'},'https://api.espacopreludio.com.br'),'https://api.espacopreludio.com.br/public/profissionais/synthetic/foto?t=valid.token');
 for(const url of ['https://evil.invalid/photo','javascript:alert(1)','/public/profissionais/a/foto?t=bad"injection'])assert.equal(publicPhotoUrl({photoUrl:url},'https://api.espacopreludio.com.br'),'');
});
test('staging API fetch retains the gateway cookie without forwarding it cross-origin',async()=>{
 const calls=[];const fetch=createClinicalFetch({fetch:async(_input,options)=>{calls.push(options);return new Response('{}');},backend:'https://espacopreludio.com.br/staging/api',location:{href:'https://espacopreludio.com.br/staging/painel.html',pathname:'/staging/painel.html',search:'',hash:''},storage:{getItem:()=>null}});
 await fetch('https://espacopreludio.com.br/staging/api/therapy/profissional/me');assert.equal(calls[0].credentials,'same-origin');
 await fetch('https://foreign.invalid/therapy/me');assert.equal(calls[1].credentials,undefined);
});
