import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../app/home.html',import.meta.url),'utf8');
const start=html.indexOf('  async function loadSupport(user)');
const code=html.slice(start,html.indexOf('  onAuthStateChanged(auth',start));
async function cardState({requests=[],enabled=true,historyError=false,stale=false}){
  const label={setAttribute(key,value){this[key]=value;},innerHTML:''};
  const card={hidden:true,querySelector:()=>label};
  const user={uid:'synthetic-user'};
  const context=vm.createContext({activeSkyUser:stale?null:user,document:{getElementById:()=>card},
    portalApi:async(_,path)=>{
      if(path.includes('/requests')) {if(historyError)throw Error('network failure');return {items:requests};}
      return {companies:[{config:{enabled,careEnabled:enabled}}]};
    }});
  vm.runInContext(code,context);context.user=user;
  await vm.runInContext('loadSupport(user)',context);
  return {card,label};
}
test('home support card prioritizes tracking an existing request even when the channel is paused',async()=>{
  for(const enabled of [true,false]){
    const {card,label}=await cardState({enabled,requests:[{id:'request-one',status:'open'}]});
    assert.equal(card.hidden,false);assert.match(label.innerHTML,/Acompanhar pedido/);
    assert.equal(card.href,'./apoio.html#requestsTitle');assert.equal(label['data-i18n-html'],'p-app-home:acompanhar_pedido');
  }
});
test('home support card offers a new request only with a configured route and no previous requests',async()=>{
  const {card,label}=await cardState({});assert.equal(card.hidden,false);assert.match(label.innerHTML,/Pedir apoio/);
  assert.equal((await cardState({enabled:false})).card.hidden,true);
});
test('failed history lookup does not invite duplicate requests and late account responses stay hidden',async()=>{
  const {card,label}=await cardState({historyError:true});assert.equal(card.hidden,false);assert.match(label.innerHTML,/Abrir central/);
  assert.equal((await cardState({stale:true,requests:[{id:'private-request'}]})).card.hidden,true);
});
