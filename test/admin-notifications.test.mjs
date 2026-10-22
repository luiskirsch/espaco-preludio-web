import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../js/admin-nav-badges.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('export ','');
test('shared admin feed displays pending counts, combined finance queues, zero and errors',async()=>{
  const nodes=new Map();
  for(const id of ['navBadgeApoio','navBadgeRepasses','navBadgeEmpresa'])nodes.set(id,{textContent:'',dataset:{},classes:new Set(),setAttribute(){},classList:{toggle(key,value){const c=nodes.get(id).classes;value?c.add(key):c.delete(key);}}});
  let data={ok:true,counts:{apoio:{count:4},repasses:{count:2},reembolsos:{count:3},empresa:{count:0}}};
  const calls=[];
  const context=vm.createContext({auth:{},BACKEND_BASE_URL:'https://synthetic.test',onAuthStateChanged(){},document:{querySelectorAll:selector=>[...nodes].filter(([id])=>selector.split(',').map(s=>s.trim()).includes('#'+id)).map(([,el])=>el)},fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>data};},window:{addEventListener(){}},setInterval(){return 1;}});
  vm.runInContext(source,context);
  await vm.runInContext('refreshNavBadges("synthetic-token")',context);
  assert.equal(nodes.get('navBadgeApoio').textContent,'4');assert.equal(nodes.get('navBadgeRepasses').textContent,'5');
  assert.ok(nodes.get('navBadgeEmpresa').classes.has('ep-hide'));
  assert.equal(calls[0].options.cache,'no-store');assert.equal(calls[0].options.headers.Authorization,'Bearer synthetic-token');
  data={ok:true,counts:{apoio:{error:true}}};await vm.runInContext('refreshNavBadges("synthetic-token")',context);
  assert.equal(nodes.get('navBadgeApoio').textContent,'!');assert.ok(!nodes.get('navBadgeApoio').classes.has('ep-hide'));
});
