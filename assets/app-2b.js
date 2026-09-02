function closedSnapshots(data){return data.snapshots.filter(s=>clean(s.closed_at)).sort((a,b)=>clean(a.snapshot_date).localeCompare(clean(b.snapshot_date)))}
function parseList(v){try{const a=JSON.parse(v||'[]');return Array.isArray(a)?a:[]}catch{return[]}}
function beddayAnalytics(data){const snaps=closedSnapshots(data).filter(s=>clean(s.snapshot_date)>=addDays(todayISO(),-365)),company={},shift={},module={},month={};for(const s of snaps){const mo=clean(s.snapshot_date).slice(0,7);month[mo]=(month[mo]||0)+(Number(s.occupied)||0);for(const [field,target] of [['companies_json',company],['shifts_json',shift],['modules_json',module]])for(const i of parseList(s[field])){const l=clean(i.label)||'SIN DATO';target[l]=(target[l]||0)+(Number(i.n)||0)}}const rows=o=>Object.entries(o).map(([label,n])=>({label,n})).sort((a,b)=>b.n-a.n||a.label.localeCompare(b.label,'es'));return{company:rows(company),shift:rows(shift),module:rows(module),month:rows(month).sort((a,b)=>a.label.localeCompare(b.label))}}
function calcExceptions(data,an){const ex=[],today=todayISO(),workers=data.workers,occ=occupiedWorkers(data),inventoryKeys=new Set(data.inventory.map(b=>lkey(b.module,b.room,b.bed))),occMap=new Map();for(const w of occ){const k=lkey(w.modulo,w.habitacion,w.cama);if(!occMap.has(k))occMap.set(k,[]);occMap.get(k).push(w)}const noRut=workers.filter(w=>!clean(w.rut)).length,noShift=workers.filter(w=>!clean(w.turno)).length,noCompany=workers.filter(w=>!clean(w.empresa)).length,noAssign=workers.filter(w=>!lkey(w.modulo,w.habitacion,w.cama).split('|').every(Boolean)).length,duplicates=[...occMap.values()].filter(x=>x.length>1).length;
  const names=new Map();for(const w of workers){const n=plain(w.nombre);if(n)names.set(n,(names.get(n)||0)+1)}const dupNames=[...names.values()].filter(n=>n>1).length;
  const active=data.reservations.filter(r=>['PENDIENTE','CONFIRMADA'].includes(plain(r.status))),unassignedRes=active.filter(r=>!clean(r.module)||!clean(r.room)||!clean(r.bed)).length,expiredRes=active.filter(r=>clean(r.departure_date)&&r.departure_date<=today).length,blockMap=blocksOn(today,data),blockedUsed=[...blockMap.keys()].filter(k=>occMap.has(k)).length;
  let resConf=0;for(const r of active.filter(r=>activeResOn(r,today)&&clean(r.module)&&clean(r.room)&&clean(r.bed))){const w=occMap.get(lkey(r.module,r.room,r.bed))?.[0];if(w&&plain(w.nombre)!==plain(r.person_name))resConf++}
  const rooms=new Map();for(const w of occ){const sx=plain(w.sexo),rk=`${loc(w.modulo,'module')}|${loc(w.habitacion,'room')}`;if(!rooms.has(rk))rooms.set(rk,new Set());if(sx.includes('FEM'))rooms.get(rk).add('F');if(sx.includes('MASC'))rooms.get(rk).add('M')}const mixed=[...rooms.values()].filter(s=>s.size>1).length;
  const mv=movementTotals(today,data),resArr=active.filter(r=>r.arrival_date===today).reduce((a,r)=>a+(Number(r.bed_count)||0),0),arrivalGap=Math.max(mv.SUBIDA-resArr,0),inventoryGap=an.capacityAvailable?Math.max(an.baseCapacity-data.inventory.length,0):0,closedToday=data.snapshots.some(s=>s.snapshot_date===today&&clean(s.closed_at));
  const add=(level,code,title,count,detail,action)=>{if(Number(count)>0)ex.push({level,code,title,count,detail,action})};
  add('high','SIN_RUT','Registros sin RUT',noRut,'Existen trabajadores sin RUT válido.','Regularizar el RUT antes de usar consultas o cruces nominales.');add('medium','NO_TURNO','Trabajadores sin turno',noShift,'Registros activos sin turno informado.','Completar turno para mantener análisis confiables.');add('medium','NO_EMPRESA','Trabajadores sin empresa',noCompany,'Registros activos sin empresa informada.','Regularizar la empresa.');add('medium','SIN_CAMA','Trabajadores sin cama completa',noAssign,'Trabajadores sin módulo/habitación/cama completa.','Asignar ubicación antes del cierre diario.');add('high','CAMA_DUP','Camas con doble asignación',duplicates,'Una misma cama figura asociada a más de un trabajador.','Corregir la duplicidad antes de nuevos ingresos.');add('low','NOMBRE_DUP','Nombres duplicados para revisión',dupNames,'Existen nombres repetidos; pueden ser homónimos.','Revisar por RUT.');add('medium','RES_SIN_CAMA','Reservas sin cama exacta',unassignedRes,'Reservas activas sin ubicación completa.','Completar asignación antes de la llegada.');add('low','RES_VENCIDA','Reservas vencidas aún abiertas',expiredRes,'La fecha de salida se cumplió y la reserva sigue activa.','Cerrar o anular administrativamente.');add('critical','BLOQUEADA_USADA','Cama fuera de servicio ocupada',blockedUsed,'Una cama bloqueada aparece ocupada.','Reasignar al trabajador o cerrar el bloqueo.');add('high','RES_CAMA_OCUP','Reserva con cama ocupada por otra persona',resConf,'Hay reserva exacta cruzada con ocupante distinto.','Revisar antes de confirmar.');add('medium','HAB_MIXTA','Habitaciones con mezcla de sexo',mixed,'Se detecta personal femenino y masculino en una misma habitación.','Validar política vigente.');add('medium','SUBIDA_SIN_RES','Subidas sin respaldo suficiente de reservas',arrivalGap,`Hay ${mv.SUBIDA} subida(s) hoy y ${resArr} cama(s) con reserva de llegada.`, 'Confirmar alojamiento para la diferencia.');add('medium','INVENTARIO_PARCIAL','Inventario menor que capacidad base',inventoryGap,`El inventario contiene ${data.inventory.length} camas frente a capacidad base ${an.baseCapacity}.`,'Verificar planilla base.');const over=an.forecast.filter(x=>x.capacity_available&&x.over>0);add('critical','SOBRECUPO','Días con sobrecapacidad proyectada',over.length,over.length?`Primer sobrecupo: ${fmtDate(over[0].date)} con déficit de ${over[0].over} cama(s).`:'','Ajustar movimientos, reservas o capacidad.');if(!closedToday)add('low','CIERRE','Cierre diario pendiente',1,'El día actual todavía no está congelado en el histórico.','Ejecutar CERRAR DÍA al finalizar la jornada.');if(an.blockedToday)add('low','BLOQUEOS','Camas fuera de servicio hoy',an.blockedToday,`${an.blockedToday} cama(s) se encuentran fuera de servicio.`,'Revisar fecha de retorno.');
  const sev={critical:0,high:1,medium:2,low:3};ex.sort((a,b)=>(sev[a.level]-sev[b.level])-(0)||b.count-a.count||a.title.localeCompare(b.title,'es'));return ex;
}
function calcAnomalies(data,an){const out=[],today=todayISO(),closed=closedSnapshots(data),recent7=closed.filter(s=>s.snapshot_date>=addDays(today,-7)&&s.snapshot_date<today);const histAvg=recent7.length?recent7.reduce((a,s)=>a+Number(s.committed_occupancy||0),0)/recent7.length:null;if(an.capacityAvailable&&an.committedPct!=null&&histAvg!=null&&Math.abs(an.committedPct-histAvg)>=15)out.push({level:'medium',title:'Variación inusual de ocupación',detail:`La ocupación comprometida de hoy (${fmt1(an.committedPct)}%) difiere ${fmt1(Math.abs(an.committedPct-histAvg))} puntos del promedio reciente (${fmt1(histAvg)}%).`});const historyStart=addDays(today,-30),histMoves=data.movements.filter(m=>clean(m.movement_date)>=historyStart&&clean(m.movement_date)<today);let days=30;if(histMoves.length){const first=histMoves.map(m=>clean(m.movement_date)).sort()[0];const ms=(new Date(today+'T12:00:00Z')-new Date(first+'T12:00:00Z'))/86400000;days=Math.min(30,Math.max(Math.round(ms),1))}const sums={SUBIDA:0,BAJADA:0};for(const m of histMoves){const k=plain(m.movement_type);if(k in sums)sums[k]+=Number(m.people_count)||0}const avgUp=sums.SUBIDA/days,avgDown=sums.BAJADA/days;if(avgUp>0&&an.mv.SUBIDA>=Math.max(avgUp*1.75,avgUp+10))out.push({level:'medium',title:'Subida inusual',detail:`Hoy se registran ${an.mv.SUBIDA} subidas frente a un promedio reciente de ${fmt1(avgUp)}.`});if(avgDown>0&&an.mv.BAJADA>=Math.max(avgDown*1.75,avgDown+10))out.push({level:'medium',title:'Bajada inusual',detail:`Hoy se registran ${an.mv.BAJADA} bajadas frente a un promedio reciente de ${fmt1(avgDown)}.`});return out}
function analytics(data){
  const today=todayISO();

  const occupied=
    physicalOccupied(data);

  const capacityInfo=
    effectiveCapacityV1(
      today,
      data
    );

  const capacityAvailable=
    capacityInfo.capacity_available;

  const capacitySource=
    capacityInfo.capacity_source;

  const baseCapacity=
    capacityInfo.base_capacity;

  const blockedToday=
    capacityInfo.blocked;

  const effectiveCapacity=
    capacityInfo.capacity;

  const reservedToday=
    reservedCount(
      today,
      data
    );

  const committed=
    occupied+
    reservedToday;

  const free=
    capacityAvailable
      ? Math.max(
          effectiveCapacity-committed,
          0
        )
      : null;

  const occupancyPct=
    capacityAvailable
      ? (
          effectiveCapacity
            ? Math.round(
                occupied/effectiveCapacity*1000
              )/10
            : (
                occupied
                  ? 100
                  : 0
              )
        )
      : null;

  const committedPct=
    capacityAvailable
      ? (
          effectiveCapacity
            ? Math.round(
                committed/effectiveCapacity*1000
              )/10
            : (
                committed
                  ? 100
                  : 0
              )
        )
      : null;

  const mv=
    movementTotals(
      today,
      data
    );

  const pa=
    pendingArrivals(data);

  const pd=
    pendingDepartures(data);

  const forecast=
    forecast30(data);

  const forecastCapacityComplete=
    forecast.length>0&&
    forecast.every(
      x=>x.capacity_available
    );

  const availableForecast=
    forecast.filter(
      x=>
        x.capacity_available&&
        x.pct!=null
    );

  const maxDay=
    availableForecast.length
      ? availableForecast.reduce(
          (a,b)=>
            b.pct>a.pct
              ? b
              : a
        )
      : null;

  const riskDays90=
    forecastCapacityComplete
      ? forecast.filter(
          x=>x.pct>=90
        ).length
      : null;

  const peakPressurePct=
    forecastCapacityComplete&&
    maxDay
      ? maxDay.pct
      : null;

  const deficitRows=
    forecastCapacityComplete
      ? forecast.filter(
          x=>x.over>0
        )
      : [];

  const deficitDays=
    forecastCapacityComplete
      ? deficitRows.length
      : null;

  const maxDeficitBeds=
    forecastCapacityComplete
      ? (
          deficitRows.length
            ? Math.max(
                ...deficitRows.map(
                  x=>x.over
                )
              )
            : 0
        )
      : null;

  const companies=
    groupRows(
      data.workers,
      'empresa',
      'SIN EMPRESA'
    );

  const shifts=
    groupRows(
      data.workers,
      'turno',
      'SIN TURNO'
    );

  const hm=
    heatmap(
      data,
      today
    );

  const bed=
    beddayAnalytics(data);

  const cost=
    Math.max(
      Number(
        data.settings.cost_per_bed_day||0
      ),
      0
    );

  const closed=
    closedSnapshots(data);

  const recent7=
    closed.filter(
      s=>
        s.snapshot_date>=addDays(today,-7)&&
        s.snapshot_date<today
    );

  const histAvg=
    recent7.length
      ? Math.round(
          recent7.reduce(
            (a,s)=>
              a+
              Number(
                s.committed_occupancy||0
              ),
            0
          )/
          recent7.length*
          10
        )/10
      : null;

  const an={
    today,
    occupied,

    capacityAvailable,
    capacitySource,

    capacity_available:
      capacityAvailable,

    capacity_source:
      capacitySource,

    capacityCode:
      capacityInfo.code,

    operationalUniverseCount:
      capacityInfo.operational_universe_count,

    baseCapacity,
    blockedToday,
    effectiveCapacity,

    reservedToday,
    committed,
    free,

    occupancyPct,
    committedPct,

    mv,
    pa,
    pd,

    forecast,
    forecastCapacityComplete,

    RISK_DAYS_90:
      riskDays90,

    PEAK_PRESSURE_PCT:
      peakPressurePct,

    DEFICIT_DAYS:
      deficitDays,

    MAX_DEFICIT_BEDS:
      maxDeficitBeds,

    riskDays90,
    peakPressurePct,
    deficitDays,
    maxDeficitBeds,

    companies,
    shifts,
    hm,
    bed,
    cost,
    closed,
    histAvg,
    maxDay
  };

  an.exceptions=
    calcExceptions(
      data,
      an
    );

  an.anomalies=
    calcAnomalies(
      data,
      an
    );

  if(!capacityAvailable){
    an.status=
      'unavailable';
  }else{
    an.status=
      an.exceptions.some(
        x=>x.level==='critical'
      )
        ? 'critical'
        : (
            an.exceptions.some(
              x=>
                ['high','medium']
                  .includes(x.level)
            )||
            an.anomalies.length
          )
          ? 'attention'
          : 'normal';
  }

  const topC=
    companies[0]||
    {
      label:'Sin datos',
      n:0
    };

  const topS=
    shifts[0]||
    {
      label:'Sin datos',
      n:0
    };

  if(!capacityAvailable){
    an.summary=
      'CAPACIDAD NO DISPONIBLE. '+
      'No se calculan camas libres, porcentajes, deficit ni riesgo de capacidad. '+
      'Ocupadas observadas: '+
      occupied+
      '; reservas vigentes: '+
      reservedToday+
      '.';
  }else if(!forecastCapacityComplete){
    an.summary=
      'Hoy el campamento registra '+
      occupied+
      ' camas ocupadas, '+
      reservedToday+
      ' reservadas y '+
      free+
      ' libres efectivas. '+
      'La proyeccion de capacidad esta incompleta: '+
      'RISK_DAYS_90, PEAK_PRESSURE_PCT, DEFICIT_DAYS y MAX_DEFICIT_BEDS no se calculan.';
  }else{
    an.summary=
      'Hoy el campamento registra '+
      occupied+
      ' camas ocupadas, '+
      reservedToday+
      ' reservadas y '+
      free+
      ' libres efectivas ('+
      fmt1(committedPct)+
      '% comprometido). '+
      'La proyeccion de 30 dias alcanza un maximo de '+
      fmt1(peakPressurePct)+
      '% el '+
      fmtDate(maxDay.date)+
      '. La mayor dotacion corresponde a '+
      topC.label+
      ' ('+
      topC.n+
      ') y el turno con mayor presencia es '+
      topS.label+
      ' ('+
      topS.n+
      ').';
  }

  return an;
}

function capacityNumberV1(value){
  return value===null||
    value===undefined||
    !Number.isFinite(Number(value))
      ? '—'
      : fmtInt(value);
}

function capacityPctV1(value){
  return value===null||
    value===undefined||
    !Number.isFinite(Number(value))
      ? '—'
      : fmt1(value)+'%';
}

function capacitySourceLabelV1(source){
  if(source==='DAILY_CAPACITY'){
    return 'Capacidad diaria';
  }

  if(source==='OPERATIONAL_UNIVERSE'){
    return 'Universo operacional';
  }

  return 'CAPACIDAD NO DISPONIBLE';
}
function kpi(label,value,detail='',kind=''){return `<div class="kpi ${kind}"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div><div class="detail">${esc(detail)}</div></div>`}
function bars(rows,total=null,limit=10){const arr=rows.slice(0,limit),mx=Math.max(...arr.map(x=>Number(x.n)||0),1);return `<div class="bar-list">${arr.map(x=>`<div class="bar-row"><span title="${esc(x.label)}">${esc(x.label)}</span><div class="bar"><span style="width:${Math.min(100,(Number(x.n)||0)/mx*100)}%"></span></div><strong>${fmtInt(x.n)}</strong></div>`).join('')}</div>`}
function table(rows,cols,{empty='Sin registros',limit=500}={}){if(!rows?.length)return `<div class="empty">${esc(empty)}</div>`;return `<div class="table-wrap"><table class="data-table"><thead><tr>${cols.map(c=>`<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0,limit).map((r,i)=>`<tr>${cols.map(c=>`<td>${typeof c.render==='function'?c.render(r,i):esc(r[c.key]??'—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${rows.length>limit?`<p class="footnote">Mostrando ${limit} de ${rows.length} registros.</p>`:''}`}
function svgForecast(rows){
  if(!rows.length){
    return '';
  }

  const W=980;
  const H=260;
  const L=48;
  const T=20;
  const B=35;
  const R=15;

  const values=[];

  for(const row of rows){
    for(
      const key of
      [
        'capacity',
        'physical',
        'reserved',
        'committed'
      ]
    ){
      const value=
        row[key];

      if(
        value!==null&&
        value!==undefined&&
        Number.isFinite(
          Number(value)
        )
      ){
        values.push(
          Number(value)
        );
      }
    }
  }

  const max=
    Math.max(
      1,
      ...values
    );

  const uw=
    W-L-R;

  const uh=
    H-T-B;

  const xy=
    (value,index)=>[
      L+
      uw*
      index/
      Math.max(
        rows.length-1,
        1
      ),

      T+
      uh-
      (
        Number(value)/
        max*
        uh
      )
    ];

  function segments(key){
    const output=[];
    let current=[];

    const flush=()=>{
      if(current.length){
        output.push(current);
        current=[];
      }
    };

    rows.forEach(
      (row,index)=>{
        const value=
          row[key];

        if(
          value===null||
          value===undefined||
          !Number.isFinite(
            Number(value)
          )
        ){
          flush();
          return;
        }

        current.push(
          xy(
            value,
            index
          )
            .map(
              n=>n.toFixed(1)
            )
            .join(',')
        );
      }
    );

    flush();

    return output;
  }

  const line=
    (
      key,
      color,
      width
    )=>
      segments(key)
        .map(
          points=>
            '<polyline fill="none" stroke="'+
            color+
            '" stroke-width="'+
            width+
            '" points="'+
            points.join(' ')+
            '"/>'
        )
        .join('');

  const grid=
    [
      0,
      .25,
      .5,
      .75,
      1
    ]
      .map(
        f=>{
          const y=
            T+
            uh-
            uh*f;

          return (
            '<line x1="'+L+
            '" y1="'+y+
            '" x2="'+(W-R)+
            '" y2="'+y+
            '" stroke="#e4e9ef"/>'+
            '<text x="5" y="'+(y+4)+
            '" font-size="10" fill="#758296">'+
            Math.round(max*f)+
            '</text>'
          );
        }
      )
      .join('');

  const labels=
    rows
      .filter(
        (_,i)=>
          i%5===0||
          i===rows.length-1
      )
      .map(
        row=>{
          const i=
            rows.indexOf(row);

          const p=
            xy(
              0,
              i
            );

          return (
            '<text x="'+p[0]+
            '" y="'+(H-10)+
            '" text-anchor="middle" font-size="10" fill="#758296">'+
            esc(row.label)+
            '</text>'
          );
        }
      )
      .join('');

  const unavailable=
    rows.some(
      row=>
        row.capacity_available===false
    )
      ? (
          '<div class="notice warn">'+
          'CAPACIDAD NO DISPONIBLE en uno o mas dias. '+
          'La serie de capacidad no se fabrica para esas fechas.'+
          '</div>'
        )
      : '';

  return (
    unavailable+
    '<svg class="svg-chart" viewBox="0 0 '+
    W+
    ' '+
    H+
    '" role="img" aria-label="Proyeccion 30 dias">'+
    grid+
    line(
      'capacity',
      '#7d8795',
      2
    )+
    line(
      'physical',
      '#1769aa',
      2.5
    )+
    line(
      'reserved',
      '#7559c8',
      2
    )+
    line(
      'committed',
      '#c5444f',
      3
    )+
    labels+
    '</svg>'+
    '<div class="chart-legend">'+
    '<span><i class="dot capacity"></i>Capacidad efectiva</span>'+
    '<span><i class="dot physical"></i>Ocupacion fisica</span>'+
    '<span><i class="dot reserved"></i>Reservas</span>'+
    '<span><i class="dot committed"></i>Comprometidas</span>'+
    '</div>'
  );
}
function showMessage(msg,type='ok'){const el=$('#globalMessage');if(!el)return;el.className=`global-message notice ${type}`;el.textContent=msg;el.classList.remove('hidden');setTimeout(()=>el.classList.add('hidden'),6000)}
function showDialog(title,body){$('#detailTitle').textContent=title;$('#detailBody').innerHTML=body;$('#detailDialog').showModal()}
