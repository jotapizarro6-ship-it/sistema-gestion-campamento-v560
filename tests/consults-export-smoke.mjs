import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const code=fs.readFileSync(new URL('../assets/consults-export-xlsx.js',import.meta.url),'utf8');
const context={
  window:{renderConsults(){},A:{consults:[]}},
  document:{querySelector(){return null;},head:{appendChild(){}},createElement(){return {}; }},
  console,Date,String,Number,Array,Object,Promise,Error,setTimeout,clearTimeout,
  alert(){}
};
vm.createContext(context);
vm.runInContext(code,context);

const rows=context.window.CampConsultExport.consultsToRows([
  {
    consultado_at:'2026-08-29T00:15:30Z',
    rut:'12.345.678-5',
    nombre:'TRABAJADOR PRUEBA',
    status:'ASIGNADO',
    modulo:'OP02',
    habitacion:'216',
    cama:'A',
    ip:'192.0.2.10'
  },
  {consultado_at:'sin-fecha',rut:'9.999.999-9',nombre:'SIN ASIGNACION',status:'NO_ENCONTRADO'}
]);

assert.equal(rows.length,2);
assert.equal(rows[0].RUT,'12.345.678-5');
assert.equal(rows[0].Nombre,'TRABAJADOR PRUEBA');
assert.equal(rows[0].Resultado,'ASIGNADO');
assert.equal(rows[0]['Asignación'],'OP02 / 216 / A');
assert.ok(rows[0]['Fecha consulta'] instanceof Date);
assert.equal(rows[1]['Fecha consulta'],'sin-fecha');
assert.equal(rows[1]['Asignación'],'');
assert.equal(rows[1].IP,'');

console.log('Consultas RUT export smoke: OK');
