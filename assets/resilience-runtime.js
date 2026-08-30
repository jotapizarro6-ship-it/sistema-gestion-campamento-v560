(function(){
  'use strict';
  if(typeof window==='undefined')return;

  const RETRYABLE_STATUS=new Set([408,425,429,502,503,504]);
  const IDEMPOTENT_POSTS=new Set(['snapshot_today']);
  const CONCURRENCY_ADV_EXEMPT=new Set(['snapshot_today','close_day']);
  const CONCURRENCY_WEB_ACTIONS=new Set(['save_worker','upload_excel']);
  const metrics={requests:0,retries:0,timeouts:0,offline_errors:0,conflicts:0,session_expired:0,last_latency_ms:null,last_error_code:null,last_success_at:null};
  const inflight=new Map();
  let recovering=false;
  let lastFreshAt=0;

  const baseWebApi=window.webApi;
  const baseAdvApi=window.advApi;
  const baseLoadAll=window.loadAll;
  if(typeof baseWebApi!=='function'||typeof baseAdvApi!=='function')return;

  const cid=()=>globalThis.crypto?.randomUUID?.()||`c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const isOnline=()=>typeof navigator==='undefined'||navigator.onLine!==false;
  const stableBody=body=>{try{return JSON.stringify(body??{})}catch{return String(body??'')}};
  const requestKey=(api,action,method,body,file)=>`${api}|${action}|${method}|${file?.name||''}|${stableBody(body)}`;
  const apiBase=api=>api==='web'?window.WEB_API||'https://usrstcxiluvsizoxwlxj.supabase.co/functions/v1/campamento-web-api':window.ADV_API||'https://usrstcxiluvsizoxwlxj.supabase.co/functions/v1/campamento-v560-safe';
  const timeoutFor=(method,file)=>file?45000:(method==='GET'?12000:18000);

  function markMetric(patch){Object.assign(metrics,patch)}
  function setBadge(text,kind='warn'){
    const el=document.querySelector('#syncBadge');if(!el)return;
    el.textContent=text;el.className=`status-pill ${kind}`;
  }
  function markStale(reason='Sin conexión'){
    if(window.A?.data){
      setBadge(`${reason} · NO ACTUALIZADO`,'bad');
      const meta=document.querySelector('#systemMeta');
      if(meta&&!meta.textContent.includes('NO ACTUALIZADO'))meta.textContent=`${meta.textContent} · NO ACTUALIZADO`;
    }else setBadge(reason,'bad');
    document.documentElement.dataset.campNetwork='offline';
  }
  function markFresh(){
    lastFreshAt=Date.now();
    document.documentElement.dataset.campNetwork='online';
    const meta=document.querySelector('#systemMeta');
    if(meta)meta.textContent=meta.textContent.replace(/ · NO ACTUALIZADO/g,'');
  }
  function expireSession(){
    metrics.session_expired++;
    sessionStorage.removeItem('camp_admin_token');
    document.dispatchEvent(new CustomEvent('camp:session-expired'));
  }

  async function parseResponse(res){
    const text=await res.text();let data;
    try{data=JSON.parse(text)}catch{data={ok:false,error:text||`HTTP ${res.status}`}}
    if(res.status===401){expireSession();const e=new Error('Sesión expirada. Vuelve a ingresar.');e.status=401;e.code='SESSION_EXPIRED';throw e}
    if(res.status===409){metrics.conflicts++;const e=new Error(data?.error||'La base cambió en otra sesión. Actualiza antes de guardar.');e.status=409;e.code=data?.code||'STATE_CONFLICT';e.current_state_version=data?.current_state_version||null;throw e}
    if(!res.ok||data?.ok===false){const e=new Error(data?.error||data?.detail||`Error HTTP ${res.status}`);e.status=res.status;e.code=data?.code||`HTTP_${res.status}`;throw e}
    return data;
  }

  async function rawRequest(api,action,{method='GET',body=null,token=null,file=null,stateVersion=null}={}){
    if(!isOnline()){
      metrics.offline_errors++;metrics.last_error_code='OFFLINE';
      const e=new Error('Sin conexión. No se enviaron cambios.');e.code='OFFLINE';e.status=0;throw e;
    }
    const headers={};if(token)headers.Authorization=`Bearer ${token}`;
    const params=new URLSearchParams({action,cid:cid()});
    if(stateVersion)params.set('state_version',stateVersion);
    let payload;
    if(file){payload=new FormData();payload.append('file',file)}
    else if(method!=='GET'&&method!=='HEAD'){headers['Content-Type']='application/json';payload=JSON.stringify(body??{})}
    const retryableMethod=method==='GET'||method==='HEAD'||(method==='POST'&&IDEMPOTENT_POSTS.has(action));
    const maxAttempts=retryableMethod?3:1;
    const timeout=timeoutFor(method,file);
    let lastError;
    for(let attempt=1;attempt<=maxAttempts;attempt++){
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(new DOMException('Timeout','AbortError')),timeout);
      const started=performance.now();metrics.requests++;
      try{
        const res=await fetch(`${apiBase(api)}?${params.toString()}`,{method,headers,body:payload,signal:controller.signal,cache:'no-store'});
        clearTimeout(timer);metrics.last_latency_ms=Math.round(performance.now()-started);
        if(RETRYABLE_STATUS.has(res.status)&&attempt<maxAttempts){metrics.retries++;await wait(attempt===1?350:900);continue}
        const data=await parseResponse(res);markMetric({last_error_code:null,last_success_at:new Date().toISOString()});return data;
      }catch(err){
        clearTimeout(timer);lastError=err;
        if(err?.name==='AbortError'){metrics.timeouts++;metrics.last_error_code='TIMEOUT'}
        else metrics.last_error_code=err?.code||'NETWORK_ERROR';
        const networkish=err?.name==='AbortError'||err instanceof TypeError||err?.code==='OFFLINE';
        if(networkish&&attempt<maxAttempts&&isOnline()){metrics.retries++;await wait(attempt===1?350:900);continue}
        throw err;
      }
    }
    throw lastError||new Error('Error de red');
  }

  async function ensureStateVersion(token){
    if(window.A?.stateVersion)return window.A.stateVersion;
    const state=await rawRequest('adv','advanced_state',{token});
    if(window.A){window.A.stateVersion=state.state_version||null;if(state.data&&!window.A.data)window.A.data=state.data}
    return state.state_version||null;
  }

  async function resilientWebApi(action,opts={}){
    const method=opts.method||'GET';
    let stateVersion=null;
    if(method!=='GET'&&method!=='HEAD'&&CONCURRENCY_WEB_ACTIONS.has(action)&&opts.token)stateVersion=await ensureStateVersion(opts.token);
    const key=requestKey('web',action,method,opts.body,opts.file);
    if(inflight.has(key))return inflight.get(key);
    const p=rawRequest('web',action,{...opts,method,stateVersion}).finally(()=>inflight.delete(key));
    inflight.set(key,p);
    const data=await p;
    if(stateVersion&&window.A)window.A.stateVersion=null;
    return data;
  }

  async function resilientAdvApi(action,opts={}){
    const method=opts.method||'GET';
    let stateVersion=null;
    if(method!=='GET'&&method!=='HEAD'&&!CONCURRENCY_ADV_EXEMPT.has(action)&&opts.token)stateVersion=await ensureStateVersion(opts.token);
    const key=requestKey('adv',action,method,opts.body,null);
    if(inflight.has(key))return inflight.get(key);
    const p=rawRequest('adv',action,{...opts,method,stateVersion}).finally(()=>inflight.delete(key));
    inflight.set(key,p);
    const data=await p;
    if(action==='advanced_state'&&window.A)window.A.stateVersion=data.state_version||null;
    else if(stateVersion&&window.A)window.A.stateVersion=null;
    return data;
  }

  window.webApi=resilientWebApi;
  window.advApi=resilientAdvApi;

  if(typeof baseLoadAll==='function'){
    window.loadAll=async function resilientLoadAll(options={}){
      if(!isOnline()){
        markStale('Sin conexión');
        if(window.A?.data&&typeof window.showMessage==='function')window.showMessage('Sin conexión: se mantienen en pantalla los últimos datos cargados, marcados como NO ACTUALIZADOS. No se enviaron cambios.','error');
        return false;
      }
      const ok=await baseLoadAll(options);
      if(ok){markFresh();if(window.A?.stateVersion==null){try{const s=await resilientAdvApi('advanced_state',{token:window.A?.token});window.A.stateVersion=s.state_version||null}catch{}}}
      else if(window.A?.data)markStale('No fue posible sincronizar');
      return ok;
    };
  }

  document.addEventListener('camp:session-expired',()=>{
    if(typeof window.logoutAdmin==='function')window.logoutAdmin();
  });
  window.addEventListener('offline',()=>markStale('Sin conexión'));
  window.addEventListener('online',()=>{
    document.documentElement.dataset.campNetwork='recovering';
    setBadge('Conexión recuperada · verificando','warn');
    if(recovering)return;recovering=true;
    setTimeout(async()=>{try{if(window.A?.token&&typeof window.loadAll==='function')await window.loadAll({snapshot:false})}finally{recovering=false}},500);
  });

  async function health(){
    const started=performance.now();
    try{const data=await rawRequest('adv','health',{method:'GET'});return {...data,client_latency_ms:Math.round(performance.now()-started),browser_online:isOnline(),last_fresh_at:lastFreshAt?new Date(lastFreshAt).toISOString():null}}
    catch(err){return {ok:false,status:'unreachable',browser_online:isOnline(),error_code:err?.code||'NETWORK_ERROR'}}
  }

  window.CampResilience={
    version:'2026.08.29-1',
    health,
    isOnline,
    getMetrics:()=>({...metrics,inflight:inflight.size,last_fresh_at:lastFreshAt?new Date(lastFreshAt).toISOString():null}),
    forceRefresh:()=>window.loadAll?.({snapshot:false})
  };
})();
