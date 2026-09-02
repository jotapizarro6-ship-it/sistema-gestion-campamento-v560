"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

const rawPath = path.join(
  root,
  "supabase",
  "functions",
  "campamento-v560-raw",
  "index.ts"
);

const safePath = path.join(
  root,
  "supabase",
  "functions",
  "campamento-v560-safe",
  "index.ts"
);

const closePath = path.join(
  root,
  "supabase",
  "migrations",
  "20260901193000_r4_capacity_v1_close.sql"
);

function read(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`Required file missing: ${file}`);
  }

  return fs.readFileSync(file, "utf8");
}

const raw = read(rawPath);
const safe = read(safePath);
const closeSql = read(closePath);

const results = [];

function contract(name, passed, detail) {
  results.push({
    name,
    passed: Boolean(passed),
    detail
  });
}

contract(
  "RAW SOURCE IS VERSIONED",
  fs.existsSync(rawPath),
  "campamento-v560-raw/index.ts must exist in repository"
);

contract(
  "NO RAW FALLBACK 132",
  !(
    /daily_capacity_default\s*\|\|\s*132/i.test(raw) ||
    /\|\|\s*132\b/.test(raw) ||
    /\?\?\s*132\b/.test(raw)
  ),
  "Capacity V1 forbids legacy 132 fallback"
);

contract(
  "DAILY CAPACITY ZERO ACCEPTED",
  !/c\s*<\s*1\b/.test(raw),
  "R4 exact daily_capacity = 0 is valid"
);

contract(
  "RAW SNAPSHOT DOES NOT USE LEGACY DEFAULT",
  !/daily_capacity_default/i.test(raw),
  "snapshot_today must not use the legacy daily_capacity_default resolver"
);

contract(
  "R4 CLOSE DOES NOT PRE-REFRESH RAW SNAPSHOT",
  !/await\s+refreshTodaySnapshot\s*\(\s*req\s*\)/m.test(safe),
  "close_day must not depend on a separate RAW snapshot HTTP transaction"
);

contract(
  "R4 CLOSE RPC PRESENT",
  /db\.rpc\(\s*['"]close_day_r4['"]/m.test(safe),
  "Safe Edge must invoke close_day_r4"
);

contract(
  "CLOSE DOES NOT TRUST SNAPSHOT OCCUPIED",
  !/v_snapshot\.occupied/i.test(closeSql),
  "GREEN closure must derive occupied atomically"
);

contract(
  "CLOSE DOES NOT TRUST SNAPSHOT RESERVED",
  !/v_snapshot\.reserved_today|v_snapshot\.reserved/i.test(closeSql),
  "GREEN closure must derive reservation commitment atomically"
);

console.log("");
console.log("GARPI R4 PRE-CUTOVER HARDENING - RED CONTRACT");
console.log("============================================================");

let passed = 0;
let failed = 0;

for (const result of results) {
  if (result.passed) {
    passed += 1;
    console.log(`PASS  ${result.name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${result.name}`);
    console.log(`      ${result.detail}`);
  }
}

console.log("------------------------------------------------------------");
console.log(`PASS: ${passed}`);
console.log(`FAIL: ${failed}`);

if (failed === 0) {
  console.error("");
  console.error(
    "Unexpected GREEN: RED contract no longer detects pre-cutover defects."
  );
  process.exit(2);
}

console.log("");
console.log(
  "RED CONFIRMED: backend R4 must not be cut over before hardening."
);

process.exit(0);