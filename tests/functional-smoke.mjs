import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const files=['assets/app-1.js','assets/app-2a.js','assets/app-2b.js','assets/app-3a.js','assets/app-3b.js','assets/app-4.js','assets/final-audit-fixes.js'];
const source=files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+`\n;globalThis.__campTest={normalizeRut,formatRut,rutValid,todayISO,addDays,physicalOccupied,reservedCount,capacityFor,blocksOn,forecast30,heatmap,planningRows,analytics,calcAnomalies};`;

const sandbox={
  console,Intl,Date,Math,JSON,String,Number,Array,Object,Map,Set,RegExp,Error,Promise,
  TextEncoder,TextDecoder,setTimeout,clearTimeout,
  document:{addEventListener(){},querySelector(){return null},querySelectorAll(){return[]},body:{appendChild(){}}},
  sessionStorage:{getItem(){return null},setItem(){},removeItem(){}},
  requestAnimationFrame(fn){fn();},
  history:{replaceState(){}},location:{hash:''},confirm(){return false;},
  Blob:globalThis.Blob,URL:globalThis.URL,FormData:globalThis.FormData,
  fetch:async()=>{throw new Error('fetch no debe ejecutarse en smoke test');}
};
sandbox.window={GARPI_ENV:Object.freeze({mode:'production',isStagingLocal:false,productionOrigin:'https://usrstcxiluvsizoxwlxj.supabase.co',stagingOrigin:'http://127.0.0.1:54321',supabaseOrigin:'https://usrstcxiluvsizoxwlxj.supabase.co',supabaseHost:'usrstcxiluvsizoxwlxj.supabase.co',functionsOrigin:'https://usrstcxiluvsizoxwlxj.supabase.co/functions/v1',functionUrl(name,query){const base=this.functionsOrigin+'/'+String(name);const q=query==null?'':String(query).trim();return q?base+(q.startsWith('?')?q:'?'+q):base;}})};
sandbox.globalThis=sandbox;
vm.createContext(sandbox);
vm.runInContext(source,sandbox,{filename:'campamento-browser.js'});
const f=sandbox.__campTest;

assert.equal(f.normalizeRut('183540265'),'18354026-5');
assert.equal(f.normalizeRut('18.354.026-5'),'18354026-5');
assert.equal(f.normalizeRut('18.354.0265'),'18354026-5');
assert.equal(f.formatRut('183540265'),'18.354.026-5');
assert.equal(f.rutValid('123456785'),true,'RUT con DV módulo 11 correcto debe ser válido');
assert.equal(f.rutValid('12.345.678-5'),true,'RUT formateado con DV correcto debe ser válido');
assert.equal(f.rutValid('10003K'),true,'Debe aceptar DV K cuando corresponde');
assert.equal(f.rutValid('123456789'),false,'DV incorrecto debe rechazarse');
assert.equal(f.rutValid('183540265'),false,'Estructura correcta no basta si el DV no corresponde');
assert.equal(f.rutValid('1234'),false);

const today=f.todayISO();
const tomorrow=f.addDays(today,1);
const afterTomorrow=f.addDays(today,2);
const data={
  workers:[
    {rut:'1-9',nombre:'ANA',modulo:'M1',habitacion:'101',cama:'A',empresa:'E1',turno:'A',sexo:'F'},
    {rut:'2-7',nombre:'BOB',modulo:'M1',habitacion:'101',cama:'B',empresa:'E1',turno:'B',sexo:'M'}
  ],
  inventory:[
    {module:'M1',room:'101',bed:'A'},
    {module:'M1',room:'101',bed:'B'},
    {module:'M1',room:'101',bed:'C'}
  ],
  blocks:[
    {module:'M1',room:'101',bed:'C',start_date:today,end_date:null,status:'ACTIVO'}
  ],
  reservations:[
    {id:1,arrival_date:today,departure_date:tomorrow,person_name:'ANA',module:'M1',room:'101',bed:'A',bed_count:1,status:'PENDIENTE'},
    {id:2,arrival_date:today,departure_date:tomorrow,person_name:'VISITA',module:null,room:null,bed:null,bed_count:2,status:'CONFIRMADA'},
    {id:3,arrival_date:tomorrow,departure_date:afterTomorrow,person_name:'FUTURO',module:null,room:null,bed:null,bed_count:1,status:'PENDIENTE'}
  ],
  movements:[
    {movement_date:tomorrow,movement_type:'SUBIDA',people_count:3,lifecycle_status:'PROGRAMADO'},
    {movement_date:tomorrow,movement_type:'BAJADA',people_count:1,lifecycle_status:'PROGRAMADO'}
  ],
  capacities:[
    {capacity_date:today,capacity:4},
    {capacity_date:tomorrow,capacity:5}
  ],
  snapshots:[],
  settings:{daily_capacity_default:'4',cost_per_bed_day:'10000'}
};

assert.equal(f.physicalOccupied(data),2,'ocupación física debe contar camas únicas');
assert.equal(f.blocksOn(today,data).size,1,'bloqueo activo debe reducir capacidad');
assert.equal(f.reservedCount(today,data),2,'reserva exacta ya materializada no debe duplicar ocupación');
assert.equal(f.reservedCount(tomorrow,data),1,'día de salida no consume cama; reserva futura sí');

const plan=f.planningRows(today,2,data);
assert.equal(plan[0].capacity,3,'capacidad efectiva descuenta bloqueos');
assert.equal(plan[0].occupied,2);
assert.equal(plan[0].reserved,2);
assert.equal(plan[0].over,1);
assert.equal(plan[1].occupied,4,'proyección aplica subidas menos bajadas');
assert.equal(plan[1].reserved,1);
assert.equal(plan[1].capacity,4);
assert.equal(plan[1].over,1);

const hm=f.heatmap(data,today);
const statusByBed=Object.fromEntries(hm.items.map(x=>[x.bed,x.status]));
assert.deepEqual(statusByBed,{A:'occupied',B:'occupied',C:'blocked'});
assert.equal(hm.modules[0].occupied,2);
assert.equal(hm.modules[0].blocked,1);

const dup={...data,workers:[
  {rut:'1',nombre:'A',modulo:'M1',habitacion:'101',cama:'A'},
  {rut:'2',nombre:'B',modulo:'M1',habitacion:'101',cama:'A'}
]};
assert.equal(f.physicalOccupied(dup),1,'doble registro de una misma cama no debe inflar ocupación física');

const fc=f.forecast30(data);
assert.equal(fc[0].capacity,3);
assert.equal(fc[1].physical,4);
assert.equal(fc[1].reserved,1);

// v5.5.8: el promedio histórico usa hasta los 7 cierres confirmados inmediatamente anteriores,
// no solamente cierres dentro de los últimos 7 días calendario.
const closedValues=[10,20,30,40,50,60,70,80];
const closedOffsets=[-29,-25,-20,-16,-12,-8,-4,-2];
const histData={...data,movements:[],snapshots:closedValues.map((v,i)=>({snapshot_date:f.addDays(today,closedOffsets[i]),closed_at:'cerrado',committed_occupancy:v,occupied:0,companies_json:'[]',shifts_json:'[]',modules_json:'[]'}))};
assert.equal(f.analytics(histData).histAvg,50,'promedio reciente debe usar los últimos 7 cierres confirmados');

// v5.5.8: el promedio de movimientos usa una ventana fija de 30 días e incluye días sin movimiento.
const moveData={...data,snapshots:[],movements:[
  {movement_date:f.addDays(today,-10),movement_type:'SUBIDA',people_count:30},
  {movement_date:today,movement_type:'SUBIDA',people_count:12}
]};
const anomalies=f.calcAnomalies(moveData,{committedPct:0,mv:{SUBIDA:12,BAJADA:0}});
assert.equal(anomalies.some(x=>x.title==='Subida inusual'),true,'promedio de movimientos debe incluir días sin movimiento en la ventana de 30 días');

console.log('Smoke funcional v5.6.0: OK');
