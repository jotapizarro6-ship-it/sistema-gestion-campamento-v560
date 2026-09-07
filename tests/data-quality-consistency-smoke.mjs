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
  Map,
  Set,
  calcExceptions:()=>[],
  calcAnomalies:()=>[],
  analytics:data=>data.__analytics||{},
  kpi:(...args)=>args,
  clean:v=>String(v??'').trim(),
  plain:v=>String(v??'').trim().toUpperCase().replace(/\s+/g,' '),
  lkey:(m,r,b)=>[
    String(m??'').trim().toUpperCase(),
    String(r??'').trim().toUpperCase(),
    String(b??'').trim().toUpperCase()
  ].join('|'),
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
  baseCapacity:2
};

const base={
  workers:[],
  movements:[],
  inventory:[
    {module:'M1',room:'101',bed:'A'},
    {module:'M1',room:'101',bed:'B'}
  ],
  blocks:[],
  reservations:[]
};

const valid=structuredClone(base);
valid.reservations=[
  {
    arrival_date:'2026-09-07',
    departure_date:'2026-09-08',
    person_name:'Uno',
    bed_count:1,
    status:'PENDIENTE',
    module:'M1',room:'101',bed:'A'
  },
  {
    arrival_date:'2026-09-08',
    departure_date:'2026-09-09',
    person_name:'Dos',
    bed_count:1,
    status:'CONFIRMADA',
    module:'M1',room:'101',bed:'A'
  }
];

let out=ctx.calcExceptions(valid,analytics);

for(const code of [
  'RES_CAMA_FUERA_INVENTARIO',
  'RES_SOLAPE_CAMA',
  'RES_BLOQUEO_CRUCE'
]){
  assert.equal(out.some(x=>x.code===code),false,code);
}

const invalid=structuredClone(base);

invalid.reservations=[
  {
    arrival_date:'2026-09-07',
    departure_date:'2026-09-10',
    person_name:'Uno',
    bed_count:1,
    status:'PENDIENTE',
    module:'M1',room:'101',bed:'A'
  },
  {
    arrival_date:'2026-09-09',
    departure_date:'2026-09-11',
    person_name:'Dos',
    bed_count:1,
    status:'CONFIRMADA',
    module:'M1',room:'101',bed:'A'
  },
  {
    arrival_date:'2026-09-08',
    departure_date:'2026-09-12',
    person_name:'Tres',
    bed_count:1,
    status:'PENDIENTE',
    module:'M9',room:'999',bed:'Z'
  }
];

invalid.blocks=[
  {
    module:'M1',
    room:'101',
    bed:'A',
    start_date:'2026-09-10',
    end_date:'2026-09-12',
    status:'ACTIVO'
  }
];

out=ctx.calcExceptions(invalid,analytics);
const byCode=Object.fromEntries(out.map(x=>[x.code,x]));

assert.equal(byCode.RES_CAMA_FUERA_INVENTARIO?.count,1);
assert.equal(byCode.RES_SOLAPE_CAMA?.count,1);
assert.equal(byCode.RES_BLOQUEO_CRUCE?.count,1);

const inactive=structuredClone(base);
inactive.reservations=[
  {
    arrival_date:'2026-09-07',
    departure_date:'2026-09-20',
    person_name:'Cancelada',
    bed_count:1,
    status:'CANCELADA',
    module:'M9',room:'999',bed:'Z'
  }
];

out=ctx.calcExceptions(inactive,analytics);

assert.equal(
  out.some(x=>[
    'RES_CAMA_FUERA_INVENTARIO',
    'RES_SOLAPE_CAMA',
    'RES_BLOQUEO_CRUCE'
  ].includes(x.code)),
  false
);

console.log('data-quality-consistency-smoke: OK');
