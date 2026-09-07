import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const code=fs.readFileSync(new URL('../assets/command-center.js',import.meta.url),'utf8');

const CampOps={registerRenderer(){}};
const ctx={
  console,
  window:{CampOps},
  CampOps,
  A:{data:{},ops:{actions:[],plan_events:[]}},
  plain:v=>String(v??'').trim().toUpperCase().replace(/\s+/g,' '),
  todayISO:()=> '2026-09-07'
};

vm.createContext(ctx);
vm.runInContext(code,ctx);

assert.equal(typeof CampOps.projectAutoAlerts,'function');

const first={
  today:'2026-09-07',
  exceptions:[
    {level:'high',code:'CAMA_DUP',title:'Camas con doble asignación',count:2,detail:'Duplicadas',action:'Revisar'},
    {level:'medium',code:'SIN_CAMA',title:'Trabajadores sin cama completa',count:1,detail:'Incompletas',action:'Asignar'}
  ],
  anomalies:[
    {level:'medium',title:'Subida inusual',detail:'Movimiento fuera de patrón'}
  ]
};

const second={
  ...first,
  exceptions:[...first.exceptions].reverse()
};

const a=CampOps.projectAutoAlerts(first);
const b=CampOps.projectAutoAlerts(second);

const keysA=Object.fromEntries(a.map(x=>[x.code==='ANOMALIA'?x.title:x.code,x.key]));
const keysB=Object.fromEntries(b.map(x=>[x.code==='ANOMALIA'?x.title:x.code,x.key]));

assert.equal(keysA.CAMA_DUP,'CAMA_DUP:2026-09-07');
assert.equal(keysA.SIN_CAMA,'SIN_CAMA:2026-09-07');
assert.equal(keysA['Subida inusual'],'SUBIDA_INUSUAL:2026-09-07');
assert.deepEqual(keysA,keysB);
assert.equal(a.every(x=>x.key.length<=160),true);

const manualExactAlert=a.find(x=>x.code==='CAMA_DUP');
assert.ok(manualExactAlert);
assert.equal(
  CampOps.actionMatchesAutoAlert({
    source_type:'MANUAL',
    source_key:manualExactAlert.key,
    related_date:manualExactAlert.related_date
  },manualExactAlert),
  false
);

ctx.analytics=()=>first;
assert.deepEqual(CampOps.autoAlerts(),a);

console.log('command-center-smoke: OK');
