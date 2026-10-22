import test from 'node:test';
import assert from 'node:assert/strict';
import {chrome,browserFixture,poll} from './helpers/support-browser.mjs';
test('admin sidebar loads authenticated queue badges on the dashboard, including compact navigation', {timeout:30000,skip:!chrome},async t=>{
  const mockAuth=`const auth={currentUser:{getIdToken:async()=> 'admin-test'}};const BACKEND_BASE_URL=location.origin;function onAuthStateChanged(_,fn){queueMicrotask(()=>fn(auth.currentUser));}`;
  const b=await browserFixture(t,{route:'/admin-painel.html',script:'/js/admin-nav-badges.js',mockAuth,
    api:async(method,url,body,headers)=>{
      assert.equal(headers.authorization,'Bearer admin-test');
      assert.equal(url.pathname,'/therapy/admin/notifications/counts');
      return {ok:true,counts:{apoio:{count:4},denuncias:{count:2},crpCrm:{count:1},estudante:{count:0},recemFormado:{count:0},semConselho:{count:0},leadsEstudante:{count:0},empresa:{count:0},empresas:{count:0},colaboradores:{count:0},repasses:{count:0},reembolsos:{count:0},nr1:{count:0},estudantes:{count:0}}};
    }});
  await poll(()=>b.evaluate('document.getElementById("navBadgeApoio")?.textContent === "4"'),'dashboard badges');
  assert.equal(await b.evaluate('document.getElementById("navBadgeApoio").classList.contains("ep-hide")'),false);
  assert.equal(await b.evaluate('document.getElementById("navBadgeDenuncias").textContent'),'2');
  await b.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.equal(await b.evaluate('(()=>{const b=document.getElementById("navBadgeApoio").getBoundingClientRect(),s=document.getElementById("epAdminSidebar").getBoundingClientRect();return b.left>=s.left && b.right<=s.right;})()'),true);
});
