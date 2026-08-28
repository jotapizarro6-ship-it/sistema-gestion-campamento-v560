'use strict';
// Carga síncrona del núcleo existente, correcciones auditadas, capa responsiva y dashboard BI.
// En los smoke tests document.write no existe, por lo que no se altera el entorno de pruebas.
if(typeof document!=='undefined'&&typeof document.write==='function'){
  document.write('<script src="assets/app-4-core.js"></script>');
  document.write('<script src="assets/audit-fixes.js"></script>');
  document.write('<script src="assets/final-audit-fixes.js"></script>');
  document.write('<script src="assets/responsive-admin.js"></script>');
  document.write('<script src="assets/bi-dashboard.js"></script>');
}
