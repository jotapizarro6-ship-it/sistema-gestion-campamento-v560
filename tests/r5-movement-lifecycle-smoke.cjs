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
const safe=read(
  "supabase/functions/campamento-v560-safe/index.ts"
);
const typed=read(
  "supabase/migrations/20260921043000_p2_typed_atomic_mutation_rpcs.sql"
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
    "SAFE typed movement concurrency exemption",
    /CONCURRENCY_EXEMPT=new Set\(\[[\s\S]*?'add_movement'[\s\S]*?'movement_status'[\s\S]*?\]\)/.test(
      safe
    )
  ],
  [
    "UI expected row revision carrier",
    ui.includes(
      "expected_row_revision"
    )
  ],
  [
    "RAW p2_create_movement",
    /\.rpc\(\s*["']p2_create_movement["']/.test(
      raw
    )
  ],
  [
    "RAW p2_transition_movement",
    /\.rpc\(\s*["']p2_transition_movement["']/.test(
      raw
    )
  ],
  [
    "RAW no direct movements writer",
    !raw.includes(
      '.from("movements")'
    )
  ],
  [
    "P2 transition expected row revision",
    typed.includes(
      "p_expected_row_revision bigint"
    )
  ],
  [
    "P2 transition PROGRAMADO guard",
    typed.includes(
      "v_row.lifecycle_status <> 'PROGRAMADO'"
    )
  ],
  [
    "P2 movement terminal states",
    typed.includes("'EJECUTADO'")&&
    typed.includes("'CANCELADO'")
  ],
  [
    "RAW row conflict compatibility",
    raw.includes(
      "P2_ROW_CONFLICT"
    )
  ],
  [
    "RAW terminal conflict compatibility",
    raw.includes(
      "P2_INVALID_MOVEMENT_TRANSITION"
    )&&
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