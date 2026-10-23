export const METRICS=[
 {id:'mood',label:'Humor',icon:'😊',color:'#8060cb',soft:'#f4f0ff',max:5},
 {id:'anxiety',label:'Ansiedade',icon:'😰',color:'#b34c83',soft:'#fff1f7',max:10},
 {id:'energy',label:'Energia',icon:'⚡',color:'#16866c',soft:'#ecfaf5',max:10},
 {id:'sleep',label:'Sono',icon:'🌙',color:'#377cc1',soft:'#eff5ff',max:10}
];
export function shift(date,days){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
export function value(item,id){const n=id==='mood'?item?.mood:item?.wellbeing?.[id];return Number.isInteger(n)&&n>= (id==='mood'?1:0)&&n<=(id==='mood'?5:10)?n:null;}
export function normalized(n,id){return n===null?null:id==='mood'?(n-1)*2.5:n;}
export function windowRecords(items,today,days){
 const map=new Map();
 for(const item of items){if(!/^\d{4}-\d{2}-\d{2}$/.test(item.date)||item.date>today)continue;const old=map.get(item.date);if(!old||(item.at||0)>=(old.at||0))map.set(item.date,item);}
 return Array.from({length:days},(_,index)=>{const date=shift(today,index-days+1);return {date,item:map.get(date)||null};});
}
export function summary(rows,id){
 const values=rows.map(row=>value(row.item,id)).filter(n=>n!==null);
 if(!values.length)return {mean:null,count:0,trend:'Sem registro'};
 const mean=values.reduce((a,b)=>a+b,0)/values.length;
 if(values.length<4)return {mean,count:values.length,trend:'Sem comparação'};
 const middle=Math.floor(values.length/2),a=values.slice(0,middle),b=values.slice(middle);
 const delta=normalized(b.reduce((x,y)=>x+y,0)/b.length,id)-normalized(a.reduce((x,y)=>x+y,0)/a.length,id);
 return {mean,count:values.length,trend:Math.abs(delta)<0.5?'Estável':delta>0?'Aumentou':'Diminuiu'};
}
