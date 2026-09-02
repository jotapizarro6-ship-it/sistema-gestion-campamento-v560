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

const migration = fs.readFileSync(
  path.join(
    root,
    "supabase",
    "migrations",
    "20260902033000_r4_snapshot_write_fence.sql"
  ),
  "utf8"
);

const checks = [];

function check(name, ok) {
  checks.push([name, Boolean(ok)]);
}

check(
  "RAW uses atomic snapshot RPC",
  /db\.rpc\(\s*"upsert_open_snapshot_r4"/m.test(raw)
);

check(
  "RAW has no direct daily_snapshots upsert",
  !/\.from\("daily_snapshots"\)[\s\S]{0,150}\.upsert\(/m.test(raw)
);

check(
  "RAW direct close is disabled",
  /R4_CLOSE_REQUIRES_SAFE_EDGE/.test(raw) &&
  !/snapshot\(true,false\)/.test(raw)
);

check(
  "RPC is security definer",
  /create\s+or\s+replace\s+function\s+public\.upsert_open_snapshot_r4/i.test(migration) &&
  /security\s+definer/i.test(migration)
);

check(
  "RPC locks operational revision",
  /where\s+s\.key='operational_revision'[\s\S]{0,120}for\s+update/i.test(migration)
);

check(
  "RPC validates expected revision",
  /p_expected_revision\s*<>\s*v_revision/i.test(migration)
);

check(
  "RPC locks snapshot row",
  /from\s+public\.daily_snapshots[\s\S]{0,120}snapshot_date=p_snapshot_date[\s\S]{0,80}for\s+update/i.test(migration)
);

const closedCheck =
  migration.indexOf(
    "v_snapshot.closed_at"
  );

const updatePos =
  migration.indexOf(
    "update public.daily_snapshots"
  );

check(
  "closed check precedes snapshot update",
  closedCheck >= 0 &&
  updatePos > closedCheck
);

const updateTail =
  updatePos >= 0
    ? migration.slice(
        updatePos,
        migration.indexOf(
          "return jsonb_build_object",
          updatePos
        )
      )
    : "";

check(
  "open snapshot update never writes closed_at",
  updateTail.length > 0 &&
  !/\bclosed_at\s*=/.test(updateTail)
);

check(
  "insert never writes closed_at",
  /insert\s+into\s+public\.daily_snapshots/i.test(migration) &&
  !/insert\s+into\s+public\.daily_snapshots\s*\([^)]*\bclosed_at\b/is.test(migration)
);

check(
  "snapshot revision stamped by locked DB revision",
  /source_operational_revision=v_revision/i.test(migration)
);

check(
  "service role only execution boundary",
  /revoke\s+all[\s\S]*from\s+anon/i.test(migration) &&
  /revoke\s+all[\s\S]*from\s+authenticated/i.test(migration) &&
  /grant\s+execute[\s\S]*to\s+service_role/i.test(migration)
);

let failed = 0;

console.log("");
console.log("GARPI R4 SNAPSHOT WRITE FENCE");
console.log("============================================================");

for (const [name, ok] of checks) {
  if (ok) {
    console.log(`PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}`);
  }
}

console.log("------------------------------------------------------------");
console.log(`TOTAL : ${checks.length}`);
console.log(`FAIL  : ${failed}`);

if (failed !== 0) {
  process.exit(1);
}

console.log("");
console.log("SNAPSHOT WRITE FENCE: PASS");