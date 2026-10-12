import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, writeFileSync } from 'node:fs';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const chromePath = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].find(candidate => candidate && existsSync(candidate));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };

function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, 'http://localhost');
      const pathname = decodeURIComponent(requestUrl.pathname);
      const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const file = resolve(root, relative);
      if (!file.startsWith(root)) throw new Error('invalid path');
      let body = await readFile(file);
      if (extname(file) === '.html') body = body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<meta[^>]+http-equiv="refresh"[^>]*>/gi, '').replace('<html ', '<html class="guard-ok" ');
      response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404).end('not found');
    }
  });
  return new Promise(resolveStarted => server.listen(0, '127.0.0.1', () => resolveStarted(server)));
}

async function poll(fn, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  throw new Error('browser timeout');
}

async function connectCdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.onopen = resolveOpen;
    socket.onerror = rejectOpen;
  });
  let sequence = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const entry = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  };
  const send = (method, params = {}) => new Promise((resolveMessage, rejectMessage) => {
    const id = ++sequence;
    pending.set(id, { resolve: resolveMessage, reject: rejectMessage });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  // O override responde antes do relayout; medir em seguida Ã s vezes pegava a
  // geometria do viewport anterior (teste de login intermitente).
  const sendAndSettle = async (method, params = {}) => {
    const result = await send(method, params);
    if (method === 'Emulation.setDeviceMetricsOverride') {
      await evaluate('new Promise(resolve => { requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))); setTimeout(() => resolve(true), 500); })');
    }
    return result;
  };
  return { socket, send: sendAndSettle, evaluate };
}


if (!chromePath) throw new Error('Chrome/Edge required; set CHROME_PATH.');
const server = await startServer();
const userData = await mkdtemp(join(tmpdir(), 'ep-mobile-audit-'));
const port = 18000 + Math.floor(Math.random() * 1000);
const browser = spawn(chromePath,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port='+port,'--user-data-dir='+userData,'about:blank'],{stdio:'ignore'});
let cdp;
try {
 const page = await poll(async()=> (await fetch('http://127.0.0.1:'+port+'/json/list').then(r=>r.json())).find(p=>p.type==='page'));
 cdp = await connectCdp(page.webSocketDebuggerUrl); await cdp.send('Page.enable'); await cdp.send('Network.enable'); await cdp.send('Network.setBlockedURLs',{urls:['https://*','http://fonts.*']});
 const {readdir} = await import('node:fs/promises');
 const allPages = [...(await readdir(root)).filter(p=>p.endsWith('.html')), ...(await readdir(join(root,'app'))).filter(p=>p.endsWith('.html')).map(p=>'app/'+p),'baixar/index.html'];
 const pages = process.argv.includes('--focus') ? ['app/humor.html','profissional.html'] : allPages; const failures=[];
 let dialogCount=0;
 const viewports = process.argv.includes('--tablet') ? [[768,1024],[844,390],[899,440]] : process.argv.includes('--focus') ? [[320,568]] : [[320,568],[375,667],[390,844],[440,956],[667,375],[768,1024],[844,390],[899,440],[1440,900]];
 for(const [width,height] of viewports) {
  await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<768});
  for(const file of pages){
   await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'+file});
   await poll(()=>cdp.evaluate('!!document.body && location.pathname === '+JSON.stringify('/'+file)+' && document.readyState === "complete"')); await cdp.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
   const result=await cdp.evaluate(`(()=>{const w=document.documentElement.clientWidth;return {width:w,scroll:document.documentElement.scrollWidth, details:document.documentElement.scrollWidth>w+2?[...document.body.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>w+2).slice(0,10).map(e=>({cls:e.className,id:e.id,right:e.getBoundingClientRect().right})):[], overflow:[...document.body.querySelectorAll('*')].filter(e=>{let r=e.getBoundingClientRect(),s=getComputedStyle(e);let clipped=false; for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){if(['hidden','clip','auto','scroll'].includes(getComputedStyle(p).overflowX)){clipped=true;break;}} return !clipped&&r.width&&r.right>w+2&&s.position!=='fixed'&&!e.closest('[class*="modal"], [class*="nav"], [class*="calendar"], [class*="cal-"], [class*="table"], [class*="scroll"]')}).slice(0,8).map(e=>({tag:e.tagName,cls:e.className,id:e.id,right:Math.round(e.getBoundingClientRect().right)}))}})()`);
   if(result.scroll>result.width+2||result.overflow.length)failures.push({file,width,...result}); if(width===375||width===667) {
    const dialogs=await cdp.evaluate(`(()=>{let failures=[],count=0;for(const modal of document.querySelectorAll('.ep-modal')){modal.classList.add('is-open');const panel=modal.querySelector('.ep-modal__panel');if(panel&&getComputedStyle(modal).display!=='none'){count++;let r=panel.getBoundingClientRect();if(r.width&& (r.left< -1||r.right>innerWidth+1||r.bottom>innerHeight+1||r.top< -1||panel.scrollWidth>panel.clientWidth+2))failures.push({id:modal.id,left:r.left,right:r.right,top:r.top,bottom:r.bottom,scroll:panel.scrollWidth,width:panel.clientWidth});}modal.classList.remove('is-open');}return {count,failures};})()`);
    dialogCount+=dialogs.count; if(dialogs.failures.length)failures.push({file,width,height,dialogs:dialogs.failures});
   }
  }
  console.log('Audited '+pages.length+' pages at '+width+'px');
 }
 writeFileSync('docs/mobile-audit.json',JSON.stringify({pages:pages.length,viewports,layouts:pages.length*viewports.length,dialogs:dialogCount,mode:'Local HTML/CSS fixtures; application scripts and external requests disabled. Chrome emulation, not physical Safari devices.',failures},null,2)); console.log('Findings: '+failures.length+'; dialogs checked: '+dialogCount); if(failures.length)process.exitCode=1;
} finally {cdp?.socket.close();browser.kill();server.close();await new Promise(r=>setTimeout(r,700));await rm(userData,{recursive:true,force:true,maxRetries:10,retryDelay:300});}

