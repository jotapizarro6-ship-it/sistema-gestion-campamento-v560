'use strict';
// Carga síncrona del núcleo existente, correcciones auditadas, capa responsiva y dashboard BI.
// ECharts se carga de forma progresiva: si la librería externa falla, la ETAPA 1 queda intacta.
// En los smoke tests document.write no existe, por lo que no se altera el entorno de pruebas.
if(typeof document!=='undefined'&&typeof document.write==='function'){
  const biStyle=document.createElement('link');
  biStyle.rel='stylesheet';
  biStyle.href='assets/bi-dashboard.css';
  document.head.appendChild(biStyle);
  const ecStyle=document.createElement('link');
  ecStyle.rel='stylesheet';
  ecStyle.href='assets/echarts-dashboard.css';
  document.head.appendChild(ecStyle);
  const ccStyle=document.createElement('link');
  ccStyle.rel='stylesheet';
  ccStyle.href='assets/control-center.css';
  document.head.appendChild(ccStyle);
  document.write('<script src="assets/app-4-core.js"></script>');
  document.write('<script src="assets/audit-fixes.js"></script>');
  document.write('<script src="assets/final-audit-fixes.js"></script>');
  document.write('<script src="assets/responsive-admin.js"></script>');
  document.write('<script src="assets/bi-dashboard.js"></script>');
  document.write('<script src="assets/control-center.js"></script>');
  document.write('<script src="assets/persistent-errors.js"></script>');
  document.write('<script src="assets/echarts-loader.js"></script>');
}
