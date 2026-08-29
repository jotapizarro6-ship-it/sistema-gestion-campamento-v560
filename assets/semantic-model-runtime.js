(()=>{
  'use strict';
  if(typeof window==='undefined'||window.__CAMP_SEMANTIC_MODEL_RUNTIME__)return;
  window.__CAMP_SEMANTIC_MODEL_RUNTIME__=true;

  const VERSION='20260829-semantic1';
  const cache=new WeakMap();
  const nowMs=()=>typeof performance!=='undefined'&&performance.now?performance.now():Date.now();

  function refsOf(data){
    return [data?.workers,data?.inventory,data?.blocks,data?.reservations,data?.movements,data?.capacities].map(x=>Array.isArray(x)?x:null);
  }
  function lengthsOf(refs){return refs.map(x=>x?.length||0)}
  function sameModel(entry,data){
    if(!entry)return false;
    const refs=refsOf(data),lens=lengthsOf(refs);
    return refs.every((x,i)=>x===entry.refs[i]&&lens[i]===entry.lengths[i]);
  }
  function build(data){
    const started=nowMs();
    const workers=Array.isArray(data?.workers)?data.workers:[],inventory=Array.isArray(data?.inventory)?data.inventory:[],blocks=Array.isArray(data?.blocks)?data.blocks:[],reservations=Array.isArray(data?.reservations)?data.reservations:[],movements=Array.isArray(data?.movements)?data.movements:[],capacities=Array.isArray(data?.capacities)?data.capacities:[];
    const assignedWorkers=[],occupiedKeys=new Set(),workerByBed=new Map(),workerNames=new Set();
    for(const w of workers){
      if(!clean(w.rut))continue;
      const name=plain(w.nombre);if(name)workerNames.add(name);
      const k=lkey(w.modulo,w.habitacion,w.cama);if(!k.split('|').every(Boolean))continue;
      assignedWorkers.push(w);occupiedKeys.add(k);if(!workerByBed.has(k))workerByBed.set(k,w);
    }
    const capacityByDate=new Map();for(const r of capacities){const d=clean(r.capacity_date);if(d&&!capacityByDate.has(d))capacityByDate.set(d,Number(r.capacity)||0)}
    const movementsByDate=new Map();
    for(const r of movements){const d=clean(r.movement_date);if(!d)continue;let x=movementsByDate.get(d);if(!x){x={SUBIDA:0,BAJADA:0};movementsByDate.set(d,x)}const k=plain(r.movement_type);if(k in x)x[k]+=Number(r.people_count)||0}
    const activeReservations=reservations.filter(r=>['PENDIENTE','CONFIRMADA'].includes(plain(r.status)));
    const activeBlocks=blocks.filter(b=>plain(b.status)==='ACTIVO');
    const model={
      refs:refsOf(data),lengths:lengthsOf(refsOf(data)),workers,inventory,blocks,reservations,movements,capacities,
      assignedWorkers,occupiedKeys,workerByBed,workerNames,capacityByDate,movementsByDate,activeReservations,activeBlocks,
      blocksByDate:new Map(),reservedByDate:new Map(),projectedByDate:new Map(),heatmapByDate:new Map(),forecastByDay:new Map(),
      built_ms:0
    };
    model.built_ms=nowMs()-started;
    return model;
  }
  function getModel(data){
    if(!data||typeof data!=='object')return build({});
    let entry=cache.get(data);if(!sameModel(entry,data)){entry=build(data);cache.set(data,entry)}return entry;
  }
  function invalidate(data){if(data&&typeof data==='object')cache.delete(data)}

  function fastOccupiedWorkers(data){return getModel(data).assignedWorkers}
  function fastOccupiedSet(data){return getModel(data).occupiedKeys}
  function fastPhysicalOccupied(data){return getModel(data).occupiedKeys.size}
  function fastCapacityFor(ds,data){
    const m=getModel(data);return m.capacityByDate.has(ds)?Number(m.capacityByDate.get(ds)||0):(Number(data?.settings?.daily_capacity_default||132)||132);
  }
  function fastBlocksOn(ds,data){
    const m=getModel(data);if(m.blocksByDate.has(ds))return m.blocksByDate.get(ds);
    const out=new Map();for(const b of m.activeBlocks){if(clean(b.start_date)<=ds&&(!clean(b.end_date)||clean(b.end_date)>=ds))out.set(lkey(b.module,b.room,b.bed),b)}
    m.blocksByDate.set(ds,out);return out;
  }
  function fastMovementTotals(ds,data){
    const x=getModel(data).movementsByDate.get(ds);return x?{SUBIDA:x.SUBIDA,BAJADA:x.BAJADA}:{SUBIDA:0,BAJADA:0};
  }
  function fastFulfilled(r,data,today){
    const count=Math.max(Number(r?.bed_count)||0,0);if(count!==1||!clean(r?.person_name)||clean(r?.arrival_date)>today)return 0;
    const m=getModel(data),target=plain(r.person_name);
    if(clean(r.module)&&clean(r.room)&&clean(r.bed)){
      const w=m.workerByBed.get(lkey(r.module,r.room,r.bed));return w&&plain(w.nombre)===target?1:0;
    }
    return m.workerNames.has(target)?1:0;
  }
  function fastReservedCount(ds,data){
    const m=getModel(data);if(m.reservedByDate.has(ds))return m.reservedByDate.get(ds);
    const today=todayISO();let n=0;
    for(const r of m.activeReservations){
      if(clean(r.arrival_date)>ds|| (clean(r.departure_date)&&clean(r.departure_date)<=ds))continue;
      const count=Math.max(Number(r.bed_count)||0,0),done=ds>=today?fastFulfilled(r,data,today):0;n+=Math.max(count-done,0);
    }
    m.reservedByDate.set(ds,n);return n;
  }
  function fastProjectedPhysical(ds,data){
    const m=getModel(data);if(m.projectedByDate.has(ds))return m.projectedByDate.get(ds);
    const today=todayISO(),occ=m.occupiedKeys.size;if(ds<=today){m.projectedByDate.set(ds,occ);return occ}
    let up=0,down=0;for(const r of m.movements){const d=clean(r.movement_date);if(d>today&&d<=ds){const k=plain(r.movement_type);if(k==='SUBIDA')up+=Number(r.people_count)||0;else if(k==='BAJADA')down+=Number(r.people_count)||0}}
    const out=Math.max(occ+up-down,0);m.projectedByDate.set(ds,out);return out;
  }
  function fastPendingArrivals(data){
    const today=todayISO(),m=getModel(data);let total=0,future=0,dueToday=0,overdue=0;
    for(const r of m.activeReservations){if(clean(r.departure_date)&&clean(r.departure_date)<=today)continue;const count=Math.max(Number(r.bed_count)||0,0),arr=clean(r.arrival_date);let rem;if(arr>today){rem=count;future+=rem}else{rem=Math.max(count-fastFulfilled(r,data,today),0);if(arr===today)dueToday+=rem;else if(arr<today)overdue+=rem}total+=rem}
    return{total,future,today:dueToday,overdue};
  }
  function fastPendingDepartures(data){
    const today=todayISO(),m=getModel(data);let total=0,dueToday=0,overdue=0;
    for(const r of m.activeReservations){if(!clean(r.departure_date)||clean(r.departure_date)>today)continue;const c=Math.max(Number(r.bed_count)||0,0);total+=c;if(clean(r.departure_date)===today)dueToday+=c;else overdue+=c}
    return{total,today:dueToday,overdue};
  }
  function fastForecast30(data){
    const today=todayISO(),m=getModel(data);if(m.forecastByDay.has(today))return m.forecastByDay.get(today);
    let physical=m.occupiedKeys.size;const out=[];
    for(let i=0;i<30;i++){
      const ds=addDays(today,i),base=fastCapacityFor(ds,data),blocked=fastBlocksOn(ds,data).size,cap=Math.max(base-blocked,0),mv=fastMovementTotals(ds,data);if(i>0)physical=Math.max(physical+mv.SUBIDA-mv.BAJADA,0);
      const res=fastReservedCount(ds,data),committed=physical+res,pct=cap?Math.round(committed/cap*1000)/10:(committed?100:0),over=Math.max(committed-cap,0),state=over?'over':(pct>=90?'critical':pct>=80?'attention':'normal');
      out.push({date:ds,label:fmtShort(ds),base_capacity:base,blocked,capacity:cap,physical,reserved:res,committed,free:Math.max(cap-committed,0),pct,over,up:mv.SUBIDA,down:mv.BAJADA,state});
    }
    m.forecastByDay.set(today,out);return out;
  }
  function fastHeatmap(data,ds=todayISO()){
    const m=getModel(data);if(m.heatmapByDate.has(ds))return m.heatmapByDate.get(ds);
    const rmap=new Map();for(const r of m.activeReservations){if(clean(r.arrival_date)<=ds&&(!clean(r.departure_date)||clean(r.departure_date)>ds)&&clean(r.module)&&clean(r.room)&&clean(r.bed))rmap.set(lkey(r.module,r.room,r.bed),r)}
    const bmap=fastBlocksOn(ds,data),items=[],roll=new Map();
    for(const b of m.inventory){
      const k=lkey(b.module,b.room,b.bed),w=m.workerByBed.get(k),r=rmap.get(k),bl=bmap.get(k),status=bl?'blocked':w?'occupied':r?'reserved':'free',detail=bl?.reason||w?.nombre||r?.person_name||'Disponible';
      const item={...b,status,detail,worker:w,reservation:r,block:bl};items.push(item);
      const mk=clean(b.module);if(!roll.has(mk))roll.set(mk,{label:mk,capacity:0,occupied:0,reserved:0,blocked:0,free:0,committed:0,pct:0});const x=roll.get(mk);x.capacity++;x[status]++;
    }
    const modules=[...roll.values()].map(x=>{const operative=Math.max(x.capacity-x.blocked,0);x.free=Math.max(operative-x.occupied-x.reserved,0);x.committed=x.occupied+x.reserved;x.pct=operative?Math.round(x.committed/operative*1000)/10:0;return x}).sort((a,b)=>b.pct-a.pct||a.label.localeCompare(b.label,'es'));
    const out={items,modules,moduleNames:[...roll.keys()].sort((a,b)=>a.localeCompare(b,'es'))};m.heatmapByDate.set(ds,out);return out;
  }

  if(typeof occupiedWorkers==='function')occupiedWorkers=fastOccupiedWorkers;
  if(typeof occupiedSet==='function')occupiedSet=fastOccupiedSet;
  if(typeof physicalOccupied==='function')physicalOccupied=fastPhysicalOccupied;
  if(typeof capacityFor==='function')capacityFor=fastCapacityFor;
  if(typeof blocksOn==='function')blocksOn=fastBlocksOn;
  if(typeof movementTotals==='function')movementTotals=fastMovementTotals;
  if(typeof fulfilled==='function')fulfilled=fastFulfilled;
  if(typeof reservedCount==='function')reservedCount=fastReservedCount;
  if(typeof projectedPhysical==='function')projectedPhysical=fastProjectedPhysical;
  if(typeof pendingArrivals==='function')pendingArrivals=fastPendingArrivals;
  if(typeof pendingDepartures==='function')pendingDepartures=fastPendingDepartures;
  if(typeof forecast30==='function')forecast30=fastForecast30;
  if(typeof heatmap==='function')heatmap=fastHeatmap;

  window.CampSemanticModel={VERSION,get:getModel,invalidate};
})();
