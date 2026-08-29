import fs from 'node:fs';
import assert from 'node:assert/strict';

const src=fs.readFileSync(new URL('../supabase/functions/campamento-consults-api/index.ts',import.meta.url),'utf8');

assert.match(src,/access-control-allow-methods[^\n]*GET,DELETE,OPTIONS/,'La API debe permitir únicamente GET, DELETE y OPTIONS.');
assert.match(src,/async function isAdmin\(/,'La API debe conservar autenticación administrativa HMAC.');
assert.ok(src.indexOf('if(!await isAdmin(req))')>=0,'Debe rechazarse una sesión no administrativa.');
assert.ok(src.indexOf('if(!await isAdmin(req))')<src.indexOf('if(req.method==="DELETE")'),'La autenticación debe ejecutarse antes de cualquier borrado.');
assert.match(src,/action==="delete_preview"/,'Debe existir una vista previa antes del borrado.');
assert.match(src,/validDateKey\(u\.searchParams\.get\("date"\)\)/,'Toda limpieza debe exigir una fecha válida.');
assert.match(src,/storedDatePrefix\(date\)/,'El borrado debe convertir la fecha operacional al formato histórico almacenado.');
assert.match(src,/\.from\("consultation_log"\)\.delete\(\)\.like\("consultado_at",`\$\{prefix\},%`\)\.select\("id"\)/,'El DELETE debe quedar limitado exclusivamente a la fecha seleccionada.');
assert.ok(!/\.from\("consultation_log"\)\.delete\(\)(?!\.like)/.test(src),'No debe existir un borrado global de consultation_log.');
assert.match(src,/DELETE_CONSULTATION_LOG_DATE/,'La limpieza debe quedar registrada como evento de auditoría.');
assert.match(src,/\.from\("audit_log"\)\.insert\(/,'La API debe registrar auditoría después de la limpieza.');
assert.match(src,/timezone:TZ/,'La operación debe declarar la zona horaria operacional.');
assert.match(src,/America\/Santiago/,'La fecha debe interpretarse según Chile.');
assert.ok(!/sb_secret_[A-Za-z0-9_-]+/.test(src),'No debe existir una secret key literal en el código versionado.');
assert.ok(!/SUPABASE_SERVICE_ROLE_KEY\s*=/.test(src),'No debe existir un service_role asignado como literal.');

console.log('Consultas RUT cleanup API: OK · auth antes de DELETE · fecha obligatoria · sin borrado global · auditoría activa');
