"use strict";

const fs=require("fs");
const assert=require("assert");

const read=p=>fs.readFileSync(p,"utf8");

const analytics=read("assets/app-2a.js");
const semantic=read("assets/semantic-model-runtime.js");
const ui=read("assets/app-3b.js");
const raw=read(
  "supabase/functions/campamento-v560-raw/index.ts"
);
const migration=read(
  "supabase/migrations/20260901162000_r3_schema_foundations.sql"
);

const checks=[
  [
    "schema lifecycle status",
    migration.includes("lifecycle_status text")
  ],
  [
    "schema PROGRAMADO",
    migration.includes("'PROGRAMADO'")
  ],
  [
    "schema EJECUTADO",
    migration.includes("'EJECUTADO'")
  ],
  [
    "schema CANCELADO",
    migration.includes("'CANCELADO'")
  ],
  [
    "schema LEGACY_UNRESOLVED",
    migration.includes("'LEGACY_UNRESOLVED'")
  ],
  [
    "schema executed_at",
    migration.includes("executed_at timestamptz")
  ],
  [
    "schema cancelled_at",
    migration.includes("cancelled_at timestamptz")
  ],

  [
    "base lifecycle helper",
    analytics.includes(
      "function movementLifecycle(m)"
    )
  ],
  [
    "base projected PROGRAMADO only",
    analytics.includes(
      "movementLifecycle(m)==='PROGRAMADO'"
    )
  ],
  [
    "base future totals PROGRAMADO only",
    analytics.includes(
      "ds>today&&status!=='PROGRAMADO'"
    )
  ],

  [
    "semantic R5 version",
    semantic.includes(
      "20260902-r5-movement-lifecycle-v1"
    )
  ],
  [
    "semantic future index PROGRAMADO",
    semantic.includes(
      "lifecycle!=='PROGRAMADO'"
    )
  ],
  [
    "semantic CANCELADO excluded",
    semantic.includes(
      "lifecycle==='CANCELADO'"
    )
  ],
  [
    "semantic projected PROGRAMADO only",
    /d>today[\s\S]{0,250}d<=ds[\s\S]{0,250}lifecycle==='PROGRAMADO'/.test(
      semantic
    )
  ],
  [
    "semantic fast totals override",
    semantic.includes(
      "movementTotals=fastMovementTotals"
    )
  ],
  [
    "semantic fast projection override",
    semantic.includes(
      "projectedPhysical=fastProjectedPhysical"
    )
  ],

  [
    "UI lifecycle column",
    ui.includes("label:'Estado'")
  ],
  [
    "UI execute action",
    ui.includes("data-move-execute")
  ],
  [
    "UI cancel action",
    ui.includes("data-move-cancel")
  ],
  [
    "UI movement_status",
    ui.includes("'movement_status'")
  ],

  [
    "RAW new PROGRAMADO",
    /lifecycle_status\s*:\s*"PROGRAMADO"/.test(
      raw
    )
  ],
  [
    "RAW movement_status",
    raw.includes(
      'a==="movement_status"'
    )
  ],
  [
    "RAW atomic terminal transition",
    /\.eq\(\s*"lifecycle_status",\s*"PROGRAMADO"\s*\)/s.test(
      raw
    )
  ],
  [
    "RAW EJECUTADO",
    /lifecycle_status\s*:\s*"EJECUTADO"/.test(
      raw
    )
  ],
  [
    "RAW CANCELADO",
    /lifecycle_status\s*:\s*"CANCELADO"/.test(
      raw
    )
  ],
  [
    "RAW terminal conflict",
    raw.includes(
      '"MOVEMENT_TERMINAL"'
    )
  ]
];

let passed=0;

for(const [name,ok] of checks){
  console.log(
    `${name.padEnd(46)} : ${ok?"PASS":"FAIL"}`
  );

  if(ok){
    passed++;
  }
}

console.log("");
console.log(
  `R5 MOVEMENT LIFECYCLE : ${passed}/${checks.length} PASS`
);

assert.strictEqual(
  passed,
  checks.length,
  "R5 movement lifecycle contract must be fully green"
);

console.log(
  "R5 MOVEMENT LIFECYCLE SMOKE: PASS"
);