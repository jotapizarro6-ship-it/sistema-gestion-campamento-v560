import fs from 'node:fs';
import assert from 'node:assert/strict';

const runtime=fs.readFileSync('assets/resilience-runtime.js','utf8');
const loader=fs.readFileSync('assets/app-4.js','utf8');
const fast=fs.readFileSync('supabase/functions/campamento-v560-fast/index.ts','utf8');
const safe=fs.readFileSync('supabase/functions/campamento-v560-safe/index.ts','utf8');
const web=fs.readFileSync('supabase/functions/campamento-web-api/index.ts','utf8');

assert.match(runtime,/navigator\.onLine/,'Debe detectar pérdida de conexión');
assert.match(runtime,/AbortController/,'Debe aplicar timeout de red');
assert.match(runtime,/RETRYABLE_STATUS/,'Debe limitar reintentos a errores transitorios');
assert.match(runtime,/IDEMPOTENT_POSTS=new Set\(\['snapshot_today'\]\)/,'Sólo snapshot_today puede reintentarse automáticamente como POST');
assert.doesNotMatch(runtime,/IDEMPOTENT_POSTS[^\n]*lookup/,'lookup no debe reintentarse porque registra trazabilidad');
assert.match(runtime,/inflight=new Map\(\)/,'Debe deduplicar solicitudes simultáneas');
assert.match(runtime,/NO ACTUALIZADO/,'La interfaz debe marcar datos antiguos');
assert.match(runtime,/STATE_CONFLICT/,'Debe reconocer conflictos concurrentes');
assert.match(runtime,/cid:cid\(\)/,'Debe emitir correlation ID sin PII');
assert.match(runtime,/getMetrics/,'Debe exponer métricas técnicas locales');
assert.doesNotMatch(runtime,/localStorage/,'No debe persistir dotación o respuestas en almacenamiento local');

const guardPos=loader.indexOf('admin-performance-guard.js');
const resiliencePos=loader.indexOf('resilience-runtime.js');
assert.ok(guardPos>=0&&resiliencePos>guardPos,'La resiliencia debe cargarse al final para envolver el runtime definitivo');

assert.match(fast,/action==='health'/,'Debe existir health API');
assert.match(fast,/hashState/,'El estado debe tener versión determinística');
assert.match(fast,/state_version:stateVersion/,'advanced_state debe entregar state_version');
assert.match(fast,/x-camp-state-version/,'La versión también debe exponerse por cabecera');

assert.match(safe,/CONCURRENCY_EXEMPT=new Set\(\['snapshot_today','close_day'\]\)/,'Operaciones idempotentes especiales deben quedar exentas del bloqueo optimista');
assert.match(safe,/current!==expected/,'Debe comparar versión esperada y actual');
assert.match(safe,/STATE_CONFLICT/,'Debe responder conflicto explícito');
assert.match(safe,/409/,'El conflicto debe usar HTTP 409');

assert.match(web,/CONCURRENCY_ACTIONS=new Set\(\['save_worker','upload_excel'\]\)/,'Las escrituras web críticas deben usar control de concurrencia');
assert.match(web,/STATE_UPSTREAM/,'La API web debe validar la versión contra el estado central');
assert.match(web,/STATE_CONFLICT/,'La API web debe devolver conflicto de versión');

console.log('resilience-runtime-smoke: OK');
