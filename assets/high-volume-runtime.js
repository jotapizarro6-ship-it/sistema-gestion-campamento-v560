(()=>{
  'use strict';
  if(typeof window==='undefined'||typeof A==='undefined'||window.__CAMP_HIGH_VOLUME_RUNTIME__)return;
  window.__CAMP_HIGH_VOLUME_RUNTIME__=true;

  const VERSION='20260829-hv1';
  const DB_REGION='us-east-1';
  const WORKER_PAGE_SIZE=100;
  const CONSULT_PAGE_SIZE=100;
  const CHART_VIEWS=new Set(['overview','control','planning','management','history','command','masterplan','governance']);
  const perfNow=()=>typeof performance!=='undefined'&&performance.now?performance.now():Date.now();
  const idle=(fn,timeout=1200)=>typeof requestIdleCallback==='function'?requestIdleCallback(fn,{timeout}):setTimeout(fn,Math.min(timeout,350));
  const debounce=(fn,ms=120)=>{let t;return(...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),ms)}};

  // Mantiene las funciones intensivas en base de datos cerca del proyecto Supabase (us-east-1).
  // Solo altera URLs del dominio de funciones del proyecto; no toca otros fetch del navegador.
  if(typeof window.fetch==='function'&&!window.__CAMP_REGION_PINNED_FETCH__){
    window.__CAMP_REGION_PINNED_FETCH__=true;
    const nativeFetch=window.fetch.bind(window);
    window.fetch=(input,init)=>{
      let next=input;
      try{
        if(typeof input==='string'){
          const u=new URL(input,window.location?.href||undefined);
          if(u.hostname==='usrstcxiluvsizoxwlxj.supabase.co'&&u.pathname.includes('/functions/v1/')&&!u.searchParams.has('forceFunctionRegion')){
            u.searchParams.set('forceFunctionRegion',DB_REGION);next=u.toString();
          }
        }
      }catch(_){/* URL no aplicable: usar fetch original */}
      return nativeFetch(next,init);
    };
  }

  let analyticsMemo={data:null,day:'',value:null};
  function invalidateAnalytics(){analyticsMemo={data:null,day:'',value:null}}
  if(typeof analytics==='function'&&!analytics.__campHighVolumeMemo){
    const baseAnalytics=analytics;
    const memoized=function(data){
      const day=typeof todayISO==='function'?todayISO():'';
      if(analyticsMemo.data===data&&analyticsMemo.day===day&&analyticsMemo.value)return analyticsMemo.value;
      const value=baseAnalytics(data);
      analyticsMemo={data,day,value};
      return value;
    };
    memoized.__campHighVolumeMemo=true;
    analytics=memoized;
  }

  const fold=v=>typeof plain==='function'?plain(v):String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim().replace(/\s+/g,' ');
  const text=v=>typeof clean==='function'?clean(v):String(v??'').trim();
  function buildWorkerIndex(workers){
    return (Array.isArray(workers)?workers:[]).map(w=>({
      worker:w,
      search:fold([w.rut,w.nombre,w.empresa,w.turno,w.modulo,w.habitacion,w.cama,w.especialidad,w.categoria,w.residencia,w.sexo].join(' ')),
      sort:text(w.nombre)
    })).sort((a,b)=>a.sort.localeCompare(b.sort,'es',{sensitivity:'base'}));
  }
  function filterWorkerIndex(index,query){
    const tokens=fold(query).split(' ').filter(Boolean);
    if(!tokens.length)return index;
    return index.filter(x=>tokens.every(t=>x.search.includes(t)));
  }
  function paginate(rows,page,size){
    const total=rows.length,pages=Math.max(1,Math.ceil(total/size)),p=Math.min(pages,Math.max(1,Number(page)||1)),start=(p-1)*size;
    return {items:rows.slice(start,start+size),page:p,pages,total,start,end:Math.min(start+size,total)};
  }

  function qualityMetrics(data){
    const inventoryKeys=new Set((data?.inventory||[]).map(b=>lkey(b.module,b.room,b.bed)));
    const occ=occupiedWorkers(data),seen=new Map();
    for(const w of occ){const k=lkey(w.modulo,w.habitacion,w.cama);seen.set(k,(seen.get(k)||0)+1)}
    const invalidRut=(data?.workers||[]).filter(w=>clean(w.rut)&&!rutValid(w.rut)).length;
    const incomplete=(data?.workers||[]).filter(w=>!lkey(w.modulo,w.habitacion,w.cama).split('|').every(Boolean)).length;
    const missingInv=occ.filter(w=>!inventoryKeys.has(lkey(w.modulo,w.habitacion,w.cama))).length;
    const duplicate=[...seen.values()].filter(n=>n>1).length;
    const badBeds=(data?.inventory||[]).filter(b=>!['A','B','C'].includes(loc(b.bed,'bed'))).length;
    const issues=invalidRut+incomplete+missingInv+duplicate+badBeds;
    return {issues,invalidRut,incomplete,missingInv,duplicate,badBeds,status:issues?'REVISAR':'VALIDADA'};
  }
  function patchQualityCard(data){
    const btn=document.getElementById('biQualityBtn');if(!btn||!data)return;
    const q=qualityMetrics(data),value=btn.querySelector('.bi-kpi-value'),line=btn.querySelector('.bi-quality-line');
    btn.classList.toggle('warn',q.issues>0);btn.classList.toggle('ok',q.issues===0);
    if(value)value.textContent=q.status;
    if(line)line.innerHTML=`<strong>${q.issues}</strong><span>observación${q.issues===1?'':'es'} · Inventario físico ${fmtInt(data.inventory.length)} camas</span>`;
    if(!btn.dataset.highVolumeQuality){
      btn.dataset.highVolumeQuality='1';
      btn.addEventListener('click',()=>setTimeout(()=>{
        const body=document.getElementById('detailBody'),first=body?.querySelector('.bi-quality-grid > div:first-child strong');
        if(first)first.textContent=`${fmtInt(data.inventory.length)} camas físicas`;
      },0));
    }
  }
  if(typeof renderOverview==='function'){
    const baseHighVolumeOverview=renderOverview;
    renderOverview=function(){const value=baseHighVolumeOverview();setTimeout(()=>patchQualityCard(A.data),0);return value};
  }

  let workerIndexData=null,workerIndex=[];
  function getWorkerIndex(data){
    if(workerIndexData!==data){workerIndexData=data;workerIndex=buildWorkerIndex(data?.workers||[])}
    return workerIndex;
  }

  if(typeof renderWorkers==='function'){
    renderWorkers=function(){
      const d=A.data;if(!d)return;
      const view=document.getElementById('view-workers');if(!view)return;
      const index=getWorkerIndex(d);
      let page=1,query='';
      view.innerHTML=`<div class="section-head"><div><h2>Trabajadores y asignaciones</h2><div class="muted">Búsqueda rápida y paginada para dotaciones de alto volumen.</div></div><div class="toolbar"><label class="field"><span>Buscar</span><input id="workerSearch" placeholder="RUT, nombre, empresa, turno, módulo…" autocomplete="off"></label></div></div><section class="panel mb"><h3>Agregar / actualizar trabajador</h3><form id="workerForm" class="form-grid"><label class="field"><span>RUT</span><input name="rut" required></label><label class="field span2"><span>Nombre</span><input name="nombre" required></label><label class="field"><span>Turno</span><input name="turno"></label><label class="field"><span>Empresa</span><input name="empresa"></label><label class="field"><span>Módulo</span><input name="modulo"></label><label class="field"><span>Habitación</span><input name="habitacion"></label><label class="field"><span>Cama</span><input name="cama"></label><div><button class="btn btn-primary" type="submit">Guardar</button></div></form></section><div class="toolbar mb"><span id="workerMatchInfo" class="badge blue"></span><span id="workerPageInfo" class="muted"></span><button id="workerPrev" class="btn btn-secondary small-btn" type="button">Anterior</button><button id="workerNext" class="btn btn-secondary small-btn" type="button">Siguiente</button></div><div id="workersTable"></div>`;
      const cols=[{label:'RUT',key:'rut'},{label:'Trabajador',key:'nombre'},{label:'Empresa',key:'empresa'},{label:'Turno',key:'turno'},{label:'Módulo',key:'modulo'},{label:'Hab.',key:'habitacion'},{label:'Cama',key:'cama'},{label:'Especialidad',key:'especialidad'},{label:'Categoría',key:'categoria'}];
      const draw=()=>{
        const matches=filterWorkerIndex(index,query),pg=paginate(matches,page,WORKER_PAGE_SIZE);page=pg.page;
        const host=document.getElementById('workersTable');if(host)host.innerHTML=table(pg.items,cols,{limit:WORKER_PAGE_SIZE,empty:'Sin trabajadores para el filtro actual'});
        const match=document.getElementById('workerMatchInfo');if(match)match.textContent=`${pg.total} trabajador${pg.total===1?'':'es'}`;
        const info=document.getElementById('workerPageInfo');if(info)info.textContent=pg.total?`Mostrando ${pg.start+1}–${pg.end} · Página ${pg.page} de ${pg.pages}`:'Sin resultados';
        const prev=document.getElementById('workerPrev'),next=document.getElementById('workerNext');if(prev)prev.disabled=pg.page<=1;if(next)next.disabled=pg.page>=pg.pages;
      };
      document.getElementById('workerPrev')?.addEventListener('click',()=>{page--;draw()});
      document.getElementById('workerNext')?.addEventListener('click',()=>{page++;draw()});
      document.getElementById('workerSearch')?.addEventListener('input',debounce(e=>{query=e.target.value||'';page=1;draw()},100));
      document.getElementById('workerForm')?.addEventListener('submit',async e=>{
        e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));b.rut=normalizeRut(b.rut);
        try{await webApi('save_worker',{method:'POST',body:b,token:A.token});showMessage('Trabajador guardado.');e.currentTarget.reset();await loadAll({snapshot:false})}catch(err){showMessage(err.message,'error')}
      });
      draw();
    };
  }

  let consultPage=1,consultsLoadedGeneration=-1,consultsPromise=null,dataGeneration=0;
  let consultsLoading=false;
  if(typeof renderConsults==='function'){
    renderConsults=function(){
      const view=document.getElementById('view-consults');if(!view)return;
      const rows=A.consults||[],pg=paginate(rows,consultPage,CONSULT_PAGE_SIZE);consultPage=pg.page;
      const cols=[{label:'Fecha',key:'consultado_at'},{label:'RUT',key:'rut'},{label:'Nombre',key:'nombre'},{label:'Resultado',render:r=>`<span class="badge ${r.status==='ASIGNADO'?'green':r.status==='NO_ENCONTRADO'?'red':'amber'}">${esc(r.status)}</span>`},{label:'Asignación',render:r=>esc([r.modulo,r.habitacion,r.cama].filter(Boolean).join(' / ')||'—')},{label:'IP',key:'ip'}];
      view.innerHTML=`<div class="section-head"><div><h2>Consultas por RUT</h2><div class="muted">Trazabilidad cargada solo cuando se abre esta sección.</div></div></div>${consultsLoading?'<div class="notice info mb">Cargando historial de consultas…</div>':''}<div class="toolbar mb"><span class="badge blue">${rows.length} consulta${rows.length===1?'':'s'}</span><span class="muted">${rows.length?`Mostrando ${pg.start+1}–${pg.end} · Página ${pg.page} de ${pg.pages}`:'Sin registros cargados'}</span><button id="consultPrev" class="btn btn-secondary small-btn" type="button">Anterior</button><button id="consultNext" class="btn btn-secondary small-btn" type="button">Siguiente</button></div>${table(pg.items,cols,{limit:CONSULT_PAGE_SIZE,empty:consultsLoading?'Cargando…':'Sin registros'})}`;
      const prev=document.getElementById('consultPrev'),next=document.getElementById('consultNext');if(prev)prev.disabled=pg.page<=1;if(next)next.disabled=pg.page>=pg.pages;
      prev?.addEventListener('click',()=>{consultPage--;renderConsults()});next?.addEventListener('click',()=>{consultPage++;renderConsults()});
      setTimeout(()=>window.CampConsultExport?.enhanceConsultsView?.(),0);
    };
  }

  function currentView(){return window.CampProgressiveAdminRender?.activeView?.()||A.currentView||String(location.hash||'#overview').slice(1)||'overview'}
  async function ensureConsults(force=false){
    if(!A.token)return false;
    if(!force&&consultsLoadedGeneration===dataGeneration)return true;
    if(consultsPromise)return consultsPromise;
    consultsLoading=true;if(currentView()==='consults')renderConsults?.();
    const myGen=dataGeneration;
    consultsPromise=webApi('consults',{token:A.token}).then(r=>{
      if(myGen!==dataGeneration)return false;
      A.consults=r.data||[];consultsLoadedGeneration=dataGeneration;consultPage=1;return true;
    }).catch(err=>{console.warn('[Campamento] Consultas RUT diferidas:',err);return false}).finally(()=>{
      consultsLoading=false;consultsPromise=null;if(currentView()==='consults')window.CampProgressiveAdminRender?.renderOne?.('consults');
    });
    return consultsPromise;
  }

  function mergeSnapshot(snapshot){
    if(!snapshot||!A.data)return;
    const rows=Array.isArray(A.data.snapshots)?A.data.snapshots:[];
    const i=rows.findIndex(x=>String(x.snapshot_date||'')===String(snapshot.snapshot_date||''));
    if(i>=0)rows[i]=snapshot;else rows.push(snapshot);
    rows.sort((a,b)=>String(a.snapshot_date||'').localeCompare(String(b.snapshot_date||'')));
    A.data.snapshots=rows;invalidateAnalytics();
  }

  function scheduleSnapshot(generation){
    idle(async()=>{
      if(generation!==dataGeneration||!A.token)return;
      try{
        const r=await advApi('snapshot_today',{method:'POST',body:{},token:A.token});
        if(generation!==dataGeneration)return;mergeSnapshot(r.data);
        if(currentView()==='history')window.CampProgressiveAdminRender?.renderOne?.('history',{refreshOps:false});
      }catch(err){console.warn('[Campamento] Snapshot automático diferido:',err)}
    },1800);
  }

  function scheduleOps(generation){
    if(!window.CampOps?.loadOpsState)return;
    idle(async()=>{
      if(generation!==dataGeneration||!A.token)return;
      try{await window.CampOps.loadOpsState();if(generation===dataGeneration)window.CampOps.renderOpsViews?.()}catch(err){console.warn('[Campamento] Centro de Control diferido:',err)}
    },1000);
  }

  if(typeof loadAll==='function'){
    loadAll=async function({snapshot=true}={}){
      const generation=++dataGeneration;consultsLoadedGeneration=-1;consultsPromise=null;consultPage=1;invalidateAnalytics();workerIndexData=null;workerIndex=[];
      const badge=document.getElementById('syncBadge');if(badge){badge.textContent='Sincronizando';badge.className='status-pill warn'}
      const started=perfNow();
      try{
        const state=await advApi('advanced_state',{token:A.token});
        if(generation!==dataGeneration)return false;
        A.data=state.data||{};A.data.workers=A.data.workers||[];A.data.inventory=A.data.inventory||[];A.data.blocks=A.data.blocks||[];A.data.reservations=A.data.reservations||[];A.data.movements=A.data.movements||[];A.data.capacities=A.data.capacities||[];A.data.snapshots=A.data.snapshots||[];
        A.imports=Array.isArray(A.data.imports)?A.data.imports:[];
        A.consults=[];
        const source=A.data.settings?.source_file||'Sin planilla',upd=A.data.settings?.last_update||'—';
        const meta=document.getElementById('systemMeta');if(meta)meta.textContent=`Base central Supabase · ${source} · ${upd}`;
        const elapsed=Math.round(perfNow()-started);if(badge){badge.textContent='Actualizado';badge.className='status-pill ok';badge.title=`Carga principal: ${elapsed} ms · ${A.data.workers.length} trabajadores · ${A.data.inventory.length} camas`}
        window.__CAMP_DATA_READY__=true;
        window.dispatchEvent?.(new CustomEvent('campamento:data-ready',{detail:{elapsed_ms:elapsed,workers:A.data.workers.length,beds:A.data.inventory.length,generation}}));
        renderAll();
        if(currentView()==='consults')ensureConsults();
        if(snapshot)scheduleSnapshot(generation);
        scheduleOps(generation);
        console.info(`[Campamento] Base principal lista en ${elapsed} ms · ${A.data.workers.length} trabajadores · ${A.data.inventory.length} camas`);
        return true;
      }catch(err){
        if(badge){badge.textContent='Error';badge.className='status-pill bad'}
        if(err.status===401){logoutAdmin();return false}
        showMessage(err.message||'Error al cargar la base.','error');
        window.CampOps?.loadOpsState?.().catch(()=>{});
        return false;
      }
    };
  }

  if(typeof switchView==='function'){
    const baseSwitchView=switchView;
    switchView=function(view){
      baseSwitchView(view);
      if(view==='consults')ensureConsults();
      if(CHART_VIEWS.has(view))window.CampEChartsLazy?.ensure?.();
    };
  }

  window.CampHighVolume={VERSION,DB_REGION,WORKER_PAGE_SIZE,CONSULT_PAGE_SIZE,buildWorkerIndex,filterWorkerIndex,paginate,invalidateAnalytics,ensureConsults,get generation(){return dataGeneration}};
})();
