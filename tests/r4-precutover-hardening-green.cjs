"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

const raw = fs.readFileSync(
  path.join(
    root,
    "supabase",
    "functions",
    "campamento-v560-raw",
    "index.ts"
  ),
  "utf8"
);

const safe = fs.readFileSync(
  path.join(
    root,
    "supabase",
    "functions",
    "campamento-v560-safe",
    "index.ts"
  ),
  "utf8"
);

const fence = fs.readFileSync(
  path.join(
    root,
    "supabase",
    "migrations",
    "20260901225000_r4_pre_cutover_fence.sql"
  ),
  "utf8"
);

const checks = [];

function check(name, value) {
  checks.push([
    name,
    Boolean(value)
  ]);
}

check(
  "RAW source versioned",
  raw.length > 0
);

check(
  "no daily_capacity_default",
  !/daily_capacity_default/i.test(raw)
);

check(
  "no fallback 132",
  !/\|\|\s*132\b/.test(raw) &&
  !/\?\?\s*132\b/.test(raw)
);

check(
  "daily_capacity zero valid",
  /c\s*<\s*0\s*\|\|\s*c\s*>\s*10000/.test(raw)
);

check(
  "operational universe resolver",
  /function\s+operationalUniverse\s*\(/.test(raw) &&
  /OPERATIONAL_UNIVERSE/.test(raw)
);

check(
  "capacity unavailable is fail closed",
  /CAPACITY_UNAVAILABLE/.test(raw)
);

check(
  "snapshot captures revision",
  /sourceRevisionBefore\s*=\s*await\s+revision\(\)/.test(raw) &&
  /sourceRevisionAfter\s*=\s*await\s+revision\(\)/.test(raw) &&
  /beforeWriteRevision\s*=\s*await\s+revision\(\)/.test(raw)
);

check(
  "snapshot writes source revision",
  /source_operational_revision\s*:\s*sourceRevisionAfter/.test(raw)
);

check(
  "source mutation trigger exists",
  /create\s+or\s+replace\s+function\s+public\.bump_operational_revision_r4/i.test(fence)
);

check(
  "source mutation trigger locks revision",
  /where\s+s\.key='operational_revision'[\s\S]{0,100}for\s+update/i.test(fence)
);

for (const table of [
  "workers",
  "bed_inventory",
  "bed_blocks",
  "reservations",
  "reservation_members",
  "movements",
  "daily_capacity",
  "import_history"
]) {
  check(
    `source fenced: ${table}`,
    fence.includes(`'${table}'`)
  );
}

const legacyPos =
  fence.indexOf(
    "LEGACY_CLOSED_SNAPSHOT_PRESERVED"
  );

const fencePos =
  fence.indexOf(
    "v_snapshot.source_operational_revision is null"
  );

check(
  "closed snapshot idempotence precedes fence",
  legacyPos >= 0 &&
  fencePos > legacyPos
);

check(
  "open snapshot revision must equal locked revision",
  /v_snapshot\.source_operational_revision\s*<>\s*v_source_revision/i.test(fence)
);

check(
  "close retains operational revision row lock",
  /where\s+s\.key='operational_revision'[\s\S]{0,120}for\s+update/i.test(fence)
);

check(
  "safe still obtains certified snapshot",
  /refreshTodaySnapshot\s*\(\s*req\s*\)/.test(safe)
);

check(
  "safe calls close_day_r4",
  /db\.rpc\(\s*'close_day_r4'/m.test(safe)
);

check(
  "security definer",
  /security\s+definer/i.test(fence)
);

check(
  "anon revoked",
  /revoke\s+all[\s\S]{0,300}from\s+anon/i.test(fence)
);

check(
  "authenticated revoked",
  /revoke\s+all[\s\S]{0,300}from\s+authenticated/i.test(fence)
);

let failed = 0;

console.log("");
console.log(
  "GARPI R4 PRE-CUTOVER HARDENING - GREEN CONTRACT"
);
console.log(
  "============================================================"
);

for (const [name, passed] of checks) {
  if (passed) {
    console.log(`PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}`);
  }
}

console.log(
  "------------------------------------------------------------"
);

console.log(`TOTAL : ${checks.length}`);
console.log(`FAIL  : ${failed}`);

if (failed !== 0) {
  process.exit(1);
}

console.log("");
console.log("GREEN FENCE CONTRACT: PASS");