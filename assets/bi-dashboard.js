(()=>{
  'use strict';
  if(typeof renderOverview!=='function'||typeof analytics!=='function')return;

  const EXPECTED_BEDS=504;
  const BI={company:'',shift:'',module:'',date:todayISO(),resizeTimer:null};
  const baseRenderOverview=renderOverview;

  const uniq=(a)=>[...new Set(a.filter(Boolean))].sort((x,y)=>String(x).localeCompare(String(y),'es'));
  const signed=(n,suffix='')=>{const v=Number(n)||0;return `${v>0?'+':''}${fmt1(v)}${suffix}`};
  const deltaClass=n=>Number(n)>0?'up':Number(n)<0?'down':'flat';
  const normKey=(v)=>plain(v);

  function recentClosed(data,limit=7){
    return closedSnapshots(data).filter(s=>clean(s.snapshot_date)<todayISO()).slice(-limit);
  }
  function sparkline(values){
    const nums=values.map(Number).filter(Number.isFinite);
    if(nums.length<2)return '<span class="bi-spark-empty">Sin tendencia</span>';
    const W=112,H=30,P=3,min=Math.min(...nums),max=Math.max(...nums),range=Math.max(max-min,1);
    const pts=nums.map((v,i)=>`${(P+(W-P*2)*i/(nums.length-1)).toFixed(1)},${(H-P-(H-P*2)*(v-min)/range).toFixed(1)}`).join(' ');
    return `<svg class="bi-spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  function kpiCard({label,value,detail='',delta=null,deltaSuffix='',series=[],tone='',meta=''}){
    const hasDelta=delta!==null&&Number.isFinite(Number(delta));
    return `<article class="bi-kpi ${tone}"><div class="bi-kpi-top"><span>${esc(label)}</span>${meta?`<small>${esc(meta)}</small>`:''}</div><div class="bi-kpi-value">${esc(value)}</div><div class="bi-kpi-foot"><div>${hasDelta?`<b class="bi-delta ${deltaClass(delta)}">${signed(delta,deltaSuffix)}</b>`:''}<span>${esc(detail)}</span></div>${sparkline(series)}</div></article>`;
  }
  function currentQuality(data){
    const inventoryKeys=new Set(data.inventory.map(b=>lkey(b.module,b.room,b.bed)));
    const occ=occupiedWorkers(data),seen=new Map();
    for(const w of occ){const k=lkey(w.modulo,w.habitacion,w.cama);seen.set(k,(seen.get(k)||0)+1)}
    const invalidRut=data.workers.filter(w=>clean(w.rut)&&!rutValid(w.rut)).length;
    const incomplete=data.workers.filter(w=>!lkey(w.modulo,w.habitacion,w.cama).split('|').every(Boolean)).length;
    const missingInv=occ.filter(w=>!inventoryKeys.has(lkey(w.modulo,w.habitacion,w.cama))).length;
    const duplicate=[...seen.values()].filter(n=>n>1).length;
    const badBeds=data.inventory.filter(b=>!['A','B','C'].includes(loc(b.bed,'bed'))).length;
    const inventoryGap=Math.abs(data.inventory.length-EXPECTED_BEDS);
    const issues=invalidRut+incomplete+missingInv+duplicate+badBeds+(inventoryGap?1:0);
    return {issues,invalidRut,incomplete,missingInv,duplicate,badBeds,inventoryGap,status:issues?'REVISAR':'VALIDADA'};
  }
  function filterWorkers(data){
    return data.workers.filter(w=>(!BI.company||normKey(w.empresa)===normKey(BI.company))&&(!BI.shift||normKey(w.turno)===normKey(BI.shift))&&(!BI.module||normKey(w.modulo)===normKey(BI.module)));
  }
  function filterBar(data){
    const companies=uniq(data.workers.map(w=>clean(w.empresa))),shifts=uniq(data.workers.map(w=>clean(w.turno))),modules=uniq(data.inventory.map(b=>clean(b.module)));
    const opts=(arr,val,label)=>`<option value="">${label}</option>${arr.map(x=>`<option value="${esc(x)}" ${x===val?'selected':''}>${esc(x)}</option>`).join('')}`;
    return `<section class="bi-filterbar" aria-label="Filtros de análisis"><div class="bi-filter-title"><strong>Filtros interactivos</strong><span>Aplican solo donde el dato puede segmentarse sin distorsionar la capacidad global.</span></div><div class="bi-filters"><label><span>Empresa</span><select id="biCompany">${opts(companies,BI.company,'Todas')}</select></label><label><span>Turno</span><select id="biShift">${opts(shifts,BI.shift,'Todos')}</select></label><label><span>Módulo</span><select id="biModule">${opts(modules,BI.module,'Todos')}</select></label><label><span>Fecha de análisis</span><input id="biDate" type="date" min="${todayISO()}" max="${addDays(todayISO(),29)}" value="${esc(BI.date)}"></label><button id="biClear" class="btn btn-secondary" type="button">Limpiar</button></div></section>`;
  }
  function qualityDetail(q,data){
    return `<div class="bi-quality-grid"><div><span>Inventario</span><strong>${fmtInt(data.inventory.length)} / ${EXPECTED_BEDS}</strong></div><div><span>RUT inválidos</span><strong>${q.invalidRut}</strong></div><div><span>Sin cama completa</span><strong>${q.incomplete}</strong></div><div><span>Cama duplicada</span><strong>${q.duplicate}</strong></div><div><span>Fuera inventario</span><strong>${q.missingInv}</strong></div><div><span>Etiquetas cama inválidas</span><strong>${q.badBeds}</strong></div></div>`;
  }
  function moduleStack(data,an){
    let mods=an.hm.modules;
    if(BI.module)mods=mods.filter(m=>normKey(m.label)===normKey(BI.module));
    if(!mods.length)return '<div class="empty">Sin módulos para el filtro actual.</div>';
    return `<div class="bi-module-stack">${mods.map(m=>{
      const total=Math.max(Number(m.capacity)||0,1),seg=(cls,n,label)=>Number(n)>0?`<button type="button" class="bi-seg ${cls}" style="width:${Math.max((Number(n)||0)/total*100,1.6)}%" data-module="${esc(m.label)}" data-status="${cls}" aria-label="${esc(`${m.label}: ${label} ${n}`)}"><span>${Number(n)>=8?fmtInt(n):''}</span></button>`:'';
      return `<div class="bi-module-row"><div class="bi-module-head"><strong>${esc(m.label)}</strong><span>${fmt1(m.pct)}% comprometido físico</span></div><div class="bi-stackbar">${seg('occupied',m.occupied,'ocupadas')}${seg('reserved',m.reserved,'reservadas')}${seg('blocked',m.blocked,'bloqueadas')}${seg('free',m.free,'libres')}</div><div class="bi-module-meta"><span>Ocup. ${m.occupied}</span><span>Res. ${m.reserved}</span><span>Bloq. ${m.blocked}</span><span>Libres ${m.free}</span><span>Total ${m.capacity}</span></div></div>`;
    }).join('')}</div><div class="bi-legend"><span><i class="occupied"></i>Ocupada</span><span><i class="reserved"></i>Reservada</span><span><i class="blocked"></i>Bloqueada</span><span><i class="free"></i>Libre</span></div>`;
  }
  function capacityHeatmap(an){
    return `<div class="bi-heatmap">${an.forecast.map(x=>`<button type="button" class="bi-heat ${x.state} ${x.date===BI.date?'selected':''}" data-forecast-date="${x.date}" title="${esc(`${fmtDate(x.date)} · ${fmt1(x.pct)}% · ${x.free} libres`)}"><span>${esc(x.label)}</span><strong>${fmt1(x.pct)}%</strong><small>${x.over?`Déficit ${x.over}`:`${x.free} libres`}</small></button>`).join('')}</div><div class="bi-scale"><span>0–79 normal</span><span>80–89 atención</span><span>90–99 crítico</span><span>≥100 sobrecupo</span></div>`;
  }
  function movementsChart(data,an){
    const n=typeof window!=='undefined'&&window.innerWidth<640?14:30,rows=an.forecast.slice(0,n),W=Math.max(720,rows.length*34),H=250,L=38,R=15,T=20,B=38,mid=125,max=Math.max(1,...rows.flatMap(x=>[x.up,x.down]));
    const iw=W-L-R,step=iw/Math.max(rows.length,1),scale=(mid-T-8)/max;
    let bars='',linePts=[];
    rows.forEach((x,i)=>{const cx=L+step*i+step/2,bw=Math.min(11,step*.32),upH=x.up*scale,downH=x.down*scale,net=x.up-x.down,ny=mid-net*scale*.7;linePts.push(`${cx.toFixed(1)},${Math.max(T,Math.min(H-B,ny)).toFixed(1)}`);bars+=`<g class="bi-move-day" data-move-date="${x.date}"><rect x="${cx-bw-1}" y="${mid-upH}" width="${bw}" height="${upH}" rx="2" class="up"/><rect x="${cx+1}" y="${mid}" width="${bw}" height="${downH}" rx="2" class="down"/><rect x="${cx-step/2}" y="${T}" width="${step}" height="${H-T-B}" fill="transparent"/><title>${esc(`${fmtDate(x.date)} · Suben ${x.up} · Bajan ${x.down} · Neto ${net>=0?'+':''}${net}`)}</title></g>`});
    const labels=rows.map((x,i)=>i%Math.max(1,Math.ceil(rows.length/8))===0||i===rows.length-1?`<text x="${(L+step*i+step/2).toFixed(1)}" y="${H-12}" text-anchor="middle">${esc(x.label)}</text>`:'').join('');
    return `<div class="bi-chart-scroll"><svg class="bi-movement-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Subidas, bajadas y movimiento neto"><line x1="${L}" y1="${mid}" x2="${W-R}" y2="${mid}" class="axis"/><text x="4" y="${mid-5}" class="axis-label">0</text>${bars}<polyline class="net" points="${linePts.join(' ')}" fill="none"/>${linePts.map(p=>{const [x,y]=p.split(',');return `<circle cx="${x}" cy="${y}" r="3" class="net-dot"/>`}).join('')}${labels}</svg></div><div class="bi-legend"><span><i class="move-up"></i>Subidas</span><span><i class="move-down"></i>Bajadas</span><span><i class="move-net"></i>Neto</span></div>`;
  }
  function filteredSummary(data){
    const rows=filterWorkers(data),assigned=rows.filter(w=>lkey(w.modulo,w.habitacion,w.cama).split('|').every(Boolean));
    const byCompany=groupRows(rows,'empresa','SIN EMPRESA').slice(0,8),byShift=groupRows(rows,'turno','SIN TURNO').slice(0,8);
    const filterText=[BI.company&&`Empresa: ${BI.company}`,BI.shift&&`Turno: ${BI.shift}`,BI.module&&`Módulo: ${BI.module}`].filter(Boolean).join(' · ')||'Sin filtros';
    return `<div class="bi-filter-summary"><div><span>Dotación filtrada</span><strong>${rows.length}</strong><small>${assigned.length} con cama · ${esc(filterText)}</small></div><div><h4>Empresas</h4>${bars(byCompany,null,8)}</div><div><h4>Turnos</h4>${bars(byShift,null,8)}</div></div>`;
  }
  function selectedDay(an){return an.forecast.find(x=>x.date===BI.date)||an.forecast[0]}
  function renderBI(){
    const d=A.data,an=analytics(d),q=currentQuality(d),closed=recentClosed(d,7),prev=closed.at(-1)||null;
    const histOccupied=[...closed.map(s=>Number(s.occupied)||0),an.occupied],histReserved=[...closed.map(s=>Number(s.reserved)||0),an.reservedToday],histCommitted=[...closed.map(s=>(Number(s.occupied)||0)+(Number(s.reserved)||0)),an.committed],histFree=[...closed.map(s=>Number(s.free)||0),an.free],histPct=[...closed.map(s=>Number(s.committed_occupancy)||0),an.committedPct];
    const prevCommitted=prev?(Number(prev.occupied)||0)+(Number(prev.reserved)||0):null,day=selectedDay(an),view=$('#view-overview'),closedToday=d.snapshots.find(s=>s.snapshot_date===an.today&&clean(s.closed_at));
    view.innerHTML=`<div class="section-head bi-head"><div><div class="eyebrow">OPERACIÓN Y ANALÍTICA</div><h2>Centro de Control Operacional</h2><div class="muted">Fecha operacional ${fmtDate(an.today)} · inventario físico y capacidad operativa separados</div></div><div class="section-actions"><span class="badge ${closedToday?'green':'amber'}">${closedToday?'Día cerrado':'Cierre pendiente'}</span></div></div>
    ${filterBar(d)}
    <div class="bi-kpi-grid">
      ${kpiCard({label:'Capacidad operativa',value:fmtInt(an.baseCapacity),detail:`${an.effectiveCapacity} efectivas · ${an.blockedToday} fuera servicio`,tone:'navy',meta:'GLOBAL'})}
      ${kpiCard({label:'Ocupadas',value:fmtInt(an.occupied),detail:prev?'vs. último cierre':'Sin cierre previo',delta:prev?an.occupied-Number(prev.occupied||0):null,series:histOccupied,tone:'blue'})}
      ${kpiCard({label:'Reservadas hoy',value:fmtInt(an.reservedToday),detail:'vigentes no materializadas',delta:prev?an.reservedToday-Number(prev.reserved||0):null,series:histReserved,tone:'purple'})}
      ${kpiCard({label:'Comprometidas',value:fmtInt(an.committed),detail:`${fmt1(an.committedPct)}% de capacidad efectiva`,delta:prev?an.committed-prevCommitted:null,series:histCommitted,tone:an.committedPct>=90?'amber':'teal'})}
      ${kpiCard({label:'Libres reales',value:fmtInt(an.free),detail:'disponibilidad efectiva',delta:prev?an.free-Number(prev.free||0):null,series:histFree,tone:'green'})}
      ${kpiCard({label:'% comprometido',value:`${fmt1(an.committedPct)}%`,detail:prev?'variación vs. último cierre':'Sin cierre previo',delta:prev?an.committedPct-Number(prev.committed_occupancy||0):null,deltaSuffix:' pp',series:histPct,tone:an.committedPct>=100?'red':an.committedPct>=90?'amber':'blue'})}
      <button id="biQualityBtn" type="button" class="bi-kpi quality ${q.issues?'warn':'ok'}"><div class="bi-kpi-top"><span>Calidad de Base</span><small>CONTROL</small></div><div class="bi-kpi-value">${q.status}</div><div class="bi-quality-line"><strong>${q.issues}</strong><span>observación${q.issues===1?'':'es'} · Inventario ${d.inventory.length}/${EXPECTED_BEDS}</span></div></button>
      ${kpiCard({label:'Dotación filtrada',value:fmtInt(filterWorkers(d).length),detail:'responde a Empresa / Turno / Módulo',tone:'slate',meta:'FILTRABLE'})}
    </div>
    <div class="bi-grid bi-grid-main">
      <section class="panel bi-panel"><div class="bi-panel-head"><div><h3>Ocupación física por módulo</h3><p>Inventario físico: ocupadas, reservadas, bloqueadas y libres.</p></div><span class="bi-tag">HOY</span></div>${moduleStack(d,an)}</section>
      <section class="panel bi-panel"><div class="bi-panel-head"><div><h3>Heatmap de capacidad · 30 días</h3><p>Presión de capacidad global según ocupación proyectada y reservas vigentes.</p></div><span class="bi-tag">GLOBAL</span></div>${capacityHeatmap(an)}<div class="bi-day-summary"><div><span>${fmtDate(day.date)}</span><strong>${fmt1(day.pct)}%</strong></div><div><span>Comprometidas</span><strong>${day.committed}</strong></div><div><span>Libres</span><strong>${day.free}</strong></div><div><span>Déficit</span><strong>${day.over}</strong></div></div></section>
    </div>
    <div class="bi-grid bi-grid-secondary">
      <section class="panel bi-panel"><div class="bi-panel-head"><div><h3>Subidas / Bajadas / Neto</h3><p>Movimientos programados del horizonte operacional.</p></div><span class="bi-tag">30 DÍAS</span></div>${movementsChart(d,an)}</section>
      <section class="panel bi-panel"><div class="bi-panel-head"><div><h3>Lectura filtrada de dotación</h3><p>Empresa, turno y módulo sin alterar los KPI globales de capacidad.</p></div><span class="bi-tag">INTERACTIVO</span></div>${filteredSummary(d)}</section>
    </div>
    <div class="bi-grid bi-grid-secondary"><section class="panel bi-panel"><div class="bi-panel-head"><div><h3>Alertas prioritarias</h3><p>Excepciones operacionales ordenadas por severidad.</p></div><span class="bi-tag ${an.status}">${an.status==='critical'?'CRÍTICO':an.status==='attention'?'ATENCIÓN':'NORMAL'}</span></div><div class="exception-list">${an.exceptions.slice(0,6).map(e=>exceptionHTML(e)).join('')||'<div class="notice ok">Sin excepciones relevantes.</div>'}</div></section><section class="panel bi-panel"><div class="bi-panel-head"><div><h3>Resumen ejecutivo</h3><p>Lectura automática de la situación actual.</p></div><span class="bi-tag">HOY</span></div><div class="summary-box"><p>${esc(an.summary)}</p></div><div class="bi-exec-metrics"><div><span>Subidas hoy</span><strong>${an.mv.SUBIDA}</strong></div><div><span>Bajadas hoy</span><strong>${an.mv.BAJADA}</strong></div><div><span>Pend. llegada</span><strong>${an.pa.total}</strong></div><div><span>Pend. salida</span><strong>${an.pd.total}</strong></div></div></section></div>`;
    wireBI(d,an,q);
  }
  function statusItems(data,module,status){
    const hm=heatmap(data,todayISO());return hm.items.filter(x=>normKey(x.module)===normKey(module)&&x.status===status);
  }
  function drillModule(data,module,status){
    const labels={occupied:'Ocupadas',reserved:'Reservadas',blocked:'Bloqueadas',free:'Libres'},items=statusItems(data,module,status);
    showDialog(`${module} · ${labels[status]||status}`,table(items,[{label:'Hab.',key:'room'},{label:'Cama',key:'bed'},{label:'Estado',render:r=>esc(r.status.toUpperCase())},{label:'Detalle',key:'detail'}],{limit:200,empty:'Sin camas para este estado.'}));
  }
  function drillForecast(an,date){
    const x=an.forecast.find(r=>r.date===date);if(!x)return;
    showDialog(`Capacidad · ${fmtDate(date)}`,`<div class="bi-dialog-grid"><div><span>Capacidad base</span><strong>${x.base_capacity}</strong></div><div><span>Bloqueadas</span><strong>${x.blocked}</strong></div><div><span>Capacidad efectiva</span><strong>${x.capacity}</strong></div><div><span>Ocup. proyectada</span><strong>${x.physical}</strong></div><div><span>Reservadas</span><strong>${x.reserved}</strong></div><div><span>Comprometidas</span><strong>${x.committed}</strong></div><div><span>Libres</span><strong>${x.free}</strong></div><div><span>Déficit</span><strong>${x.over}</strong></div><div><span>Subidas</span><strong>${x.up}</strong></div><div><span>Bajadas</span><strong>${x.down}</strong></div></div>`);
  }
  function drillMoves(data,date){
    const rows=data.movements.filter(m=>clean(m.movement_date)===date);
    showDialog(`Movimientos · ${fmtDate(date)}`,table(rows,[{label:'Tipo',key:'movement_type'},{label:'Turno',key:'shift'},{label:'Empresa',key:'company'},{label:'Personas',key:'people_count'},{label:'Hora',key:'bus_time'},{label:'Bus',key:'bus'}],{limit:100,empty:'Sin movimientos programados para esta fecha.'}));
  }
  function wireBI(data,an,q){
    $('#biCompany')?.addEventListener('change',e=>{BI.company=e.target.value;renderOverview()});
    $('#biShift')?.addEventListener('change',e=>{BI.shift=e.target.value;renderOverview()});
    $('#biModule')?.addEventListener('change',e=>{BI.module=e.target.value;renderOverview()});
    $('#biDate')?.addEventListener('change',e=>{BI.date=e.target.value||todayISO();renderOverview()});
    $('#biClear')?.addEventListener('click',()=>{BI.company='';BI.shift='';BI.module='';BI.date=todayISO();renderOverview()});
    $('#biQualityBtn')?.addEventListener('click',()=>showDialog('Calidad de Base',`${qualityDetail(q,data)}<p class="muted mt">El indicador valida inventario esperado, RUT, asignaciones completas, duplicidades y correspondencia con bed_inventory. No modifica datos.</p>`));
    $$('[data-module][data-status]',$('#view-overview')).forEach(el=>el.addEventListener('click',()=>drillModule(data,el.dataset.module,el.dataset.status)));
    $$('[data-forecast-date]',$('#view-overview')).forEach(el=>el.addEventListener('click',()=>{BI.date=el.dataset.forecastDate;drillForecast(an,BI.date);renderOverview()}));
    $$('[data-move-date]',$('#view-overview')).forEach(el=>{el.setAttribute('tabindex','0');el.setAttribute('role','button');const go=()=>drillMoves(data,el.dataset.moveDate);el.addEventListener('click',go);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}})});
  }
  renderOverview=function(){renderBI()};
  if(typeof window!=='undefined')window.addEventListener('resize',()=>{clearTimeout(BI.resizeTimer);BI.resizeTimer=setTimeout(()=>{if(A?.data&&A.currentView==='overview')renderOverview()},180)});
})();
