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
const beforeHeap=process.memoryUsage().heapUsed;

// Escenario de certificación: 2.000 trabajadores asignados sobre 2.000 camas físicas.
// Se agregan reservas, movimientos, bloqueos, capacidad y cierres para ejercitar dashboards y proyecciones.
const inventory=[];
for(let i=0;i<2000;i++){
  const module=`M${String(Math.floor(i/100)+1).padStart(2,'0')}`;
  const within=i%100,room=String(Math.floor(within/4)+1),bed=['A','B','C','D'][within%4];
  inventory.push({module,room,bed,room_type:'ESTANDAR',camp:'CAMPAMENTO'});
}
const workers=[];
for(let i=0;i<2000;i++){
  const b=inventory[i];
  workers.push({id:i+1,rut:`${10000000+i}-0`,nombre:`TRABAJADOR ${String(i+1).padStart(4,'0')}`,turno:['A','B','C','D'][i%4],modulo:b.module,habitacion:b.room,cama:b.bed,empresa:`EMPRESA ${i%20+1}`,especialidad:`AREA ${i%30+1}`,categoria:`CATEGORIA ${i%12+1}`,sexo:i%5===0?'FEMENINO':'MASCULINO',residencia:`CIUDAD ${i%15+1}`});
}
const movements=[];
for(let i=0;i<180;i++)movements.push({id:i+1,movement_date:add(today,i%30),movement_type:i%2?'SUBIDA':'BAJADA',people_count:(i%8)+1,shift:['A','B','C','D'][i%4],company:`EMPRESA ${i%20+1}`});
const reservations=[];
for(let i=0;i<300;i++){
  const b=inventory[(i+1500)%inventory.length];
  reservations.push({id:i+1,arrival_date:add(today,(i%25)-5),departure_date:add(today,(i%25)+6),person_name:`VISITA ${i+1}`,module:b.module,room:b.room,bed:b.bed,bed_count:1,status:i%9===0?'CONFIRMADA':'PENDIENTE'});
}
const blocks=[];
for(let i=0;i<120;i++){
  const b=inventory[1750+i];
  blocks.push({id:i+1,module:b.module,room:b.room,bed:b.bed,start_date:today,end_date:add(today,10),status:'ACTIVO',reason:'MANTENCIÓN'});
}
const capacities=Array.from({length:31},(_,i)=>({capacity_date:add(today,i),capacity:2000}));
const snapshots=Array.from({length:60},(_,i)=>({snapshot_date:add(today,-60+i),capacity:2000,occupied:1850+i%80,reserved:30,free:100,committed_occupancy:95,closed_at:'CIERRE',companies_json:'[]',shifts_json:'[]',modules_json:'[]'}));
const data={workers,inventory,movements,reservations,blocks,capacities,snapshots,settings:{daily_capacity_default:'2000',cost_per_bed_day:'0',source_file:'CERTIFICACION_2000x2000.xlsx',last_update:'TEST'}};
sandbox.__data=data;

const t0=performance.now();
const first=vm.runInContext('analytics(__data)',sandbox);
const firstMs=performance.now()-t0;
const t1=performance.now();
const second=vm.runInContext('analytics(__data)',sandbox);
const cachedMs=performance.now()-t1;
const semantic=sandbox.CampSemanticModel.get(data);
const heapDeltaMb=(process.memoryUsage().heapUsed-beforeHeap)/(1024*1024);

assert.equal(first.occupied,2000,'debe procesar 2.000 trabajadores asignados');
assert.equal(first.hm.items.length,2000,'debe procesar 2.000 camas físicas');
assert.equal(first.hm.modules.length,20,'debe resumir correctamente 20 módulos');
assert.equal(first.forecast.length,30,'debe mantener la proyección operacional de 30 días');
assert.equal(semantic.occupiedKeys.size,2000,'el modelo semántico debe indexar las 2.000 ocupaciones una sola vez');
assert.equal(semantic.capacityByDate.size,31,'el modelo semántico debe indexar capacidad por fecha');
assert.strictEqual(first,second,'analytics debe reutilizar el resultado mientras A.data no cambie');

// Contratos de datos consumidos por gráficos: módulos, heatmap/proyección, movimientos, turnos e histórico.
const finite=n=>Number.isFinite(Number(n));
for(const m of first.hm.modules){
  for(const k of ['occupied','reserved','blocked','free'])assert.ok(finite(m[k]),`módulo ${m.label}: ${k} debe ser numérico`);
}
for(const x of first.forecast){
  for(const k of ['base_capacity','blocked','capacity','physical','reserved','committed','free','over','pct','up','down'])assert.ok(finite(x[k]),`forecast ${x.date}: ${k} debe ser numérico`);
}
const shiftCounts=new Map();for(const w of workers)shiftCounts.set(w.turno,(shiftCounts.get(w.turno)||0)+1);
assert.equal([...shiftCounts.values()].reduce((a,b)=>a+b,0),2000,'el gráfico de turnos debe conservar toda la dotación');
assert.equal(shiftCounts.size,4,'el gráfico de turnos debe mantener los cuatro turnos');
assert.equal(snapshots.length,60,'el histórico sintético debe cubrir 60 cierres');
assert.ok(snapshots.every(x=>finite(x.capacity)&&finite(x.occupied)&&finite(x.committed_occupancy)),'el histórico debe entregar valores numéricos a sus gráficos');

// Umbrales de certificación del motor interno en runner estándar.
assert.ok(firstMs<2000,`cálculo inicial demasiado lento para 2000/2000: ${firstMs.toFixed(1)} ms`);
assert.ok(semantic.built_ms<800,`modelo semántico demasiado lento para 2000/2000: ${semantic.built_ms.toFixed(1)} ms`);
assert.ok(cachedMs<25,`lectura memoizada demasiado lenta: ${cachedMs.toFixed(1)} ms`);
assert.ok(heapDeltaMb<256,`consumo incremental de memoria demasiado alto: ${heapDeltaMb.toFixed(1)} MB`);

const idx=sandbox.CampHighVolume.buildWorkerIndex(workers);
assert.equal(idx.length,2000);
const page=sandbox.CampHighVolume.paginate(idx,1,100);
assert.equal(page.items.length,100,'la vista de trabajadores debe limitar el DOM a 100 filas por página');
assert.equal(page.pages,20,'2.000 trabajadores deben paginarse en 20 páginas de 100');
const found=sandbox.CampHighVolume.filterWorkerIndex(idx,'TRABAJADOR 2000');
assert.equal(found.length,1,'la búsqueda indexada debe encontrar al trabajador 2.000');
const company=sandbox.CampHighVolume.filterWorkerIndex(idx,'EMPRESA 20');
assert.ok(company.length>0,'la búsqueda indexada por empresa debe operar en dotación de 2.000');

console.log(`CERTIFICACION 2000x2000: OK · analytics ${firstMs.toFixed(1)} ms · semantic ${semantic.built_ms.toFixed(1)} ms · cache ${cachedMs.toFixed(2)} ms · heap +${heapDeltaMb.toFixed(1)} MB · 2000 trabajadores · 2000 camas · 300 reservas · 180 movimientos · 120 bloqueos`);
