(()=>{
  'use strict';
  if(typeof window==='undefined'||typeof A==='undefined'||window.__CAMP_OPERATIONS_CORE__)return;
  window.__CAMP_OPERATIONS_CORE__=true;

  const CONTROL_API=window.GARPI_ENV.functionUrl('campamento-control-api');
  const PROFILE_KEY='camp_session_profile_v1';
  const RESILIENCE_KEY='camp_resilience_summary_v1';
  const AUDIT_QUEUE_KEY='camp_audit_queue_v1';
  const validProfiles=['ADMINISTRADOR','OPERADOR','JEFATURA'];
  const getProfile=()=>{const p=(sessionStorage.getItem(PROFILE_KEY)||'ADMINISTRADOR').toUpperCase();return validProfiles.includes(p)?p:'ADMINISTRADOR'};

  A.profile=getProfile();
  A.ops=A.ops||{actions:[],plan_events:[],scenarios:[],audit:[]};
  A.opsOffline=false;
  A.opsLastSync='';
  A.opsRenderers=A.opsRenderers||[];

  async function controlApi(action,{method='GET',body=null}={}){
    const headers={'Content-Type':'application/json'};
    if(A.token)headers.Authorization=`Bearer ${A.token}`;
    const payload=method==='GET'?undefined:JSON.stringify({...body,profile:A.profile});
    const res=await fetch(`${CONTROL_API}?action=${encodeURIComponent(action)}`,{method,headers,body:payload});
    const text=await res.text();let data;try{data=JSON.parse(text)}catch{data={ok:false,error:text||`HTTP ${res.status}`}}
    if(res.status===401){const e=new Error('Sesión expirada. Vuelve a ingresar.');e.status=401;throw e}
    if(!res.ok||data?.ok===false){const e=new Error(data?.error||data?.detail||`Error HTTP ${res.status}`);e.status=res.status;throw e}
    return data;
  }

  function safeParse(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'')||fallback}catch{return fallback}}
  function safeStore(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}}

  function aggregateSnapshot(){
    if(!A.data)return null;
    const an=analytics(A.data),actions=A.ops?.actions||[],plan=A.ops?.plan_events||[];
    return {
      saved_at:new Date().toISOString(),
      source_file:A.data.settings?.source_file||'',
      last_update:A.data.settings?.last_update||'',
      capacity:an.effectiveCapacity,
      occupied:an.occupied,
      reserved:an.reservedToday,
      free:an.free,
      committed_pct:an.committedPct,
      forecast:an.forecast.slice(0,7).map(x=>({date:x.date,pct:x.pct,free:x.free,over:x.over})),
      actions:{pending:actions.filter(x=>['PENDIENTE','EN_GESTION'].includes(x.status)).length,critical:actions.filter(x=>x.severity==='CRITICO'&&x.status!=='RESUELTO'&&x.status!=='CANCELADO').length},
      milestones:plan.filter(x=>!['COMPLETADO','CANCELADO'].includes(x.status)&&x.start_date>=todayISO()).slice(0,8).map(x=>({title:x.title,start_date:x.start_date,status:x.status}))
    };
  }

  function renderResilienceBanner(show=false){
    const content=document.querySelector('.content');if(!content)return;
    let el=document.getElementById('opsResilienceBanner');
    if(!el){el=document.createElement('div');el.id='opsResilienceBanner';el.className='ops-resilience-banner hidden';const msg=document.getElementById('globalMessage');msg?.insertAdjacentElement('afterend',el)}
    if(!show){el.classList.add('hidden');el.innerHTML='';return}
    const c=safeParse(RESILIENCE_KEY,null);if(!c)return;
    el.classList.remove('hidden');
    el.innerHTML=`<strong>Modo resiliente · última lectura válida</strong><span>${esc(new Date(c.saved_at).toLocaleString('es-CL'))} · ${fmtInt(c.occupied)} ocupadas · ${fmtInt(c.free)} libres · ${fmt1(c.committed_pct)}% comprometido.</span><small>Resumen agregado de respaldo; no sustituye una sincronización en línea.</small>`;
  }

  async function auditNow(event){return await controlApi('audit',{method:'POST',body:event})}
  function auditQueue(){return safeParse(AUDIT_QUEUE_KEY,[])}
  function queueAudit(event){const q=auditQueue();q.push({...event,queued_at:new Date().toISOString()});safeStore(AUDIT_QUEUE_KEY,q.slice(-50))}
  async function flushAuditQueue(){const q=auditQueue();if(!q.length||A.opsOffline)return;const remain=[];for(const event of q){try{await auditNow(event)}catch{remain.push(event)}}safeStore(AUDIT_QUEUE_KEY,remain)}
  function emitAudit(event){auditNow(event).catch(()=>queueAudit(event))}

  async function loadOpsState(){
    try{
      const r=await controlApi('state');A.ops=r.data||{actions:[],plan_events:[],scenarios:[],audit:[]};
      A.ops.actions=A.ops.actions||[];A.ops.plan_events=A.ops.plan_events||[];A.ops.scenarios=A.ops.scenarios||[];A.ops.audit=A.ops.audit||[];
      A.opsOffline=false;A.opsLastSync=new Date().toISOString();
      const agg=aggregateSnapshot();if(agg)safeStore(RESILIENCE_KEY,agg);
      renderResilienceBanner(false);flushAuditQueue();return true;
    }catch(err){A.opsOffline=true;renderResilienceBanner(true);console.warn('Centro de Control sin conexión:',err);return false}
  }

  function registerRenderer(fn){if(typeof fn==='function'&&!A.opsRenderers.includes(fn))A.opsRenderers.push(fn)}
  function renderOpsViews(){for(const fn of A.opsRenderers){try{fn()}catch(e){console.error('ops renderer',e)}}applyProfileUi();try{window.CampOpsECharts?.renderAll?.()}catch(_){}}

  function ensureProfileBadge(){
    let badge=document.getElementById('profileBadge');if(badge)return badge;
    const host=document.querySelector('.top-actions');if(!host)return null;
    badge=document.createElement('button');badge.id='profileBadge';badge.type='button';badge.className='ops-profile-badge';badge.title='Perfil activo de la sesión';host.insertAdjacentElement('afterbegin',badge);
    badge.addEventListener('click',()=>{const b=document.querySelector('.nav-btn[data-view="governance"]');if(b)switchView('governance')});return badge;
  }
  function setDisabled(root,disabled){if(!root)return;root.querySelectorAll('button,input,select,textarea').forEach(el=>{if(el.dataset?.opsLocal==='1'||el.dataset?.profileSwitch==='1')return;el.disabled=!!disabled})}
  function enforceLegacyPermissions(){
    const p=A.profile;
    const adminOnly=['#excelForm','#capacityForm','#costForm'];
    const writeSections=['#reservationForm','#blockForm','#movementForm'];
    adminOnly.forEach(s=>setDisabled(document.querySelector(s),p!=='ADMINISTRADOR'));
    document.querySelectorAll('#closeDayBtn').forEach(b=>b.disabled=p!=='ADMINISTRADOR');
    document.querySelectorAll('[data-resstatus],[data-closeblock]').forEach(b=>b.disabled=p==='JEFATURA');
    writeSections.forEach(s=>setDisabled(document.querySelector(s),p==='JEFATURA'));
    document.querySelectorAll('[data-ops-write]').forEach(el=>{
      const need=el.dataset.opsWrite||'OPERATOR';
      el.disabled=need==='ADMIN'?(p!=='ADMINISTRADOR'):(p==='JEFATURA');
    });
  }
  function applyProfileUi(){
    A.profile=getProfile();document.body.dataset.campProfile=A.profile;
    const badge=ensureProfileBadge();if(badge){badge.textContent=A.profile==='ADMINISTRADOR'?'Administrador':A.profile==='OPERADOR'?'Operador':'Jefatura · lectura';badge.className=`ops-profile-badge ${A.profile.toLowerCase()}`}
    enforceLegacyPermissions();
  }
  function setProfile(p){p=String(p||'').toUpperCase();if(!validProfiles.includes(p))return;sessionStorage.setItem(PROFILE_KEY,p);A.profile=p;applyProfileUi();renderOpsViews();emitAudit({action:'CAMBIAR_PERFIL_SESION',entity_type:'session_profile',entity_id:p,endpoint:'frontend',details:{profile:p}})}

  const originalRenderAll=renderAll;
  renderAll=function(){originalRenderAll();renderOpsViews()};
  const originalLoadAll=loadAll;
  loadAll=async function(opts={}){
    const ok=await originalLoadAll(opts);
    if(ok){await loadOpsState();renderOpsViews()}else renderResilienceBanner(true);
    return ok;
  };

  const originalWebApi=webApi;
  webApi=async function(action,opts={}){
    const result=await originalWebApi(action,opts);
    if((opts.method||'GET')==='POST'&&A.token&&!['admin_login','lookup'].includes(action))emitAudit({action:'API_'+plain(action).replace(/\s+/g,'_'),entity_type:'legacy_web',endpoint:`webApi:${action}`,details:{action}});
    return result;
  };
  const originalAdvApi=advApi;
  advApi=async function(action,opts={}){
    const result=await originalAdvApi(action,opts);
    if((opts.method||'GET')==='POST'&&A.token&&!['snapshot_today'].includes(action))emitAudit({action:'API_'+plain(action).replace(/\s+/g,'_'),entity_type:'legacy_advanced',endpoint:`advApi:${action}`,details:{action}});
    return result;
  };

  window.CampOps={
    CONTROL_API,controlApi,loadOpsState,registerRenderer,renderOpsViews,applyProfileUi,setProfile,getProfile,aggregateSnapshot,
    resilience:()=>safeParse(RESILIENCE_KEY,null),auditQueue,emitAudit,flushAuditQueue,
    canWrite:()=>A.profile!=='JEFATURA',isAdmin:()=>A.profile==='ADMINISTRADOR'
  };

  document.addEventListener('DOMContentLoaded',()=>{applyProfileUi();if(!navigator.onLine)renderResilienceBanner(true)});
  window.addEventListener('online',()=>{renderResilienceBanner(false);if(A.token)loadOpsState().then(()=>renderOpsViews())});
  window.addEventListener('offline',()=>renderResilienceBanner(true));
})();
