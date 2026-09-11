import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const code=fs.readFileSync(
  new URL('../assets/final-audit-fixes.js',import.meta.url),
  'utf8'
);

const ctx={
  console,
  Date,
  Number,
  String,
  Math,
  Array,
  calcExceptions:()=>[],
  calcAnomalies:()=>[],
  analytics:data=>data.__analytics||{},
  kpi:(...args)=>args,
  clean:v=>String(v??'').trim(),
  plain:v=>String(v??'').trim().toUpperCase().replace(/\s+/g,' '),
  rutValid:()=>true,
  closedSnapshots:()=>[],
  todayISO:()=> '2026-09-07',
  addDays:v=>v,
  fmt1:v=>String(v)
};

vm.createContext(ctx);
vm.runInContext(code,ctx);

const analytics={
  capacityAvailable:true,
  baseCapacity:0
};

const valid={
  workers:[],
  movements:[],
  reservations:[
    {
      arrival_date:'2026-09-07',
      departure_date:'2026-09-08',
      person_name:'Persona Uno',
      bed_count:1,
      status:'PENDIENTE',
      module:'M1',
      room:'101',
      bed:'A'
    },
    {
      arrival_date:'2026-09-10',
      departure_date:'',
      person_name:'Persona Dos',
      bed_count:3,
      status:'CONFIRMADA',
      module:'',
      room:'',
      bed:''
    },
    {
      arrival_date:'2026-09-11',
      departure_date:null,
      person_name:'Persona Tres',
      bed_count:2,
      status:'ANULADA',
      module:'M1',
      room:'101',
      bed:''
    },
    {
      arrival_date:'2026-09-12',
      departure_date:'2026-09-13',
      person_name:'Persona Cuatro',
      bed_count:1,
      status:'CANCELADA',
      module:'',
      room:'',
      bed:''
    }
  ]
};

let out=ctx.calcExceptions(valid,analytics);

const reservationCodes=new Set([
  'RES_FECHA_INVALIDA',
  'RES_INTERVALO_INVALIDO',
  'RES_CANTIDAD_INVALIDA',
  'RES_ESTADO_INVALIDO',
  'RES_NOMBRE_FALTANTE',
  'RES_CAMA_INCOMPLETA',
  'RES_CAMA_CANTIDAD'
]);

assert.equal(
  out.filter(x=>reservationCodes.has(x.code)).length,
  0
);

const invalid={
  workers:[],
  movements:[],
  reservations:[
    {
      arrival_date:'2026-02-30',
      departure_date:'2026-02-29',
      person_name:'',
      bed_count:0,
      status:'DESCONOCIDA',
      module:'',
      room:'',
      bed:'A'
    },
    {
      arrival_date:'2026-09-10',
      departure_date:'2026-09-10',
      person_name:'Persona',
      bed_count:2,
      status:'PENDIENTE',
      module:'M1',
      room:'101',
      bed:'B'
    }
  ]
};

out=ctx.calcExceptions(invalid,analytics);
const byCode=Object.fromEntries(out.map(x=>[x.code,x]));

assert.equal(byCode.RES_FECHA_INVALIDA?.count,2);
assert.equal(byCode.RES_INTERVALO_INVALIDO?.count,1);
assert.equal(byCode.RES_CANTIDAD_INVALIDA?.count,1);
assert.equal(byCode.RES_ESTADO_INVALIDO?.count,1);
assert.equal(byCode.RES_NOMBRE_FALTANTE?.count,1);
assert.equal(byCode.RES_CAMA_INCOMPLETA?.count,1);
assert.equal(byCode.RES_CAMA_CANTIDAD?.count,1);

console.log('data-quality-reservations-smoke: OK');
