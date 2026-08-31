"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");

const CONTRACT = path.join(
  ROOT,
  "tests",
  "r1-operational-universe.contract.json"
);

const SOURCE = path.join(
  ROOT,
  "supabase",
  "functions",
  "campamento-upload-api",
  "index.ts"
);

const EXPECTED_CONTRACT_SHA256 =
  "63E0486E4AA7D777C828080876FA0C6982F519C1E7BC4517555F29C27149D6C0";

const EXPECTED_SOURCE_SHA256 =
  "0DFB38E150FCCEB0425D4843D82A6EF22A5BA9F99D2FEEBB1183632E130670E4";

const EXPECTED_BASELINE_FAILURES = [
  "U02",
  "U05",
  "U06",
  "U09"
];

function sha256(buffer) {
  return crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex")
    .toUpperCase();
}

function fail(message, code = 2) {
  console.error(`STOP: ${message}`);
  process.exit(code);
}

if (!fs.existsSync(CONTRACT)) {
  fail("contract file not found.");
}

if (!fs.existsSync(SOURCE)) {
  fail("baseline index.ts not found.");
}

const contractBuffer = fs.readFileSync(CONTRACT);
const sourceBuffer = fs.readFileSync(SOURCE);

const contractHash = sha256(contractBuffer);
const sourceHashBefore = sha256(sourceBuffer);

if (contractHash !== EXPECTED_CONTRACT_SHA256) {
  fail(
    `contract SHA256 mismatch. actual=${contractHash}`
  );
}

if (sourceHashBefore !== EXPECTED_SOURCE_SHA256) {
  fail(
    `source SHA256 mismatch. actual=${sourceHashBefore}`
  );
}

const contract = JSON.parse(
  contractBuffer.toString("utf8")
);

if (!Array.isArray(contract.tests) || contract.tests.length !== 10) {
  fail("contract must contain exactly U01-U10.");
}

const source = sourceBuffer.toString("utf8");

/*
 * Source guards.
 *
 * These do not replace behavioral tests.
 * They bind this baseline model to the exact audited
 * production-source semantics before R1 modification.
 */
const sourceGuards = {
  enTurnOnly:
    /inTurn\s*=\s*estadoTurno\s*===\s*["']EN TURNO["']/.test(source),

  workerGuard:
    /if\s*\(\s*!inTurn\s*\)\s*continue/.test(source),

  bedMapUnderInTurn:
    /if\s*\(\s*inTurn\s*\)[\s\S]{0,700}?B\.set\s*\(/.test(source),

  duplicateEnTurnoOnly:
    /duplicateBedRows\s*=\s*enTurnoRowsWithLocation\s*-\s*B\.size/.test(source)
};

const failedGuards = Object.entries(sourceGuards)
  .filter(([, ok]) => !ok)
  .map(([name]) => name);

if (failedGuards.length > 0) {
  fail(
    `audited baseline source markers changed: ${failedGuards.join(", ")}`
  );
}

function norm(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function loc(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function bedKey(row) {
  return [
    loc(row.module),
    loc(row.room),
    loc(row.bed)
  ].join("|");
}

function completeLocation(row) {
  return Boolean(
    loc(row.module) &&
    loc(row.room) &&
    loc(row.bed)
  );
}

/*
 * Offline semantic model of CURRENT audited baseline.
 *
 * CURRENT:
 *   beds    = EN TURNO only
 *   workers = EN TURNO only
 *   duplicate detection = EN TURNO only
 *   DESCANSO / LIBRE / unknown = ignored
 *
 * This is deliberately NOT the target R1 behavior.
 */
function runBaseline(rows) {
  let enTurnoRows = 0;
  let enTurnoRowsWithLocation = 0;

  const beds = new Set();
  const workers = new Set();

  let invalidRutDetected = false;

  for (const row of rows) {
    const state = norm(row.estadoTurno);

    const inTurn = state === "EN TURNO";

    if (!inTurn) {
      continue;
    }

    enTurnoRows++;

    const hasLocation = completeLocation(row);

    if (hasLocation) {
      enTurnoRowsWithLocation++;
      beds.add(bedKey(row));
    }

    if (row.identity === "INVALID_RUT") {
      invalidRutDetected = true;
      continue;
    }

    const validIdentity =
      typeof row.identity === "string" &&
      row.identity.startsWith("VALID_RUT_");

    const validName =
      typeof row.name === "string" &&
      row.name.trim().length > 0;

    if (
      validIdentity &&
      validName &&
      hasLocation
    ) {
      workers.add(row.identity);
    }
  }

  if (invalidRutDetected) {
    return {
      result: "REJECT",
      reason: "INVALID_RUT"
    };
  }

  if (
    enTurnoRowsWithLocation !==
    enTurnoRows
  ) {
    return {
      result: "REJECT",
      reason: "MISSING_OPERATIONAL_LOCATION"
    };
  }

  const duplicateBedRows =
    enTurnoRowsWithLocation -
    beds.size;

  if (duplicateBedRows > 0) {
    return {
      result: "CONFLICT",
      reason: "DUPLICATE_OPERATIONAL_BED"
    };
  }

  return {
    result: "ACCEPT",
    bedCount: beds.size,
    workerCount: workers.size
  };
}

function matches(actual, expected) {
  if (actual.result !== expected.result) {
    return false;
  }

  if (expected.result === "ACCEPT") {
    return (
      actual.bedCount === expected.bedCount &&
      actual.workerCount === expected.workerCount
    );
  }

  return actual.reason === expected.reason;
}

function formatOutcome(value) {
  if (value.result === "ACCEPT") {
    return (
      `ACCEPT beds=${value.bedCount} ` +
      `workers=${value.workerCount}`
    );
  }

  return `${value.result} ${value.reason}`;
}

const results = [];

for (const test of contract.tests) {
  const actual = runBaseline(test.rows);
  const ok = matches(actual, test.expect);

  results.push({
    id: test.id,
    ok,
    actual,
    expected: test.expect
  });
}

const passed = results.filter(r => r.ok);
const failed = results.filter(r => !r.ok);

const failedIds = failed
  .map(r => r.id)
  .sort();

const expectedFailedIds = [
  ...EXPECTED_BASELINE_FAILURES
].sort();

const expectedRed =
  JSON.stringify(failedIds) ===
  JSON.stringify(expectedFailedIds);

const sourceHashAfter = sha256(
  fs.readFileSync(SOURCE)
);

const sourceUnchanged =
  sourceHashAfter ===
  EXPECTED_SOURCE_SHA256;

console.log("");
console.log("======================================================");
console.log("R1 U01-U10 BASELINE CONTRACT RUN");
console.log("======================================================");
console.log(`Contract SHA256 : ${contractHash}`);
console.log(`Source SHA256   : ${sourceHashBefore}`);
console.log("");

console.log("SOURCE GUARDS:");
for (const [name, value] of Object.entries(sourceGuards)) {
  console.log(
    `  ${name.padEnd(24, " ")} : ${value ? "PASS" : "FAIL"}`
  );
}

console.log("");
console.log("TEST RESULTS:");

for (const result of results) {
  console.log("");
  console.log(
    `${result.id} ${result.ok ? "PASS" : "FAIL"}`
  );

  console.log(
    `  current : ${formatOutcome(result.actual)}`
  );

  console.log(
    `  target  : ${formatOutcome(result.expected)}`
  );
}

console.log("");
console.log("======================================================");
console.log("BASELINE SUMMARY");
console.log("======================================================");

console.log(`Passed                   : ${passed.length}/10`);
console.log(`Failed                   : ${failed.length}/10`);
console.log(`Failed IDs               : ${failedIds.join(", ")}`);
console.log(`Expected baseline fails  : ${expectedFailedIds.join(", ")}`);
console.log(`EXPECTED RED SIGNATURE   : ${expectedRed}`);
console.log(`SOURCE UNCHANGED         : ${sourceUnchanged}`);

console.log("");

if (!expectedRed) {
  console.log("R1 BASELINE CONTRACT RED: UNEXPECTED RESULT");
  process.exit(4);
}

if (!sourceUnchanged) {
  console.log("R1 BASELINE CONTRACT RED: SOURCE CHANGED");
  process.exit(5);
}

console.log("CONTRACT COMPLIANCE      : RED (EXPECTED)");
console.log("R1 BASELINE CONTRACT RED : PASS");
process.exit(0);