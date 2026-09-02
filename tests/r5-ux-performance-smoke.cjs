"use strict";

const fs=require("fs");
const assert=require("assert");

const read=p=>
  fs.readFileSync(
    p,
    "utf8"
  );

const app3=
  read(
    "assets/app-3a.js"
  );

const app4core=
  read(
    "assets/app-4-core.js"
  );

const app4=
  read(
    "assets/app-4.js"
  );

const progressive=
  read(
    "assets/progressive-admin-render.js"
  );

const guard=
  read(
    "assets/admin-performance-guard.js"
  );

const ui=
  read(
    "assets/ui-experience-fixes.js"
  );

const css=
  read(
    "assets/ui-experience-fixes.css"
  );

const checks=[
  [
    "load sequence counter",
    app3.includes(
      "let loadAllSequence=0;"
    )
  ],

  [
    "load pending counter",
    app3.includes(
      "let loadAllPending=0;"
    )
  ],

  [
    "latest request wins",
    /sequence\s*!==\s*loadAllSequence/.test(
      app3
    )
  ],

  [
    "programmatic refresh busy",
    /button\.disabled\s*=\s*Boolean\(busy\)/.test(
      app3
    )
  ],

  [
    "programmatic aria busy",
    app3.includes(
      "'aria-busy'"
    )
  ],

  [
    "401 logout preserved",
    /if\(err\.status===401\)/.test(
      app3
    )
  ],

  [
    "click syncing fence",
    app4core.includes(
      "button.dataset.syncing==='true'"
    )
  ],

  [
    "click disabled synchronously",
    app4core.includes(
      "button.disabled=true;"
    )
  ],

  [
    "click aria busy",
    app4core.includes(
      "button.setAttribute("
    ) &&
    app4core.includes(
      "'aria-busy'"
    )
  ],

  [
    "click uses current window loadAll",
    app4core.includes(
      "typeof window.loadAll==='function'"
    )
  ],

  [
    "click awaits refresh",
    app4core.includes(
      "await refresh();"
    )
  ],

  [
    "click finally restores",
    app4core.includes(
      "button.disabled=false;"
    ) &&
    app4core.includes(
      "removeAttribute("
    )
  ],

  [
    "app4 core cache-bust",
    app4.includes(
      "app-4-core.js?v=20260902-r5c-refresh1"
    )
  ],

  [
    "active view guard",
    progressive.includes(
      "if(!A.data||activeView()!==view)return false"
    )
  ],

  [
    "rapid render cancellation",
    progressive.includes(
      "if(seq!==renderSeq||activeView()!==view)return"
    )
  ],

  [
    "loading placeholder",
    progressive.includes(
      "Preparando información…"
    )
  ],

  [
    "single navigation owner",
    progressive.includes(
      "__campSingleNavigationOwner=true"
    )
  ],

  [
    "advanced state dedupe",
    guard.includes(
      "if(statePromise)return statePromise"
    )
  ],

  [
    "ops state dedupe",
    guard.includes(
      "if(opsPromise)return opsPromise"
    )
  ],

  [
    "hidden recovery suppressed",
    guard.includes(
      "hidden-recovery-status"
    )
  ],

  [
    "refresh accessible name",
    ui.includes(
      "Actualizar datos del sistema"
    )
  ],

  [
    "JS menu touch target",
    ui.includes(
      "min-width:48px!important"
    ) &&
    ui.includes(
      "min-height:48px!important"
    )
  ],

  [
    "CSS main menu 48",
    /html body #menuBtn\{[\s\S]{0,250}width:48px!important;[\s\S]{0,100}height:48px!important;[\s\S]{0,120}min-height:48px!important;/.test(
      css
    )
  ],

  [
    "CSS refresh 44",
    /html body #refreshAllBtn\{[\s\S]{0,300}min-width:120px!important;[\s\S]{0,120}height:44px!important;[\s\S]{0,100}min-height:44px!important;/.test(
      css
    )
  ],

  [
    "CSS compact menu 44",
    css.includes(
      "html body #menuBtn{width:44px!important;height:44px!important;min-width:44px!important;min-height:44px!important}"
    )
  ],

  [
    "CSS compact refresh 44",
    css.includes(
      "height:44px!important;min-height:44px!important;padding:0 9px!important"
    )
  ]
];

let passed=0;

for(const [name,ok] of checks){
  console.log(
    `${name.padEnd(44)} : ${ok?"PASS":"FAIL"}`
  );

  if(ok){
    passed++;
  }
}

console.log("");

console.log(
  `R5C UX/PERFORMANCE : ${passed}/${checks.length} PASS`
);

assert.strictEqual(
  passed,
  checks.length,
  "R5C UX/performance contract must be GREEN"
);

console.log(
  "R5C UX/PERFORMANCE SMOKE: PASS"
);