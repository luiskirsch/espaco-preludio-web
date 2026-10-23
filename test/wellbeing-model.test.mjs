import test from 'node:test';
import assert from 'node:assert/strict';
import {windowRecords,summary,value,normalized} from '../app/wellbeing-model.js';
test('well-being windows preserve gaps, zero values and the original mood scale',()=>{
 const rows=windowRecords([{date:'2026-10-16',mood:4,wellbeing:{energy:0}},{date:'2026-10-22',mood:5},{date:'2026-10-23',mood:1}],'2026-10-22',7);
 assert.equal(rows.length,7);assert.equal(rows[1].item,null);assert.equal(value(rows[0].item,'energy'),0);assert.equal(value(rows[0].item,'sleep'),null);
 assert.equal(summary(rows,'mood').mean,4.5);assert.equal(summary(rows,'energy').mean,0);assert.equal(summary(rows,'sleep').mean,null);
 assert.equal(summary(rows,'mood').trend,'Sem comparação');assert.equal(normalized(1,'mood'),0);assert.equal(normalized(5,'mood'),10);
});
test('trend requires enough observations and compares the two halves of actual records',()=>{
 const rows=windowRecords([1,2,4,5].map((mood,i)=>({date:`2026-10-${19+i}`,mood})),'2026-10-22',14);
 assert.equal(summary(rows,'mood').trend,'Aumentou');assert.equal(summary(rows,'mood').count,4);
 for(const invalid of [NaN,Infinity,'5',-1,11])assert.equal(value({wellbeing:{sleep:invalid}},'sleep'),null);
});
