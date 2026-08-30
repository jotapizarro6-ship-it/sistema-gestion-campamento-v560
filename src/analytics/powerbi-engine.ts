(()=>{
  'use strict';
  const W=window as any;
  if(W.__CAMP_ANALYTICS_ENGINE__)return;
  W.__CAMP_ANALYTICS_ENGINE__=true;
  const VERSION='2026.08.30-powerbi1';
  const cache=new WeakMap<object,{signature:string;value:any}>();
  const list=(v:any):any[]=>Array.isArray(v)?v:[];
  const text=(v:any)=>String(v??'').trim();
  const norm=(v:any)=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ');
  const bedKey=(w:any)=>[w?.modulo,w?.habitacion,w?.cama].map(norm).join('|');
  const assigned=(w:any)=>Boolean(text(w?.modulo)&&text(w?.habitacion)&&text(w?.cama));
  function today(){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value])) as Record<string,string>;return `${parts.year}-${parts.month}-${parts.day}`}
  function signature(data:any){return [data?.state_version??data?.operational_revision??'',list(data?.workers).length,list(data?.inventory).length,list(data?.blocks).length,list(data?.reservations).length,list(data?.movements).length,list(data?.capacities).length].join(':')}
  function fallbackCapacity(ds:string,data:any){const row=list(data?.capacities).find((x:any)=>text(x?.capacity_date)===ds);return Number(row?.capacity??data?.settings?.daily_capacity_default??132)||132}
  function activeBlocks(ds:string,data:any){if(typeof W.blocksOn==='function')return W.blocksOn(ds,data)?.size||0;return new Set(list(data?.blocks).filter((b:any)=>norm(b?.status)==='ACTIVO'&&text(b?.start_date)<=ds&&(!text(b?.end_date)||text(b?.end_date)>=ds)).map(bedKey)).size}
  function reserved(ds:string,data:any){if(typeof W.reservedCount==='function')return Number(W.reservedCount(ds,data)||0);return list(data?.reservations).filter((r:any)=>['PENDIENTE','CONFIRMADA'].includes(norm(r?.status))&&text(r?.arrival_date)<=ds&&(!text(r?.departure_date)||text(r?.departure_date)>ds)).reduce((s:number,r:any)=>s+Math.max(Number(r?.bed_count)||0,0),0)}
  function workforce(workers:any[]){const api=W.CampWorkforceMODMOI;if(!api?.compute)return {total:workers.length,DIRECTA:0,INDIRECTA:0,POR_DEFINIR:workers.length};try{return api.compute(workers,api.state?.rules||{}).totals}catch(_){return {total:workers.length,DIRECTA:0,INDIRECTA:0,POR_DEFINIR:workers.length}}}
  function groupRows(rows:any[],dimension:string){const map=new Map<string,number>();for(const row of rows){const key=text(row?.[dimension])||'SIN DATO';map.set(key,(map.get(key)||0)+1)}return [...map].map(([key,value])=>({key,value})).sort((a,b)=>b.value-a.value||a.key.localeCompare(b.key,'es'))}
  function build(data:any){
    const ds=today(),workers=list(data?.workers),assignedWorkers=workers.filter(assigned),occupied=new Set(assignedWorkers.map(bedKey)).size,inventory=list(data?.inventory).length,blocked=activeBlocks(ds,data),baseCapacity=typeof W.capacityFor==='function'?Number(W.capacityFor(ds,data)||0):fallbackCapacity(ds,data),effectiveCapacity=Math.max(baseCapacity-blocked,0),reservedToday=reserved(ds,data),committed=occupied+reservedToday,free=Math.max(effectiveCapacity-committed,0),pct=effectiveCapacity?Math.round(committed/effectiveCapacity*1000)/10:(committed?100:0),forecast=typeof W.forecast30==='function'?list(W.forecast30(data)):[],wf=workforce(workers),peak=forecast.reduce((best:any,row:any)=>!best||Number(row?.pct||0)>Number(best?.pct||0)?row:best,null),maxDeficit=forecast.reduce((m:number,row:any)=>Math.max(m,Number(row?.over||0)),0);
    return {
      version:VERSION,date:ds,
      measures:{workers_total:workers.length,workers_assigned:assignedWorkers.length,beds_inventory:inventory,occupied_physical:occupied,reserved_today:reservedToday,blocked_today:blocked,capacity_base:baseCapacity,capacity_effective:effectiveCapacity,committed_today:committed,free_today:free,occupancy_pct:pct,mod:Number(wf.DIRECTA||0),moi:Number(wf.INDIRECTA||0),workforce_undefined:Number(wf.POR_DEFINIR||0),forecast_peak_pct:Number(peak?.pct||0),forecast_peak_date:peak?.date||null,forecast_max_deficit:maxDeficit},
      dimensions:{empresa:groupRows(assignedWorkers,'empresa'),turno:groupRows(assignedWorkers,'turno'),modulo:groupRows(assignedWorkers,'modulo'),categoria:groupRows(assignedWorkers,'categoria')},
      forecast
    };
  }
  function snapshot(data:any){if(!data||typeof data!=='object')return build({});const sig=signature(data),entry=cache.get(data);if(entry?.signature===sig)return entry.value;const value=build(data);cache.set(data,{signature:sig,value});return value}
  function filtered(data:any,filters:Record<string,string>={}){return list(data?.workers).filter(assigned).filter((w:any)=>Object.entries(filters).every(([k,v])=>!v||norm(w?.[k])===norm(v)))}
  function query(data:any,options:{dimension?:string;filters?:Record<string,string>}={}){const rows=filtered(data,options.filters||{});return options.dimension?groupRows(rows,options.dimension):{count:rows.length}}
  function invalidate(data?:any){if(data&&typeof data==='object')cache.delete(data)}
  const catalog={dimensions:['empresa','turno','modulo','categoria','sexo','residencia'],measures:['workers_total','workers_assigned','beds_inventory','occupied_physical','reserved_today','blocked_today','capacity_base','capacity_effective','committed_today','free_today','occupancy_pct','mod','moi','workforce_undefined','forecast_peak_pct','forecast_peak_date','forecast_max_deficit']};
  W.CampAnalyticsEngine={VERSION,catalog,snapshot,query,invalidate};
  window.addEventListener('campamento:data-ready',()=>{if(W.A?.data){const value=snapshot(W.A.data);window.dispatchEvent(new CustomEvent('campamento:analytics-ready',{detail:{version:VERSION,measures:value.measures}}))}});
})();
