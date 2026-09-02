let loadAllSequence=0;
let loadAllPending=0;

function loadAllSyncState(
  text,
  tone
){
  const badge=
    $('#syncBadge');

  if(!badge){
    return;
  }

  badge.textContent=
    text;

  badge.className=
    `status-pill ${tone}`;
}

function loadAllRefreshBusy(
  busy
){
  const button=
    $('#refreshAllBtn');

  if(!button){
    return;
  }

  button.disabled=
    Boolean(busy);

  if(busy){
    button.setAttribute(
      'aria-busy',
      'true'
    );

    button.setAttribute(
      'data-syncing',
      'true'
    );
  }else{
    button.removeAttribute(
      'aria-busy'
    );

    button.removeAttribute(
      'data-syncing'
    );
  }
}

async function loadAll(
  {
    snapshot=true
  }={}
){
  const sequence=
    ++loadAllSequence;

  loadAllPending++;

  loadAllRefreshBusy(
    true
  );

  loadAllSyncState(
    'Sincronizando',
    'warn'
  );

  try{
    if(snapshot){
      await advApi(
        'snapshot_today',
        {
          method:'POST',
          body:{},
          token:A.token
        }
      );
    }

    const [
      state,
      consults,
      imports
    ]=
      await Promise.all([
        advApi(
          'advanced_state',
          {
            token:A.token
          }
        ),

        webApi(
          'consults',
          {
            token:A.token
          }
        ).catch(
          ()=>({
            data:[]
          })
        ),

        webApi(
          'imports',
          {
            token:A.token
          }
        ).catch(
          ()=>({
            data:[]
          })
        )
      ]);

    /*
     * A newer synchronization started while this one
     * was waiting on the network.
     *
     * Do not let an old response overwrite newer state.
     */
    if(
      sequence!==
      loadAllSequence
    ){
      return true;
    }

    A.data=
      state.data;

    A.consults=
      consults.data||
      [];

    A.imports=
      imports.data||
      [];

    const source=
      A.data.settings.source_file||
      'Sin planilla';

    const updated=
      A.data.settings.last_update||
      '—';

    $('#systemMeta').textContent=
      `Base central Supabase · ${source} · ${updated}`;

    loadAllSyncState(
      'Actualizado',
      'ok'
    );

    renderAll();

    return true;
  }catch(err){
    /*
     * Authentication expiry is never stale:
     * terminate the admin session immediately.
     */
    if(err.status===401){
      logoutAdmin();
      return false;
    }

    /*
     * If another load started after this one,
     * its UI status owns the screen.
     */
    if(
      sequence!==
      loadAllSequence
    ){
      return false;
    }

    loadAllSyncState(
      'Error',
      'bad'
    );

    showMessage(
      err.message||
      'Error al cargar la base.',
      'error'
    );

    return false;
  }finally{
    loadAllPending=
      Math.max(
        loadAllPending-1,
        0
      );

    if(loadAllPending===0){
      loadAllRefreshBusy(
        false
      );
    }
  }
}
function renderAll(){if(!A.data)return;renderOverview();renderControl();renderPlanning();renderManagement();renderHistory();renderMovements();renderReservations();renderBlocks();renderWorkers();renderConsults();renderExcel();renderExports()}

function renderOverview(){const d=A.data,an=analytics(d),mv=an.mv,closed=d.snapshots.find(s=>s.snapshot_date===an.today),view=$('#view-overview');view.innerHTML=`
<div class="section-head"><div><h2>Centro de Control Operacional</h2><div class="muted">Fecha operacional ${fmtDate(an.today)} · datos centralizados</div></div><div class="section-actions"><span class="badge ${clean(closed?.closed_at)?'green':'amber'}">${clean(closed?.closed_at)?'Día cerrado':'Cierre pendiente'}</span></div></div>
<div class="kpi-grid">${kpi('Capacidad total',fmtInt(an.baseCapacity),`${an.effectiveCapacity} efectivas · ${an.blockedToday} fuera servicio`,'')}${kpi('Ocupadas',fmtInt(an.occupied),`${fmt1(an.occupancyPct)}% físico`)}${kpi('Reservadas hoy',fmtInt(an.reservedToday),'vigentes no materializadas','reserve')}${kpi('Comprometidas',fmtInt(an.committed),`${fmt1(an.committedPct)}% de capacidad`,an.committedPct>=90?'warning':'')}${kpi('Libres reales',fmtInt(an.free),'disponibilidad efectiva')}${kpi('Trabajadores',fmtInt(d.workers.length),`${occupiedWorkers(d).length} con cama completa`)}${kpi('Subidas hoy',fmtInt(mv.SUBIDA),'personas programadas')}${kpi('Bajadas hoy',fmtInt(mv.BAJADA),'personas programadas')}${kpi('Pend. llegada',fmtInt(an.pa.total),`${an.pa.future} futuras · ${an.pa.today} hoy · ${an.pa.overdue} atrasadas`,an.pa.total?'warning':'')}${kpi('Pend. salida',fmtInt(an.pd.total),`${an.pd.today} hoy · ${an.pd.overdue} vencidas`,an.pd.total?'warning':'')}${kpi('Empresas',fmtInt(an.companies.filter(x=>x.label!=='SIN EMPRESA').length),'dotación registrada')}${kpi('Inventario camas',fmtInt(d.inventory.length),'camas físicas del Excel')}</div>
<div class="grid-2 mt"><section class="panel"><h3>Dotación por empresa</h3>${bars(an.companies)}</section><section class="panel"><h3>Dotación por turno</h3>${bars(an.shifts)}</section></div>
<div class="grid-2 mt"><section class="panel"><h3>Próximos 7 días</h3><div class="forecast-grid">${an.forecast.slice(0,7).map(x=>`<div class="forecast-day ${x.state}"><div class="date">${esc(x.label)}</div><div class="pct">${fmt1(x.pct)}%</div><div class="mini">${x.committed}/${x.capacity} · libres ${x.free}</div></div>`).join('')}</div></section><section class="panel"><h3>Alertas prioritarias</h3><div class="exception-list">${an.exceptions.slice(0,5).map(e=>exceptionHTML(e)).join('')||'<div class="notice ok">Sin excepciones relevantes.</div>'}</div></section></div>`}
function exceptionHTML(e){return `<div class="exception ${e.level}"><div class="exception-head"><span>${esc(e.title)}</span><span class="badge ${e.level==='critical'?'red':e.level==='high'||e.level==='medium'?'amber':'blue'}">${fmtInt(e.count)}</span></div><div class="detail">${esc(e.detail)}</div><div class="action">Acción: ${esc(e.action)}</div></div>`}

function renderControl(){const d=A.data,an=analytics(d),hm=an.hm;if(!A.mapModule||!hm.moduleNames.includes(A.mapModule))A.mapModule=hm.moduleNames[0]||'';const items=hm.items.filter(x=>x.module===A.mapModule),rooms=new Map();for(const b of items){if(!rooms.has(b.room))rooms.set(b.room,[]);rooms.get(b.room).push(b)}const mod=hm.modules.find(x=>x.label===A.mapModule);$('#view-control').innerHTML=`
<div class="section-head"><div><h2>Centro de Gestión · Mapa de Alojamiento</h2><div class="muted">Módulo → habitación → cama → trabajador/reserva/bloqueo</div></div><div class="toolbar"><label class="field small"><span>Módulo</span><select id="mapModuleSelect">${hm.moduleNames.map(m=>`<option ${m===A.mapModule?'selected':''}>${esc(m)}</option>`).join('')}</select></label></div></div>
${mod?`<div class="kpi-grid mb">${kpi('Camas módulo',mod.capacity)}${kpi('Ocupadas',mod.occupied)}${kpi('Reservadas',mod.reserved,'','reserve')}${kpi('Bloqueadas',mod.blocked,'','warning')}${kpi('Libres',mod.free)}${kpi('% comprometido',`${fmt1(mod.pct)}%`)}</div>`:''}
<div class="legend mb"><span class="bed-chip free">Libre</span><span class="bed-chip occupied">Ocupada</span><span class="bed-chip reserved">Reservada</span><span class="bed-chip blocked">Bloqueada</span></div>
<div class="bed-map">${[...rooms.entries()].sort((a,b)=>Number(a[0])-Number(b[0])||String(a[0]).localeCompare(String(b[0]))).map(([room,beds])=>`<div class="room-card"><div class="room-title">Habitación ${esc(room)}</div><div class="beds">${beds.sort((a,b)=>String(a.bed).localeCompare(String(b.bed))).map(b=>`<button class="bed-chip ${b.status}" data-bedkey="${esc(lkey(b.module,b.room,b.bed))}" title="${esc(b.detail)}">Cama ${esc(b.bed)}</button>`).join('')}</div></div>`).join('')||'<div class="empty">Sin camas para este módulo.</div>'}</div>
<div class="grid-2 mt"><section class="panel"><h3>Resumen por módulo</h3>${table(hm.modules,[{label:'Módulo',key:'label'},{label:'Capacidad',key:'capacity'},{label:'Ocupadas',key:'occupied'},{label:'Reservadas',key:'reserved'},{label:'Bloq.',key:'blocked'},{label:'Libres',key:'free'},{label:'%',render:r=>`${fmt1(r.pct)}%`}],{limit:50})}</section><section class="panel"><h3>Control operacional hoy</h3><div class="metric-row"><span>Capacidad efectiva</span><strong>${an.effectiveCapacity}</strong></div><div class="metric-row"><span>Ocupación física</span><strong>${an.occupied}</strong></div><div class="metric-row"><span>Reservas no materializadas</span><strong>${an.reservedToday}</strong></div><div class="metric-row"><span>Disponibles</span><strong>${an.free}</strong></div><div class="metric-row"><span>Comprometido</span><strong>${fmt1(an.committedPct)}%</strong></div></section></div>`;
  $('#mapModuleSelect')?.addEventListener('change',e=>{A.mapModule=e.target.value;renderControl()});
  $$('[data-bedkey]',$('#view-control')).forEach(btn=>{
    btn.addEventListener('click',()=>{
      const b=hm.items.find(x=>lkey(x.module,x.room,x.bed)===btn.dataset.bedkey);if(!b)return;
      showDialog(`${b.module} · Hab. ${b.room} · Cama ${b.bed}`,`<div class="notice ${b.status==='free'?'ok':b.status==='blocked'?'error':b.status==='reserved'?'warn':'info'}"><strong>Estado: ${esc(b.status.toUpperCase())}</strong><br>${esc(b.detail)}</div>${b.worker?`<h4>Trabajador</h4><div class="code-box">${esc(JSON.stringify(b.worker,null,2))}</div>`:''}${b.reservation?`<h4>Reserva</h4><div class="code-box">${esc(JSON.stringify(b.reservation,null,2))}</div>`:''}${b.block?`<h4>Bloqueo</h4><div class="code-box">${esc(JSON.stringify(b.block,null,2))}</div>`:''}`);
    });
  });
}
