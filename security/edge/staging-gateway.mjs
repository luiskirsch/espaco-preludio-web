const cookieName = '__Secure-ep_staging';
const encoder = new TextEncoder();
async function sign(value, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value)));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
async function equal(a,b) {
  const digest = async value => new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
  const [left,right] = await Promise.all([digest(a),digest(b)]);
  return left.reduce((diff,value,index)=>diff|(value^right[index]),0)===0;
}
export async function stagingGate(request, env, now=Date.now()) {
  if (!new URL(request.url).pathname.startsWith('/staging/')) return {allowed:true};
  const password=env?.STAGING_BASIC_PASSWORD || '';
  if(password.length<32) return {allowed:false,response:new Response('Homologação indisponível.',{status:503,headers:{'Cache-Control':'no-store'}})};
  const cookie=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
  const [expiry,signature]=cookie.split('.');
  if(/^\d+$/.test(expiry||'')&&Number(expiry)>now&&Number(expiry)<=now+8*3600_000&&signature&&await equal(signature,await sign('staging:'+expiry,password))) return {allowed:true};
  let basic='';
  try{const auth=request.headers.get('Authorization')||'';if(auth.startsWith('Basic ')&&auth.length<1024)basic=atob(auth.slice(6));}catch{}
  if(basic&&await equal(basic,(env.STAGING_BASIC_USER||'preludio')+':'+password)){
    const until=String(now+8*3600_000),token=until+'.'+await sign('staging:'+until,password);
    return {allowed:true,cookie:`${cookieName}=${token}; Path=/staging/; Max-Age=28800; Secure; HttpOnly; SameSite=Strict`};
  }
  return {allowed:false,response:new Response('Autenticação de homologação necessária.',{status:401,headers:{'WWW-Authenticate':'Basic realm="Preludio Homologacao", charset="UTF-8"','Cache-Control':'no-store'}})};
}
export async function stagingProxy(request, env, fetchOrigin=fetch) {
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/staging/api/'))return null;
  if(!env?.STAGING_API_TOKEN||env.STAGING_API_TOKEN.length<32)return new Response('Homologação indisponível.',{status:503});
  const upstream=new URL('https://api-staging.espacopreludio.com.br');
  upstream.pathname=url.pathname.slice('/staging/api'.length);upstream.search=url.search;
  const headers=new Headers(request.headers);headers.set('X-Staging-Token',env.STAGING_API_TOKEN);headers.delete('Cookie');headers.delete('Host');
  if(headers.get('Authorization')?.startsWith('Basic '))headers.delete('Authorization');
  const response=await fetchOrigin(new Request(upstream,request),{headers});
  const safe=new Headers(response.headers);safe.delete('Access-Control-Allow-Origin');safe.delete('Access-Control-Allow-Credentials');safe.set('Cache-Control','private, no-store');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers:safe,...(response.webSocket?{webSocket:response.webSocket}:{})});
}
