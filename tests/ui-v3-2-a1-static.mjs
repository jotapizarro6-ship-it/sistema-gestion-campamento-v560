import fs from "node:fs";
import assert from "node:assert/strict";

const admin=fs.readFileSync("admin.html","utf8");
const dashboard=fs.readFileSync("assets/ui-v3-dashboard.js","utf8");
const js=fs.readFileSync("assets/ui-v3-2-a1.js","utf8");
const css=fs.readFileSync("assets/ui-v3-2-a1.css","utf8");
const sw=fs.readFileSync("service-worker.js","utf8");

assert.match(
  admin,
  /ui-v3-dashboard\.js\?v=20260914-v32a1/
);

assert.match(
  admin,
  /ui-v3-2-a1\.js\?v=20260914-v32a1/
);

assert.match(
  admin,
  /ui-v3-2-a1\.css\?v=20260914-v32a1/
);

assert.equal(
  (dashboard.match(/\$\{v3FilterBar\(model\)\}/g)||[]).length,
  1
);

assert.equal(
  (dashboard.match(/\$\{v3WorkforceCard\(model\)\}/g)||[]).length,
  1
);

assert.match(
  dashboard,
  /data-v32-role-card/
);

assert.match(
  dashboard,
  /Composición del personal alojado/
);

assert.match(
  dashboard,
  /data-v32-export-xlsx/
);

assert.doesNotMatch(
  dashboard,
  /\$\{companyCard\(scoped\)\}/
);

assert.doesNotMatch(
  dashboard,
  /function\s+companyCard\s*\(/
);

assert.match(
  js,
  /CampWorkforceMODMOI/
);

assert.match(
  js,
  /Cargo \/ especialidad/
);

assert.match(
  js,
  /Especialidad/
);

assert.match(
  js,
  /Categoría registrada/
);

assert.match(
  js,
  /Dotación registrada en GARPI/
);

assert.match(
  js,
  /xlsx@0\.18\.5/
);

assert.match(
  js,
  /GARPI_resumen_gerencial_/
);

assert.match(
  js,
  /Resumen Ejecutivo/
);

assert.match(
  js,
  /Alojamiento Empresas/
);

assert.match(
  js,
  /MOD-MOI y Cargos/
);

assert.match(
  js,
  /Datos Grafico/
);

assert.match(
  js,
  /Contexto/
);

assert.match(
  css,
  /v32-role-card/
);

assert.match(
  css,
  /max-width:760px/
);

assert.match(
  css,
  /max-width:390px/
);

assert.match(
  sw,
  /ui-v3-2-a1/
);

console.log(
  "UI V3.2 A1 lean static contract: OK"
);