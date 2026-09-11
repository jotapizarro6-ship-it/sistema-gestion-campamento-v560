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
  movements:[
    {movement_date:'2026-09-07',movement_type:'SUBIDA',people_count:0,lifecycle_status:'PROGRAMADO'},
    {movement_date:'2026-09-08',movement_type:'BAJADA',people_count:10,lifecycle_status:'EJECUTADO'},
    {movement_date:'2026-09-09',movement_type:'SUBIDA',people_count:10000,lifecycle_status:'CANCELADO'},
    {movement_date:'2026-09-10',movement_type:'BAJADA',people_count:1}
  ]
};

let out=ctx.calcExceptions(valid,analytics);

const movementCodes=new Set([
  'MOV_FECHA_INVALIDA',
  'MOV_TIPO_INVALIDO',
  'MOV_CANTIDAD_INVALIDA',
  'MOV_ESTADO_INVALIDO'
]);

assert.equal(
  out.filter(x=>movementCodes.has(x.code)).length,
  0
);

const invalid={
  workers:[],
  movements:[
    {
      movement_date:'2026-02-30',
      movement_type:'OTRO',
      people_count:-1,
      lifecycle_status:'DESCONOCIDO'
    }
  ]
};

out=ctx.calcExceptions(invalid,analytics);

const byCode=Object.fromEntries(out.map(x=>[x.code,x]));

assert.equal(byCode.MOV_FECHA_INVALIDA?.count,1);
assert.equal(byCode.MOV_TIPO_INVALIDO?.count,1);
assert.equal(byCode.MOV_CANTIDAD_INVALIDA?.count,1);
assert.equal(byCode.MOV_ESTADO_INVALIDO?.count,1);

const upperBound={
  workers:[],
  movements:[
    {
      movement_date:'2026-09-07',
      movement_type:'SUBIDA',
      people_count:10001,
      lifecycle_status:'PROGRAMADO'
    }
  ]
};

out=ctx.calcExceptions(upperBound,analytics);
assert.equal(
  out.find(x=>x.code==='MOV_CANTIDAD_INVALIDA')?.count,
  1
);

console.log('data-quality-movements-smoke: OK');
