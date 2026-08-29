import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT_FILES = ['index.html', 'admin.html'];
const ASSET_EXTENSIONS = new Set(['.js', '.html']);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (ASSET_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

const files = [...ROOT_FILES, ...walk('assets')].filter(fs.existsSync);
assert.ok(files.length > 2, 'deben existir archivos de frontend para auditar');

const contents = new Map(files.map(file => [file, fs.readFileSync(file, 'utf8')]));
const combined = [...contents.values()].join('\n');

const forbidden = [
  { name: 'service_role', re: /service[_-]?role/i },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', re: /SUPABASE_SERVICE_ROLE_KEY/i },
  { name: 'Supabase secret key', re: /\bsb_secret_[A-Za-z0-9_-]{8,}\b/ },
  { name: 'Postgres connection string', re: /postgres(?:ql)?:\/\/[^\s'"`]+/i },
  { name: 'acceso REST directo a tablas', re: /\/rest\/v1\//i },
  { name: 'cliente Supabase directo en navegador', re: /\bcreateClient\s*\(/ },
];

for (const { name, re } of forbidden) {
  for (const [file, text] of contents) {
    assert.ok(!re.test(text), `${file}: patrón prohibido detectado (${name})`);
  }
}

assert.match(combined, /supabase\.co\/functions\/v1\/campamento-web-api/, 'el frontend debe usar la API web mediante Edge Functions');
assert.match(combined, /supabase\.co\/functions\/v1\/campamento-v560-safe/, 'el frontend administrativo debe mantener el wrapper seguro');
assert.doesNotMatch(combined, /@supabase\/supabase-js/i, 'el frontend estático no debe cargar supabase-js para acceder directamente a tablas');

console.log(`ARQUITECTURA/SEGURIDAD: OK · ${files.length} archivos frontend auditados · sin service_role, secretos, REST directo ni createClient`);
