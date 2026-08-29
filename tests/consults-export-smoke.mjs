import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const code=fs.readFileSync(new URL('../assets/consults-export-xlsx.js',import.meta.url),'utf8');
const dataset=Array.from({length:2050},(_,i)=>({
  consultado_at:`2026-08-29T00:${String(i%60).padStart(2,'0')}:00Z`,
  rut:`TEST-${String(i+1).padStart(4,'0')}`,
  nombre:`TRABAJADOR ${i+1}`,
  status:'ASIGNADO',
  modulo:'OP01',habitacion:String((i%100)+1),cama:'A',ip:'192.0.2.10'
}));
let requests=0;
const maintenanceCalls=[];
const adminState={token:'token-prueba',consults:[],consultsTotal:null,consultsPage:0};
const fetchMock=async (input,init={})=>{
  requests++;
  const u=new URL(String(input));
  const action=u.searchParams.get('action')||'';
  const date=u.searchParams.get('date')||'';
  const method=String(init.method||'GET').toUpperCase();
  if(action==='delete_preview'){
    maintenanceCalls.push({method,action,date});
    return {ok:true,status:200,text:async()=>JSON.stringify({ok:true,date,count:37,timezone:'America/Santiago'})};
  }
  if(method==='DELETE'){
    maintenanceCalls.push({method,action,date});
    return {ok:true,status:200,text:async()=>JSON.stringify({ok:true,date,deleted:37,timezone:'America/Santiago'})};
  }
  const page=Math.max(1,Number(u.searchParams.get('page')||1));
  const size=Math.max(1,Math.min(500,Number(u.searchParams.get('page_size')||100)));
  const start=(page-1)*size;
  const data=dataset.slice(start,start+size);
  return {ok:true,status:200,text:async()=>JSON.stringify({ok:true,data,total:dataset.length,page,page_size:size,pages:Math.ceil(dataset.length/size)})};
};
const context={
  A:adminState,
  webApi:async()=>({ok:true,data:[]}),
  window:{A:adminState,addEventListener(){},dispatchEvent(){}},
  document:{getElementById(){return null;},querySelector(){return null;},head:{appendChild(){}},createElement(){return {}; }},
  fetch:fetchMock,
  URL,URLSearchParams,AbortController,
  CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail}},
  console,Date,String,Number,Array,Object,Promise,Error,Intl,setTimeout,clearTimeout,
  alert(){},esc:v=>String(v??''),table:()=>''
};
vm.createContext(context);
vm.runInContext(code,context);
const api=context.window.CampConsultExport;

const rows=api.consultsToRows([
  {consultado_at:'2026-08-29T00:15:30Z',rut:'12.345.678-5',nombre:'TRABAJADOR PRUEBA',status:'ASIGNADO',modulo:'OP02',habitacion:'216',cama:'A',ip:'192.0.2.10'},
  {consultado_at:'sin-fecha',rut:'9.999.999-9',nombre:'SIN ASIGNACION',status:'NO_ENCONTRADO'}
]);
assert.equal(rows.length,2);
assert.equal(rows[0].RUT,'12.345.678-5');
assert.equal(rows[0].Nombre,'TRABAJADOR PRUEBA');
assert.equal(rows[0].Resultado,'ASIGNADO');
assert.equal(rows[0]['Asignación'],'OP02 / 216 / A');
assert.ok(rows[0]['Fecha consulta'] instanceof Date);
assert.equal(rows[1]['Fecha consulta'],'sin-fecha');
assert.equal(rows[1]['Asignación'],'');
assert.equal(rows[1].IP,'');

const page20=await api.loadConsultPage(19,{render:false});
assert.equal(page20.total,2050);
assert.equal(page20.page,20);
assert.equal(page20.data.length,100);
assert.equal(adminState.consultsTotal,2050);
assert.equal(adminState.consultsPage,19);
assert.equal(adminState.consults[0].nombre,'TRABAJADOR 1901');

const page21=await api.loadConsultPage(20,{render:false});
assert.equal(page21.page,21);
assert.equal(page21.data.length,50);
assert.equal(adminState.consults[49].nombre,'TRABAJADOR 2050');

const all=await api.fetchAllConsults();
assert.equal(all.length,2050);
assert.equal(all[0].nombre,'TRABAJADOR 1');
assert.equal(all.at(-1).nombre,'TRABAJADOR 2050');
assert.ok(requests>=7,'La prueba debe recorrer varias páginas de servidor');
assert.equal(api.PAGE_SIZE,100);
assert.equal(api.EXPORT_PAGE_SIZE,500);
assert.equal(api.CAMP_TIMEZONE,'America/Santiago');
assert.match(api.todayChileKey(),/^\d{4}-\d{2}-\d{2}$/);
assert.equal(api.addDaysKey('2026-08-29',-1),'2026-08-28');
assert.equal(api.addDaysKey('2026-03-01',-1),'2026-02-28');

const preview=await api.requestCleanupPreview('2026-08-28');
assert.equal(preview.count,37);
assert.equal(preview.date,'2026-08-28');
assert.equal(preview.timezone,'America/Santiago');
const deleted=await api.deleteConsultDate('2026-08-28');
assert.equal(deleted.deleted,37);
assert.equal(deleted.date,'2026-08-28');
assert.deepEqual(maintenanceCalls,[
  {method:'GET',action:'delete_preview',date:'2026-08-28'},
  {method:'DELETE',action:'',date:'2026-08-28'}
]);
await assert.rejects(()=>api.requestCleanupPreview('28-08-2026'),/fecha válida/i);
await assert.rejects(()=>api.deleteConsultDate(''),/fecha válida/i);

console.log('Consultas RUT smoke: OK · 2050 registros · paginación/exportación · vista previa · borrado por fecha');
