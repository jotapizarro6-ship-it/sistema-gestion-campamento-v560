import fs from 'node:fs';
import assert from 'node:assert/strict';

const api=fs.readFileSync('supabase/functions/campamento-recovery-api/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20260830032000_fix_recovery_backup_permissions.sql','utf8');

assert.match(api,/SUPABASE_SERVICE_ROLE_KEY/,'La API de recuperación debe usar la credencial solo desde variables de entorno del servidor.');
assert.match(api,/async function isAdmin/,'La API debe validar sesión administrativa antes de operar.');
assert.match(api,/session_secret/,'La validación administrativa debe conservar la sesión HMAC existente.');
assert.match(api,/run_backup_restore_test/,'La API debe ejecutar la prueba de recuperación aislada.');
assert.match(api,/cache-control":"no-store/,'La API no debe permitir cache de respuestas sensibles.');
assert.doesNotMatch(api,/service_role\s*[=:]\s*['"][A-Za-z0-9._-]{20,}/,'No debe existir una service_role incrustada en el código.');

for(const schema of ['backup_pre_control_20260828','backup_pre_integridad_20260828']){
  assert.match(migration,new RegExp(`grant usage on schema ${schema} to service_role;`),'Debe conceder USAGE al service_role sobre cada respaldo.');
  assert.match(migration,new RegExp(`grant select on all tables in schema ${schema} to service_role;`),'Debe conceder solo lectura al service_role sobre cada respaldo.');
  assert.match(migration,new RegExp(`revoke all on schema ${schema} from public, anon, authenticated;`),'Debe mantener los respaldos cerrados a acceso público.');
}

console.log('Recovery backend smoke OK');
