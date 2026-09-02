import fs from 'node:fs';
import assert from 'node:assert/strict';

const runtime=fs.readFileSync('assets/resilience-runtime.js','utf8');
const loader=fs.readFileSync('assets/app-4.js','utf8');
const fast=fs.readFileSync('supabase/functions/campamento-v560-fast/index.ts','utf8');
const safe=fs.readFileSync('supabase/functions/campamento-v560-safe/index.ts','utf8');
const web=fs.readFileSync('supabase/functions/campamento-web-api/index.ts','utf8');
const control=fs.readFileSync('supabase/functions/campamento-control-api/index.ts','utf8');
const workforce=fs.readFileSync('supabase/functions/campamento-workforce-api/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20260830004324_operational_revision.sql','utf8');

assert.match(runtime,/navigator\.onLine/,'Debe detectar pérdida de conexión');
assert.match(runtime,/AbortController/,'Debe aplicar timeout de red');
assert.match(runtime,/RETRYABLE_STATUS/,'Debe limitar reintentos a errores transitorios');
assert.match(runtime,/IDEMPOTENT_POSTS=new Set\(\['snapshot_today'\]\)/,'Sólo snapshot_today puede reintentarse automáticamente como POST');
assert.doesNotMatch(runtime,/IDEMPOTENT_POSTS[^\n]*lookup/,'lookup no debe reintentarse porque registra trazabilidad');
assert.match(runtime,/const originalFetch=window\.fetch\.bind\(window\)/,'Debe envolver fetch sin reemplazar las APIs de negocio');
assert.match(runtime,/window\.fetch=function campResilientFetch/,'Debe cubrir también APIs dedicadas del sistema');
assert.doesNotMatch(runtime,/window\.webApi\s*=/,'No debe saltarse la capa de auditoría existente');
assert.doesNotMatch(runtime,/window\.advApi\s*=/,'No debe saltarse la capa de auditoría avanzada');
assert.match(runtime,/inflight=new Map\(\)/,'Debe deduplicar solicitudes simultáneas');
assert.match(runtime,/NO ACTUALIZADO/,'La interfaz debe marcar datos antiguos');
assert.match(runtime,/STATE_CONFLICT/,'Debe reconocer conflictos concurrentes');
assert.match(runtime,/searchParams\.set\('cid',cid\(\)\)/,'Debe emitir correlation ID sin PII');
assert.match(runtime,/current\+1/,'Tras una escritura propia debe conservar la revisión exacta reclamada');
assert.match(runtime,/getMetrics/,'Debe exponer métricas técnicas locales');
assert.doesNotMatch(runtime,/localStorage/,'La nueva capa no debe persistir dotación o respuestas en almacenamiento local');

const guardPos=loader.indexOf('admin-performance-guard.js');
const resiliencePos=loader.indexOf('resilience-runtime.js');
assert.ok(guardPos>=0&&resiliencePos>guardPos,'La resiliencia debe cargarse al final para preservar capas previas');

assert.match(migration,/claim_operational_revision/,'Debe existir un reclamo atómico de revisión');
assert.match(migration,/for update/i,'La revisión debe bloquearse transaccionalmente durante el reclamo');
assert.match(migration,/grant execute on function public\.claim_operational_revision\(bigint\) to service_role/,'Sólo service_role debe ejecutar el reclamo');

assert.match(fast,/action==='health'/,'Debe existir health API');
assert.match(fast,/action==='revision'/,'Debe existir lectura ligera de revisión');
assert.match(fast,/action==='claim_revision'/,'Debe centralizar el reclamo atómico');
assert.match(fast,/claim_operational_revision/,'Debe usar el RPC atómico de PostgreSQL');
assert.match(fast,/state_version:stateVersion/,'advanced_state debe entregar state_version');
assert.match(fast,/x-camp-state-version/,'La versión también debe exponerse por cabecera');

assert.match(safe,/CONCURRENCY_EXEMPT=new Set\(\['snapshot_today','close_day'\]\)/,'Snapshot y cierre idempotente no deben invalidar la revisión operacional');
assert.match(safe,/action:'claim_revision'/,'La API segura debe reservar revisión antes de mutar');

assert.match(web,/CONCURRENCY_ACTIONS=new Set\(\['save_worker','upload_excel'\]\)/,'Las escrituras web críticas deben usar concurrencia');
assert.match(web,/action:'claim_revision'/,'La API web debe reservar revisión antes de guardar');

assert.match(control,/action!=="audit"/,'La auditoría técnica no debe generar conflictos operacionales');
assert.match(control,/action:'claim_revision'/,'Centro de Control debe proteger acciones, hitos y escenarios');
assert.match(workforce,/action:'claim_revision'/,'MOD/MOI debe proteger cambios de clasificación');

console.log('resilience-runtime-smoke: OK');
