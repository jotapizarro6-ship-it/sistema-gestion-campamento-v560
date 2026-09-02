const A={token:null,data:null,consults:[],mapModule:'',planStart:todayISO(),planDays:30,historyDate:todayISO(),drillDim:'empresa',drillValue:'',currentView:'overview'};

function groupRows(rows,field,missing='SIN DATO'){
  const m=new Map();for(const r of rows){const raw=clean(r[field])||missing,k=plain(raw);if(!m.has(k))m.set(k,{label:raw,n:0});m.get(k).n++}return [...m.values()].sort((a,b)=>b.n-a.n||a.label.localeCompare(b.label,'es'));
}
function occupiedWorkers(data){return data.workers.filter(w=>lkey(w.modulo,w.habitacion,w.cama).split('|').every(Boolean)&&clean(w.rut))}
function occupiedSet(data){return new Set(occupiedWorkers(data).map(w=>lkey(w.modulo,w.habitacion,w.cama)))}
function physicalOccupied(data){return occupiedSet(data).size}
function activeResOn(r,ds){return ['PENDIENTE','CONFIRMADA'].includes(plain(r.status))&&clean(r.arrival_date)<=ds&&(!clean(r.departure_date)||clean(r.departure_date)>ds)}
function fulfilled(r,data,today){let count=Math.max(Number(r.bed_count)||0,0);if(count!==1||!clean(r.person_name)||clean(r.arrival_date)>today)return 0;const target=plain(r.person_name);if(clean(r.module)&&clean(r.room)&&clean(r.bed)){const w=data.workers.find(x=>clean(x.rut)&&lkey(x.modulo,x.habitacion,x.cama)===lkey(r.module,r.room,r.bed));return w&&plain(w.nombre)===target?1:0}return data.workers.some(w=>clean(w.rut)&&plain(w.nombre)===target)?1:0}
function reservedCount(ds,data){const today=todayISO();let n=0;for(const r of data.reservations.filter(x=>activeResOn(x,ds))){const count=Math.max(Number(r.bed_count)||0,0),done=ds>=today?fulfilled(r,data,today):0;n+=Math.max(count-done,0)}return n}
const R4_CAPACITY_V1='R4_CAPACITY_V1';

function operationalUniverseV1(data){
  const keys=new Set();

  for(
    const b of
    (
      Array.isArray(data?.inventory)
        ? data.inventory
        : []
    )
  ){
    const k=
      lkey(
        b?.module,
        b?.room,
        b?.bed
      );

    if(
      k
        .split('|')
        .every(Boolean)
    ){
      keys.add(k);
    }
  }

  return{
    count:keys.size,
    keys
  };
}

function capacityUnavailableV1(
  ds,
  universeCount,
  reason='CAPACITY_UNAVAILABLE'
){
  return{
    semantic_version:R4_CAPACITY_V1,
    date:ds,

    available:false,
    capacity_available:false,

    source:null,
    capacity_source:null,

    value:null,
    base_capacity:null,

    operational_universe_count:
      universeCount,

    code:'CAPACITY_UNAVAILABLE',
    reason
  };
}

function resolveCapacityV1(ds,data){
  const universe=
    operationalUniverseV1(data);

  const rows=
    Array.isArray(data?.capacities)
      ? data.capacities
      : [];

  const exact=
    rows.find(
      r=>
        clean(
          r?.capacity_date
        )===ds
    );

  if(exact){
    const raw=
      exact.capacity;

    const value=
      raw===null||
      raw===undefined||
      clean(raw)===''
        ? NaN
        : Number(raw);

    if(
      !Number.isFinite(value)||
      value<0
    ){
      return capacityUnavailableV1(
        ds,
        universe.count,
        'INVALID_DAILY_CAPACITY'
      );
    }

    return{
      semantic_version:R4_CAPACITY_V1,
      date:ds,

      available:true,
      capacity_available:true,

      source:'DAILY_CAPACITY',
      capacity_source:'DAILY_CAPACITY',

      value,
      base_capacity:value,

      operational_universe_count:
        universe.count,

      code:null,
      reason:null
    };
  }

  if(universe.count>0){
    return{
      semantic_version:R4_CAPACITY_V1,
      date:ds,

      available:true,
      capacity_available:true,

      source:'OPERATIONAL_UNIVERSE',
      capacity_source:'OPERATIONAL_UNIVERSE',

      value:universe.count,
      base_capacity:universe.count,

      operational_universe_count:
        universe.count,

      code:null,
      reason:null
    };
  }

  return capacityUnavailableV1(
    ds,
    0
  );
}

function effectiveCapacityV1(ds,data){
  const resolved=
    resolveCapacityV1(
      ds,
      data
    );

  if(!resolved.capacity_available){
    return{
      ...resolved,
      blocked:null,
      capacity:null,
      effective_capacity:null
    };
  }

  const universe=
    operationalUniverseV1(data);

  const active=
    blocksOn(
      ds,
      data
    );

  let blocked=0;

  for(const key of active.keys()){
    if(
      universe.keys.has(key)
    ){
      blocked++;
    }
  }

  const effective=
    Math.max(
      resolved.base_capacity-blocked,
      0
    );

  return{
    ...resolved,
    blocked,
    capacity:effective,
    effective_capacity:effective
  };
}

function capacityFor(ds,data){
  const resolved=
    resolveCapacityV1(
      ds,
      data
    );

  return resolved.capacity_available
    ? resolved.base_capacity
    : null;
}
function blocksOn(ds,data){const m=new Map();for(const b of data.blocks){if(plain(b.status)==='ACTIVO'&&clean(b.start_date)<=ds&&(!clean(b.end_date)||clean(b.end_date)>=ds))m.set(lkey(b.module,b.room,b.bed),b)}return m}
function movementLifecycle(m){return plain(m?.lifecycle_status||'LEGACY_UNRESOLVED')}
function movementTotals(ds,data){
  const today=todayISO(),x={SUBIDA:0,BAJADA:0};
  for(const m of data.movements.filter(r=>clean(r.movement_date)===ds)){
    const status=movementLifecycle(m);
    if(ds>today&&status!=='PROGRAMADO')continue;
    if(ds<=today&&status==='CANCELADO')continue;
    const k=plain(m.movement_type);
    if(k in x)x[k]+=Number(m.people_count)||0;
  }
  return x;
}
function projectedPhysical(ds,data){
  const today=todayISO(),occ=physicalOccupied(data);
  if(ds<=today)return occ;
  let up=0,down=0;
  for(const m of data.movements){
    const d=clean(m.movement_date);
    if(
      d>today&&
      d<=ds&&
      movementLifecycle(m)==='PROGRAMADO'
    ){
      if(plain(m.movement_type)==='SUBIDA'){
        up+=Number(m.people_count)||0;
      }
      if(plain(m.movement_type)==='BAJADA'){
        down+=Number(m.people_count)||0;
      }
    }
  }
  return Math.max(occ+up-down,0);
}
function pendingArrivals(data){const today=todayISO();let total=0,future=0,dueToday=0,overdue=0;for(const r of data.reservations.filter(x=>['PENDIENTE','CONFIRMADA'].includes(plain(x.status))&&(!clean(x.departure_date)||clean(x.departure_date)>today))){const count=Math.max(Number(r.bed_count)||0,0),arr=clean(r.arrival_date);let rem;if(arr>today){rem=count;future+=rem}else{rem=Math.max(count-fulfilled(r,data,today),0);if(arr===today)dueToday+=rem;else if(arr<today)overdue+=rem}total+=rem}return{total,future,today:dueToday,overdue}}
function pendingDepartures(data){const today=todayISO();let total=0,dueToday=0,overdue=0;for(const r of data.reservations.filter(x=>['PENDIENTE','CONFIRMADA'].includes(plain(x.status))&&clean(x.departure_date)&&clean(x.departure_date)<=today)){const c=Math.max(Number(r.bed_count)||0,0);total+=c;if(r.departure_date===today)dueToday+=c;else overdue+=c}return{total,today:dueToday,overdue}}
function forecast30(data){
  const today=
    todayISO();

  let physical=
    physicalOccupied(data);

  const out=[];

  for(let i=0;i<30;i++){
    const ds=
      addDays(
        today,
        i
      );

    const capacityInfo=
      effectiveCapacityV1(
        ds,
        data
      );

    const mv=
      movementTotals(
        ds,
        data
      );

    if(i>0){
      physical=
        Math.max(
          physical+
          mv.SUBIDA-
          mv.BAJADA,
          0
        );
    }

    const reserved=
      reservedCount(
        ds,
        data
      );

    const committed=
      physical+
      reserved;

    let free=null;
    let pct=null;
    let over=null;
    let state='unavailable';

    if(capacityInfo.capacity_available){
      const cap=
        capacityInfo.capacity;

      free=
        Math.max(
          cap-committed,
          0
        );

      pct=
        cap
          ? Math.round(
              committed/cap*1000
            )/10
          : (
              committed
                ? 100
                : 0
            );

      over=
        Math.max(
          committed-cap,
          0
        );

      state=
        over>0
          ? 'over'
          : pct>=90
            ? 'critical'
            : pct>=80
              ? 'attention'
              : 'normal';
    }

    out.push({
      date:ds,
      label:fmtShort(ds),

      base_capacity:
        capacityInfo.base_capacity,

      blocked:
        capacityInfo.blocked,

      capacity:
        capacityInfo.capacity,

      effective_capacity:
        capacityInfo.effective_capacity,

      capacity_available:
        capacityInfo.capacity_available,

      capacity_source:
        capacityInfo.capacity_source,

      capacity_code:
        capacityInfo.code,

      operational_universe_count:
        capacityInfo.operational_universe_count,

      physical,
      reserved,
      committed,
      free,
      pct,
      over,

      up:mv.SUBIDA,
      down:mv.BAJADA,

      state
    });
  }

  return out;
}
function heatmap(data,ds=todayISO()){
  const wmap=new Map();for(const w of occupiedWorkers(data))wmap.set(lkey(w.modulo,w.habitacion,w.cama),w);
  const rmap=new Map();for(const r of data.reservations.filter(x=>activeResOn(x,ds)&&clean(x.module)&&clean(x.room)&&clean(x.bed)))rmap.set(lkey(r.module,r.room,r.bed),r);
  const bmap=blocksOn(ds,data),items=[],roll=new Map();
  for(const b of data.inventory){const k=lkey(b.module,b.room,b.bed),w=wmap.get(k),r=rmap.get(k),bl=bmap.get(k),status=bl?'blocked':w?'occupied':r?'reserved':'free',detail=bl?.reason||w?.nombre||r?.person_name||'Disponible';const item={...b,status,detail,worker:w,reservation:r,block:bl};items.push(item);const mk=clean(b.module);if(!roll.has(mk))roll.set(mk,{label:mk,capacity:0,occupied:0,reserved:0,blocked:0,free:0,committed:0,pct:0});const m=roll.get(mk);m.capacity++;m[status]++}
  const modules=[...roll.values()].map(m=>{const operative=Math.max(m.capacity-m.blocked,0);m.free=Math.max(operative-m.occupied-m.reserved,0);m.committed=m.occupied+m.reserved;m.pct=operative?Math.round(m.committed/operative*1000)/10:0;return m}).sort((a,b)=>b.pct-a.pct||a.label.localeCompare(b.label,'es'));
  return{items,modules,moduleNames:[...roll.keys()].sort((a,b)=>a.localeCompare(b,'es'))}
}
