import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const src=fs.readFileSync('assets/workforce-mod-moi.js','utf8');
assert.ok(!/MutationObserver/.test(src),'MOD/MOI no debe usar observers globales.');
assert.match(src,/camp:view-rendered/,'El panel debe renderizar únicamente al completar Dashboard Gerencial.');
assert.match(src,/campamento-workforce-api/,'La clasificación persistente debe usar API protegida.');

const context={console,setTimeout,clearTimeout,globalThis:null};
context.globalThis=context;
vm.createContext(context);
vm.runInContext(src,context,{filename:'workforce-mod-moi.js'});
const model=context.CampWorkforceMODMOI;
assert.ok(model?.compute,'Debe exponer el modelo de cálculo MOD/MOI.');

const workers=[];
for(let i=0;i<2000;i++)workers.push({
  rut:`${10000000+i}-K`,
  nombre:`Trabajador ${i}`,
  empresa:i<1400?'EMPRESA A':'EMPRESA B',
  turno:i%2?'14X14 A':'14X14 B',
  categoria:i<1200?'Maestro Primera':i<1900?'Administrativo':'Cargo Nuevo',
  modulo:`M${(i%20)+1}`,
  habitacion:String((i%100)+1),
  cama:String((i%4)+1)
});
const rules={
  [model.fold('Maestro Primera')]:'DIRECTA',
  [model.fold('Administrativo')]:'INDIRECTA'
};
const all=model.compute(workers,rules,{turno:'TODOS',empresa:'TODAS'});
assert.equal(all.totals.total,2000);
assert.equal(all.totals.DIRECTA,1200);
assert.equal(all.totals.INDIRECTA,700);
assert.equal(all.totals.POR_DEFINIR,100);
assert.equal(all.companies.length,2);
assert.equal(all.turnos.length,2);

const companyB=model.compute(workers,rules,{turno:'TODOS',empresa:'EMPRESA B'});
assert.equal(companyB.totals.total,600);
assert.equal(companyB.totals.DIRECTA,0);
assert.equal(companyB.totals.INDIRECTA,500);
assert.equal(companyB.totals.POR_DEFINIR,100);

const shiftA=model.compute(workers,rules,{turno:'14X14 A',empresa:'TODAS'});
assert.equal(shiftA.totals.total,1000);
assert.equal(shiftA.totals.DIRECTA,600);
assert.equal(shiftA.totals.INDIRECTA,350);
assert.equal(shiftA.totals.POR_DEFINIR,50);

const withUnassigned=[...workers,{categoria:'Maestro Primera',empresa:'EMPRESA A',turno:'14X14 A',modulo:'',habitacion:'',cama:''}];
assert.equal(model.compute(withUnassigned,rules,{turno:'TODOS',empresa:'TODAS'}).totals.total,2000,'En turno debe contar solo trabajadores con cama completa asignada.');

console.log('MOD/MOI 2000 trabajadores: OK · filtros turno/empresa · empresa→cargo · por definir · solo alojados');
