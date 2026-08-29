import fs from 'node:fs';
import assert from 'node:assert/strict';

const exportSrc=fs.readFileSync('assets/consults-export-xlsx.js','utf8');
const loaderSrc=fs.readFileSync('assets/app-4.js','utf8');

assert.match(exportSrc,/consultsObserver\.observe\(view,\{childList:true\}\)/,'Consultas RUT debe observar solo reemplazos directos de la vista.');
assert.ok(!/consultsObserver\.observe\([^)]*subtree\s*:\s*true/s.test(exportSrc),'No se debe observar todo el subárbol de Consultas RUT: provoca realimentación del MutationObserver.');
assert.ok(exportSrc.includes("badge&&badge.textContent!==label"),'El contador debe ser idempotente y no mutar el DOM si su valor no cambió.');
assert.ok(loaderSrc.includes('consults-export-xlsx.js?v=20260829-consults3'),'La corrección debe usar una versión nueva para evitar caché del navegador.');

console.log('Consultas RUT navegación: OK · sin bucle MutationObserver · contador idempotente · caché renovada');
