"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const contract = JSON.parse(
  fs.readFileSync(
    path.join(
      process.cwd(),
      "tests/r3-schema-foundations.contract.json"
    ),
    "utf8"
  )
);

const sql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260901162000_r3_schema_foundations.sql"
  ),
  "utf8"
);

const semantic = fs.readFileSync(
  path.join(
    process.cwd(),
    "assets/semantic-model-runtime.js"
  ),
  "utf8"
);

const bi = fs.readFileSync(
  path.join(
    process.cwd(),
    "assets/bi-dashboard.js"
  ),
  "utf8"
);

const resilience = fs.readFileSync(
  path.join(
    process.cwd(),
    "assets/resilience-runtime.js"
  ),
  "utf8"
);

const lower = sql.toLowerCase();

const destructive =
  /\b(drop\s+(table|column)|truncate\b|delete\s+from\b|alter\s+table[^;]*\brename\b)/i;

const inferredProgramado =
  /update\s+(?:public\.)?movements[\s\S]{0,600}(?:lifecycle_status|status)[\s\S]{0,120}programado/i;

const snapshotBackfill =
  /update\s+(?:public\.)?daily_snapshots[\s\S]{0,1200}(capacity_source|operational_universe_fingerprint|source_import_id)/i;

const reservationBackfill =
  /insert\s+into\s+(?:public\.)?reservation_members[\s\S]{0,1200}person_name/i;

const workersReference =
  /references\s+(?:public\.)?workers/i;

const checks = {
  "R3-U01":
    lower.includes(
      "create table if not exists public.reservation_members"
    ),

  "R3-U02":
    lower.includes("reservation_id bigint not null") &&
    lower.includes("rut text not null") &&
    lower.includes("references public.reservations(id)") &&
    lower.includes("unique (reservation_id, rut)") &&
    !workersReference.test(sql),

  "R3-U03":
    lower.includes(
      "alter table public.reservation_members\n  enable row level security"
    ) &&
    lower.includes(
      "revoke all on table public.reservation_members from anon"
    ) &&
    lower.includes(
      "revoke all on table public.reservation_members from authenticated"
    ),

  "R3-U04":
    lower.includes("alter table public.movements") &&
    lower.includes("lifecycle_status") &&
    sql.includes("PROGRAMADO") &&
    sql.includes("EJECUTADO") &&
    sql.includes("CANCELADO") &&
    sql.includes("LEGACY_UNRESOLVED"),

  "R3-U05":
    lower.includes("executed_at") &&
    lower.includes("cancelled_at") &&
    !inferredProgramado.test(sql),

  "R3-U06":
    lower.includes(
      "alter table public.daily_snapshots"
    ) &&
    lower.includes("provenance_status") &&
    lower.includes("capacity_source") &&
    lower.includes("operational_universe_count") &&
    lower.includes("operational_universe_fingerprint") &&
    lower.includes("source_import_id") &&
    lower.includes("source_operational_revision") &&
    lower.includes("semantic_version") &&
    lower.includes("provenance_version"),

  "R3-U07":
    sql.includes("LEGACY_UNRESOLVED") &&
    !snapshotBackfill.test(sql) &&
    !reservationBackfill.test(sql),

  "R3-U08":
    lower.includes(
      "alter table public.daily_capacity"
    ) &&
    lower.includes("check (capacity >= 0)") &&
    lower.includes("not valid"),

  "R3-U09":
    !destructive.test(sql) &&
    !inferredProgramado.test(sql) &&
    !snapshotBackfill.test(sql) &&
    !reservationBackfill.test(sql),

  "R3-U10":
    /daily_capacity_default\s*\|\|\s*132/i.test(
      semantic
    ),

  "R3-U11":
    !/EXPECTED_BEDS\s*=\s*504/i.test(bi) &&
    /(?:408|425|429)[\s\S]{0,100}502[\s\S]{0,100}503[\s\S]{0,100}504/i.test(
      resilience
    ),

  "R3-U12":
    /R3_SCHEMA_FOUNDATIONS/i.test(sql) &&
    /Release class:\s*EXPAND/i.test(sql) &&
    /ROLLBACK CLASSIFICATION/i.test(sql) &&
    !destructive.test(sql)
};

let passed = 0;

console.log("");
console.log("======================================================");
console.log("R3 SCHEMA FOUNDATIONS - GREEN");
console.log("======================================================");
console.log("");

for (const rule of contract.rules) {
  const ok = checks[rule.id] === true;

  if (ok) {
    passed++;
  }

  console.log(
    rule.id +
    " " +
    (ok ? "PASS" : "FAIL") +
    " :: " +
    rule.title
  );
}

console.log("");
console.log("TOTAL : " + contract.rules.length);
console.log("PASS  : " + passed);
console.log("FAIL  : " + (contract.rules.length - passed));

assert.strictEqual(
  passed,
  contract.rules.length,
  "R3 GREEN must satisfy all frozen rules"
);

assert.ok(
  lower.includes(
    "rut ~ '^[0-9]{5,9}-[0-9k]$'"
  ),
  "Canonical RUT storage check missing"
);

assert.doesNotMatch(
  sql,
  workersReference,
  "reservation_members must not reference workers"
);

assert.doesNotMatch(
  sql,
  destructive,
  "R3 must remain EXPAND-only"
);

console.log("");
console.log("R3 GREEN CONTRACT: 12/12 PASS");
console.log("R3 EXPAND SAFETY : PASS");
