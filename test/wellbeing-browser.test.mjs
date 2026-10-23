import test from 'node:test';
import assert from 'node:assert/strict';
import {chrome,browserFixture,poll} from './helpers/support-browser.mjs';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
test('well-being: real records, missing values, chart toggles, periods, saving and responsive layout',{timeout:40000,skip:!chrome},async t=>{
 const b=await browserFixture(t,{route:'/app/humor.html',script:'/app/wellbeing.js',mockAuth:"import {METRICS,windowRecords,summary,value,normalized} from './wellbeing-model.js'; import {createWellbeingDialog} from './wellbeing-entry.js';",api:async()=>({})});
 await poll(()=>b.evaluate('!!document.getElementById("wellbeingSection")'),'well-being section');
 await b.evaluate(`(async()=>{document.body.classList.add('a-route-humor');const {createWellbeing}=await import('/app/wellbeing.js');window.records=[{date:'2026-10-16',mood:4,wellbeing:{anxiety:5,energy:0}},{date:'2026-10-22',mood:5,wellbeing:{anxiety:5,energy:0}}];window.widget=createWellbeing(document.getElementById('wellbeingSection'),{save:async metrics=>{window.saved=metrics;window.records[1].wellbeing=metrics;window.widget.update(window.records,'2026-10-22');}});window.widget.update(window.records,'2026-10-22');})()`);
 const ev=b.evaluate,click=s=>ev(`document.querySelector(${JSON.stringify(s)}).click()`);
 assert.equal(await ev('document.querySelectorAll(".wb-metric").length'),4);
 assert.ok(await ev('document.querySelector("[data-metric=energy] .wb-value").textContent.includes("0,0")'));
 assert.ok(await ev('document.querySelector("[data-metric=sleep] .wb-value").textContent.includes("—")'));
 assert.equal(await ev('!!document.querySelector("#wbChart svg")'),true);
 assert.equal(await ev('!!document.getElementById("historyList")'),false);
 if(process.env.WELLBEING_PREVIEW==='1'){
  await b.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const clip=await ev('(()=>{const b=document.getElementById("wellbeingSection").getBoundingClientRect();return {x:b.left+scrollX,y:b.top+scrollY,width:b.width,height:b.height,scale:1};})()');
  const shot=await b.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip});
  await writeFile(join(tmpdir(),'ep-wellbeing-preview.png'),Buffer.from(shot.data,'base64'));
 }
 await click('[data-chart="bar"]');assert.ok(await ev('document.querySelectorAll("#wbChart rect").length>0'));
 await click('[data-chart="radar"]');assert.ok(await ev('document.querySelectorAll("#wbChart polygon").length>0'));
 await click('[data-metric="anxiety"]');assert.ok(await ev('document.getElementById("wbChart").textContent.includes("pelo menos três")'));
 await click('[data-metric="anxiety"]');await click('[data-chart="area"]');await click('[data-days="7"]');
 assert.equal(await ev('document.querySelector("[data-days=\\"7\\"]").getAttribute("aria-pressed")'),'true');
 await b.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await click('#wbView');
 assert.equal(await ev('document.querySelector(".wbe-dialog").open'),true);
 assert.equal(await ev('document.querySelector(".wbe-submit").hidden'),true);
 assert.equal(await ev('document.querySelectorAll(".wbe-record article").length'),3);
 assert.equal(await ev('document.querySelectorAll(".wbe-dialog input:not(:disabled)").length'),0);
 await ev('document.querySelector(".wbe-form").requestSubmit()');assert.equal(await ev('window.saved===undefined'),true);
 await click('.wbe-done');
 for(const width of [1440,768,390,320]){
  await b.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<700});
  await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth'),true,`no horizontal overflow ${width}`);
 }
 await ev('window.widget.reset()');assert.equal(await ev('document.getElementById("wbTable").textContent'),'');
 assert.equal(await ev('document.querySelector(".wbe-dialog").open'),false);
 assert.equal(await ev('document.querySelectorAll(".wbe-dialog input:checked").length'),0);
 assert.deepEqual(b.errors,[]);
});
