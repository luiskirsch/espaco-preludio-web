import {createWellbeingDialog} from './wellbeing-entry.js?h=2ad04c8200';
import {METRICS,windowRecords,summary,value,normalized} from './wellbeing-model.js?h=c004476f4f';
const number=n=>new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1}).format(n);
const short=date=>`${date.slice(8,10)}/${date.slice(5,7)}`;
export function createWellbeing(root){
 let records=[],today='',days=14,type='area',selected=new Set(METRICS.map(m=>m.id)),generation=0;
 root.classList.add('wb');root.setAttribute('aria-busy','true');
 root.innerHTML=`<header class="wb-head"><h2>↗ Evolução do bem-estar</h2><span class="wb-count" id="wbCount" role="status">Carregando registros…</span></header><div class="wb-metrics" id="wbMetrics"></div><p class="wb-help">Toque nos cards para mostrar ou ocultar métricas. Os valores são médias do período selecionado.</p><section class="wb-entry"><div><h3>Seu registro de hoje</h3><p class="wb-help" id="wbFormHelp">O registro de bem-estar acompanha seu humor na página inicial.</p></div><button type="button" class="wb-save" id="wbView" disabled>Ver registro de hoje</button><a href="./home.html" class="wb-save" id="wbStart" hidden>Registrar meu dia ↗</a></section><p class="wb-status" id="wbStatus" role="status" aria-live="polite"></p><div class="wb-toolbar"><div class="wb-controls" role="group" aria-label="Tipo de gráfico"><button type="button" data-chart="area" aria-pressed="true">↗ Área</button><button type="button" data-chart="bar" aria-pressed="false">▥ Barras</button><button type="button" data-chart="radar" aria-pressed="false">◇ Radar</button></div><div class="wb-controls" role="group" aria-label="Período da evolução">${[7,14,30].map(d=>`<button type="button" data-days="${d}" aria-pressed="${d===days}">${d} dias</button>`).join('')}</div></div><div class="wb-chart" id="wbChart"></div><div class="wb-legend" id="wbLegend"></div><p class="wb-help">Humor: média de 1 a 5, convertida para 0 a 10 no gráfico. Ansiedade, energia e sono: 0 a 10. Dias sem registro ficam em branco. Ansiedade mais alta significa maior intensidade.</p><details class="wb-data"><summary>Ver dados em tabela</summary><div class="wb-table-wrap" id="wbTable"></div></details>`;
 const $=id=>root.querySelector('#'+id);
 const entry=createWellbeingDialog();
 $('wbView').addEventListener('click',()=>{const item=records.find(item=>item.date===today);if(item)entry.open({readOnly:true,metrics:item.wellbeing,note:item.note,date:item.date,moodLabel:({1:'Mal',2:'Cansado',3:'Ok',4:'Bem',5:'Ótimo'})[item.mood]||''});});
 function empty(text){return `<div class="wb-chart-empty">${text}</div>`;}
 function render(){
  if(!today)return;
  const rows=windowRecords(records,today,days),metrics=METRICS.filter(m=>selected.has(m.id));
  const count=rows.filter(r=>r.item).length;
  $('wbCount').textContent=`${count} ${count===1?'registro':'registros'} em ${days} dias`;
  $('wbMetrics').innerHTML=METRICS.map(m=>{const s=summary(rows,m.id);return `<button type="button" class="wb-metric" data-metric="${m.id}" aria-pressed="${selected.has(m.id)}" aria-label="${m.label}: ${s.mean===null?'sem registro':number(s.mean)+' de '+m.max}. Mostrar ou ocultar no gráfico" style="--metric:${m.color};--soft:${m.soft}"><span class="wb-metric-top"><span class="wb-icon" aria-hidden="true">${m.icon}</span><span class="wb-trend">${s.trend}</span></span><span class="wb-value">${s.mean===null?'—':number(s.mean)} <small>/${m.max}</small></span><span class="wb-name">${m.label}</span></button>`;}).join('');
  root.querySelectorAll('[data-chart]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.chart===type)));
  root.querySelectorAll('[data-days]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.days)===days)));
  $('wbLegend').innerHTML=metrics.map(m=>`<span style="--metric:${m.color}"><i></i>${m.label}</span>`).join('');
  $('wbChart').innerHTML=!metrics.length?empty('Selecione uma métrica nos cards acima.'):!count?empty('Seu próximo registro começa esta evolução.<br>Registre seu humor no início para começar.'):chart(rows,metrics);
  $('wbTable').innerHTML=`<table class="wb-table"><caption>Registros do período · valores nas escalas originais</caption><thead><tr><th scope="col">Data</th>${metrics.map(m=>`<th scope="col">${m.label} /${m.max}</th>`).join('')}</tr></thead><tbody>${rows.filter(r=>r.item).map(r=>`<tr><th scope="row">${short(r.date)}/${r.date.slice(0,4)}</th>${metrics.map(m=>`<td>${value(r.item,m.id)??'Não informado'}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
 }
 function chart(rows,metrics){
  const W=Math.max(280,Math.min(1000,root.clientWidth-68)),H=300,L=32,R=18,T=20,B=36,w=W-L-R,h=H-T-B,y=n=>T+h-n*h/10;
  let content='';
  if(type==='radar'){
   const available=metrics.map(m=>({m,s:summary(rows,m.id)})).filter(e=>e.s.mean!==null);
   if(available.length<3)return empty('O radar precisa de pelo menos três métricas registradas e selecionadas.<br>Registre seu próximo dia no início para acompanhar estas métricas.');
   const cx=W/2,cy=H/2,r=Math.min(105,W/2-65),n=available.length;
   const point=(i,v)=>[cx+Math.sin(i*2*Math.PI/n)*r*v/10,cy-Math.cos(i*2*Math.PI/n)*r*v/10];
   for(const level of [2,4,6,8,10])content+=`<polygon points="${available.map((_,i)=>point(i,level).join(',')).join(' ')}" fill="none" stroke="#e0e6df"/>`;
   available.forEach(({m,s},i)=>{const p=point(i,10),label=point(i,12);content+=`<line x1="${cx}" y1="${cy}" x2="${p[0]}" y2="${p[1]}" stroke="#e0e6df"/><text x="${label[0]}" y="${label[1]}" text-anchor="middle" fill="${m.color}" font-size="12">${m.label} · ${number(s.mean)}/${m.max}</text>`;});
   const points=available.map(({m,s},i)=>point(i,normalized(s.mean,m.id)).join(',')).join(' ');
   content+=`<polygon points="${points}" fill="#357a6529" stroke="#357a65" stroke-width="2"/><text x="${cx}" y="${H-4}" text-anchor="middle" fill="#6b7b70" font-size="11">Médias do período · intensidade de cada métrica</text>`;
  }else{
   const x=i=>L+(type==='bar'?(i+.5)*w/rows.length:i*w/(rows.length-1));
   for(const level of [0,2,4,6,8,10])content+=`<line x1="${L}" y1="${y(level)}" x2="${W-R}" y2="${y(level)}" stroke="#e4e9e2" stroke-dasharray="4 5"/><text x="${L-12}" y="${y(level)+4}" text-anchor="end" fill="#7b897f" font-size="11">${level}</text>`;
   rows.forEach((row,i)=>{if(i===0||i===rows.length-1||i%Math.ceil(rows.length/(W<500?4:7))===0)content+=`<text x="${x(i)}" y="${H-9}" text-anchor="middle" fill="#7b897f" font-size="11">${short(row.date)}</text>`;});
   metrics.forEach((m,mi)=>{
    const title=(row,n)=>`${short(row.date)} · ${m.label}: ${n}/${m.max}`;
    if(type==='bar'){
     const group=w/rows.length,bw=Math.min(18,(group-6)/metrics.length);
     rows.forEach((row,i)=>{const raw=value(row.item,m.id);if(raw===null)return;const n=normalized(raw,m.id);content+=`<rect x="${x(i)-bw*metrics.length/2+mi*bw}" y="${y(n)}" width="${Math.max(1,bw-1)}" height="${Math.max(1,y(0)-y(n))}" rx="2" fill="${m.color}" opacity=".8"><title>${title(row,raw)}</title></rect>`;});
    }else{
     const segments=[];let current=[];
     rows.forEach((row,i)=>{const raw=value(row.item,m.id);if(raw===null){if(current.length)segments.push(current);current=[];return;}current.push({x:x(i),y:y(normalized(raw,m.id)),row,raw});});if(current.length)segments.push(current);
     content+=`<defs><linearGradient id="wb-fill-${m.id}" x1="0" x2="0" y1="0" y2="1"><stop stop-color="${m.color}" stop-opacity=".2"/><stop offset="1" stop-color="${m.color}" stop-opacity=".01"/></linearGradient></defs>`;
     segments.forEach(segment=>{if(segment.length>1){const path=segment.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ');content+=`<path d="${path} L${segment.at(-1).x},${y(0)} L${segment[0].x},${y(0)} Z" fill="url(#wb-fill-${m.id})"/><path d="${path}" fill="none" stroke="${m.color}" stroke-width="2.5"/>`;}segment.forEach(p=>{content+=`<circle cx="${p.x}" cy="${p.y}" r="4" fill="${m.color}"><title>${title(p.row,p.raw)}</title></circle>`;});});
    }
   });
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolução do bem-estar em ${days} dias. Dados detalhados na tabela abaixo.">${content}</svg>`;
 }
 root.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.metric){const id=button.dataset.metric;selected.has(id)?selected.delete(id):selected.add(id);render();root.querySelector(`[data-metric="${id}"]`)?.focus();}
  if(button.dataset.chart){type=button.dataset.chart;render();}
  if(button.dataset.days){days=Number(button.dataset.days);render();}
 });
 if(typeof ResizeObserver==='function'){let width=0;new ResizeObserver(()=>{const next=Math.round(root.clientWidth);if(next!==width){width=next;render();}}).observe(root);}
 return {
  update(items,date){records=items;today=date;root.setAttribute('aria-busy','false');render();const item=items.find(i=>i.date===today);const canSave=value(item,'mood')!==null;$('wbView').disabled=!canSave;$('wbView').hidden=!canSave;$('wbStart').hidden=canSave;$('wbFormHelp').textContent=canSave?'Seu registro foi salvo e está disponível apenas para consulta.':'Escolha seu humor na página inicial para registrar ansiedade, energia e sono no mesmo momento.';if(items.some(i=>i.wellbeingUnavailable))this.error('Algumas métricas não puderam ser carregadas. Tente atualizar a página.');},
  error(message){root.setAttribute('aria-busy','false');$('wbStatus').classList.add('is-error');$('wbStatus').textContent=message;},
  reset(){generation++;entry.reset();records=[];today='';$('wbCount').textContent='Carregando registros…';$('wbChart').replaceChildren();$('wbMetrics').replaceChildren();$('wbTable').replaceChildren();$('wbLegend').replaceChildren();$('wbStatus').textContent='';$('wbView').disabled=true;$('wbView').hidden=false;$('wbStart').hidden=true;root.setAttribute('aria-busy','true');}
 };
}
