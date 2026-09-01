import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

const source=['assets/app-1.js','assets/app-2a.js','assets/app-2b.js','assets/semantic-model-runtime.js','assets/high-volume-runtime.js']
  .map(p=>fs.readFileSync(p,'utf8')).join('\n');

const sandbox={console,Date,Intl,URL,setTimeout,clearTimeout,performance,location:{href:'https://example.test/admin.html',hash:'#overview'}};
sandbox.window=sandbox;
sandbox.fetch=async()=>({ok:true,text:async()=>'{"ok":true}'});
vm.createContext(sandbox);
vm.runInContext(source,sandbox,{filename:'high-volume-bundle.js'});

const today=vm.runInContext('todayISO()',sandbox);
const add=(iso,n)=>{const d=new Date(`${iso}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};

const WORKERS=2000;
const BEDS=2000;
const RESERVATIONS=300;
const MOVEMENTS=180;
const BLOCKS=120;
const MODULE_SIZE=120;

const inventory=[];
for(let i=0;i<BEDS;i++){
  const module=`M${String(Math.floor(i/MODULE_SIZE)+1).padStart(2,'0')}`;
  const within=i%MODULE_SIZE,room=String(Math.floor(within/3)+1),bed=['A','B','C'][within%3];
  inventory.push({module,room,bed,room_type:'ESTANDAR',camp:'CAMPAMENTO'});
}

const workers=[];
function makeValidSyntheticRut(body){
  const digits=String(body);
  let sum=0;
  let multiplier=2;
  for(let p=digits.length-1;p>=0;p--){
    sum+=Number(digits[p])*multiplier;
    multiplier=multiplier===7?2:multiplier+1;
  }
  const result=11-(sum%11);
  const dv=result===11?'0':result===10?'K':String(result);
  return digits+'-'+dv;
}
for(let i=0;i<WORKERS;i++){
  const b=inventory[i];
  workers.push({id:i+1,rut:makeValidSyntheticRut(10000000+i),nombre:`TRABAJADOR ${String(i+1).padStart(4,'0')}`,turno:['A','B','C','D'][i%4],modulo:b.module,habitacion:b.room,cama:b.bed,empresa:`EMPRESA ${i%20+1}`,especialidad:`AREA ${i%30+1}`,categoria:`CATEGORIA ${i%10+1}`,sexo:i%5===0?'FEMENINO':'MASCULINO',residencia:`CIUDAD ${i%16+1}`});
}

const movements=[];
for(let i=0;i<MOVEMENTS;i++)movements.push({id:i+1,movement_date:add(today,1+(i%30)),movement_type:i%2?'SUBIDA':'BAJADA',people_count:(i%8)+1,shift:['A','B','C','D'][i%4],company:`EMPRESA ${i%20+1}`});

const reservations=[];
for(let i=0;i<RESERVATIONS;i++){
  const b=inventory[(i*7)%inventory.length];
  reservations.push({id:i+1,arrival_date:add(today,1+(i%25)),departure_date:add(today,7+(i%25)),person_name:`VISITA ${i+1}`,module:b.module,room:b.room,bed:b.bed,bed_count:1,status:i%7===0?'CONFIRMADA':'PENDIENTE'});
}

const blocks=[];
for(let i=0;i<BLOCKS;i++){
  const b=inventory[(1500+i)%inventory.length];
  blocks.push({id:i+1,module:b.module,room:b.room,bed:b.bed,start_date:add(today,2),end_date:add(today,10),status:'ACTIVO',reason:'MANTENCIÓN'});
}

const capacities=Array.from({length:31},(_,i)=>({capacity_date:add(today,i),capacity:BEDS}));
const snapshots=Array.from({length:30},(_,i)=>({snapshot_date:add(today,-30+i),capacity:BEDS,occupied:1850+i%30,reserved:40,free:110,committed_occupancy:94.5,closed_at:'CIERRE',companies_json:'[]',shifts_json:'[]',modules_json:'[]'}));
const data={workers,inventory,movements,reservations,blocks,capacities,snapshots,settings:{daily_capacity_default:String(BEDS),cost_per_bed_day:'0',source_file:'PRUEBA_SINTETICA_2000.xlsx',last_update:'TEST'}};
sandbox.__data=data;

const heapBefore=process.memoryUsage().heapUsed;
const t0=performance.now();
const first=vm.runInContext('analytics(__data)',sandbox);
const firstMs=performance.now()-t0;
const heapAfter=process.memoryUsage().heapUsed;

const t1=performance.now();
const second=vm.runInContext('analytics(__data)',sandbox);
const cachedMs=performance.now()-t1;
const semantic=sandbox.CampSemanticModel.get(data);

assert.equal(first.occupied,WORKERS,'debe procesar 2.000 trabajadores físicamente asignados');
assert.equal(first.hm.items.length,BEDS,'debe procesar las 2.000 camas físicas');
assert.equal(first.hm.modules.length,Math.ceil(BEDS/MODULE_SIZE),'debe resumir correctamente todos los módulos');
assert.equal(first.forecast.length,30,'debe mantener la proyección operacional de 30 días');
assert.equal(semantic.occupiedKeys.size,WORKERS,'el modelo semántico debe indexar las 2.000 ocupaciones una sola vez');
assert.equal(semantic.capacityByDate.size,31,'el modelo semántico debe indexar capacidad por fecha');
assert.strictEqual(first,second,'analytics debe reutilizar exactamente el mismo resultado mientras A.data no cambie');
assert.ok(firstMs<1000,`cálculo inicial demasiado lento para 2000/2000: ${firstMs.toFixed(1)} ms`);
assert.ok(semantic.built_ms<300,`modelo semántico demasiado lento para 2000/2000: ${semantic.built_ms.toFixed(1)} ms`);
assert.ok(cachedMs<25,`lectura memoizada demasiado lenta: ${cachedMs.toFixed(1)} ms`);
assert.ok((heapAfter-heapBefore)<32*1024*1024,`incremento de memoria excesivo: ${((heapAfter-heapBefore)/1024/1024).toFixed(1)} MB`);

const warmStart=performance.now();
for(let i=0;i<25;i++)assert.strictEqual(vm.runInContext('analytics(__data)',sandbox),first);
const warmMs=performance.now()-warmStart;
assert.ok(warmMs<100,`25 lecturas de caché demasiado lentas: ${warmMs.toFixed(1)} ms`);

const idx=sandbox.CampHighVolume.buildWorkerIndex(workers);
assert.equal(idx.length,WORKERS,'el índice de trabajadores debe contener los 2.000 registros');
const page=sandbox.CampHighVolume.paginate(idx,1,100);
assert.equal(page.items.length,100,'la vista de trabajadores debe limitar el DOM a 100 filas por página');
assert.equal(page.pages,20,'2.000 trabajadores deben dividirse en 20 páginas de 100');
const lastPage=sandbox.CampHighVolume.paginate(idx,20,100);
assert.equal(lastPage.items.length,100,'la última página debe mantener 100 registros');
const found=sandbox.CampHighVolume.filterWorkerIndex(idx,'TRABAJADOR 2000');
assert.equal(found.length,1,'la búsqueda indexada debe encontrar al trabajador 2.000');

console.log(`CERTIFICACION 2000x2000: OK · analytics ${firstMs.toFixed(1)} ms · semantic ${semantic.built_ms.toFixed(1)} ms · cache ${cachedMs.toFixed(2)} ms · 25 cache ${warmMs.toFixed(1)} ms · heap ${((heapAfter-heapBefore)/1024/1024).toFixed(1)} MB · ${WORKERS} trabajadores · ${BEDS} camas · ${RESERVATIONS} reservas · ${MOVEMENTS} movimientos · ${BLOCKS} bloqueos`);
