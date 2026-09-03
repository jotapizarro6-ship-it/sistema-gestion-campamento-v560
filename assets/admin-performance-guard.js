(()=>{
  'use strict';
  if(typeof window==='undefined'||typeof A==='undefined'||window.__CAMP_ADMIN_PERFORMANCE_GUARD__)return;
  window.__CAMP_ADMIN_PERFORMANCE_GUARD__=true;

  const VERSION='20260829-adminperf1';
  const SUPABASE_HOST=window.GARPI_ENV.supabaseHost;
  const API_TIMEOUT_GET=15000;
  const API_TIMEOUT_POST=30000;
  const API_TIMEOUT_UPLOAD=60000;
  const now=()=>typeof performance!=='undefined'&&performance.now?performance.now():Date.now();

  function activeView(){
    return window.CampProgressiveAdminRender?.activeView?.()||A.currentView||String(location.hash||'#overview').replace(/^#/,'')||'overview';
  }

  function isSupabaseFunction(input){
    try{const u=new URL(typeof input==='string'?input:input?.url,location.href);return u.hostname===SUPABASE_HOST&&u.pathname.includes('/functions/v1/')}catch{return false}
  }
  function requestTimeout(input,init={}){
    const method=String(init?.method||'GET').toUpperCase();
    let upload=false;try{const u=new URL(typeof input==='string'?input:input?.url,location.href);upload=u.pathname.includes('/campamento-upload-api')}catch{}
    return upload?API_TIMEOUT_UPLOAD:(method==='GET'||method==='HEAD'||method==='OPTIONS'?API_TIMEOUT_GET:API_TIMEOUT_POST);
  }
  function recoveryStatusRequest(input,init={}){
    if(String(init?.method||'GET').toUpperCase()!=='GET')return false;
    try{const u=new URL(typeof input==='string'?input:input?.url,location.href);return u.hostname===SUPABASE_HOST&&u.pathname.includes('/campamento-recovery-api')&&u.searchParams.get('action')==='status'}catch{return false}
  }

  let recoveryStatusCache=null;
  if(typeof window.fetch==='function'&&!window.__CAMP_API_TIMEOUT_FETCH__){
    window.__CAMP_API_TIMEOUT_FETCH__=true;
    const baseFetch=window.fetch.bind(window);
    window.fetch=async(input,init={})=>{
      if(recoveryStatusRequest(input,init)&&activeView()!=='exports'&&typeof Response!=='undefined'){
        const payload=recoveryStatusCache||{ok:true,data:{tests:[]}};
        return new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json; charset=utf-8','x-camp-suppressed':'hidden-recovery-status'}});
      }
      if(!isSupabaseFunction(input))return baseFetch(input,init);
      const controller=new AbortController(),external=init?.signal;
      const abortExternal=()=>controller.abort(external?.reason||new DOMException('Abortado','AbortError'));
      if(external){if(external.aborted)abortExternal();else external.addEventListener('abort',abortExternal,{once:true})}
      const timeout=requestTimeout(input,init),timer=setTimeout(()=>controller.abort(new DOMException('Tiempo de espera agotado','TimeoutError')),timeout);
      try{
        const res=await baseFetch(input,{...init,signal:controller.signal});
        if(recoveryStatusRequest(input,init)&&activeView()==='exports')res.clone().json().then(x=>{if(x?.ok)recoveryStatusCache=x}).catch(()=>{});
        return res;
      }catch(err){
        if(controller.signal.aborted&&!external?.aborted){const e=new Error('La conexión con el servidor tardó demasiado. Reintenta la operación.');e.name='CampamentoTimeoutError';e.cause=err;throw e}
        throw err;
      }finally{
        clearTimeout(timer);external?.removeEventListener?.('abort',abortExternal);
      }
    };
  }

  // Evita dos cargas principales simultáneas si el usuario pulsa Actualizar mientras aún sincroniza.
  if(typeof advApi==='function'&&!advApi.__campStateDedupe){
    const baseAdvApi=advApi;let statePromise=null;
    const wrapped=function(action,opts={}){
      const method=String(opts?.method||'GET').toUpperCase();
      if(action!=='advanced_state'||method!=='GET')return baseAdvApi(action,opts);
      if(statePromise)return statePromise;
      statePromise=Promise.resolve(baseAdvApi(action,opts)).finally(()=>{statePromise=null});
      return statePromise;
    };
    wrapped.__campStateDedupe=true;advApi=wrapped;
  }

  function rendererScope(fn){
    let src='';try{src=Function.prototype.toString.call(fn)}catch{}
    if(src.includes('view-control-room'))return new Set(['control-room']);
    if(src.includes('view-governance')&&!src.includes('renderSemaphore'))return new Set(['governance']);
    if(src.includes('renderSemaphore')&&src.includes('renderRecovery'))return new Set(['overview','governance','exports','management']);
    return null;
  }
  function renderOpsCharts(view){
    try{
      if(view==='control-room')window.CampOpsECharts?.renderActions?.();
      else if(view==='planning')window.CampOpsECharts?.renderPlanning?.();
    }catch(err){console.warn('[Campamento] Gráfico operacional diferido:',err)}
  }

  if(window.CampOps&&!window.CampOps.__campScopedRendering){
    window.CampOps.__campScopedRendering=true;
    const originalRenderers=()=>Array.isArray(A.opsRenderers)?A.opsRenderers:[];
    window.CampOps.renderOpsViews=function(view=activeView()){
      const started=now();
      for(const fn of originalRenderers()){
        if(typeof fn!=='function')continue;
        const scope=rendererScope(fn);if(scope&&!scope.has(view))continue;
        try{fn()}catch(err){console.error('[Campamento] Renderer operacional',err)}
      }
      window.CampOps.applyProfileUi?.();renderOpsCharts(view);
      const elapsed=now()-started;if(elapsed>120)console.info(`[Campamento] Capa operacional ${view}: ${Math.round(elapsed)} ms`);
    };

    const baseLoadOps=window.CampOps.loadOpsState;let opsPromise=null;
    if(typeof baseLoadOps==='function')window.CampOps.loadOpsState=function(){
      if(opsPromise)return opsPromise;
      opsPromise=Promise.resolve(baseLoadOps()).finally(()=>{opsPromise=null});return opsPromise;
    };
  }

  // Observabilidad ligera, equivalente al enfoque de Performance Analyzer: informa tareas largas sin bloquear la interfaz.
  try{
    if(typeof PerformanceObserver!=='undefined'&&PerformanceObserver.supportedEntryTypes?.includes('longtask')){
      const observer=new PerformanceObserver(list=>{for(const e of list.getEntries())if(e.duration>=150)console.info(`[Campamento] Tarea larga detectada: ${Math.round(e.duration)} ms`)});
      observer.observe({entryTypes:['longtask']});
    }
  }catch{}

  window.CampAdminPerformance={VERSION,activeView,rendererScope,requestTimeout};
})();
