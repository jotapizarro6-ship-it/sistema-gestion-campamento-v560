(()=>{
  'use strict';
  if(typeof window==='undefined'||typeof renderControl!=='function'||typeof A==='undefined')return;
  const baseRenderControl=renderControl;
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
  const uniq=arr=>[...new Set(arr.map(x=>String(x??'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
  const fmt=v=>Number(v||0).toLocaleString('es-CL');
  const pressure=mod=>{const p=Number(mod?.pct||0);return p>=90?{key:'critical',label:'CRÍTICO'}:p>=80?{key:'attention',label:'ATENCIÓN'}:{key:'normal',label:'NORMAL'}};
  const statusLabel={free:'LIBRE',occupied:'OCUPADA',reserved:'RESERVADA',blocked:'BLOQUEADA'};
  const statusOrder=['occupied','reserved','blocked','free'];
  const escText=v=>esc(String(v??''));

  function ensureState(d,hm){
    if(!A.mapModule||!hm.moduleNames.includes(A.mapModule))A.mapModule=hm.moduleNames[0]||'';
    if(typeof A.controlStatus!=='string')A.controlStatus='';
    if(typeof A.controlCompany!=='string')A.controlCompany='';
    if(typeof A.controlShift!=='string')A.controlShift='';
    if(typeof A.controlBedKey!=='string')A.controlBedKey='';
    const companies=uniq(d.workers.map(w=>w.empresa)),shifts=uniq(d.workers.map(w=>w.turno));
    if(A.controlCompany&&!companies.includes(A.controlCompany))A.controlCompany='';
    if(A.controlShift&&!shifts.includes(A.controlShift))A.controlShift='';
    return {companies,shifts};
  }

  function filteredItems(hm){
    return hm.items.filter(x=>{
      if(norm(x.module)!==norm(A.mapModule))return false;
      if(A.controlStatus&&x.status!==A.controlStatus)return false;
      if(A.controlCompany||A.controlShift){
        if(!x.worker)return false;
        if(A.controlCompany&&norm(x.worker.empresa)!==norm(A.controlCompany))return false;
        if(A.controlShift&&norm(x.worker.turno)!==norm(A.controlShift))return false;
      }
      return true;
    });
  }

  function moduleExceptions(d,module){
    const today=todayISO(),out=[],occ=occupiedWorkers(d).filter(w=>norm(w.modulo)===norm(module)),occMap=new Map();
    for(const w of occ){const k=lkey(w.modulo,w.habitacion,w.cama);if(!occMap.has(k))occMap.set(k,[]);occMap.get(k).push(w)}
    const dup=[...occMap.values()].filter(x=>x.length>1).length;
    const blocked=blocksOn(today,d),blockedUsed=[...occMap.keys()].filter(k=>blocked.has(k)).length;
    const active=d.reservations.filter(r=>['PENDIENTE','CONFIRMADA'].includes(plain(r.status))&&activeResOn(r,today)&&norm(r.module)===norm(module));
    let resConflict=0;for(const r of active.filter(r=>clean(r.room)&&clean(r.bed))){const w=occMap.get(lkey(r.module,r.room,r.bed))?.[0];if(w&&plain(w.nombre)!==plain(r.person_name))resConflict++}
    const resIncomplete=active.filter(r=>!clean(r.room)||!clean(r.bed)).length;
    if(blockedUsed)out.push({level:'critical',title:'Cama bloqueada y ocupada',detail:`${blockedUsed} cama(s) fuera de servicio aparecen ocupadas en ${module}.`});
    if(resConflict)out.push({level:'critical',title:'Reserva cruzada con ocupante',detail:`${resConflict} reserva(s) exactas coinciden con un trabajador distinto.`});
    if(dup)out.push({level:'critical',title:'Doble asignación',detail:`${dup} cama(s) tienen más de un trabajador asignado.`});
    if(resIncomplete)out.push({level:'attention',title:'Reserva sin cama exacta',detail:`${resIncomplete} reserva(s) activas del módulo no tienen habitación/cama completa.`});
    return out;
  }

  function fallbackComposition(mod){
    const cap=Math.max(Number(mod?.capacity||0),1),occ=Number(mod?.occupied||0),res=Number(mod?.reserved||0),blo=Number(mod?.blocked||0),free=Number(mod?.free||0);
    const a=occ/cap*100,b=(occ+res)/cap*100,c=(occ+res+blo)/cap*100;
    return `<div class="cc-fallback-donut"><div class="cc-fallback-ring" style="--cc-occ:${a}%;--cc-res:${b}%;--cc-block:${c}%"><div><strong>${fmt1(mod?.pct||0)}%</strong><span>comprometido</span></div></div><div class="cc-fallback-list"><div><i class="occupied"></i><span>Ocupadas</span><b>${fmt(occ)}</b></div><div><i class="reserved"></i><span>Reservadas</span><b>${fmt(res)}</b></div><div><i class="blocked"></i><span>Bloqueadas</span><b>${fmt(blo)}</b></div><div><i class="free"></i><span>Libres</span><b>${fmt(free)}</b></div></div></div>`;
  }

  function fallbackModules(mods){
    return `<div class="cc-module-fallback">${mods.map(m=>{const p=Math.min(110,Math.max(0,Number(m.pct||0))),s=pressure(m);return `<button type="button" data-cc-module="${escText(m.label)}"><span>${escText(m.label)}</span><span class="track"><i class="${s.key}" style="width:${Math.min(100,p)}%"></i></span><strong>${fmt1(m.pct||0)}%</strong></button>`}).join('')}</div>`;
  }

  function bedMap(items){
    const rooms=new Map();for(const b of items){if(!rooms.has(String(b.room)))rooms.set(String(b.room),[]);rooms.get(String(b.room)).push(b)}
    if(!rooms.size)return '<div class="empty">No hay camas que coincidan con los filtros seleccionados.</div>';
    return `<div class="cc-bed-map">${[...rooms.entries()].sort((a,b)=>Number(a[0])-Number(b[0])||a[0].localeCompare(b[0])).map(([room,beds])=>`<article class="cc-room-card"><div class="cc-room-title"><span>Habitación ${escText(room)}</span><small>${beds.length} visible(s)</small></div><div class="cc-beds">${beds.sort((a,b)=>String(a.bed).localeCompare(String(b.bed))).map(b=>{const key=lkey(b.module,b.room,b.bed),selected=key===A.controlBedKey?' selected':'';return `<button type="button" class="cc-bed-btn ${b.status}${selected}" data-cc-bed="${escText(key)}" title="${escText(b.detail||statusLabel[b.status]||'')}">Cama ${escText(b.bed)}</button>`}).join('')}</div></article>`).join('')}</div>`;
  }

  function detailHTML(b){
    if(!b)return '<div class="cc-detail-empty"><strong>Selecciona una cama</strong><br>Verás aquí trabajador, empresa, turno, reserva o bloqueo sin salir del mapa.</div>';
    const worker=b.worker,res=b.reservation,block=b.block;
    return `<div class="cc-detail-head"><div class="eyebrow">DETALLE DE CAMA</div><h3>${escText(b.module)} · Hab. ${escText(b.room)} · Cama ${escText(b.bed)}</h3><span class="cc-status">${escText(statusLabel[b.status]||String(b.status).toUpperCase())}</span></div><div class="cc-detail-body"><div class="cc-detail-grid"><div><span>Módulo</span><strong>${escText(b.module)}</strong></div><div><span>Habitación</span><strong>${escText(b.room)}</strong></div><div><span>Cama</span><strong>${escText(b.bed)}</strong></div><div><span>Estado</span><strong>${escText(statusLabel[b.status]||b.status)}</strong></div></div>${worker?`<div class="cc-detail-section"><h4>Trabajador</h4><p><strong>${escText(worker.nombre||'No informado')}</strong></p><p>RUT: ${escText(worker.rut||'—')}</p><p>Empresa: ${escText(worker.empresa||'—')}</p><p>Turno: ${escText(worker.turno||'—')}</p></div>`:''}${res?`<div class="cc-detail-section"><h4>Reserva</h4><p><strong>${escText(res.person_name||'Reserva')}</strong></p><p>Llegada: ${escText(res.arrival_date||'—')}</p><p>Salida: ${escText(res.departure_date||'—')}</p><p>Estado: ${escText(res.status||'—')}</p></div>`:''}${block?`<div class="cc-detail-section"><h4>Bloqueo</h4><p><strong>${escText(block.reason||'Fuera de servicio')}</strong></p><p>Desde: ${escText(block.start_date||'—')}</p><p>Hasta: ${escText(block.end_date||'—')}</p></div>`:''}${!worker&&!res&&!block?'<div class="cc-detail-section"><p>Cama disponible sin trabajador, reserva ni bloqueo activo.</p></div>':''}</div>`;
  }

  function bindControl(hm,visibleItems){
    const moduleSelect=document.querySelector('#ccModule'),status=document.querySelector('#ccStatus'),company=document.querySelector('#ccCompany'),shift=document.querySelector('#ccShift'),reset=document.querySelector('#ccReset');
    moduleSelect?.addEventListener('change',()=>{A.mapModule=moduleSelect.value;A.controlBedKey='';renderControl()});
    status?.addEventListener('change',()=>{A.controlStatus=status.value;A.controlBedKey='';renderControl()});
    company?.addEventListener('change',()=>{A.controlCompany=company.value;A.controlBedKey='';renderControl()});
    shift?.addEventListener('change',()=>{A.controlShift=shift.value;A.controlBedKey='';renderControl()});
    reset?.addEventListener('click',()=>{A.controlStatus='';A.controlCompany='';A.controlShift='';A.controlBedKey='';renderControl()});
    document.querySelectorAll('#view-control [data-cc-module]').forEach(btn=>btn.addEventListener('click',()=>{A.mapModule=btn.dataset.ccModule||A.mapModule;A.controlBedKey='';renderControl()}));
    document.querySelectorAll('#view-control [data-cc-bed]').forEach(btn=>btn.addEventListener('click',()=>{A.controlBedKey=btn.dataset.ccBed||'';document.querySelectorAll('#view-control .cc-bed-btn').forEach(x=>x.classList.toggle('selected',x.dataset.ccBed===A.controlBedKey));const item=hm.items.find(x=>lkey(x.module,x.room,x.bed)===A.controlBedKey);const panel=document.querySelector('#controlDetailPanel');if(panel)panel.innerHTML=detailHTML(item);if(window.innerWidth<=760)panel?.scrollIntoView({behavior:'smooth',block:'start'})}));
    if(A.controlBedKey){const item=hm.items.find(x=>lkey(x.module,x.room,x.bed)===A.controlBedKey);if(item&&visibleItems.some(x=>lkey(x.module,x.room,x.bed)===A.controlBedKey)){const panel=document.querySelector('#controlDetailPanel');if(panel)panel.innerHTML=detailHTML(item)}else A.controlBedKey=''}
  }

  renderControl=function(){
    try{
      const d=A.data;if(!d)return baseRenderControl();const an=analytics(d),hm=an.hm,{companies,shifts}=ensureState(d,hm),mod=hm.modules.find(x=>norm(x.label)===norm(A.mapModule))||hm.modules[0];if(!mod)return baseRenderControl();A.mapModule=mod.label;
      const state=pressure(mod),items=filteredItems(hm),exceptions=moduleExceptions(d,mod.label),selected=hm.items.find(x=>lkey(x.module,x.room,x.bed)===A.controlBedKey);
      const companyOpts=['',...companies].map(x=>`<option value="${escText(x)}" ${x===A.controlCompany?'selected':''}>${escText(x||'Todas las empresas')}</option>`).join('');
      const shiftOpts=['',...shifts].map(x=>`<option value="${escText(x)}" ${x===A.controlShift?'selected':''}>${escText(x||'Todos los turnos')}</option>`).join('');
      document.querySelector('#view-control').innerHTML=`<div class="section-head cc-head"><div><h2>Centro de Gestión · Mapa de Alojamiento</h2><div class="muted">Módulo → habitación → cama → trabajador / reserva / bloqueo</div></div><div class="section-actions"><span class="cc-tag ${state.key}">MÓDULO ${state.label}</span><span class="badge blue">${escText(mod.label)}</span></div></div>
      <section class="cc-filterbar"><label><span>Módulo</span><select id="ccModule">${hm.moduleNames.map(m=>`<option ${m===A.mapModule?'selected':''}>${escText(m)}</option>`).join('')}</select></label><label><span>Estado de cama</span><select id="ccStatus"><option value="">Todos los estados</option>${statusOrder.map(s=>`<option value="${s}" ${s===A.controlStatus?'selected':''}>${statusLabel[s]}</option>`).join('')}</select></label><label><span>Empresa</span><select id="ccCompany">${companyOpts}</select></label><label><span>Turno</span><select id="ccShift">${shiftOpts}</select></label><button id="ccReset" class="btn btn-secondary" type="button">Limpiar filtros</button><div class="cc-filter-note"><strong>Nota:</strong> Empresa y Turno filtran camas ocupadas con trabajador identificado; no se asignan esos atributos a camas libres, reservadas o bloqueadas.</div></section>
      <div class="cc-kpi-grid"><div class="cc-kpi navy"><span>Camas módulo</span><strong>${fmt(mod.capacity)}</strong><small>inventario físico</small></div><div class="cc-kpi blue"><span>Ocupadas</span><strong>${fmt(mod.occupied)}</strong><small>ocupación física</small></div><div class="cc-kpi purple"><span>Reservadas</span><strong>${fmt(mod.reserved)}</strong><small>vigentes no materializadas</small></div><div class="cc-kpi red"><span>Bloqueadas</span><strong>${fmt(mod.blocked)}</strong><small>fuera de servicio</small></div><div class="cc-kpi green"><span>Libres</span><strong>${fmt(mod.free)}</strong><small>disponibles</small></div><div class="cc-kpi ${state.key==='normal'?'green':state.key==='attention'?'amber':'red'}"><span>% comprometido</span><strong>${fmt1(mod.pct)}%</strong><small>${state.label}</small></div></div>
      <div class="cc-analytics-grid"><section class="panel"><div class="cc-panel-head"><div><h3>Estado y composición del módulo</h3><p>Ocupadas, reservadas, bloqueadas y libres.</p></div><span class="cc-tag ${state.key}">${state.label}</span></div><div id="controlModuleChart" class="cc-chart">${fallbackComposition(mod)}</div><div class="cc-chart-hint">Toca un segmento para filtrar el mapa por estado.</div></section><section class="panel"><div class="cc-panel-head"><div><h3>Presión de capacidad por módulo</h3><p>Comparación del porcentaje comprometido entre módulos.</p></div><span class="cc-tag">INTERACTIVO</span></div><div id="controlAvailabilityChart" class="cc-chart cc-modules">${fallbackModules(hm.modules)}</div><div class="cc-chart-hint">Toca un módulo para abrirlo en el mapa de alojamiento.</div></section></div>
      <div class="cc-map-layout"><section class="panel cc-map-panel"><div class="cc-panel-head"><div><h3>Mapa de camas · ${escText(mod.label)}</h3><p>Vista táctil por habitación y cama.</p></div><span class="cc-tag">${fmt(items.length)} visibles</span></div><div class="cc-map-meta"><span>🟦 Ocupada</span><span>🟪 Reservada</span><span>🟥 Bloqueada</span><span>🟩 Libre</span></div>${bedMap(items)}</section><aside class="panel cc-detail-panel" id="controlDetailPanel">${detailHTML(selected)}</aside></div>
      <section class="panel cc-exceptions"><div class="cc-panel-head"><div><h3>Excepciones del módulo</h3><p>Controles que requieren atención operacional.</p></div><span class="cc-tag ${exceptions.some(x=>x.level==='critical')?'critical':exceptions.length?'attention':'normal'}">${exceptions.length?`${exceptions.length} alerta(s)`:'SIN ALERTAS'}</span></div><div class="cc-exception-list">${exceptions.length?exceptions.map(x=>`<div class="cc-exception ${x.level}"><strong>${escText(x.title)}</strong><span>${escText(x.detail)}</span></div>`).join(''):'<div class="notice ok">No se detectan excepciones críticas en el módulo seleccionado.</div>'}</div></section>`;
      bindControl(hm,items);
      if(typeof window.__mountControlCenterEcharts==='function')setTimeout(()=>window.__mountControlCenterEcharts(),0);
    }catch(err){console.error('Centro de Gestión avanzado: fallback',err);baseRenderControl()}
  };
})();
