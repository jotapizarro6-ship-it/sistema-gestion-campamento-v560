"use strict";

const cp = require("child_process");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const BASE =
  "4214101bac2c7b4c2abb01268f0b870218127f1d";

const contract =
  JSON.parse(
    fs.readFileSync(
      path.join(
        process.cwd(),
        "tests/r4-capacity-v1.contract.json"
      ),
      "utf8"
    )
  );

function show(file) {
  const r =
    cp.spawnSync(
      "git",
      [
        "show",
        BASE + ":" + file
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        windowsHide: true
      }
    );

  if (
    r.error ||
    r.status !== 0
  ) {
    throw new Error(
      "Unable to inspect base blob: " +
      file +
      "\n" +
      String(r.stderr || "")
    );
  }

  return String(
    r.stdout || ""
  );
}

const app2a =
  show("assets/app-2a.js");

const app2b =
  show("assets/app-2b.js");

const app3b =
  show("assets/app-3b.js");

const app4 =
  show("assets/app-4.js");

const semantic =
  show(
    "assets/semantic-model-runtime.js"
  );

const safe =
  show(
    "supabase/functions/campamento-v560-safe/index.ts"
  );

const r3 =
  show(
    "supabase/migrations/20260901162000_r3_schema_foundations.sql"
  );

const resilience =
  show(
    "assets/resilience-runtime.js"
  );

const capacityCode =
  [
    app2a,
    app2b,
    app3b,
    semantic
  ].join("\n");

const hasResolver =
  /resolveCapacityV1/i.test(
    capacityCode
  ) &&
  /capacity_source/i.test(
    capacityCode
  );

const exactDaily =
  hasResolver &&
  /DAILY_CAPACITY/i.test(
    capacityCode
  ) &&
  /capacity_date/i.test(
    capacityCode
  ) &&
  /Number\.isFinite/i.test(
    capacityCode
  );

const operational =
  hasResolver &&
  /OPERATIONAL_UNIVERSE/i.test(
    capacityCode
  ) &&
  /inventory/i.test(
    capacityCode
  );

const unavailable =
  hasResolver &&
  /CAPACITY_UNAVAILABLE/i.test(
    capacityCode
  );

const no132 =
  !/daily_capacity_default/i.test(
    capacityCode
  ) &&
  !/\|\|\s*132\b/.test(
    capacityCode
  ) &&
  !/\?\?\s*132\b/.test(
    capacityCode
  ) &&
  !/Math\.max\(\s*132\b/.test(
    capacityCode
  );

const blocksAfter =
  hasResolver &&
  (
    /resolveCapacityV1[\s\S]{0,1600}blocksOn/i.test(
      capacityCode
    ) ||
    /capacity_source[\s\S]{0,1600}blocked/i.test(
      capacityCode
    )
  );

const propagation =
  /capacity_source/i.test(
    app2b +
    "\n" +
    app3b +
    "\n" +
    semantic
  ) &&
  /capacity_available/i.test(
    app2b +
    "\n" +
    app3b +
    "\n" +
    semantic
  );

const unavailableUi =
  /CAPACITY_UNAVAILABLE|CAPACIDAD_NO_DISPONIBLE|CAPACIDAD NO DISPONIBLE/i.test(
    app2b +
    "\n" +
    app3b +
    "\n" +
    app4 +
    "\n" +
    semantic
  );

const provenanceV1 =
  /provenance_version/i.test(
    safe
  ) &&
  /capacity_source/i.test(
    safe
  ) &&
  /operational_universe_count/i.test(
    safe
  ) &&
  /source_operational_revision/i.test(
    safe
  ) &&
  /snapshot_today|close_day/i.test(
    safe
  );

const legacySafe =
  /provenance_status[\s\S]{0,200}LEGACY_UNRESOLVED/i.test(
    r3
  ) &&
  !/update\s+(?:public\.)?daily_snapshots[\s\S]{0,1000}provenance_status/i.test(
    r3
  );

const r2Population =
  /rutValid\(w\.rut\)/.test(
    semantic
  ) &&
  /inventoryKeys\.has\(k\)/.test(
    semantic
  );

const http504 =
  /504/.test(
    resilience
  );

const audit =
  /capacity-v1|R4_CAPACITY_V1|CAPACITY_V1/i.test(
    app4 +
    "\n" +
    capacityCode +
    "\n" +
    safe
  );

const checks = {
  "R4-U01": hasResolver,
  "R4-U02": exactDaily,
  "R4-U03": operational,
  "R4-U04": unavailable,
  "R4-U05": no132,
  "R4-U06": blocksAfter,
  "R4-U07": propagation,
  "R4-U08": unavailable && unavailableUi,
  "R4-U09": provenanceV1,
  "R4-U10": legacySafe,
  "R4-U11": r2Population && http504,
  "R4-U12": audit
};

const pass = [];
const fail = [];

console.log("");
console.log("======================================================");
console.log("R4 CAPACITY V1 - HISTORICAL BASELINE");
console.log("======================================================");
console.log("");

for (
  const rule of
  contract.rules
) {
  const ok =
    checks[rule.id] === true;

  if (ok) {
    pass.push(rule.id);
  } else {
    fail.push(rule.id);
  }

  console.log(
    rule.id +
    " " +
    (ok ? "PASS" : "FAIL") +
    " :: " +
    rule.title
  );
}

pass.sort();
fail.sort();

const expectedPass =
  [...contract.expected_baseline_pass]
    .sort();

const expectedFail =
  [...contract.expected_baseline_fail]
    .sort();

assert.deepStrictEqual(
  pass,
  expectedPass,
  "Unexpected baseline PASS set"
);

assert.deepStrictEqual(
  fail,
  expectedFail,
  "Unexpected baseline FAIL set"
);

console.log("");
console.log(
  "TOTAL : " +
  contract.rules.length
);

console.log(
  "PASS  : " +
  pass.length
);

console.log(
  "FAIL  : " +
  fail.length
);

console.log("");
console.log(
  "R4 BASELINE RED SHAPE: PASS"
);

console.log(
  "R4 HISTORICAL BASELINE: 2/12 PASS, 10/12 EXPECTED FAIL"
);
