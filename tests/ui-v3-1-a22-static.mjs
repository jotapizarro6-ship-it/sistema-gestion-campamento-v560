import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');

const check=(condition,message)=>{
  if(!condition){
    throw new Error(
      `UI_V311_A22_CONTRACT_FAILED: ${message}`
    );
  }
};

const dc=read('assets/decision-cockpit.js');
const dashboard=read('assets/ui-v3-dashboard.js');
const clarityJs=read('assets/ui-v3-1-clarity.js');
const clarityCss=read('assets/ui-v3-1-clarity.css');
const admin=read('admin.html');
const sw=read('service-worker.js');

check(
  !dc.includes('${filterCard(data)}'),
  'Resumen Operativo still renders filterCard'
);

check(
  !dc.includes(
    "if(rowScope==='overview'){applyRowFilter(dim,val);renderOverview();return}"
  ),
  'Resumen Operativo still applies hidden row filtering'
);

check(
  dc.includes(
    "'Toca una fila para abrir el detalle.'"
  ),
  'Resumen Operativo row interaction text is stale'
);

check(
  !dashboard.includes(
    'data-v3-open-advanced="analysis"'
  ),
  'generic legacy analysis action still exists'
);

check(
  dashboard.includes(
    'data-v31-open-tool="drillthrough"'
  ),
  'drillthrough specialized action missing'
);

check(
  dashboard.includes(
    'data-v31-open-tool="cost"'
  ),
  'cost specialized action missing'
);

check(
  dashboard.includes(
    'Drillthrough de dotaci\\u00f3n'
  ),
  'drillthrough label missing'
);

check(
  clarityJs.includes(
    '[data-v31-open-tool]'
  ),
  'specialized tool event contract missing'
);

check(
  clarityJs.includes(
    'target==="cost"?"#costForm":target==="drillthrough"?"#drillTable":""'
  ),
  'specialized tools are not explicitly allowlisted'
);

check(
  clarityJs.includes('v31-tool-selected') &&
  clarityJs.includes('v31-tool-panel'),
  'selective tool markers missing'
);

check(
  clarityCss.includes(
    'GARPI V3.1.1 A2.2'
  ),
  'A2.2 selective CSS missing'
);

check(
  clarityCss.includes(
    ':not(.v31-advanced-bar):not(.v31-tool-selected)'
  ),
  'legacy modal is not fail-closed'
);

check(
  admin.includes(
    'assets/ui-v3-dashboard.js?v=20260914-v311a22'
  ),
  'dashboard cache bust missing'
);

check(
  admin.includes(
    'assets/ui-v3-1-clarity.css?v=20260914-v311a22'
  ) &&
  admin.includes(
    'assets/ui-v3-1-clarity.js?v=20260914-v311a22'
  ),
  'clarity cache bust missing'
);

check(
  sw.includes(
    'ui-v3-1-1-a22'
  ),
  'A2.2 service worker cache missing'
);

check(
  sw.includes(
    './assets/decision-cockpit.js'
  ),
  'decision cockpit missing from SW precache'
);

console.log(
  'UI V3.1.1 A2.2 static contract: OK'
);