import test from 'node:test';
import assert from 'node:assert/strict';
import {chrome,browserFixture,poll} from './helpers/support-browser.mjs';
test('support action matches the journey and survey links under mouse hover', {timeout:30000,skip:!chrome},async t=>{
  const b=await browserFixture(t,{route:'/app/home.html',script:'/unused.js',mockAuth:'',api:async()=>({})});
  await poll(()=>b.evaluate('!!document.querySelector(".home-support-card__cta")'),'home markup');
  await b.evaluate(`(()=>{document.body.classList.add('a-portal-authenticated');document.getElementById('homeSupport').hidden=false;document.getElementById('homeJourney').innerHTML='<div class="home-journey-card__next"><a id="referenceJourney" href="./jornada.html">Começar <b>→</b></a></div>';document.getElementById('homeSurvey').innerHTML='<div class="home-survey-card"><div></div><div></div><a id="referenceSurvey" href="./nr1.html">Participar agora <b>→</b></a></div>';const s=document.createElement('style');s.textContent='*{transition:none!important}';document.head.append(s);})()`);
  await b.send('DOM.enable');await b.send('CSS.enable');const {root}=await b.send('DOM.getDocument');
  const styles=[];
  for(const selector of ['.home-support-card__cta','#referenceJourney','#referenceSurvey']){
    const {nodeId}=await b.send('DOM.querySelector',{nodeId:root.nodeId,selector});
    await b.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:['hover']});
    styles.push(await b.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),s=getComputedStyle(e),a=getComputedStyle(e.querySelector('b'));return {tag:e.tagName,color:s.color,transform:s.transform,filter:s.filter,background:s.backgroundColor,shadow:s.boxShadow,gap:s.gap,arrowBackground:a.backgroundColor,arrowRadius:a.borderRadius};})()`));
  }
  assert.deepEqual(styles[0],styles[1]);assert.deepEqual(styles[0],styles[2]);
  const diary=await b.send('DOM.querySelector',{nodeId:root.nodeId,selector:'.home-diary-card'});
  await b.send('CSS.forcePseudoState',{nodeId:diary.nodeId,forcedPseudoClasses:['hover']});
  const diaryStyle=await b.evaluate('(()=>{const s=getComputedStyle(document.querySelector(".home-diary-card__cta"));return {background:s.backgroundColor,transform:s.transform};})()');
  assert.equal(diaryStyle.background,'rgb(237, 196, 100)');
  assert.equal(diaryStyle.transform,'matrix(1, 0, 0, 1, 0, -2)');
});
