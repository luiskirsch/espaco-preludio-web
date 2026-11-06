import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserFixture, chrome, poll } from './helpers/support-browser.mjs';
import { parseRosterCsv, rosterCsv } from '../js/corporate-csv.js';

test('CSV import respects quoted separators, BOM, CRLF and rejects malformed rows and spreadsheet formulas on export',()=>{
  const rows=parseRosterCsv('\uFEFFnome;email;departamento\r\n"Ana; Silva";ana@example.test;"Equipe ""A"""\r\n');
  assert.deepEqual(rows,[{nome:'Ana; Silva',email:'ana@example.test',departamento:'Equipe "A"'}]);
  assert.equal(parseRosterCsv('nome,email\nAna,ana@example.test')[0].nome,'Ana');
  assert.throws(()=>parseRosterCsv('nome;email\nAna;"not closed'),/aspas/);
  assert.throws(()=>parseRosterCsv('nome;email\nAna;ana@example.test;extra'),/colunas/);
  assert.throws(()=>parseRosterCsv('nome;email\n'+Array.from({length:101},()=> 'Ana;a@example.test').join('\n')),/100/);
  assert.match(rosterCsv(['nome'],[['=HYPERLINK("bad")']]),/'=HYPERLINK/);
});

test('HR browser supports admission, approval, offboarding, readmission, import, indicators and mobile navigation', {skip:!chrome,timeout:90000}, async t=>{
  const records=[
    {id:'ana',nome:'Ana Paula Ribeiro',email:'ana@example.test',status:'ativo',employmentType:'clt',departamento:'Operações',cargo:'Analista',benefitEligible:true,admissionDate:'2026-01-02',version:1},
    {id:'bia',nome:'Beatriz Souza',email:'bia@example.test',status:'pendente',employmentType:null,departamento:'Pessoas',benefitEligible:false,version:1},
    {id:'carlos',nome:'Carlos Lima',email:'carlos@example.test',status:'inativo',employmentType:'pj',departamento:'Tecnologia',benefitEligible:false,version:1}
  ];
  const events=[],writes=[];
  const response=body=>({body:{ok:true,...body}});
  const {evaluate:ev,send,errors,base}=await browserFixture(t,{route:'/empresa-painel.html',script:'/js/empresa-gestao.js',
    mockAuth:`const BACKEND_BASE_URL=location.origin; sessionStorage.setItem('ep:empresa:token','fixture'); import {parseRosterCsv,rosterCsv} from '/js/corporate-csv.js';`,
    api:async(method,url,body)=>{
      if(url.pathname==='/empresa/dashboard')return response({kpis:{sessoesMes:0,taxaAdesao:0,sessoesTotal:0},especialidades:{},periodo:'2026-11',geradoEm:Date.now()});
      if(url.pathname.endsWith('/movimentacoes'))return response({items:events,nextCursor:null});
      if(url.pathname.endsWith('/importar/preview'))return response({valid:true,rows:body.rows.map((item,i)=>({line:i+2,item,error:null})),summary:{disponiveis:10}});
      if(url.pathname.endsWith('/importar')){writes.push(body);const added=body.rows.map((r,i)=>({...r,id:`import${i}`,status:'pendente',version:1}));records.push(...added);return response({items:added});}
      if(method==='PATCH'){
        writes.push(body);const item=records.find(r=>r.id===url.pathname.split('/').at(-1));
        Object.assign(item,body,{version:item.version+1});
        if(body.action==='approve'||body.action==='reactivate')Object.assign(item,{status:'ativo',benefitEligible:true});
        if(body.action==='deactivate')Object.assign(item,{status:'inativo',benefitEligible:false});
        events.unshift({id:'e'+events.length,type:body.action==='deactivate'?'desligamento':body.action==='reactivate'?'readmissao':'aprovacao',nome:item.nome,email:item.email,actor:'rh@example.test',createdAt:Date.now(),after:{...item}});
        return response({item});
      }
      if(method==='POST') {const item={...body,id:'new'+records.length,version:1,benefitEligible:body.status==='ativo'};records.push(item);return response({item});}
      const status=url.searchParams.get('status')||'all',q=url.searchParams.get('q')||'',department=url.searchParams.get('departamento')||'';
      const items=records.filter(r=>(status==='all'||r.status===status)&&(!q||r.nome.toLowerCase().includes(q))&&(!department||r.departamento===department));
      return response({items,total:items.length,page:1,summary:{total:records.length,ativo:records.filter(r=>r.status==='ativo').length,pendente:records.filter(r=>r.status==='pendente').length,inativo:records.filter(r=>r.status==='inativo').length,elegiveis:records.filter(r=>r.benefitEligible).length,ocupadas:records.filter(r=>r.status!=='inativo').length,limite:30,disponiveis:30-records.filter(r=>r.status!=='inativo').length},departments:['Operações','Pessoas','Tecnologia'],company:{nome:'Prelúdio Software Systems LTDA',benefitActive:true},registrationPath:'/colaborador-cadastro.html?empresa=preludio'});
    }});
  const click=selector=>ev(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fill=(selector,value)=>ev(`document.querySelector(${JSON.stringify(selector)}).value=${JSON.stringify(value)}`);
  const wait=expression=>poll(()=>ev(expression),expression,16000);
  await wait('document.getElementById("countTotal").textContent==="3"');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await ev('document.fonts.ready');
  const desktop=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
  await writeFile(join(tmpdir(),'ep-empresa-gestao-desktop.png'),Buffer.from(desktop.data,'base64'));
  await click('[data-action="approve"][data-id="bia"]');await fill('#actionEmployment','clt');await click('#actionConfirm');await click('#confirmAction');
  await wait('!document.getElementById("actionDialog").open');assert.equal(records[1].benefitEligible,true);
  await click('#btnAdd');await fill('#memberName','Diana Costa');await fill('#memberEmail','diana@example.test');await click('#saveMember');
  await wait('document.getElementById("countTotal").textContent==="4"');assert.equal(records.at(-1).status,'pendente');
  await click('[data-edit="ana"]');await fill('#memberForm [name="departamento"]','Financeiro');await click('#saveMember');
  await wait('!document.getElementById("memberDialog").open');assert.equal(records[0].departamento,'Financeiro');
  await click('[data-action="deactivate"][data-id="ana"]');await click('#actionConfirm');await click('#confirmAction');
  await wait('!document.getElementById("actionDialog").open');assert.equal(records[0].status,'inativo');
  await click('[data-action="reactivate"][data-id="ana"]');await click('#actionConfirm');await click('#confirmAction');
  await wait('!document.getElementById("actionDialog").open');assert.equal(records[0].status,'ativo');
  await click('#btnInvite');assert.equal(await ev('document.getElementById("inviteLink").value'),base+'/colaborador-cadastro.html?empresa=preludio');await click('#inviteDialog [data-close]');
  const folder=await mkdtemp(join(tmpdir(),'ep-roster-csv-'));t.after(()=>rm(folder,{recursive:true,force:true}));
  const file=join(folder,'colaboradores.csv');await writeFile(file,'nome;email\nEduardo Teste;eduardo@example.test');
  await click('#btnImport');const document=await send('DOM.getDocument');const input=await send('DOM.querySelector',{nodeId:document.root.nodeId,selector:'#importFile'});await send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[file]});
  await wait('!document.getElementById("commitImport").disabled');await click('#commitImport');await wait('!document.getElementById("importDialog").open');assert.equal(records.at(-1).email,'eduardo@example.test');
  await click('[data-view="analytics"]');await wait('document.getElementById("kpiSessoesMes").textContent==="0"');assert.match(await ev('document.getElementById("specialties").textContent'),/Nenhuma consulta/);
  await click('[data-view="history"]');await wait('document.querySelectorAll(".history-item").length===4');
  await click('[data-view="people"]');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.equal(await ev('document.documentElement.scrollWidth<=window.innerWidth'),true);
  assert.equal(await ev('document.getElementById("btnSair").getBoundingClientRect().height>0'),true);
  assert.equal(await ev('document.querySelector("[data-edit=ana]").getBoundingClientRect().right<=window.innerWidth'),true);
  const mobile=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile(join(tmpdir(),'ep-empresa-gestao-mobile.png'),Buffer.from(mobile.data,'base64'));
  await send('Emulation.setDeviceMetricsOverride',{width:320,height:740,deviceScaleFactor:1,mobile:true});
  assert.equal(await ev('document.documentElement.scrollWidth<=window.innerWidth'),true);
  assert.equal(writes.filter(w=>w.action==='deactivate').length,1);assert.deepEqual(errors,[]);
});
