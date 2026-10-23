import test from 'node:test';
import assert from 'node:assert/strict';
import {chrome,browserFixture,poll} from './helpers/support-browser.mjs';
import {writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const options=api=>({route:'/app/home.html',script:'/app/daily-mood.js',mockAuth:"import {createWellbeingDialog} from './wellbeing-entry.js';",api});
async function mount(b){
 await poll(()=>b.evaluate('!!document.getElementById("moodPicker")'),'daily mood');
 await b.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await b.evaluate(`(async()=>{const {mountDailyMood}=await import('/app/daily-mood.js');window.mountMood=mountDailyMood;window.owner={uid:'synthetic-owner',getIdToken:async()=> 'synthetic-token'};window.current=true;window.daily=mountDailyMood({user:window.owner,backendUrl:location.origin,isCurrent:()=>window.current});await window.daily.ready;})()`);
}

test('home daily check-in requires descriptive answers, saves atomically, retries without losing responses and supports editing',{timeout:40000,skip:!chrome},async t=>{
 const writes=[];let fail=true;
 const b=await browserFixture(t,options(async(method,url,body)=>{
  if(method==='GET')return {ok:true,items:[]};
  writes.push({method,path:url.pathname,body});
  if(fail)return {status:503,body:{ok:false}};
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  return {ok:true,date,...(method==='POST'?{mood:body.mood,wellbeing:body.wellbeing}:{metrics:body})};
 }));
 await mount(b);
 const ev=b.evaluate,click=selector=>ev(`document.querySelector(${JSON.stringify(selector)}).click()`);
 await click('[data-mood="4"]');
 assert.equal(await ev('document.querySelector(".wbe-dialog").open'),true);
 assert.equal(writes.length,0,'choosing mood does not commit an incomplete day');
 assert.equal(await ev('document.querySelectorAll(".wbe-dialog input:checked").length'),0);
 assert.equal(await ev('document.querySelectorAll(".wbe-dialog input[type=radio]").length'),15);
 assert.equal(await ev('/pular/i.test(document.querySelector(".wbe-dialog").textContent)'),false);
 await click('.wbe-submit');assert.equal(writes.length,0);
 assert.equal(await ev('document.activeElement.name'),'anxiety');
 await click('input[name="anxiety"][value="0"]');
 await click('input[name="energy"][value="8"]');
 await click('input[name="sleep"][value="10"]');
 await click('.wbe-add-note');
 await ev(`document.getElementById('wbeNote').value='synthetic private note';`);
 for(const width of [1440,768,390,320]){
  await b.send('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:width<700});
  const size=await ev('new Promise(r=>requestAnimationFrame(()=>{const d=document.querySelector(".wbe-dialog"),b=d.getBoundingClientRect();r({overflow:d.scrollWidth>d.clientWidth,left:b.left,right:b.right,height:b.height,viewport:innerWidth});}))');
  assert.equal(size.overflow,false,`modal content fits at ${width}`);assert.ok(size.left>=0&&size.right<=size.viewport);assert.ok(size.height<=850);
 }
 await b.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 if(process.env.WELLBEING_PREVIEW==='1'){
  await b.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const shot=await b.send('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),'ep-daily-check-in.png'),Buffer.from(shot.data,'base64'));
 }
 await click('.wbe-submit');await poll(()=>ev('document.querySelector(".wbe-status").textContent.includes("tente novamente")'),'retry after failure');
 assert.equal(await ev('document.querySelector(".wbe-dialog").open'),true);
 assert.equal(await ev('document.querySelectorAll(".wbe-dialog input:checked").length'),3);
 assert.equal(await ev('document.getElementById("wbeNote").value'),'synthetic private note');
 fail=false;await click('.wbe-submit');await poll(()=>ev('!document.querySelector(".wbe-dialog").open'),'saved complete day');
 assert.deepEqual(writes[1],{method:'POST',path:'/therapy/paciente/humor',body:{mood:4,wellbeing:{anxiety:0,energy:8,sleep:10},note:'synthetic private note'}});
 assert.equal(await ev('document.querySelector("[data-mood=\\"4\\"]").disabled'),true);
 assert.equal(await ev('document.querySelectorAll(".wbe-dialog input:checked").length'),0,'sensitive modal answers clear after closing');
 await click('#moodWellbeing');assert.equal(await ev('document.querySelector(".wbe-note").hidden'),true);
 assert.equal(await ev('document.querySelector("input[name=sleep]:checked").value'),'10');
 await click('input[name="sleep"][value="8"]');await click('.wbe-submit');
 await poll(()=>ev('!document.querySelector(".wbe-dialog").open'),'edited daily well-being');
 assert.deepEqual(writes.at(-1),{method:'PATCH',path:'/therapy/paciente/humor/bem-estar',body:{anxiety:0,energy:8,sleep:8}});
 await click('#moodWellbeing');await click('.wbe-close');await poll(()=>ev('!document.querySelector(".wbe-dialog").open'),'close without saving');assert.equal(writes.length,3);
 await ev('window.daily.destroy()');assert.equal(await ev('!!document.querySelector(".wbe-dialog")'),false);
 assert.deepEqual(b.errors,[]);
});

test('check-in fits without modal scrolling and small screens require each answer before advancing',{timeout:30000,skip:!chrome},async t=>{
 const writes=[];
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const b=await browserFixture(t,options(async(method,url,body)=>{if(method==='GET')return {ok:true,items:[]};writes.push(body);return {ok:true,date,mood:body.mood,wellbeing:body.wellbeing};}));
 await mount(b);const ev=b.evaluate,click=s=>ev(`document.querySelector(${JSON.stringify(s)}).click()`);
 async function fits(label){
  const layout=await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const d=document.querySelector(".wbe-dialog"),box=d.getBoundingClientRect();r({scroll:d.scrollHeight>d.clientHeight+1,horizontal:d.scrollWidth>d.clientWidth+1,inside:box.top>=0&&box.bottom<=innerHeight,controls:[...d.querySelectorAll(".wbe-footer button:not([hidden])")].every(b=>{const r=b.getBoundingClientRect();return r.top>=box.top&&r.bottom<=box.bottom;})});})))');
  assert.deepEqual(layout,{scroll:false,horizontal:false,inside:true,controls:true},label);
 }
 await b.send('Emulation.setDeviceMetricsOverride',{width:320,height:568,deviceScaleFactor:1,mobile:true});
 await click('[data-mood="4"]');await fits('initial small screen');
 assert.equal(await ev('document.querySelectorAll(".wbe-question:not([hidden])").length'),1);
 await click('.wbe-next');assert.equal(writes.length,0);await fits('required answer feedback');
 assert.equal(await ev('document.querySelector(".wbe-question:not([hidden])").dataset.question'),'anxiety');
 await click('input[name="anxiety"][value="0"]');await click('.wbe-next');
 assert.equal(await ev('document.querySelector(".wbe-question:not([hidden])").dataset.question'),'energy');
 await click('.wbe-back');assert.equal(await ev('document.querySelector("input[name=anxiety]:checked").value'),'0');
 await click('.wbe-next');await click('input[name="energy"][value="5"]');await click('.wbe-next');
 await click('input[name="sleep"][value="8"]');await fits('last question');
 await click('.wbe-add-note');await fits('optional note');
 await ev('document.getElementById("wbeNote").value="synthetic note"');
 await click('.wbe-back');assert.equal(await ev('document.querySelectorAll(".wbe-dialog input:checked").length'),3);
 for(const [width,height] of [[1440,900],[1440,768],[1366,700],[1280,600],[768,1024],[390,844],[320,568],[844,390]]){
  await b.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
  await fits(`${width}x${height}`);
  if(process.env.WELLBEING_PREVIEW==='1'&&width===1440&&height===768){const shot=await b.send('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),'ep-daily-check-in-compact.png'),Buffer.from(shot.data,'base64'));}
 }
 await click('.wbe-submit');await poll(()=>ev('!document.querySelector(".wbe-dialog").open'),'complete check-in without scrolling');
 assert.deepEqual(writes,[{mood:4,wellbeing:{anxiety:0,energy:5,sleep:8},note:'synthetic note'}]);
 assert.deepEqual(b.errors,[]);
});

test('existing mood can complete wellbeing from home without another mood submission; leaving an unfinished modal saves nothing',{timeout:20000,skip:!chrome},async t=>{
 const writes=[];
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const b=await browserFixture(t,options(async(method,url,body)=>{if(method==='GET')return {ok:true,items:[{date,mood:4}]};writes.push({method,body});return {ok:true,date,metrics:body};}));
 await mount(b);const ev=b.evaluate,click=s=>ev(`document.querySelector(${JSON.stringify(s)}).click()`);
 assert.equal(await ev('document.querySelector(".wbe-dialog").open'),false);
 assert.ok(await ev('document.getElementById("moodWellbeing").textContent.includes("Completar")'));
 await click('#moodWellbeing');await click('input[name="energy"][value="8"]');await click('.wbe-close');
 await poll(()=>ev('!document.querySelector(".wbe-dialog").open'),'cancelled incomplete form');assert.equal(writes.length,0);
 await click('#moodWellbeing');assert.equal(await ev('document.querySelectorAll(".wbe-dialog input:checked").length'),0);
 for(const id of ['anxiety','energy','sleep'])await click(`input[name="${id}"][value="5"]`);
 await click('.wbe-submit');await poll(()=>ev('!document.querySelector(".wbe-dialog").open'),'completed legacy day');
 assert.deepEqual(writes,[{method:'PATCH',body:{anxiety:5,energy:5,sleep:5}}]);
 assert.deepEqual(b.errors,[]);
});
