"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const cp=require("child_process");

const root=path.resolve(__dirname,"..");

const read=file=>
  fs.readFileSync(
    path.join(root,file),
    "utf8"
  );

function run(file){
  const r=cp.spawnSync(
    process.execPath,
    [file],
    {
      cwd:root,
      encoding:"utf8",
      windowsHide:true
    }
  );

  process.stdout.write(r.stdout||"");
  process.stderr.write(r.stderr||"");

  assert.strictEqual(
    r.status,
    0,
    file+" failed"
  );
}

run("tests/r4-capacity-v1-core-smoke.cjs");
run("tests/r4-capacity-v1-analytics-smoke.cjs");
run("tests/r4-capacity-v1-close-smoke.cjs");

const a2a=read("assets/app-2a.js");
const a2b=read("assets/app-2b.js");
const a3b=read("assets/app-3b.js");
const sem=read("assets/semantic-model-runtime.js");
const app4=read("assets/app-4.js");
const sw=read("service-worker.js");
const ver=read("version.json");
const wf=read(".github/workflows/validate.yml");
const mig=read("supabase/migrations/20260901193000_r4_capacity_v1_close.sql");
const safe=read("supabase/functions/campamento-v560-safe/index.ts");
const r3=read("supabase/migrations/20260901162000_r3_schema_foundations.sql");
const resilience=read("assets/resilience-runtime.js");

const active=[
  a2a,
  a2b,
  a3b,
  sem
].join("\n");

const checks={

  U01:
    (
      active.match(
        /function\s+resolveCapacityV1\s*\(/g
      )||[]
    ).length===1 &&
    a2a.includes("capacity_source"),

  U02:
    a2a.includes("'DAILY_CAPACITY'") &&
    a2a.includes("Number.isFinite(value)") &&
    /value<0/.test(a2a),

  U03:
    a2a.includes("'OPERATIONAL_UNIVERSE'") &&
    !/daily_capacity_default/i.test(active),

  U04:
    a2a.includes("'CAPACITY_UNAVAILABLE'") &&
    a2a.includes("capacity_available:false") &&
    a2a.includes("base_capacity:null"),

  U05:
    !/daily_capacity_default/i.test(active) &&
    !/\|\|\s*132\b/.test(active) &&
    !/\?\?\s*132\b/.test(active) &&
    !/Math\.max\(\s*132\b/.test(active),

  U06:
    a2a.includes("effectiveCapacityV1") &&
    a2a.includes("blocksOn(") &&
    a2a.includes("resolved.base_capacity-blocked"),

  U07:
    a3b.includes("capacity_available") &&
    a3b.includes("capacity_source") &&
    sem.includes("capacity_available") &&
    sem.includes("capacity_source"),

  U08:
    a2b.includes("forecastCapacityComplete") &&
    a2b.includes("RISK_DAYS_90") &&
    a2b.includes("PEAK_PRESSURE_PCT") &&
    a2b.includes("DEFICIT_DAYS") &&
    a2b.includes("MAX_DEFICIT_BEDS") &&
    a3b.includes("CAPACIDAD NO DISPONIBLE"),

  U09:
    mig.includes("close_day_r4") &&
    /security\s+definer/i.test(mig) &&
    /provenance_status\s*=\s*'CAPTURED'/i.test(mig) &&
    mig.includes("source_operational_revision") &&
    mig.includes("update public.settings") &&
    safe.includes("'close_day_r4'"),

  U10:
    r3.includes("LEGACY_UNRESOLVED") &&
    mig.includes("LEGACY_CLOSED_SNAPSHOT_PRESERVED") &&
    !/update\s+public\.daily_snapshots[\s\S]{0,300}LEGACY_UNRESOLVED/i.test(mig),

  U11:
    /rutValid\s*\(\s*w\.rut\s*\)/.test(sem) &&
    /inventoryKeys\.has\s*\(\s*k\s*\)/.test(sem) &&
    /504/.test(resilience),

  /*
   * U12 is the release-wiring gate for the still-active
   * R4 Capacity V1 semantic contract.
   *
   * R5 changes shell/runtime release identifiers but must
   * keep the R4 capacity baseline and green runners wired.
   */
  U12:
    sem.includes("20260902-r5-movement-lifecycle-v1") &&
    app4.includes("20260902-r5-movement-lifecycle-v1") &&
    sw.includes("campamento-shell-5.6.1-modern.12-r5-operational-v1") &&
    ver.includes("5.6.1-modern.12-r5-operational-v1") &&
    ver.includes("r5-operational-v1") &&
    wf.includes("r4-capacity-v1.baseline-runner.cjs") &&
    wf.includes("r4-capacity-v1.green-runner.cjs")
};

console.log("");
console.log("======================================================");
console.log("R4 CAPACITY V1 - GREEN CONTRACT");
console.log("======================================================");
console.log("");

let pass=0;

for(const [id,ok] of Object.entries(checks)){
  console.log(id+" "+(ok?"PASS":"FAIL"));
  if(ok)pass++;
}

console.log("");
console.log("TOTAL : 12");
console.log("PASS  : "+pass);
console.log("FAIL  : "+(12-pass));

assert.strictEqual(
  pass,
  12,
  "R4 GREEN contract must pass 12/12"
);

console.log("");
console.log("R4 GREEN CONTRACT: 12/12 PASS");