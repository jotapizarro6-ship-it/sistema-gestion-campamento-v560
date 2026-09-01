function planningRows(start,days,data){
  const today=
    todayISO();

  const sd=
    start<today
      ? today
      : start;

  const rows=[];

  for(let i=0;i<days;i++){
    const ds=
      addDays(
        sd,
        i
      );

    const capacityInfo=
      effectiveCapacityV1(
        ds,
        data
      );

    const projected=
      projectedPhysical(
        ds,
        data
      );

    const mv=
      movementTotals(
        ds,
        data
      );

    const reserved=
      reservedCount(
        ds,
        data
      );

    const committed=
      projected+
      reserved;

    const pct=
      capacityInfo.capacity_available
        ? (
            capacityInfo.capacity
              ? Math.round(
                  committed/
                  capacityInfo.capacity*
                  1000
                )/10
              : (
                  committed
                    ? 100
                    : 0
                )
          )
        : null;

    const occupancy=
      capacityInfo.capacity_available
        ? (
            capacityInfo.capacity
              ? Math.round(
                  projected/
                  capacityInfo.capacity*
                  1000
                )/10
              : (
                  projected
                    ? 100
                    : 0
                )
          )
        : null;

    rows.push({
      date:ds,

      base_capacity:
        capacityInfo.base_capacity,

      blocked:
        capacityInfo.blocked,

      capacity:
        capacityInfo.capacity,

      capacity_available:
        capacityInfo.capacity_available,

      capacity_source:
        capacityInfo.capacity_source,

      capacity_code:
        capacityInfo.code,

      operational_universe_count:
        capacityInfo.operational_universe_count,

      occupied:
        projected,

      reserved,

      free:
        capacityInfo.capacity_available
          ? Math.max(
              capacityInfo.capacity-
              committed,
              0
            )
          : null,

      occupancy,

      committed_occupancy:
        pct,

      over:
        capacityInfo.capacity_available
          ? Math.max(
              committed-
              capacityInfo.capacity,
              0
            )
          : null,

      up:
        mv.SUBIDA,

      down:
        mv.BAJADA
    });
  }

  return rows;
}
function renderPlanningCapacityAvailable(){const rows=planningRows(A.planStart,A.planDays,A.data);$('#view-planning').innerHTML=`<div class="section-head"><div><h2>Planificación de capacidad</h2><div class="muted">Proyección física basada en subidas/bajadas + reservas vigentes</div></div><div class="toolbar"><label class="field small"><span>Desde</span><input id="planStart" type="date" value="${esc(A.planStart)}" min="${todayISO()}"></label><label class="field small"><span>Días</span><select id="planDays">${[7,14,21,30,31].map(n=>`<option ${n===A.planDays?'selected':''}>${n}</option>`).join('')}</select></label><button id="applyPlan" class="btn btn-primary">Aplicar</button></div></div><section class="panel mb">${svgForecast(rows.map(x=>({...x,physical:x.occupied,committed:x.occupied+x.reserved,label:fmtShort(x.date)})))}</section>${table(rows,[{label:'Fecha',render:r=>fmtDate(r.date)},{label:'Cap. base',key:'base_capacity'},{label:'Bloq.',key:'blocked'},{label:'Cap. efectiva',key:'capacity'},{label:'Ocup. proyectada',key:'occupied'},{label:'Reservas',key:'reserved'},{label:'Suben',key:'up'},{label:'Bajan',key:'down'},{label:'Libres',key:'free'},{label:'% comprometido',render:r=>`<strong class="${r.over?'text-danger':''}">${fmt1(r.committed_occupancy)}%</strong>`},{label:'Déficit',render:r=>r.over?`<span class="badge red">${r.over}</span>`:'—'}],{limit:31})}`;$('#applyPlan').addEventListener('click',()=>{A.planStart=$('#planStart').value||todayISO();A.planDays=Math.min(31,Math.max(1,Number($('#planDays').value)||7));renderPlanning()})}

function renderPlanning(){
  const rows=
    planningRows(
      A.planStart,
      A.planDays,
      A.data
    );

  if(
    rows.every(
      row=>row.capacity_available
    )
  ){
    return renderPlanningCapacityAvailable();
  }

  $('#view-planning').innerHTML=
    '<div class="section-head">'+
      '<div>'+
        '<h2>Planificacion de capacidad</h2>'+
        '<div class="muted">'+
          'Capacity V1 · daily_capacity → universo operacional → CAPACITY_UNAVAILABLE'+
        '</div>'+
      '</div>'+
      '<div class="toolbar">'+
        '<label class="field small">'+
          '<span>Desde</span>'+
          '<input id="planStart" type="date" value="'+
          esc(A.planStart)+
          '" min="'+
          todayISO()+
          '">'+
        '</label>'+
        '<label class="field small">'+
          '<span>Dias</span>'+
          '<select id="planDays">'+
            [7,14,21,30,31]
              .map(
                n=>
                  '<option '+
                  (
                    n===A.planDays
                      ? 'selected'
                      : ''
                  )+
                  '>'+
                  n+
                  '</option>'
              )
              .join('')+
          '</select>'+
        '</label>'+
        '<button id="applyPlan" class="btn btn-primary">Aplicar</button>'+
      '</div>'+
    '</div>'+
    '<div class="notice warn mb">'+
      '<strong>CAPACIDAD NO DISPONIBLE</strong><br>'+
      'Uno o mas dias no tienen una fuente de capacidad valida. '+
      'No se fabrican libres, porcentajes ni deficit para esos dias.'+
    '</div>'+
    '<section class="panel mb">'+
      svgForecast(
        rows.map(
          row=>({
            ...row,
            physical:
              row.occupied,
            committed:
              row.occupied+
              row.reserved,
            label:
              fmtShort(
                row.date
              )
          })
        )
      )+
    '</section>'+
    table(
      rows,
      [
        {
          label:'Fecha',
          render:
            row=>
              fmtDate(
                row.date
              )
        },
        {
          label:'Fuente',
          render:
            row=>
              capacitySourceLabelV1(
                row.capacity_source
              )
        },
        {
          label:'Cap. base',
          render:
            row=>
              capacityNumberV1(
                row.base_capacity
              )
        },
        {
          label:'Bloq.',
          render:
            row=>
              capacityNumberV1(
                row.blocked
              )
        },
        {
          label:'Cap. efectiva',
          render:
            row=>
              capacityNumberV1(
                row.capacity
              )
        },
        {
          label:'Ocup. proyectada',
          key:'occupied'
        },
        {
          label:'Reservas',
          key:'reserved'
        },
        {
          label:'Libres',
          render:
            row=>
              capacityNumberV1(
                row.free
              )
        },
        {
          label:'% comprometido',
          render:
            row=>
              capacityPctV1(
                row.committed_occupancy
              )
        },
        {
          label:'Deficit',
          render:
            row=>
              row.over===null
                ? '—'
                : row.over>0
                  ? '<span class="badge red">'+
                    row.over+
                    '</span>'
                  : '—'
        }
      ],
      {
        limit:31
      }
    );

  $('#applyPlan')
    ?.addEventListener(
      'click',
      ()=>{
        A.planStart=
          $('#planStart').value||
          todayISO();

        A.planDays=
          Math.min(
            31,
            Math.max(
              1,
              Number(
                $('#planDays').value
              )||7
            )
          );

        renderPlanning();
      }
    );
}
function renderManagementCapacityAvailable(){const d=A.data,an=analytics(d),cost=an.cost,bed=an.bed,currentMonth=todayISO().slice(0,7),currentMonthBD=bed.month.find(x=>x.label===currentMonth)?.n||0,proj30=an.forecast.reduce((a,x)=>a+x.committed,0),risk=an.forecast.filter(x=>x.pct>=90),over=an.forecast.filter(x=>x.over>0),recent30=an.closed.filter(s=>s.snapshot_date>=addDays(todayISO(),-29)),max30=Math.max(an.occupied,...recent30.map(x=>Number(x.occupied)||0)),min30=Math.min(an.occupied,...recent30.map(x=>Number(x.occupied)||0));$('#view-management').innerHTML=`
<div class="section-head"><div><h2>Dashboard Gerencial Avanzado</h2><div class="muted">KPI ejecutivos, proyección, excepciones, camas-día, costos y drillthrough</div></div><span class="badge ${an.status==='critical'?'red':an.status==='attention'?'amber':'green'}">Estado ${an.status==='critical'?'CRÍTICO':an.status==='attention'?'ATENCIÓN':'NORMAL'}</span></div>
<div class="summary-box mb"><p>${esc(an.summary)}</p></div>
<div class="kpi-grid">${kpi('Capacidad total',an.baseCapacity,`${an.effectiveCapacity} efectivas · ${an.blockedToday} fuera servicio`)}${kpi('Ocupadas',an.occupied,`${fmt1(an.occupancyPct)}% físico`)}${kpi('Reservadas hoy',an.reservedToday,'vigentes no materializadas','reserve')}${kpi('Comprometidas',an.committed,`${an.committed}/${an.effectiveCapacity} efectivas`,an.committedPct>=90?'warning':'')}${kpi('Libres reales',an.free,'disponibilidad efectiva')}${kpi('% ocupación física',`${fmt1(an.occupancyPct)}%`,'ocupadas / capacidad efectiva')}${kpi('% ocup. comprometida',`${fmt1(an.committedPct)}%`,'ocupadas + reservas',an.committedPct>=100?'danger':an.committedPct>=90?'warning':'')}${kpi('Ingresos hoy',an.mv.SUBIDA,`${A.data.reservations.filter(r=>['PENDIENTE','CONFIRMADA'].includes(plain(r.status))&&r.arrival_date===an.today).reduce((a,r)=>a+(Number(r.bed_count)||0),0)} camas con reserva`)}${kpi('Salidas hoy',an.mv.BAJADA,`${an.pd.today} reservas vencen hoy`)}${kpi('Pend. llegada',an.pa.total,`${an.pa.future} futuras · ${an.pa.today} hoy · ${an.pa.overdue} atrasadas`,an.pa.total?'warning':'')}${kpi('Pend. salida',an.pd.total,`${an.pd.today} hoy · ${an.pd.overdue} vencidas`,an.pd.total?'warning':'')}${kpi('Fuera servicio',an.blockedToday,'camas bloqueadas',an.blockedToday?'warning':'')}</div>
<div class="grid-2 mt"><section class="panel"><h3>Proyección ejecutiva 30 días</h3>${svgForecast(an.forecast)}<div class="metric-row"><span>Días con riesgo ≥90%</span><strong>${risk.length}</strong></div><div class="metric-row"><span>Días con sobrecupo</span><strong>${over.length}</strong></div></section><section class="panel"><h3>Excepciones y anomalías</h3><div class="exception-list">${[...an.exceptions,...an.anomalies].slice(0,15).map(e=>e.action?exceptionHTML(e):`<div class="exception ${e.level}"><div class="exception-head"><span>${esc(e.title)}</span><span class="badge amber">ANOMALÍA</span></div><div class="detail">${esc(e.detail)}</div></div>`).join('')||'<div class="notice ok">Sin excepciones ni anomalías relevantes.</div>'}</div></section></div>
<div class="grid-3 mt"><section class="panel"><h3>Empresas</h3>${bars(an.companies)}</section><section class="panel"><h3>Turnos</h3>${bars(an.shifts)}</section><section class="panel"><h3>Módulos comprometidos</h3>${bars(an.hm.modules.map(x=>({label:x.label,n:x.committed})))}</section></div>
<div class="grid-4 mt"><div class="panel"><div class="eyebrow">Camas-día mes</div><h2>${fmtInt(currentMonthBD)}</h2><div class="muted">cierres confirmados</div></div><div class="panel"><div class="eyebrow">Costo mes</div><h2 class="clp">${fmtCLP(currentMonthBD*cost)}</h2><div class="muted">a ${fmtCLP(cost)} / cama-día</div></div><div class="panel"><div class="eyebrow">Proyección 30 días</div><h2>${fmtInt(proj30)}</h2><div class="muted">camas-día comprometidas proyectadas</div></div><div class="panel"><div class="eyebrow">Costo proyectado</div><h2 class="clp">${fmtCLP(proj30*cost)}</h2><div class="muted">30 días</div></div></div>
<div class="grid-2 mt"><section class="panel"><h3>Camas-día por empresa</h3>${table(bed.company.slice(0,20),[{label:'Empresa',key:'label'},{label:'Camas-día',key:'n'},{label:'Costo',render:r=>fmtCLP(r.n*cost)}],{limit:20})}</section><section class="panel"><h3>Benchmark histórico</h3><div class="metric-row"><span>Promedio comprometido reciente</span><strong>${an.histAvg==null?'Sin datos':fmt1(an.histAvg)+'%'}</strong></div><div class="metric-row"><span>Máximo ocupadas (30 días)</span><strong>${max30}</strong></div><div class="metric-row"><span>Mínimo ocupadas (30 días)</span><strong>${min30}</strong></div><div class="metric-row"><span>Costo cama-día</span><strong>${fmtCLP(cost)}</strong></div><form id="costForm" class="toolbar mt"><label class="field"><span>Actualizar costo CLP/cama-día</span><input id="costValue" type="number" min="0" step="1" value="${cost}"></label><button class="btn btn-primary">Guardar costo</button></form></section></div>
<section class="panel mt"><div class="section-head"><div><h3>Drillthrough de dotación</h3><div class="muted">Explora empresa → turno → módulo → habitación → cama → trabajador</div></div><div class="toolbar"><label class="field small"><span>Dimensión</span><select id="drillDim"><option value="empresa">Empresa</option><option value="turno">Turno</option><option value="modulo">Módulo</option><option value="habitacion">Habitación</option><option value="cama">Cama</option><option value="especialidad">Especialidad</option></select></label><label class="field"><span>Valor</span><select id="drillValue"></select></label></div></div><div id="drillTable"></div></section>`;
  $('#costForm').addEventListener('submit',async e=>{e.preventDefault();try{await advApi('update_cost',{method:'POST',body:{cost_per_bed_day:Number($('#costValue').value)},token:A.token});showMessage('Costo por cama-día actualizado.');await loadAll({snapshot:false})}catch(err){showMessage(err.message,'error')}});
  const dim=$('#drillDim'),val=$('#drillValue');dim.value=A.drillDim;const refresh=()=>{A.drillDim=dim.value;const values=[...new Set(d.workers.map(w=>clean(w[A.drillDim])||'SIN DATO'))].sort((a,b)=>a.localeCompare(b,'es'));if(!values.includes(A.drillValue))A.drillValue=values[0]||'';val.innerHTML=values.map(x=>`<option ${x===A.drillValue?'selected':''}>${esc(x)}</option>`).join('');renderDrill()};const renderDrill=()=>{A.drillValue=val.value;const rows=d.workers.filter(w=>(clean(w[A.drillDim])||'SIN DATO')===A.drillValue);$('#drillTable').innerHTML=table(rows,[{label:'RUT',key:'rut'},{label:'Trabajador',key:'nombre'},{label:'Empresa',key:'empresa'},{label:'Turno',key:'turno'},{label:'Módulo',key:'modulo'},{label:'Hab.',key:'habitacion'},{label:'Cama',key:'cama'},{label:'Especialidad',key:'especialidad'}],{limit:300})};dim.addEventListener('change',refresh);val.addEventListener('change',renderDrill);refresh()}

function renderManagement(){
  const an=
    analytics(
      A.data
    );

  if(
    an.capacityAvailable&&
    an.forecastCapacityComplete
  ){
    return renderManagementCapacityAvailable();
  }

  const source=
    capacitySourceLabelV1(
      an.capacitySource
    );

  $('#view-management').innerHTML=
    '<div class="section-head">'+
      '<div>'+
        '<h2>Dashboard Gerencial Avanzado</h2>'+
        '<div class="muted">Capacity V1 · modo fail-closed</div>'+
      '</div>'+
      '<span class="badge amber">'+
        'CAPACIDAD INCOMPLETA'+
      '</span>'+
    '</div>'+
    '<div class="summary-box mb">'+
      '<p>'+
        esc(an.summary)+
      '</p>'+
    '</div>'+
    '<div class="kpi-grid">'+
      kpi(
        'Fuente capacidad',
        source
      )+
      kpi(
        'Capacidad total',
        capacityNumberV1(
          an.baseCapacity
        )
      )+
      kpi(
        'Capacidad efectiva',
        capacityNumberV1(
          an.effectiveCapacity
        )
      )+
      kpi(
        'Ocupadas',
        an.occupied,
        an.capacityAvailable
          ? capacityPctV1(
              an.occupancyPct
            )+
            ' fisico'
          : 'porcentaje no disponible'
      )+
      kpi(
        'Reservadas hoy',
        an.reservedToday,
        'valor absoluto observado',
        'reserve'
      )+
      kpi(
        'Comprometidas',
        an.committed,
        an.capacityAvailable
          ? capacityPctV1(
              an.committedPct
            )
          : 'porcentaje no disponible'
      )+
      kpi(
        'Libres reales',
        capacityNumberV1(
          an.free
        )
      )+
      kpi(
        'RISK_DAYS_90',
        capacityNumberV1(
          an.RISK_DAYS_90
        ),
        'requiere horizonte completo'
      )+
      kpi(
        'PEAK_PRESSURE_PCT',
        capacityPctV1(
          an.PEAK_PRESSURE_PCT
        ),
        'requiere horizonte completo'
      )+
      kpi(
        'DEFICIT_DAYS',
        capacityNumberV1(
          an.DEFICIT_DAYS
        ),
        'requiere horizonte completo'
      )+
      kpi(
        'MAX_DEFICIT_BEDS',
        capacityNumberV1(
          an.MAX_DEFICIT_BEDS
        ),
        'requiere horizonte completo'
      )+
      kpi(
        'Ingresos hoy',
        an.mv.SUBIDA
      )+
      kpi(
        'Salidas hoy',
        an.mv.BAJADA
      )+
    '</div>'+
    '<section class="panel mt">'+
      '<h3>Proyeccion ejecutiva 30 dias</h3>'+
      svgForecast(
        an.forecast
      )+
    '</section>';
}
function renderHistory(){const d=A.data,today=todayISO(),dates=[...new Set(d.snapshots.filter(s=>clean(s.closed_at)||s.snapshot_date===today).map(s=>s.snapshot_date))].sort().reverse();if(!dates.includes(A.historyDate))A.historyDate=dates[0]||today;const snap=d.snapshots.find(s=>s.snapshot_date===A.historyDate),trend=d.snapshots.filter(s=>s.snapshot_date>=addDays(A.historyDate,-29)&&s.snapshot_date<=A.historyDate&&(clean(s.closed_at)||s.snapshot_date===today)).sort((a,b)=>a.snapshot_date.localeCompare(b.snapshot_date)),avg=trend.length?trend.reduce((a,s)=>a+Number(s.committed_occupancy||0),0)/trend.length:0,max=Math.max(0,...trend.map(s=>Number(s.committed_occupancy)||0)),min=trend.length?Math.min(...trend.map(s=>Number(s.committed_occupancy)||0)):0,prev=trend.length>1?Number(trend[trend.length-2].committed_occupancy||0):null,variation=snap&&prev!=null?Number(snap.committed_occupancy||0)-prev:0;$('#view-history').innerHTML=`
<div class="section-head"><div><h2>Histórico completo y cierre diario</h2><div class="muted">Los cierres confirmados quedan congelados; el día actual se actualiza automáticamente.</div></div><div class="toolbar"><label class="field small"><span>Fecha</span><select id="historyDate">${dates.map(x=>`<option value="${x}" ${x===A.historyDate?'selected':''}>${fmtDate(x)}${clean(d.snapshots.find(s=>s.snapshot_date===x)?.closed_at)?' · cerrado':' · actual'}</option>`).join('')}</select></label>${A.historyDate===today?'<button id="snapshotBtn" class="btn btn-secondary">Actualizar snapshot</button><button id="closeDayBtn" class="btn btn-danger">CERRAR DÍA</button>':''}</div></div>
${snap?`<div class="kpi-grid mb">${kpi('Capacidad',snap.capacity,`${snap.base_capacity} base · ${snap.blocked} bloqueadas`)}${kpi('Ocupadas',snap.occupied,`${fmt1(snap.occupancy)}%`)}${kpi('Reservadas',snap.reserved,'','reserve')}${kpi('Libres',snap.free)}${kpi('Comprometido',`${fmt1(snap.committed_occupancy)}%`)}${kpi('Trabajadores',snap.total_workers)}</div><div class="grid-2"><section class="panel"><h3>Tendencia últimos 30 registros/días</h3>${svgForecast(trend.map(s=>({label:fmtShort(s.snapshot_date),capacity:Number(s.capacity)||0,physical:Number(s.occupied)||0,reserved:Number(s.reserved)||0,committed:(Number(s.occupied)||0)+(Number(s.reserved)||0)})))}<div class="metric-row"><span>Promedio comprometido</span><strong>${fmt1(avg)}%</strong></div><div class="metric-row"><span>Máximo</span><strong>${fmt1(max)}%</strong></div><div class="metric-row"><span>Mínimo</span><strong>${fmt1(min)}%</strong></div><div class="metric-row"><span>Variación vs. cierre previo</span><strong>${variation>=0?'+':''}${fmt1(variation)} pp</strong></div></section><section class="panel"><h3>Distribución del cierre</h3><h4>Empresas</h4>${bars(parseList(snap.companies_json))}<h4 class="mt">Turnos</h4>${bars(parseList(snap.shifts_json))}<h4 class="mt">Módulos</h4>${bars(parseList(snap.modules_json))}</section></div><div class="grid-2 mt"><section class="panel"><h3>Movimientos del día</h3>${table(parseList(snap.movements_json),[{label:'Tipo',key:'movement_type'},{label:'Turno',key:'shift'},{label:'Empresa',key:'company'},{label:'Personas',key:'people_count'},{label:'Hora',key:'bus_time'},{label:'Bus',key:'bus'}],{limit:100})}</section><section class="panel"><h3>Reservas activas del día</h3>${table(parseList(snap.reservations_json),[{label:'Persona',key:'person_name'},{label:'Llegada',key:'arrival_date'},{label:'Salida',key:'departure_date'},{label:'Módulo',key:'module'},{label:'Hab.',key:'room'},{label:'Cama',key:'bed'},{label:'Camas',key:'bed_count'}],{limit:100})}</section></div>`:'<div class="notice warn">No existe fotografía histórica para la fecha seleccionada.</div>'}`;
  $('#historyDate')?.addEventListener('change',e=>{A.historyDate=e.target.value;renderHistory()});$('#snapshotBtn')?.addEventListener('click',async()=>{try{await advApi('snapshot_today',{method:'POST',body:{},token:A.token});showMessage('Snapshot actualizado.');await loadAll({snapshot:false})}catch(err){showMessage(err.message,'error')}});$('#closeDayBtn')?.addEventListener('click',async()=>{if(!confirm('¿Confirmas CERRAR DÍA? El cierre histórico quedará congelado para hoy.'))return;try{const r=await advApi('close_day',{method:'POST',body:{snapshot_date:today},token:A.token});showMessage(r.message||'Cierre diario guardado.');await loadAll({snapshot:false})}catch(err){showMessage(err.message,'error')}})}

function renderMovements(){const d=A.data,rows=[...d.movements].sort((a,b)=>clean(b.movement_date).localeCompare(clean(a.movement_date))||clean(a.bus_time).localeCompare(clean(b.bus_time)));$('#view-movements').innerHTML=`<div class="section-head"><div><h2>Movimientos de personal</h2><div class="muted">Subidas y bajadas utilizadas por la planificación y proyección gerencial.</div></div></div><section class="panel mb"><h3>Registrar movimiento</h3><form id="movementForm" class="form-grid"><label class="field"><span>Fecha</span><input name="movement_date" type="date" value="${todayISO()}" required></label><label class="field"><span>Tipo</span><select name="movement_type"><option>SUBIDA</option><option>BAJADA</option></select></label><label class="field"><span>Personas</span><input name="people_count" type="number" min="0" max="10000" required></label><label class="field"><span>Turno</span><input name="shift"></label><label class="field"><span>Empresa</span><input name="company"></label><label class="field"><span>Hora bus</span><input name="bus_time" type="time"></label><label class="field"><span>Bus / móvil</span><input name="bus"></label><label class="field"><span>Notas</span><input name="notes"></label><div><button class="btn btn-primary" type="submit">Registrar movimiento</button></div></form></section>${table(rows,[{label:'Fecha',render:r=>fmtDate(r.movement_date)},{label:'Tipo',render:r=>`<span class="badge ${plain(r.movement_type)==='SUBIDA'?'green':'blue'}">${esc(r.movement_type)}</span>`},{label:'Personas',key:'people_count'},{label:'Turno',key:'shift'},{label:'Empresa',key:'company'},{label:'Hora',key:'bus_time'},{label:'Bus',key:'bus'},{label:'Notas',key:'notes'}],{limit:500})}`;$('#movementForm').addEventListener('submit',async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));b.people_count=Number(b.people_count);try{await advApi('add_movement',{method:'POST',body:b,token:A.token});showMessage('Movimiento registrado.');e.currentTarget.reset();await loadAll()}catch(err){showMessage(err.message,'error')}})}

function inventoryOptions(data){const modules=[...new Set(data.inventory.map(x=>clean(x.module)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));return modules}
