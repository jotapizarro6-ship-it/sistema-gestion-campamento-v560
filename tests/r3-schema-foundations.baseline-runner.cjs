"use strict";

const fs = require("fs");
const cp = require("child_process");
const path = require("path");

const BASE =
  "83058c88c4d80318d542cadfda42c2dc8fa8744f";

const CONTRACT =
  JSON.parse(
    fs.readFileSync(
      path.join(
        process.cwd(),
        "tests/r3-schema-foundations.contract.json"
      ),
      "utf8"
    )
  );

function git(args) {
  const result =
    cp.spawnSync(
      "git",
      args,
      {
        cwd: process.cwd(),
        encoding: "utf8",
        windowsHide: true
      }
    );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      "git " + args.join(" ") +
      " failed: " +
      String(result.stderr || "")
    );
  }

  return String(result.stdout || "").trim();
}

function baseFile(file) {
  const result =
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

  if (result.status !== 0) {
    return "";
  }

  return String(result.stdout || "");
}

const files =
  git([
    "ls-tree",
    "-r",
    "--name-only",
    BASE
  ])
  .split(/\r?\n/)
  .filter(Boolean);

const sqlFiles =
  files.filter(
    (file) =>
      file.startsWith("supabase/migrations/") &&
      file.endsWith(".sql")
  );

const r3Migration =
  sqlFiles.find(
    (file) =>
      /r3.*schema.*foundation/i.test(file) ||
      /20260901.*schema.*foundation/i.test(file)
  ) || "";

const r3sql =
  r3Migration
    ? baseFile(r3Migration)
    : "";

const semantic =
  baseFile(
    "assets/semantic-model-runtime.js"
  );

const bi =
  baseFile(
    "assets/bi-dashboard.js"
  );

const resilience =
  baseFile(
    "assets/resilience-runtime.js"
  );

const lower =
  r3sql.toLowerCase();

function has(pattern) {
  return pattern.test(r3sql);
}

function hasAll(words) {
  return words.every(
    (word) =>
      lower.includes(
        String(word).toLowerCase()
      )
  );
}

const destructive =
  /\b(drop\s+(table|column)|truncate\b|delete\s+from\b|alter\s+table[^;]*\brename\b)/i;

const inferredReservationIdentity =
  /insert\s+into\s+(?:public\.)?reservation_members[\s\S]{0,1000}person_name/i;

const inferredProgramado =
  /update\s+(?:public\.)?movements[\s\S]{0,500}(?:set[\s\S]{0,200})?(?:lifecycle_status|status)[\s\S]{0,100}programado/i;

const workersFk =
  /foreign\s+key\s*\([^)]*rut[^)]*\)[\s\S]{0,300}references\s+(?:public\.)?workers/i;

const checks = {
  "R3-U01":
    Boolean(r3Migration) &&
    /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?reservation_members/i.test(r3sql),

  "R3-U02":
    Boolean(r3Migration) &&
    hasAll([
      "reservation_members",
      "reservation_id",
      "rut",
      "references public.reservations",
      "unique"
    ]) &&
    !workersFk.test(r3sql),

  "R3-U03":
    Boolean(r3Migration) &&
    /alter\s+table\s+(?:public\.)?reservation_members\s+enable\s+row\s+level\s+security/i.test(r3sql) &&
    /revoke[\s\S]{0,300}reservation_members[\s\S]{0,300}(anon|authenticated)/i.test(r3sql),

  "R3-U04":
    Boolean(r3Migration) &&
    hasAll([
      "alter table public.movements",
      "lifecycle_status",
      "PROGRAMADO",
      "EJECUTADO",
      "CANCELADO",
      "LEGACY_UNRESOLVED"
    ]),

  "R3-U05":
    Boolean(r3Migration) &&
    hasAll([
      "executed_at",
      "cancelled_at",
      "LEGACY_UNRESOLVED"
    ]) &&
    !inferredProgramado.test(r3sql),

  "R3-U06":
    Boolean(r3Migration) &&
    hasAll([
      "alter table public.daily_snapshots",
      "provenance_status",
      "capacity_source",
      "operational_universe_count",
      "operational_universe_fingerprint",
      "source_import_id",
      "source_operational_revision",
      "semantic_version",
      "provenance_version"
    ]),

  "R3-U07":
    Boolean(r3Migration) &&
    (
      /legacy_unresolved/i.test(r3sql) ||
      /provenance_status/i.test(r3sql)
    ) &&
    !inferredReservationIdentity.test(r3sql) &&
    !/update\s+(?:public\.)?daily_snapshots[\s\S]{0,1000}(capacity_source|operational_universe_fingerprint|source_import_id)/i.test(r3sql),

  "R3-U08":
    Boolean(r3Migration) &&
    /alter\s+table\s+(?:public\.)?daily_capacity/i.test(r3sql) &&
    /check\s*\(\s*capacity\s*>=\s*0\s*\)/i.test(r3sql) &&
    /not\s+valid/i.test(r3sql),

  "R3-U09":
    Boolean(r3Migration) &&
    !destructive.test(r3sql) &&
    !inferredReservationIdentity.test(r3sql) &&
    !inferredProgramado.test(r3sql),

  "R3-U10":
    /daily_capacity_default\s*\|\|\s*132/i.test(semantic),

  "R3-U11":
    !/EXPECTED_BEDS\s*=\s*504/i.test(bi) &&
    /(?:408|425|429)[\s\S]{0,100}502[\s\S]{0,100}503[\s\S]{0,100}504/i.test(resilience),

  "R3-U12":
    Boolean(r3Migration) &&
    /R3[\s_-]*SCHEMA[\s_-]*FOUNDATIONS/i.test(r3sql) &&
    /EXPAND/i.test(r3sql) &&
    /ROLLBACK/i.test(r3sql) &&
    !destructive.test(r3sql)
};

const ids =
  CONTRACT.rules.map(
    (rule) => rule.id
  );

const pass =
  ids.filter(
    (id) => checks[id] === true
  );

const fail =
  ids.filter(
    (id) => checks[id] !== true
  );

console.log("");
console.log("======================================================");
console.log("R3 SCHEMA FOUNDATIONS - BASELINE RED");
console.log("======================================================");
console.log("");

for (const rule of CONTRACT.rules) {
  const ok = checks[rule.id] === true;

  console.log(
    rule.id +
    " " +
    (ok ? "PASS" : "FAIL") +
    " :: " +
    rule.title
  );
}

console.log("");
console.log("TOTAL : " + ids.length);
console.log("PASS  : " + pass.length);
console.log("FAIL  : " + fail.length);

const expectedPass =
  [...CONTRACT.expected_baseline.pass].sort();

const expectedFail =
  [...CONTRACT.expected_baseline.fail].sort();

const actualPass =
  [...pass].sort();

const actualFail =
  [...fail].sort();

const passExact =
  JSON.stringify(actualPass) ===
  JSON.stringify(expectedPass);

const failExact =
  JSON.stringify(actualFail) ===
  JSON.stringify(expectedFail);

const countsExact =
  ids.length ===
    CONTRACT.expected_baseline.expected_total &&
  pass.length ===
    CONTRACT.expected_baseline.expected_pass &&
  fail.length ===
    CONTRACT.expected_baseline.expected_fail;

const redExact =
  passExact &&
  failExact &&
  countsExact;

console.log("");
console.log(
  "EXPECTED PASS SET : " +
  passExact
);

console.log(
  "EXPECTED FAIL SET : " +
  failExact
);

console.log(
  "EXPECTED COUNTS   : " +
  countsExact
);

console.log("");

if (!redExact) {
  console.error(
    "R3 BASELINE RED SHAPE: STOP"
  );

  console.error(
    "Actual PASS: " +
    actualPass.join(",")
  );

  console.error(
    "Actual FAIL: " +
    actualFail.join(",")
  );

  process.exit(1);
}

console.log(
  "R3 BASELINE RED SHAPE: PASS"
);

console.log(
  "R3 HISTORICAL BASELINE: 2/12 PASS, 10/12 EXPECTED FAIL"
);

process.exit(0);
