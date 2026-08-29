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

const inventory=[];
for(let i=0;i<1200;i++){
  const module=`M${String(Math.floor(i/120)+1).padStart(2,'0')}`;
  const within=i%120,room=String(Math.floor(within/3)+1),bed=['A','B','C'][within%3];
  inventory.push({module,room,bed,room_type:'ESTANDAR',camp:'CAMPAMENTO'});
}
const workers=[];
for(let i=0;i<800;i++){
  const b=inventory[i];
  workers.push({id:i+1,rut:`${10000000+i}-0`,nombre:`TRABAJADOR ${String(i+1).padStart(4,'0')}`,turno:['A','B','C','D'][i%4],modulo:b.module,habitacion:b.room,cama:b.bed,empresa:`EMPRESA ${i%12+1}`,especialidad:`AREA ${i%20+1}`,categoria:`CATEGORIA ${i%8+1}`,sexo:i%5===0?'FEMENINO':'MASCULINO',residencia:`CIUDAD ${i%10+1}`});
}
const movements=[];
for(let i=0;i<90;i++)movements.push({id:i+1,movement_date:add(today,i%30),movement_type:i%2?'SUBIDA':'BAJADA',people_count:(i%6)+1,shift:['A','B','C','D'][i%4],company:`EMPRESA ${i%12+1}`});
const reservations=[];
for(let i=0;i<120;i++){
  const b=inventory[(i+820)%inventory.length];
  reservations.push({id:i+1,arrival_date:add(today,(i%25)-5),departure_date:add(today,(i%25)+6),person_name:`VISITA ${i+1}`,module:b.module,room:b.room,bed:b.bed,bed_count:1,status:i%7===0?'CONFIRMADA':'PENDIENTE'});
}
const blocks=[];
for(let i=0;i<50;i++){
  const b=inventory[1000+i];
  blocks.push({id:i+1,module:b.module,room:b.room,bed:b.bed,start_date:today,end_date:add(today,10),status:'ACTIVO',reason:'MANTENCIÓN'});
}
const capacities=Array.from({length:31},(_,i)=>({capacity_date:add(today,i),capacity:1200}));
const snapshots=Array.from({length:30},(_,i)=>({snapshot_date:add(today,-30+i),capacity:1200,occupied:760+i%20,reserved:20,free:400,committed_occupancy:65,closed_at:'CIERRE',companies_json:'[]',shifts_json:'[]',modules_json:'[]'}));
const data={workers,inventory,movements,reservations,blocks,capacities,snapshots,settings:{daily_capacity_default:'1200',cost_per_bed_day:'0',source_file:'PRUEBA_SINTETICA.xlsx',last_update:'TEST'}};
sandbox.__data=data;

const t0=performance.now();
const first=vm.runInContext('analytics(__data)',sandbox);
const firstMs=performance.now()-t0;
const t1=performance.now();
const second=vm.runInContext('analytics(__data)',sandbox);
const cachedMs=performance.now()-t1;
const semantic=sandbox.CampSemanticModel.get(data);

assert.equal(first.occupied,800,'debe procesar 800 trabajadores asignados');
assert.equal(first.hm.items.length,1200,'debe procesar 1.200 camas físicas');
assert.equal(first.hm.modules.length,10,'debe resumir correctamente los módulos');
assert.equal(first.forecast.length,30,'debe mantener la proyección operacional de 30 días');
assert.equal(semantic.occupiedKeys.size,800,'el modelo semántico debe indexar la ocupación una sola vez');
assert.equal(semantic.capacityByDate.size,31,'el modelo semántico debe indexar capacidad por fecha');
assert.strictEqual(first,second,'analytics debe reutilizar el resultado mientras A.data no cambie');
assert.ok(firstMs<500,`cálculo inicial demasiado lento para 800/1200: ${firstMs.toFixed(1)} ms`);
assert.ok(cachedMs<25,`lectura memoizada demasiado lenta: ${cachedMs.toFixed(1)} ms`);

const idx=sandbox.CampHighVolume.buildWorkerIndex(workers);
assert.equal(idx.length,800);
const page=sandbox.CampHighVolume.paginate(idx,1,100);
assert.equal(page.items.length,100,'la vista de trabajadores debe limitar el DOM a 100 filas por página');
assert.equal(page.pages,8);
const found=sandbox.CampHighVolume.filterWorkerIndex(idx,'TRABAJADOR 0800');
assert.equal(found.length,1,'la búsqueda indexada debe encontrar un trabajador en dotación alta');

console.log(`High-volume semantic smoke: OK · analytics inicial ${firstMs.toFixed(1)} ms · semantic build ${semantic.built_ms.toFixed(1)} ms · cache ${cachedMs.toFixed(2)} ms · 800 trabajadores · 1200 camas`);
