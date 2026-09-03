(function(){
  'use strict';
  if(typeof window==='undefined'||typeof window.fetch!=='function')return;

  const SUPABASE_ORIGIN='https://usrstcxiluvsizoxwlxj.supabase.co';
  const RETRYABLE_STATUS=new Set([408,425,429,502,503,504]);
  const IDEMPOTENT_POSTS=new Set(['snapshot_today']);
  const VERSION_EXEMPT_ACTIONS=new Set(['snapshot_today','close_day','audit','lookup','admin_login']);
  const SESSION_EXEMPT_ACTIONS=new Set(['admin_login','lookup']);
  const metrics={requests:0,retries:0,timeouts:0,offline_errors:0,conflicts:0,session_expired:0,last_latency_ms:null,last_error_code:null,last_success_at:null};
  const inflight=new Map();
  const bodyIds=new WeakMap();
  let bodySeq=0,recovering=false,lastFreshAt=0;

  const originalFetch=window.fetch.bind(window);
  const baseLoadAll=typeof window.loadAll==='function'?window.loadAll:null;
  const appState=()=>{try{return typeof A!=='undefined'?A:null}catch{return null}};
  const cid=()=>globalThis.crypto?.randomUUID?.()||`c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const isOnline=()=>typeof navigator==='undefined'||navigator.onLine!==false;
  const timeoutFor=(method,body)=>body instanceof FormData?45000:(method==='GET'||method==='HEAD'?12000:18000);

  function apiUrl(input){
    try{
      if(input instanceof Request)return null;
      const u=new URL(String(input),location.href);
      return u.origin===SUPABASE_ORIGIN&&u.pathname.startsWith('/functions/v1/campamento-')?u:null;
    }catch{return null}
  }
  function endpointSlug(u){return u.pathname.split('/').filter(Boolean).pop()||''}
  function fnv(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(36)}
  function bodyFingerprint(body){
    if(body==null)return'';
    if(typeof body==='string')return `s:${body.length}:${fnv(body)}`;
    if(typeof body==='object'){
      if(!bodyIds.has(body))bodyIds.set(body,++bodySeq);
      return `o:${bodyIds.get(body)}`;
    }
    return `${typeof body}:${fnv(String(body))}`;
  }
  function requestKey(u,method,body){const x=new URL(u);x.searchParams.delete('cid');return `${method}|${x.toString()}|${bodyFingerprint(body)}`}
  function mutation(method){return !['GET','HEAD','OPTIONS'].includes(method)}
  function shouldAttachVersion(u,method){
    if(!mutation(method))return false;
    const action=u.searchParams.get('action')||'';
    if(VERSION_EXEMPT_ACTIONS.has(action))return false;
    if(endpointSlug(u)==='campamento-consults-api')return false;
    return true;
  }
  function retryable(u,method){return method==='GET'||method==='HEAD'||(method==='POST'&&IDEMPOTENT_POSTS.has(u.searchParams.get('action')||''))}
  function markMetric(patch){Object.assign(metrics,patch)}
  function setBadge(text,kind='warn'){const el=document.querySelector('#syncBadge');if(!el)return;el.textContent=text;el.className=`status-pill ${kind}`}
  function markStale(reason='Sin conexión'){
    const state=appState();
    if(state?.data){
      setBadge(`${reason} · NO ACTUALIZADO`,'bad');
      const meta=document.querySelector('#systemMeta');
      if(meta&&!meta.textContent.includes('NO ACTUALIZADO'))meta.textContent=`${meta.textContent} · NO ACTUALIZADO`;
    }else setBadge(reason,'bad');
    document.documentElement.dataset.campNetwork='offline';
  }
  function markConflict(){
    const state=appState();
    setBadge('Cambios externos · ACTUALIZAR','bad');
    document.documentElement.dataset.campNetwork='conflict';
    if(state?.data){const meta=document.querySelector('#systemMeta');if(meta&&!meta.textContent.includes('NO ACTUALIZADO'))meta.textContent=`${meta.textContent} · NO ACTUALIZADO`}
  }
  function markFresh(){lastFreshAt=Date.now();document.documentElement.dataset.campNetwork='online';const meta=document.querySelector('#systemMeta');if(meta)meta.textContent=meta.textContent.replace(/ · NO ACTUALIZADO/g,'')}
  function expireSession(){metrics.session_expired++;sessionStorage.removeItem('camp_admin_token');document.dispatchEvent(new CustomEvent('camp:session-expired'))}
  function offlineError(){const e=new TypeError('Sin conexión. No se enviaron cambios.');e.code='OFFLINE';e.status=0;return e}
  function cloneInit(init={}){return {...init,headers:new Headers(init.headers||{})}}
  function makeController(externalSignal,timeout){
    const controller=new AbortController();let onAbort=null;
    if(externalSignal){onAbort=()=>controller.abort(externalSignal.reason);if(externalSignal.aborted)onAbort();else externalSignal.addEventListener('abort',onAbort,{once:true})}
    const timer=setTimeout(()=>controller.abort(new DOMException('Tiempo de espera agotado','AbortError')),timeout);
    return {signal:controller.signal,clear:()=>{clearTimeout(timer);if(externalSignal&&onAbort)externalSignal.removeEventListener('abort',onAbort)}};
  }
  async function captureStateVersion(u,res){
    if((u.searchParams.get('action')||'')!=='advanced_state'||!res.ok)return;
    try{const data=await res.clone().json();const state=appState();if(state&&data?.state_version)state.stateVersion=String(data.state_version)}catch{}
  }
  function advanceAfterMutation(u,method,res){
    if(!res.ok||!shouldAttachVersion(u,method))return;
    const state=appState();if(!state)return;
    const current=Number.parseInt(String(state.stateVersion||''),10);
    state.stateVersion=Number.isFinite(current)?String(current+1):null;
  }

  async function performCampFetch(u,init,method){
    const body=init.body,maxAttempts=retryable(u,method)?3:1,timeout=timeoutFor(method,body);let lastError;
    for(let attempt=1;attempt<=maxAttempts;attempt++){
      if(!isOnline()){metrics.offline_errors++;metrics.last_error_code='OFFLINE';markStale('Sin conexión');throw offlineError()}
      const attemptInit=cloneInit(init),ctl=makeController(init.signal,timeout);attemptInit.signal=ctl.signal;
      const started=performance.now();metrics.requests++;
      try{
        const res=await originalFetch(u.toString(),attemptInit);ctl.clear();metrics.last_latency_ms=Math.round(performance.now()-started);
        if(RETRYABLE_STATUS.has(res.status)&&attempt<maxAttempts){metrics.retries++;await wait(attempt===1?350:900);continue}
        const action=u.searchParams.get('action')||'';
        if(res.status===401&&!SESSION_EXEMPT_ACTIONS.has(action))expireSession();
        if(res.status===409){metrics.conflicts++;metrics.last_error_code='STATE_CONFLICT';markConflict()}
        else if(res.ok)markMetric({last_error_code:null,last_success_at:new Date().toISOString()});
        await captureStateVersion(u,res);advanceAfterMutation(u,method,res);return res;
      }catch(err){
        ctl.clear();lastError=err;
        if(err?.name==='AbortError'){metrics.timeouts++;metrics.last_error_code='TIMEOUT'}else metrics.last_error_code=err?.code||'NETWORK_ERROR';
        const networkish=err?.name==='AbortError'||err instanceof TypeError||err?.code==='OFFLINE';
        if(networkish&&attempt<maxAttempts&&isOnline()&&!init.signal?.aborted){metrics.retries++;await wait(attempt===1?350:900);continue}
        if(networkish)markStale(isOnline()?'Conexión inestable':'Sin conexión');throw err;
      }
    }
    throw lastError||new TypeError('Error de red');
  }

  window.fetch=function campResilientFetch(input,init={}){
    const u=apiUrl(input);if(!u)return originalFetch(input,init);
    const method=String(init.method||'GET').toUpperCase();if(!u.searchParams.has('cid'))u.searchParams.set('cid',cid());
    const state=appState();if(shouldAttachVersion(u,method)&&state?.stateVersion&&!u.searchParams.has('state_version'))u.searchParams.set('state_version',state.stateVersion);
    const key=requestKey(u,method,init.body);if(inflight.has(key))return inflight.get(key).then(res=>res.clone());
    const p=performCampFetch(u,init,method).finally(()=>inflight.delete(key));inflight.set(key,p);return p.then(res=>res.clone());
  };

  if(baseLoadAll){
    window.loadAll=async function resilientLoadAll(options={}){
      const state=appState();
      if(!isOnline()){markStale('Sin conexión');if(state?.data&&typeof window.showMessage==='function')window.showMessage('Sin conexión: se mantienen en pantalla los últimos datos cargados, marcados como NO ACTUALIZADOS. No se enviaron cambios.','error');return false}
      const ok=await baseLoadAll(options);if(ok)markFresh();else if(state?.data)markStale('No fue posible sincronizar');return ok;
    };
  }

  document.addEventListener('camp:session-expired',()=>{if(typeof window.logoutAdmin==='function')window.logoutAdmin()});
  window.addEventListener('offline',()=>markStale('Sin conexión'));
  window.addEventListener('online',()=>{
    document.documentElement.dataset.campNetwork='recovering';setBadge('Conexión recuperada · verificando','warn');
    if(recovering)return;recovering=true;
    setTimeout(async()=>{try{const state=appState();if(state?.token&&typeof window.loadAll==='function')await window.loadAll({snapshot:false})}finally{recovering=false}},500);
  });

  async function health(){
    const started=performance.now();
    try{const res=await window.fetch(`${SUPABASE_ORIGIN}/functions/v1/campamento-v560-safe?action=health`,{cache:'no-store'}),data=await res.json().catch(()=>({}));return {...data,ok:res.ok&&data?.ok!==false,client_latency_ms:Math.round(performance.now()-started),browser_online:isOnline(),last_fresh_at:lastFreshAt?new Date(lastFreshAt).toISOString():null}}
    catch(err){return {ok:false,status:'unreachable',browser_online:isOnline(),error_code:err?.code||'NETWORK_ERROR'}}
  }

  window.CampResilience={version:'2026.08.29-3',health,isOnline,getMetrics:()=>({...metrics,inflight:inflight.size,last_fresh_at:lastFreshAt?new Date(lastFreshAt).toISOString():null}),forceRefresh:()=>window.loadAll?.({snapshot:false})};
})();
