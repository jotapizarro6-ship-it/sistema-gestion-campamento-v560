import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const app2b=fs.readFileSync(
  new URL('../assets/app-2b.js',import.meta.url),
  'utf8'
);

const fixes=fs.readFileSync(
  new URL('../assets/final-audit-fixes.js',import.meta.url),
  'utf8'
);

const commandCenter=fs.readFileSync(
  new URL('../assets/command-center.js',import.meta.url),
  'utf8'
);

/* Confirma el contrato real de analytics en app-2b. */
assert.match(
  app2b,
  /an\.exceptions\s*=\s*calcExceptions\s*\(\s*data\s*,\s*an\s*\)/s
);

assert.match(
  app2b,
  /an\.anomalies\s*=\s*calcAnomalies\s*\(\s*data\s*,\s*an\s*\)/s
);

assert.match(
  commandCenter,
  /projectAutoAlerts\s*\(\s*analytics\s*\(\s*A\.data\s*\)\s*\)/
);

let writes=0;

const CampOps={
  registerRenderer(){},
  controlApi(){
    writes++;
    throw new Error('No write expected in Data Quality projection');
  }
};

const ctx={
  console,
  Date,
  Number,
  String,
  Math,
  Array,
  Map,
  Set,
  window:{CampOps},
  CampOps,
  A:{
    data:null,
    ops:{
      actions:[],
      plan_events:[]
    }
  },
  clean:v=>String(v??'').trim(),
  plain:v=>String(v??'')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,' '),
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

/*
 * Base mínima que reproduce el contrato canónico de app-2b:
 * analytics -> calcExceptions / calcAnomalies.
 */
vm.runInContext(`
  function calcExceptions(){
    return [];
  }

  function calcAnomalies(){
    return [];
  }

  function analytics(data){
    const an={
      today:todayISO(),
      capacityAvailable:true,
      baseCapacity:2,
      committedPct:0,
      mv:{
        SUBIDA:0,
        BAJADA:0
      }
    };

    an.exceptions=calcExceptions(data,an);
    an.anomalies=calcAnomalies(data,an);

    return an;
  }

  function kpi(...args){
    return args;
  }
`,ctx);

/* Instala las reglas reales V1-A/C1/C2/C3. */
vm.runInContext(fixes,ctx);

/* Instala la proyección real de Command Center. */
vm.runInContext(commandCenter,ctx);

assert.equal(typeof ctx.analytics,'function');
assert.equal(typeof CampOps.projectAutoAlerts,'function');
assert.equal(typeof CampOps.autoAlerts,'function');

const data={
  workers:[],

  inventory:[
    {
      module:'M1',
      room:'101',
      bed:'A'
    },
    {
      module:'M1',
      room:'101',
      bed:'B'
    }
  ],

  blocks:[],

  movements:[
    {
      movement_date:'2026-09-07',
      movement_type:'OTRO',
      people_count:0,
      lifecycle_status:'PROGRAMADO'
    }
  ],

  reservations:[
    /* V1-C2: registro persistido con estado fuera de contrato. */
    {
      arrival_date:'2026-09-12',
      departure_date:'2026-09-13',
      person_name:'Estado invalido',
      bed_count:2,
      status:'DESCONOCIDA',
      module:'',
      room:'',
      bed:''
    },

    /* V1-C3: dos reservas activas exactas sobre la misma cama. */
    {
      arrival_date:'2026-09-07',
      departure_date:'2026-09-10',
      person_name:'Persona Uno',
      bed_count:1,
      status:'PENDIENTE',
      module:'M1',
      room:'101',
      bed:'A'
    },
    {
      arrival_date:'2026-09-09',
      departure_date:'2026-09-11',
      person_name:'Persona Dos',
      bed_count:1,
      status:'CONFIRMADA',
      module:'M1',
      room:'101',
      bed:'A'
    }
  ]
};

ctx.A.data=data;

const an=ctx.analytics(data);

assert.ok(Array.isArray(an.exceptions));
assert.ok(Array.isArray(an.anomalies));

const exceptionByCode=Object.fromEntries(
  an.exceptions.map(x=>[x.code,x])
);

/* C1 */
assert.equal(
  exceptionByCode.MOV_TIPO_INVALIDO?.count,
  1
);

/* C2 */
assert.equal(
  exceptionByCode.RES_ESTADO_INVALIDO?.count,
  1
);

/* C3 */
assert.equal(
  exceptionByCode.RES_SOLAPE_CAMA?.count,
  1
);

const projected=CampOps.projectAutoAlerts(an);
const alertByCode=Object.fromEntries(
  projected.map(x=>[x.code,x])
);

for(const code of [
  'MOV_TIPO_INVALIDO',
  'RES_ESTADO_INVALIDO',
  'RES_SOLAPE_CAMA'
]){
  const source=exceptionByCode[code];
  const alert=alertByCode[code];

  assert.ok(source,`${code}: exception missing`);
  assert.ok(alert,`${code}: projected alert missing`);

  assert.equal(alert.count,source.count);
  assert.equal(alert.related_date,'2026-09-07');
  assert.equal(alert.key,`${code}:2026-09-07`);
  assert.equal(alert.severity,'CRITICO');
}

/* autoAlerts recorre analytics -> exceptions -> projection. */
const automatic=CampOps.autoAlerts();
const automaticByCode=Object.fromEntries(
  automatic.map(x=>[x.code,x])
);

assert.equal(
  automaticByCode.MOV_TIPO_INVALIDO?.key,
  'MOV_TIPO_INVALIDO:2026-09-07'
);

assert.equal(
  automaticByCode.RES_ESTADO_INVALIDO?.key,
  'RES_ESTADO_INVALIDO:2026-09-07'
);

assert.equal(
  automaticByCode.RES_SOLAPE_CAMA?.key,
  'RES_SOLAPE_CAMA:2026-09-07'
);

/* Reordenar señales no modifica identidad estable. */
const reversed=CampOps.projectAutoAlerts({
  ...an,
  exceptions:[...an.exceptions].reverse()
});

const reversedKeys=Object.fromEntries(
  reversed.map(x=>[x.code,x.key])
);

assert.equal(
  reversedKeys.MOV_TIPO_INVALIDO,
  'MOV_TIPO_INVALIDO:2026-09-07'
);

assert.equal(
  reversedKeys.RES_ESTADO_INVALIDO,
  'RES_ESTADO_INVALIDO:2026-09-07'
);

assert.equal(
  reversedKeys.RES_SOLAPE_CAMA,
  'RES_SOLAPE_CAMA:2026-09-07'
);

/* La detección/proyección jamás crea acciones por sí sola. */
assert.equal(writes,0);

console.log('data-quality-pipeline-smoke: OK');
