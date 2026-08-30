'use strict';
// Carga síncrona del núcleo existente, correcciones auditadas y capas visuales progresivas.
// ECharts es opcional: si la librería externa falla, las vistas base permanecen funcionales.
// En los smoke tests document.write no existe, por lo que no se altera el entorno de pruebas.
if(typeof document!=='undefined'&&typeof document.write==='function'){
  const addStyle=href=>{const l=document.createElement('link');l.rel='stylesheet';l.href=href;document.head.appendChild(l)};
  addStyle('assets/bi-dashboard.css');
  addStyle('assets/echarts-dashboard.css');
  addStyle('assets/control-center.css');
  addStyle('assets/advanced-sections.css');
  addStyle('assets/operations-suite.css');
  addStyle('assets/whatif-clarity.css');
  addStyle('assets/integrity-executive.css?v=20260828-integrity1');
  addStyle('assets/workforce-mod-moi.css?v=20260829-modmoi1');
  addStyle('assets/ui-experience-fixes.css?v=20260829-ui1');
  document.write('<script src="assets/app-4-core.js"></script>');
  document.write('<script src="assets/consults-export-xlsx.js?v=20260829-cleanup1"></script>');
  document.write('<script src="assets/audit-fixes.js"></script>');
  document.write('<script src="assets/final-audit-fixes.js"></script>');
  document.write('<script src="assets/responsive-admin.js?v=20260829-deepnav1"></script>');
  document.write('<script src="assets/semantic-model-runtime.js?v=20260829-semantic1"></script>');
  document.write('<script src="assets/bi-dashboard.js"></script>');
  document.write('<script src="assets/control-center.js"></script>');
  document.write('<script src="assets/advanced-sections.js"></script>');
  document.write('<script src="assets/persistent-errors.js"></script>');
  document.write('<script src="assets/operations-shell.js"></script>');
  document.write('<script src="assets/operations-core.js"></script>');
  document.write('<script src="assets/command-center.js"></script>');
  document.write('<script src="assets/planning-suite.js"></script>');
  document.write('<script src="assets/whatif-clarity.js"></script>');
  document.write('<script src="assets/governance.js"></script>');
  document.write('<script src="assets/integrity-executive.js?v=20260828-integrity1"></script>');
  document.write('<script src="assets/workforce-mod-moi.js?v=20260829-modmoi1"></script>');
  document.write('<script src="assets/progressive-admin-render.js?v=20260829-deepnav1"></script>');
  document.write('<script src="assets/high-volume-runtime.js?v=20260829-hv2"></script>');
  document.write('<script src="assets/high-volume-post-inline.js?v=20260829-hv1"></script>');
  document.write('<script src="assets/echarts-loader.js?v=20260829-deepnav1"></script>');
  document.write('<script src="assets/admin-performance-guard.js?v=20260829-deepnav1"></script>');
  document.write('<script src="assets/resilience-runtime.js?v=20260829-resilience1"></script>');
  document.write('<script src="assets/ts/analytics/powerbi-engine.js?v=20260830-modern1"></script>');
  document.write('<script src="assets/ts/charts/performance.js?v=20260830-modern1"></script>');
  document.write('<script src="assets/ts/pwa/runtime.js?v=20260830-modern1"></script>');
  document.write('<script src="assets/ui-experience-fixes.js?v=20260829-ui1"></script>');
}
