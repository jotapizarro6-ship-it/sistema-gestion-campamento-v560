import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

const source=fs.readFileSync('assets/admin-performance-guard.js','utf8');
const calls=[];
let advancedCalls=0,opsCalls=0,resolveAdvanced,resolveOps;

const sandbox={
  console,URL,Response,AbortController,DOMException,performance,setTimeout,clearTimeout,
  location:{href:'https://example.test/admin.html',hash:'#overview'},
  A:{currentView:'overview',opsRenderers:[]},
  fetch:async()=>new Response('{"ok":true}',{status:200,headers:{'content-type':'application/json'}}),
  advApi:(action)=>{advancedCalls++;return new Promise(r=>{resolveAdvanced=r})},
  CampOps:{
    applyProfileUi:()=>{},
    loadOpsState:()=>{opsCalls++;return new Promise(r=>{resolveOps=r})}
  }
};
sandbox.window=sandbox;
sandbox.GARPI_ENV=Object.freeze({mode:'production',isStagingLocal:false,productionOrigin:'https://usrstcxiluvsizoxwlxj.supabase.co',stagingOrigin:'http://127.0.0.1:54321',supabaseOrigin:'https://usrstcxiluvsizoxwlxj.supabase.co',supabaseHost:'usrstcxiluvsizoxwlxj.supabase.co',functionsOrigin:'https://usrstcxiluvsizoxwlxj.supabase.co/functions/v1',functionUrl(name,query){const base=this.functionsOrigin+'/'+String(name);const q=query==null?'':String(query).trim();return q?base+(q.startsWith('?')?q:'?'+q):base;}});
vm.createContext(sandbox);
vm.runInContext(source,sandbox,{filename:'admin-performance-guard.js'});

assert.equal(sandbox.CampAdminPerformance.VERSION,'20260829-adminperf1');
assert.equal(sandbox.CampAdminPerformance.requestTimeout('https://usrstcxiluvsizoxwlxj.supabase.co/functions/v1/campamento-v560-fast',{method:'GET'}),15000);
assert.equal(sandbox.CampAdminPerformance.requestTimeout('https://usrstcxiluvsizoxwlxj.supabase.co/functions/v1/campamento-upload-api',{method:'POST'}),60000);

const control=function(){calls.push('control');return 'view-control-room'};
const governance=function(){calls.push('governance');return 'view-governance'};
const integrity=function(){calls.push('integrity');return 'renderSemaphore renderRecovery'};
const globalRenderer=function(){calls.push('global')};
sandbox.A.opsRenderers=[control,governance,integrity,globalRenderer];

sandbox.CampOps.renderOpsViews('control-room');
assert.deepEqual(calls,['control','global'],'Centro de Control no debe renderizar vistas avanzadas ocultas');
calls.length=0;
sandbox.CampOps.renderOpsViews('overview');
assert.deepEqual(calls,['integrity','global'],'Resumen solo debe ejecutar la capa de integridad relevante y renderers globales');
calls.length=0;
sandbox.CampOps.renderOpsViews('governance');
assert.deepEqual(calls,['governance','integrity','global'],'Trazabilidad debe renderizar únicamente su vista y la capa de integridad');

sandbox.A.currentView='overview';
const suppressed=await sandbox.fetch('https://usrstcxiluvsizoxwlxj.supabase.co/functions/v1/campamento-recovery-api?action=status',{method:'GET'});
assert.equal(suppressed.headers.get('x-camp-suppressed'),'hidden-recovery-status','la consulta de recuperación debe suprimirse cuando Reportes no está visible');

const p1=sandbox.advApi('advanced_state',{method:'GET'});
const p2=sandbox.advApi('advanced_state',{method:'GET'});
assert.equal(advancedCalls,1,'dos sincronizaciones simultáneas deben compartir la misma carga principal');
resolveAdvanced({ok:true,data:{workers:[]}});
assert.deepEqual(await p1,await p2);

const o1=sandbox.CampOps.loadOpsState();
const o2=sandbox.CampOps.loadOpsState();
assert.equal(opsCalls,1,'el estado operacional no debe solicitarse dos veces en paralelo');
resolveOps(true);
assert.equal(await o1,true);assert.equal(await o2,true);

console.log('Admin performance guard: OK · render activo aislado · recovery oculto suprimido · cargas concurrentes deduplicadas · timeouts activos');
