import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const code=fs.readFileSync('assets/ts/analytics/powerbi-engine.js','utf8');
const window={
  addEventListener(){},
  dispatchEvent(){},
  CampWorkforceMODMOI:{
    state:{rules:{}},
    compute(){return {totals:{total:3,DIRECTA:1,INDIRECTA:1,POR_DEFINIR:1}}}
  }
};
window.window=window;
const context=vm.createContext({window,Intl,Date,WeakMap,Map,Set,CustomEvent:class CustomEvent{constructor(type,init={}){this.type=type;this.detail=init.detail}}});
vm.runInContext(code,context,{filename:'powerbi-engine.js'});
assert.ok(window.CampAnalyticsEngine,'Debe exponer CampAnalyticsEngine');

const data={
  workers:[
    {nombre:'A',empresa:'EMPRESA 1',turno:'A',modulo:'M1',habitacion:'101',cama:'A'},
    {nombre:'B',empresa:'EMPRESA 1',turno:'B',modulo:'M1',habitacion:'102',cama:'A'},
    {nombre:'C',empresa:'EMPRESA 2',turno:'C',modulo:'',habitacion:'',cama:''}
  ],
  inventory:[{},{},{},{}],
  settings:{daily_capacity_default:4},
  blocks:[{status:'ACTIVO',start_date:'2000-01-01',end_date:null,modulo:'M9',habitacion:'999',cama:'Z'}],
  reservations:[{status:'CONFIRMADA',arrival_date:'2000-01-01',departure_date:'2999-01-01',bed_count:1}],
  movements:[],capacities:[]
};
const report=window.CampAnalyticsEngine.snapshot(data);
assert.equal(report.measures.workers_total,3);
assert.equal(report.measures.workers_assigned,2);
assert.equal(report.measures.beds_inventory,4);
assert.equal(report.measures.occupied_physical,2);
assert.equal(report.measures.blocked_today,1);
assert.equal(report.measures.capacity_base,4);
assert.equal(report.measures.capacity_effective,3);
assert.equal(report.measures.reserved_today,1);
assert.equal(report.measures.committed_today,3);
assert.equal(report.measures.free_today,0);
assert.equal(report.measures.occupancy_pct,100);
assert.equal(report.measures.mod,1);
assert.equal(report.measures.moi,1);
assert.equal(report.measures.workforce_undefined,1);
assert.deepEqual(JSON.parse(JSON.stringify(report.dimensions.empresa)),[{key:'EMPRESA 1',value:2}]);
const query=window.CampAnalyticsEngine.query(data,{dimension:'turno',filters:{empresa:'EMPRESA 1'}});
assert.deepEqual(JSON.parse(JSON.stringify(query)),[{key:'A',value:1},{key:'B',value:1}]);
console.log('Motor analítico smoke: OK');
