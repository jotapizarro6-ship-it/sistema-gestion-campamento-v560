'use strict';
// Carga síncrona del núcleo existente y luego la capa responsiva. En los smoke tests document.write no existe, por lo que no se altera el entorno de pruebas.
if(typeof document!=='undefined'&&typeof document.write==='function'){
  document.write('<script src="assets/app-4-core.js"></script>');
  document.write('<script src="assets/responsive-admin.js"></script>');
}
