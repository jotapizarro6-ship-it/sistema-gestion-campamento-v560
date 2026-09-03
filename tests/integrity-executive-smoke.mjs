import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const code=fs.readFileSync(new URL('../assets/integrity-executive.js',import.meta.url),'utf8');
const uiCode=fs.readFileSync(new URL('../assets/ui-experience-fixes.js',import.meta.url),'utf8');
const uiCss=fs.readFileSync(new URL('../assets/ui-experience-fixes.css',import.meta.url),'utf8');
const app4=fs.readFileSync(new URL('../assets/app-4.js',import.meta.url),'utf8');
new vm.Script(uiCode,{filename:'ui-experience-fixes.js'});
assert.match(app4,/ui-experience-fixes\.css/,'La capa visual responsive debe cargarse desde app-4.');
assert.match(app4,/ui-experience-fixes\.js/,'La corrección de experiencia debe cargarse desde app-4.');
assert.match(uiCode,/\[data-print-executive\]/,'Debe interceptar la acción de informe ejecutivo.');
assert.match(uiCode,/window\.print\(\)/,'El PDF debe usar impresión del mismo documento.');
assert.doesNotMatch(uiCode,/window\.open\(/,'La corrección no debe depender de ventanas emergentes.');
assert.match(uiCode,/camp-topbar-status/,'Debe agrupar perfil y estado en una zona estable.');
assert.match(uiCode,/camp-topbar-buttons/,'Debe agrupar Actualizar e Instalar como acciones.');
assert.match(uiCss,/@media\(max-width:700px\)/,'Debe existir diseño específico para smartphone.');
assert.match(uiCss,/@media print/,'Debe existir una presentación dedicada al PDF/impresión.');
assert.match(uiCss,/#syncBadge\.status-pill\{display:inline-flex!important/,'El estado actualizado debe permanecer visible en móvil.');

const ctx={console,Date,Map,Set,Number,String,Math,JSON,window:{},A:{ops:{actions:[],plan_events:[]}},CampOps:{registerRenderer(){}},todayISO:()=> '2026-08-28',fmtDate:v=>v,fmt1:v=>Number(v||0).toFixed(1),fmtInt:v=>String(Number(v||0)),esc:v=>String(v??''),analytics:d=>d.__analytics};
ctx.window.GARPI_ENV=Object.freeze({mode:'production',isStagingLocal:false,productionOrigin:'https://usrstcxiluvsizoxwlxj.supabase.co',stagingOrigin:'http://127.0.0.1:54321',supabaseOrigin:'https://usrstcxiluvsizoxwlxj.supabase.co',supabaseHost:'usrstcxiluvsizoxwlxj.supabase.co',functionsOrigin:'https://usrstcxiluvsizoxwlxj.supabase.co/functions/v1',functionUrl(name,query){const base=this.functionsOrigin+'/'+String(name);const q=query==null?'':String(query).trim();return q?base+(q.startsWith('?')?q:'?'+q):base;}});
ctx.window.CampOps=ctx.CampOps;
vm.createContext(ctx);vm.runInContext(code,ctx);
const api=ctx.window.CampIntegrityExecutive;assert.ok(api,'Debe exponer API de pruebas');

const base={workers:[{rut:'11.111.111-1',modulo:'M1',habitacion:'101',cama:'A'},{rut:'22.222.222-2',modulo:'M1',habitacion:'101',cama:'B'}],inventory:[{module:'M1',room:'101',bed:'A'},{module:'M1',room:'101',bed:'B'}],reservations:[],blocks:[],settings:{source_file:'ASIGNACION.xlsx',last_update:'2026-08-28'},__analytics:{effectiveCapacity:132,occupied:2,free:130,committedPct:1.5,forecast:[{date:'2026-08-28',pct:1.5,over:0}]}};
let d=api.diagnose(base);assert.equal(d.critical,0);assert.equal(d.attention,0);assert.equal(d.score,100);

const dupRut=structuredClone(base);dupRut.workers[1].rut=dupRut.workers[0].rut;d=api.diagnose(dupRut);assert.ok(d.critical>=1);assert.equal(d.controls.find(x=>x.id==='rut').status,'CRITICO');

const dupBed=structuredClone(base);dupBed.workers[1].cama='A';d=api.diagnose(dupBed);assert.equal(d.controls.find(x=>x.id==='double-bed').status,'CRITICO');

const pressure=structuredClone(base);pressure.__analytics.forecast=[{date:'2026-08-30',pct:95,over:0}];let s=api.semaphore(pressure,api.diagnose(pressure));assert.equal(s.level,'ATENCION');
const over=structuredClone(base);over.__analytics.forecast=[{date:'2026-08-30',pct:105,over:7}];s=api.semaphore(over,api.diagnose(over));assert.equal(s.level,'CRITICO');assert.equal(s.futureOver.length,1);

console.log('integrity-executive-smoke: OK');
