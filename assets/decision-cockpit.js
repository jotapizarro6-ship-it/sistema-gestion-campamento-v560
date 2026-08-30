(()=>{
  'use strict';
  if(typeof window==='undefined'||window.__CAMP_DECISION_COCKPIT__)return;
  window.__CAMP_DECISION_COCKPIT__=true;
  const VERSION='20260830-decision2';
  const state={company:'',shift:'',module:'',dimension:'module',managementDimension:'company',filtersOpen:false,observers:new Map(),loadingRules:false};
  const e=v=>typeof esc==='function'?esc(String(v??'')):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const cleanV=v=>String(v??'').trim();
  const norm=v=>cleanV(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ');
  const int=v=>Number(v||0).toLocaleString('es-CL');
  const dec=v=>Number(v||0).toLocaleString('es-CL',{minimumFractionDigits:1,maximumFractionDigits:1});
  const pct=v=>`${dec(v)}%`;
  const signed=(v,digits=0)=>{const n=Number(v||0),f=digits?dec(n):int(n);return `${n>0?'+':''}${f}`};
  const today=()=>typeof todayISO==='function'?todayISO():new Date().toISOString().slice(0,10);
  const date=v=>typeof fmtDate==='function'?fmtDate(v):v;
  const uniq=a=>[...new Set((a||[]).map(cleanV).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
  const occupied=w=>cleanV(w?.modulo)&&cleanV(w?.habitacion)&&cleanV(w?.cama);
  const severityKey=x=>{const s=norm(x);return s.includes('CRIT')?'critical':s.includes('ATEN')||s.includes('MED')||s.includes('HIGH')?'attention':'normal'};
  const statusText=s=>s==='critical'?'CRÍTICO':s==='attention'?'ATENCIÓN':'OPERACIÓN NORMAL';
  const currentAnalytics=()=>typeof analytics==='function'&&window.A?.data?analytics(A.data):null;
  const previousClosed=data=>(data?.snapshots||[]).filter(s=>cleanV(s.closed_at)&&cleanV(s.snapshot_date)<today()).sort((a,b)=>String(a.snapshot_date).localeCompare(String(b.snapshot_date))).at(-1)||null;
  const filteredWorkers=data=>(data?.workers||[]).filter(w=>(!state.company||norm(w.empresa)===norm(state.company))&&(!state.shift||norm(w.turno)===norm(state.shift))&&(!state.module||norm(w.modulo)===norm(state.module)));
  const group=(rows,key,label='SIN DATO')=>{const m=new Map();for(const r of rows){const k=cleanV(r?.[key])||label;m.set(k,(m.get(k)||0)+1)}return [...m].map(([label,n])=>({label,n})).sort((a,b)=>b.n-a.n||a.label.localeCompare(b.label,'es'))};
  const workerAssigned=data=>(data?.workers||[]).filter(occupied);
  const safeSemaphore=data=>{try{return window.CampIntegrityExecutive?.semaphore?.(data)||null}catch(_){return null}};
  const stateFrom=(an,sem)=>sem?severityKey(sem.level):Number(an?.committedPct)>=100?'critical':Number(an?.committedPct)>=80?'attention':'normal';

  function filterOptions(data){
    return {companies:uniq(data.workers?.map(w=>w.empresa)),shifts:uniq(data.workers?.map(w=>w.turno)),modules:uniq(data.inventory?.map(b=>b.module))};
  }
  function opt(items,current,all){return `<option value="">${e(all)}</option>${items.map(x=>`<option value="${e(x)}" ${x===current?'selected':''}>${e(x)}</option>`).join('')}`}
  function filterSummary(){const x=[];if(state.company)x.push(`Empresa: ${state.company}`);if(state.shift)x.push(`Turno: ${state.shift}`);if(state.module)x.push(`Módulo: ${state.module}`);return x}
  function filterCard(data){
    const o=filterOptions(data),summary=filterSummary(),active=summary.length;
    return `<section class="dc-filter-strip dc-span-12 ${state.filtersOpen?'open':''}">
      <div class="dc-filter-toggle">
        <div class="dc-filter-label"><b>Filtros</b><span>${active?`${active} activo${active===1?'':'s'}`:'Sin filtros activos'}</span></div>
        <div class="dc-filter-summary">${summary.map(x=>`<span>${e(x)}</span>`).join('')}</div>
        <button type="button" class="dc-chip" data-dc-filter-toggle aria-expanded="${state.filtersOpen?'true':'false'}">${state.filtersOpen?'Ocultar':'Configurar'}</button>
      </div>
      <div class="dc-filter-panel ${state.filtersOpen?'open':''}" data-dc-filters>
        <label><span>Empresa</span><select data-dc-company>${opt(o.companies,state.company,'Todas')}</select></label>
        <label><span>Turno</span><select data-dc-shift>${opt(o.shifts,state.shift,'Todos')}</select></label>
        <label><span>Módulo</span><select data-dc-module>${opt(o.modules,state.module,'Todos')}</select></label>
        <label><span>Acción</span><button type="button" class="dc-chip dc-clear" data-dc-clear>Limpiar filtros</button></label>
      </div>
    </section>`;
  }
  function heroKpi(label,value,detail){return `<div class="dc-hero-kpi"><span>${e(label)}</span><strong>${e(value)}</strong><small>${e(detail)}</small></div>`}
  function attentionItems(data,an,sem){
    const items=[];
    if(sem?.reasons?.length){for(const r of sem.reasons)if(!norm(r).includes('SIN CONDICIONES'))items.push({level:severityKey(sem.level),title:r,detail:'Estado operacional'});}
    for(const x of (an?.exceptions||[]).slice(0,4))items.push({level:severityKey(x.level),title:x.title||'Excepción operacional',detail:x.detail||''});
    const closed=(data.snapshots||[]).some(s=>cleanV(s.snapshot_date)===today()&&cleanV(s.closed_at));if(!closed)items.push({level:'attention',title:'Cierre diario pendiente',detail:'El día operacional aún no está cerrado.'});
    const unique=[];const seen=new Set();for(const x of items){const k=norm(x.title);if(!seen.has(k)){seen.add(k);unique.push(x)}}return unique.slice(0,5);
  }
  function attentionBody(data,an,sem){
    const items=attentionItems(data,an,sem);
    return items.length?`<div class="dc-attention">${items.map(x=>`<div class="dc-alert ${x.level}"><i></i><div><b>${e(x.title)}</b><small>${e(x.detail)}</small></div><em>${x.level==='critical'?'CRÍTICO':x.level==='attention'?'REVISAR':'INFO'}</em></div>`).join('')}</div>`:'<div class="dc-empty-good">Sin condiciones críticas o de atención activas.</div>';
  }
  function attentionCard(data,an,sem){
    const items=attentionItems(data,an,sem);
    return `<section class="dc-card dc-span-4"><div class="dc-card-head"><div><h3>Requiere atención</h3><p>Excepciones y tareas que pueden requerir una decisión.</p></div><span class="dc-tag">${items.length} ACTIVA${items.length===1?'':'S'}</span></div>${attentionBody(data,an,sem)}</section>`;
  }
  function forecastCard(an,span='dc-span-8'){
    const rows=(an?.forecast||[]).slice(0,30),max=Math.max(100,...rows.map(x=>Number(x.pct||0)));
    return `<section class="dc-card ${span}">
      <div class="dc-card-head"><div><h3>Ocupación y proyección · 30 días</h3><p>Los 30 días completos, con drill-down por fecha y umbrales de presión.</p></div><span class="dc-tag">INTERACTIVO</span></div>
      <div class="dc-forecast-scroll"><div class="dc-forecast">${rows.map((x,i)=>{const p=Number(x.pct||0),s=p>=100?'critical':p>=80?'attention':'normal',h=Math.max(5,Math.min(118,p/max*118)),show=i===0||i===rows.length-1||i%5===0;return `<button type="button" class="dc-day ${s}" data-dc-day="${e(x.date)}" title="${e(`${date(x.date)} · ${pct(p)} · ${x.free} libres`)}" aria-label="${e(`${date(x.date)} ${pct(p)}`)}"><i style="height:${h}px"></i><span class="${show?'':'dc-day-label-muted'}">${show?e(x.label||String(x.date).slice(8)):''}</span></button>`}).join('')}</div></div>
      <div class="dc-forecast-meta"><span>Normal &lt;80%</span><span>Atención ≥80%</span><span>Capacidad 100%</span></div>
    </section>`;
  }
  function dimensionRows(data,an,dimension){
    if(dimension==='module')return (an?.hm?.modules||[]).map(x=>({label:x.label,n:Number(x.pct||0),suffix:'%'})).sort((a,b)=>b.n-a.n);
    const rows=filteredWorkers(data);return group(rows,dimension==='company'?'empresa':'turno').slice(0,8).map(x=>({...x,suffix:''}));
  }
  function dimensionCard(data,an,management=false){
    const dim=management?state.managementDimension:state.dimension,rows=dimensionRows(data,an,dim),max=Math.max(1,...rows.map(x=>x.n));
    return `<section class="dc-card ${management?'dc-span-6':'dc-span-8'}">
      <div class="dc-card-head"><div><h3>${dim==='module'?'Presión operacional':'Composición de dotación'}</h3><p>${dim==='module'?'Porcentaje comprometido por módulo.':'Una visualización reutilizable para evitar gráficos repetidos.'}</p></div>
      <div class="dc-actions"><button class="dc-dim ${dim==='module'?'active':''}" data-dc-dim="module" data-dc-scope="${management?'management':'overview'}">Módulo</button><button class="dc-dim ${dim==='shift'?'active':''}" data-dc-dim="shift" data-dc-scope="${management?'management':'overview'}">Turno</button><button class="dc-dim ${dim==='company'?'active':''}" data-dc-dim="company" data-dc-scope="${management?'management':'overview'}">Empresa</button></div></div>
      <div class="dc-bars">${rows.length?rows.map(x=>`<button type="button" class="dc-bar-row" data-dc-row="${e(x.label)}" data-dc-row-dim="${dim}" data-dc-row-scope="${management?'management':'overview'}"><span>${e(x.label)}</span><span class="dc-track"><i style="width:${Math.max(2,Math.min(100,x.n/max*100))}%"></i></span><strong>${e(dec(x.n)+x.suffix)}</strong></button>`).join(''):'<div class="dc-empty-good">Sin datos para los filtros seleccionados.</div>'}</div>
      <div class="dc-bar-note">${management?'Toca una fila para abrir el detalle.':'Toca una fila para aplicar ese filtro al cockpit.'}</div>
    </section>`;
  }
  function movementCard(an){return `<section class="dc-card dc-span-4"><div class="dc-card-head"><div><h3>Movimientos</h3><p>Situación inmediata de entradas y salidas.</p></div><span class="dc-tag">HOY</span></div><div class="dc-exec-kpis dc-two"><div class="dc-exec-kpi"><span>Subidas</span><strong>${int(an?.mv?.SUBIDA||0)}</strong><small>programadas hoy</small></div><div class="dc-exec-kpi"><span>Bajadas</span><strong>${int(an?.mv?.BAJADA||0)}</strong><small>programadas hoy</small></div><div class="dc-exec-kpi"><span>Pend. llegada</span><strong>${int(an?.pa?.total||0)}</strong><small>por materializar</small></div><div class="dc-exec-kpi"><span>Pend. salida</span><strong>${int(an?.pd?.total||0)}</strong><small>por completar</small></div></div></section>`}
  function overviewHTML(data){
    const an=currentAnalytics(),sem=safeSemaphore(data),s=stateFrom(an,sem),integrity=sem?.diag?.score??100;
    return `<div class="dc-shell dc-primary">
      <section class="dc-hero"><div class="dc-hero-top"><div><div class="dc-eyebrow">OPERACIÓN Y ANALÍTICA</div><h2>Centro de Control Operacional</h2><p>Lectura inmediata para decidir: estado, capacidad, movimientos, alertas y proyección.</p></div><span class="dc-status ${s}"><i></i>${statusText(s)}</span></div>
      <div class="dc-hero-grid">${heroKpi('Ocupación',`${int(an.occupied)} / ${int(an.effectiveCapacity)}`,`${pct(an.occupied/an.effectiveCapacity*100)} física`)}${heroKpi('Comprometidas',`${int(an.committed)} / ${int(an.effectiveCapacity)}`,`${pct(an.committedPct)} capacidad`)}${heroKpi('Libres efectivas',int(an.free),`${int(an.blockedToday)} fuera de servicio`)}${heroKpi('Movimientos hoy',`↑ ${int(an.mv?.SUBIDA)} · ↓ ${int(an.mv?.BAJADA)}`,`neto ${signed(Number(an.mv?.SUBIDA||0)-Number(an.mv?.BAJADA||0))}`)}${heroKpi('Integridad',`${int(integrity)}%`,sem?.diag?.critical?`${sem.diag.critical} crítico(s)`:'base controlada')}</div></section>
      <div class="dc-grid">${filterCard(data)}${attentionCard(data,an,sem)}${forecastCard(an)}${movementCard(an)}${dimensionCard(data,an,false)}</div>
    </div>`;
  }
  function deltaText(now,prev,suffix=''){if(prev==null)return 'Sin cierre previo';const d=Number(now||0)-Number(prev||0);return `${d>0?'+':''}${dec(d)}${suffix} vs último cierre`}
  function workforce(data){try{const api=window.CampWorkforceMODMOI;if(api?.compute){const m=api.compute(data.workers||[],api.state?.rules||{},{});return m.totals}}catch(_){}return{total:workerAssigned(data).length,DIRECTA:0,INDIRECTA:0,POR_DEFINIR:workerAssigned(data).length};}
  function executiveFocus(an,sem,prev){
    const s=stateFrom(an,sem),reasons=(sem?.reasons||[]).filter(x=>!norm(x).includes('SIN CONDICIONES'));
    let text;
    if(reasons.length)text=reasons.join(' · ');
    else if(prev)text=`Compromiso ${pct(an.committedPct)}; ${deltaText(an.committedPct,prev.committed_occupancy,' pp')}. Margen actual: ${int(an.free)} camas.`;
    else text=`Operación estable con ${int(an.free)} camas libres efectivas.`;
    return `<div class="dc-exec-reading ${s}"><b>${s==='normal'?'Lectura ejecutiva':'Foco ejecutivo'}</b><p>${e(text)}</p></div>`;
  }
  function managementSignals(an,sem,prev){
    const capacity=Number(an.effectiveCapacity||0),committed=Number(an.committed||0),attentionLimit=Math.ceil(capacity*.8),margin=attentionLimit-committed;
    const forecast=an.forecast||[],first80=forecast.find(x=>Number(x.pct)>=80),occDelta=prev==null?null:Number(an.occupied||0)-Number(prev.occupied||0),score=sem?.diag?.score??100;
    return `<div class="dc-exec-kpis">
      <div class="dc-exec-kpi"><span>Variación ocupación</span><strong>${occDelta==null?'—':`${signed(occDelta)} camas`}</strong><small>${prev?.snapshot_date?`desde ${e(date(prev.snapshot_date))}`:'sin cierre comparable'}</small></div>
      <div class="dc-exec-kpi"><span>Margen hasta atención</span><strong>${margin>0?`${int(margin)} camas`:margin===0?'En umbral':`${int(Math.abs(margin))} sobre umbral`}</strong><small>referencia operacional 80%</small></div>
      <div class="dc-exec-kpi"><span>Próxima presión ≥80%</span><strong>${first80?e(date(first80.date)):'Sin riesgo'}</strong><small>${first80?`${pct(first80.pct)} comprometido`:'30 días bajo umbral'}</small></div>
      <div class="dc-exec-kpi"><span>Integridad</span><strong>${int(score)}%</strong><small>${sem?.diag?.critical?`${sem.diag.critical} control(es) críticos`:'controles automáticos'}</small></div>
    </div>`;
  }
  function costSection(an,cost){
    if(!(cost>0))return '';
    const projected=(an.forecast||[]).reduce((z,x)=>z+Number(x.committed||0),0)*cost;
    return `<section class="dc-card dc-span-6"><div class="dc-card-head"><div><h3>Costos y camas-día</h3><p>Proyección económica sólo cuando existe tarifa válida.</p></div></div><div class="dc-exec-kpis dc-two"><div class="dc-exec-kpi"><span>Costo cama-día</span><strong>$${int(cost)}</strong><small>tarifa configurada</small></div><div class="dc-exec-kpi"><span>Proyección 30d</span><strong>$${int(projected)}</strong><small>camas-día comprometidas</small></div></div></section>`;
  }
  function managementHTML(data){
    const an=currentAnalytics(),sem=safeSemaphore(data),s=stateFrom(an,sem),prev=previousClosed(data),wf=workforce(data),forecast=an.forecast||[],peak=forecast.reduce((a,b)=>Number(b.pct)>Number(a?.pct||-1)?b:a,forecast[0]||{}),high=forecast.filter(x=>Number(x.pct)>=90).length,over=forecast.filter(x=>Number(x.over)>0).length,cost=Number(an.cost||0),focusSpan=cost>0?'dc-span-6':'dc-span-12';
    return `<div class="dc-shell dc-primary">
      <section class="dc-hero"><div class="dc-hero-top"><div><div class="dc-eyebrow">DASHBOARD GERENCIAL</div><h2>Lectura ejecutiva del campamento</h2><p>Qué cambió, qué riesgo existe y dónde concentrar la decisión.</p></div><span class="dc-status ${s}"><i></i>${statusText(s)}</span></div>
      <div class="dc-hero-grid">${heroKpi('Ocupación',`${int(an.occupied)} / ${int(an.effectiveCapacity)}`,deltaText(an.occupied,prev?.occupied))}${heroKpi('Compromiso',pct(an.committedPct),deltaText(an.committedPct,prev?.committed_occupancy,' pp'))}${heroKpi('Riesgo 30 días',`${high} día(s) ≥90%`,`máximo ${pct(peak?.pct||0)} · déficit ${over}`)}${heroKpi('Dotación',int(wf.total),`MOD ${int(wf.DIRECTA)} · MOI ${int(wf.INDIRECTA)}`)}${heroKpi('Libres efectivas',int(an.free),`${int(an.blockedToday)} fuera servicio`)}</div></section>
      <div class="dc-grid">
        <section class="dc-card dc-span-12"><div class="dc-card-head"><div><h3>Señales para decisión</h3><p>Contexto derivado para evitar repetir los KPI superiores.</p></div><span class="dc-tag">COMPARATIVO</span></div>${managementSignals(an,sem,prev)}<div class="dc-focus-wrap">${executiveFocus(an,sem,prev)}</div><div class="dc-links"><button class="dc-link" data-dc-goto="planning">Ver planificación 30 días</button><button class="dc-link" data-dc-goto="workers">Explorar dotación</button><button class="dc-link" data-dc-goto="governance">Ver integridad</button></div></section>
        ${forecastCard(an,'dc-span-6')}
        ${dimensionCard(data,an,true)}
        <section class="dc-card ${focusSpan}"><div class="dc-card-head"><div><h3>Foco ejecutivo</h3><p>Excepciones ordenadas para revisión de jefatura.</p></div><span class="dc-tag">${attentionItems(data,an,sem).length} ACTIVA${attentionItems(data,an,sem).length===1?'':'S'}</span></div>${attentionBody(data,an,sem)}</section>
        ${costSection(an,cost)}
      </div>
    </div>`;
  }

  function dialog(title,html){if(typeof showDialog==='function')return showDialog(title,html);console.info(title,html)}
  function tableWorkers(rows){return `<div style="max-height:60vh;overflow:auto"><table class="data-table"><thead><tr><th>Trabajador</th><th>Empresa</th><th>Turno</th><th>Módulo</th><th>Hab.</th><th>Cama</th></tr></thead><tbody>${rows.slice(0,250).map(w=>`<tr><td>${e(w.nombre)}</td><td>${e(w.empresa)}</td><td>${e(w.turno)}</td><td>${e(w.modulo)}</td><td>${e(w.habitacion)}</td><td>${e(w.cama)}</td></tr>`).join('')}</tbody></table></div>`}
  function applyRowFilter(dim,val){
    if(dim==='module')state.module=val;
    else if(dim==='shift')state.shift=val;
    else if(dim==='company')state.company=val;
  }
  function bindPrimary(root,data,scope){
    root.querySelector('[data-dc-filter-toggle]')?.addEventListener('click',()=>{state.filtersOpen=!state.filtersOpen;renderOverview()});
    root.querySelector('[data-dc-company]')?.addEventListener('change',x=>{state.company=x.target.value;renderOverview()});
    root.querySelector('[data-dc-shift]')?.addEventListener('change',x=>{state.shift=x.target.value;renderOverview()});
    root.querySelector('[data-dc-module]')?.addEventListener('change',x=>{state.module=x.target.value;renderOverview()});
    root.querySelector('[data-dc-clear]')?.addEventListener('click',()=>{state.company='';state.shift='';state.module='';renderOverview()});
    root.querySelectorAll('[data-dc-dim]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.dcScope==='management'){state.managementDimension=b.dataset.dcDim;renderManagement()}else{state.dimension=b.dataset.dcDim;renderOverview()}}));
    root.querySelectorAll('[data-dc-day]').forEach(b=>b.addEventListener('click',()=>{const an=currentAnalytics(),x=an?.forecast?.find(r=>r.date===b.dataset.dcDay);if(x)dialog(`Proyección · ${date(x.date)}`,`<div class="bi-dialog-grid"><div><span>Capacidad efectiva</span><strong>${int(x.capacity)}</strong></div><div><span>Ocupadas proyectadas</span><strong>${int(x.physical)}</strong></div><div><span>Reservadas</span><strong>${int(x.reserved)}</strong></div><div><span>Comprometidas</span><strong>${int(x.committed)}</strong></div><div><span>Libres</span><strong>${int(x.free)}</strong></div><div><span>Déficit</span><strong>${int(x.over)}</strong></div></div>`)}));
    root.querySelectorAll('[data-dc-row]').forEach(b=>b.addEventListener('click',()=>{
      const dim=b.dataset.dcRowDim,val=b.dataset.dcRow,rowScope=b.dataset.dcRowScope;
      if(rowScope==='overview'){applyRowFilter(dim,val);renderOverview();return}
      const rows=(data.workers||[]).filter(w=>dim==='module'?norm(w.modulo)===norm(val):dim==='shift'?norm(w.turno)===norm(val):norm(w.empresa)===norm(val));
      dialog(`${dim==='module'?'Módulo':dim==='shift'?'Turno':'Empresa'} · ${val}`,tableWorkers(rows));
    }));
    root.querySelectorAll('[data-dc-goto]').forEach(b=>b.addEventListener('click',()=>typeof switchView==='function'&&switchView(b.dataset.dcGoto)));
  }
  function wrap(view,primaryHTML,label,scope){
    state.observers.get(view)?.disconnect?.();state.observers.delete(view);
    const old=[...view.children],primary=document.createElement('div');primary.innerHTML=primaryHTML;const primaryNode=primary.firstElementChild;
    const details=document.createElement('details');details.className='dc-legacy-details';details.innerHTML=`<summary><span>${e(label)}</span><small>Detalle avanzado</small></summary><div class="dc-legacy-slot"><div class="dc-legacy-toolbar"><span>Análisis avanzado activo</span><button type="button" class="dc-link" data-dc-close-legacy>Ocultar análisis avanzado</button></div></div>`;
    const slot=details.querySelector('.dc-legacy-slot');
    view.replaceChildren(primaryNode,details);old.forEach(x=>slot.appendChild(x));bindPrimary(primaryNode,A.data,scope);
    details.querySelector('[data-dc-close-legacy]')?.addEventListener('click',()=>{details.open=false;primaryNode.scrollIntoView({behavior:'smooth',block:'start'})});
    details.addEventListener('toggle',()=>details.classList.toggle('is-open',details.open));
    const observer=new MutationObserver(ms=>{for(const m of ms)for(const n of [...m.addedNodes])if(n.nodeType===1&&n!==primaryNode&&n!==details&&n.parentElement===view)slot.appendChild(n)});
    observer.observe(view,{childList:true});state.observers.set(view,observer);
  }

  const baseOverview=typeof renderOverview==='function'?renderOverview:null,baseManagement=typeof renderManagement==='function'?renderManagement:null;
  if(baseOverview)renderOverview=function(){baseOverview();const view=document.getElementById('view-overview');if(view&&A?.data)wrap(view,overviewHTML(A.data),'Ver análisis operativo completo','overview')};
  if(baseManagement)renderManagement=function(){baseManagement();const view=document.getElementById('view-management');if(view&&A?.data){wrap(view,managementHTML(A.data),'Ver análisis gerencial completo y herramientas avanzadas','management');const wf=window.CampWorkforceMODMOI;if(wf?.loadRules&&!wf.state?.loaded&&!state.loadingRules){state.loadingRules=true;wf.loadRules().finally(()=>{state.loadingRules=false;if(A?.currentView==='management')renderManagement()})}}};
  window.CampDecisionCockpit={VERSION,state,group,filteredWorkers,overviewHTML,managementHTML,render:()=>{if(A?.currentView==='management')renderManagement();else if(A?.currentView==='overview')renderOverview()}};
})();