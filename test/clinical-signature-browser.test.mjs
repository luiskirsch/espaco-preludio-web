import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from 'acorn';
import { simple } from 'acorn-walk';
import { chrome, browserFixture, poll } from './helpers/support-browser.mjs';

for (const page of ['receita', 'documento']) {
  test(`${page}: A1 sends explicit credentials once, clears inputs and never delivers a rejected signature`, { skip: !chrome, timeout: 25000 }, async t => {
    const requests = [];
    const b = await browserFixture(t, { route: `/${page}.html`, script: '/unused.js', mockAuth: '',
      api: async (method, url, body) => {
        requests.push({method,path:url.pathname,body});
        return requests.length === 1 ? { status:422,body:{ok:false,error:'ASSINATURA_OU_CADEIA_INVALIDA'} } : {ok:true,deliveryToken:'synthetic-response-only',deliveryTokenExp:123};
      } });
    const ev = b.evaluate;
    await poll(()=>ev('!!document.getElementById("signA1Btn")'),'signing controls');
    const html = await readFile(new URL(`../${page}.html`,import.meta.url),'utf8');
    const source = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
    let handler, upload, encode;
    simple(parse(source,{ecmaVersion:'latest',sourceType:'module'}),{
      CallExpression(n){if(n.callee.type==='MemberExpression'&&n.callee.object.name==='signA1Btn'&&n.callee.property.name==='addEventListener')handler=source.slice(n.start,n.end);},
      FunctionDeclaration(n){if(n.id.name==='uploadSigned')upload=source.slice(n.start,n.end);if(n.id.name==='bytesToBase64')encode=source.slice(n.start,n.end);}
    });
    assert.ok(handler&&upload&&encode);
    await ev(`const BACKEND_BASE_URL=location.origin,idToken='synthetic-token';
      const signA1Btn=document.getElementById('signA1Btn'),signA1Status=document.getElementById('signA1Status');
      const pendingPdfBytes=new Uint8Array([37,80,68,70]);let receitaId='one',documentoId='one',receitaState='draft';
      const setStatus=(el,text)=>{el.textContent=text;};
      const showDelivery=token=>{window.delivery=token;};
      ${encode}\n${upload}\n${handler};`);
    const fillAndClick = () => ev(`(()=>{const files=new DataTransfer();files.items.add(new File(['synthetic-not-a-certificate'],'test.pfx'));
      document.getElementById('pfxFile').files=files.files;document.getElementById('pfxPass').value='synthetic-password';
      document.getElementById('signerCpf').value='123.456.789-01';signA1Btn.click();})()`);
    await fillAndClick();
    await poll(()=>ev('!signA1Btn.disabled && signA1Status.textContent.includes("validada")'),'rejected signature');
    assert.equal(await ev('window.delivery||null'),null);
    assert.equal(await ev('document.getElementById("pfxPass").value'),'');
    assert.equal(await ev('document.getElementById("pfxFile").files.length'),0);
    assert.equal(requests[0].body.signatureMethod,'a1_server');
    assert.equal(requests[0].body.signerCpf,'12345678901');
    assert.equal(requests[0].body.certPassword,'synthetic-password');
    assert.equal(requests[0].body.pdfBase64,'JVBERg==');
    await fillAndClick();
    await poll(()=>ev('window.delivery === "synthetic-response-only"'),'server-approved delivery');
    assert.equal(await ev('document.getElementById("pfxPass").value'),'');
  });
}

test('TISS editor uses completed sessions and requires the actual SP/SADT requester', {skip:!chrome,timeout:25000},async t=>{
  const b=await browserFixture(t,{route:'/tiss.html',script:'/unused.js',mockAuth:'',api:async()=>({ok:true})});
  const ev=b.evaluate;
  await poll(()=>ev('!!document.getElementById("btnPrepararGuia")'),'TISS controls');
  await ev(`(async()=>{const {mountTissGuideEditor}=await import('/js/tiss-guide-editor.js');
    window.calls=[];window.saved=0;
    mountTissGuideEditor({onSaved:async()=>{window.saved++;},api:async(path,options)=>{
      if(options){window.calls.push({path,body:JSON.parse(options.body)});return{ok:true};}
      return path.includes('/sessoes')?{sessions:[{sessionId:'done',patientName:'Synthetic',status:'completed',scheduledAt:1},{sessionId:'future',status:'scheduled',scheduledAt:2}]}:{convenios:[{code:'insurer',nome:'Synthetic insurer',enabled:true}]};
    }});document.getElementById('btnPrepararGuia').click();})()`);
  await poll(()=>ev('document.querySelector("dialog select[name=session]").options.length===1'),'completed sessions');
  assert.equal(await ev('document.querySelector("dialog select[name=session]").value'),'done');
  assert.equal(await ev('document.querySelector("dialog input[name=nome]").required'),true);
  await ev(`(()=>{const form=document.querySelector('dialog form');for(const [key,value] of Object.entries({numeroCarteira:'1234',tussCode:'50000462',tussLabel:'Therapy',valorProcedimento:'60',nome:'Synthetic Requester',conselho:'CRM',numero:'12345',uf:'MG',cbos:'225125',codigoPrestador:'111',nomeContratado:'Synthetic Provider'}))form.elements[key].value=value;form.requestSubmit();})()`);
  await poll(()=>ev('window.saved===1'),'saved SP/SADT guide');
  const sent=await ev('window.calls[0]');
  assert.equal(sent.path,'/therapy/sessao/done/tiss/marcar');
  assert.equal(sent.body.tipoGuia,'sadt');assert.equal(sent.body.valorProcedimento,60);
  assert.equal(sent.body.solicitante.nome,'Synthetic Requester');
  assert.equal(sent.body.numeroCarteira,'1234');
});
