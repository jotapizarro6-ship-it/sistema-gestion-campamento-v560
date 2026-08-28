import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync('assets/planning-suite.js','utf8');
const CampOps={registerRenderer(){},applyProfileUi(){},canWrite(){return true},isAdmin(){return true}};
const sandbox={
  console,window:{CampOps},CampOps,
  A:{whatIfAssumptions:[],whatIfIncludePlan:false,whatIfScenarioId:null,whatIfScenarioName:'',ops:{plan_events:[],scenarios:[]}},
  renderPlanning(){},plain:v=>String(v??'').trim().toUpperCase(),clean:v=>String(v??'').trim(),
  fmtInt:v=>String(Math.trunc(Number(v)||0)),fmt1:v=>String(Number(v)||0),fmtDate:v=>String(v),todayISO:()=> '2026-08-28',
  esc:v=>String(v??''),showMessage(){},planningRows(){return[]},document:{getElementById(){return null}},confirm(){return false},prompt(){return''}
};
sandbox.window.window=sandbox.window;
vm.createContext(sandbox);
vm.runInContext(source,sandbox,{filename:'planning-suite.js'});

const rows=[
  {date:'2026-08-28',capacity:100,occupied:70,reserved:10,committed_occupancy:80},
  {date:'2026-08-29',capacity:100,occupied:70,reserved:10,committed_occupancy:80},
  {date:'2026-08-30',capacity:100,occupied:70,reserved:10,committed_occupancy:80},
  {date:'2026-08-31',capacity:100,occupied:70,reserved:10,committed_occupancy:80}
];

sandbox.A.whatIfAssumptions=[{type:'SUBIDA',date:'2026-08-29',value:20,label:'subida'}];
let sim=CampOps.simulate(rows,[]);
assert.equal(sim[0].sim_committed,80,'antes de la subida el escenario no cambia');
assert.equal(sim[1].sim_committed,100,'la subida se acumula desde su fecha');
assert.equal(sim[3].sim_committed,100,'la subida sigue afectando días posteriores');

sandbox.A.whatIfAssumptions=[{type:'CAPACIDAD_MENOS',date:'2026-08-29',end_date:'2026-08-30',value:15,label:'mantención'}];
sim=CampOps.simulate(rows,[]);
assert.equal(sim[0].sim_capacity,100);
assert.equal(sim[1].sim_capacity,85,'la reducción temporal comienza en la fecha indicada');
assert.equal(sim[2].sim_capacity,85,'la reducción temporal incluye la fecha final');
assert.equal(sim[3].sim_capacity,100,'la capacidad vuelve a base al terminar el rango');
assert.equal(sim[1].sim_over,0);

sandbox.A.whatIfAssumptions=[{type:'SUBIDA',date:'2026-08-29',value:30},{type:'BAJADA',date:'2026-08-30',value:10}];
sim=CampOps.simulate(rows,[]);
assert.equal(sim[1].sim_occupied,100);
assert.equal(sim[2].sim_occupied,90,'la bajada reduce el delta acumulado desde su fecha');
assert.equal(CampOps.simSummary(sim).maxDeficit,10,'el resumen debe detectar el déficit máximo simulado');

sandbox.A.ops.plan_events=[{title:'Hito A',status:'PLANIFICADO',impact_type:'CAPACIDAD_MAS',impact_value:12,start_date:'2026-08-29',end_date:'2026-08-30'},{title:'Cerrado',status:'COMPLETADO',impact_type:'SUBIDA',impact_value:99,start_date:'2026-08-29'}];
sandbox.A.whatIfIncludePlan=false;
assert.equal(CampOps.planAssumptions().length,0,'Plan Maestro no entra por defecto al What-if');
sandbox.A.whatIfIncludePlan=true;
const plan=CampOps.planAssumptions();
assert.equal(plan.length,1,'solo impactos activos del Plan Maestro deben incorporarse');
assert.equal(plan[0].value,12);

console.log('Smoke Centro de Control / What-if: OK');
