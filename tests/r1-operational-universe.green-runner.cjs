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

const EXPECTED_CONTRACT_SHA256 = "0868753273F0F81C85EE3A05758FA19BED13DAB8D266AB31A4773D4B08F0E9C7";
const EXPECTED_SOURCE_SHA256 = "A1E8E71A7C9DB7D01F9EC33A46E448D4012F250B46C86A691740113DB53D2481";

function sha256(buffer) {
  return crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex")
    .toUpperCase();
}

function stop(message, code = 2) {
  console.error(`STOP: ${message}`);
  process.exit(code);
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

function completeLocation(row) {
  return Boolean(
    loc(row.module) &&
    loc(row.room) &&
    loc(row.bed)
  );
}

function bedKey(row) {
  return [
    loc(row.module),
    loc(row.room),
    loc(row.bed)
  ].join("|");
}

if (!fs.existsSync(CONTRACT)) {
  stop("contract missing.");
}

if (!fs.existsSync(SOURCE)) {
  stop("source missing.");
}

const contractBuffer = fs.readFileSync(CONTRACT);
const sourceBuffer = fs.readFileSync(SOURCE);

const contractHash = sha256(contractBuffer);
const sourceHashBefore = sha256(sourceBuffer);

if (contractHash !== EXPECTED_CONTRACT_SHA256) {
  stop(`contract SHA mismatch: ${contractHash}`);
}

if (sourceHashBefore !== EXPECTED_SOURCE_SHA256) {
  stop(`source SHA mismatch: ${sourceHashBefore}`);
}

const contract = JSON.parse(
  contractBuffer.toString("utf8")
);

if (
  !Array.isArray(contract.tests) ||
  contract.tests.length !== 10
) {
  stop("contract must contain exactly U01-U10.");
}

/*
 * Guards sobre el INDEX.TS REAL.
 *
 * El modelo de abajo no basta por sÃ­ solo:
 * estos guards atan la validaciÃ³n al source R1
 * que acabamos de modificar.
 */
const source = sourceBuffer.toString("utf8");

const guards = {
  enTurnoClassification:
    /inTurn\s*=\s*estadoTurno\s*===\s*["']EN TURNO["']/
      .test(source),

  libreClassification:
    /isLibre\s*=\s*estadoTurno\s*===\s*["']LIBRE["']/
      .test(source),

  operationalClassification:
    /isOperational\s*=\s*inTurn\s*\|\|\s*isLibre/
      .test(source),

  operationalBedPopulation:
    /if\s*\(\s*isOperational\s*\)\s*\{[\s\S]{0,500}?B\.set\s*\(/
      .test(source),

  workerStillEnTurnoOnly:
    /if\s*\(\s*!inTurn\s*\)\s*continue\s*;/
      .test(source),

  operationalLocationGuard:
    /operationalRowsWithLocation\s*!==\s*operationalRows/
      .test(source),

  operationalDuplicateMath:
    /duplicateBedRows\s*=\s*operationalRowsWithLocation\s*-\s*B\.size/
      .test(source),

  requireEnTurno:
    /if\s*\(\s*enTurnoRows\s*===\s*0\s*\)/
      .test(source),

  requireCanonicalWorker:
    /if\s*\(\s*W\.size\s*===\s*0\s*\)/
      .test(source),

  descansoNotOperational:
    !/isOperational\s*=[^;\n]*DESCANSO/
      .test(source)
};

const failedGuards = Object.entries(guards)
  .filter(([, ok]) => !ok)
  .map(([name]) => name);

if (failedGuards.length > 0) {
  stop(
    `source semantic guards failed: ${failedGuards.join(", ")}`,
    3
  );
}

/*
 * Target semantic model R1.
 *
 * EN TURNO:
 *   bed + worker candidate
 *
 * LIBRE:
 *   bed only
 *
 * DESCANSO / unknown:
 *   excluded
 *
 * Duplicate:
 *   any repeated operational bed => CONFLICT
 */
function runTarget(rows) {
  let enTurnoRows = 0;
  let operationalRows = 0;
  let operationalRowsWithLocation = 0;

  let invalidRutDetected = false;

  const beds = new Set();
  const workers = new Set();

  for (const row of rows) {
    const state = norm(row.estadoTurno);

    const inTurn =
      state === "EN TURNO";

    const isLibre =
      state === "LIBRE";

    const isOperational =
      inTurn || isLibre;

    if (!isOperational) {
      continue;
    }

    operationalRows++;

    if (inTurn) {
      enTurnoRows++;
    }

    const hasLocation =
      completeLocation(row);

    if (hasLocation) {
      operationalRowsWithLocation++;
      beds.add(bedKey(row));
    }

    /*
     * CRITICAL:
     * LIBRE aporta cama, pero nunca worker.
     */
    if (!inTurn) {
      continue;
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

  if (enTurnoRows === 0) {
    return {
      result: "REJECT",
      reason: "NO_EN_TURNO"
    };
  }

  if (beds.size === 0) {
    return {
      result: "REJECT",
      reason: "NO_OPERATIONAL_INVENTORY"
    };
  }

  if (invalidRutDetected) {
    return {
      result: "REJECT",
      reason: "INVALID_RUT"
    };
  }

  if (
    operationalRowsWithLocation !==
    operationalRows
  ) {
    return {
      result: "REJECT",
      reason: "MISSING_OPERATIONAL_LOCATION"
    };
  }

  const duplicateBedRows =
    operationalRowsWithLocation -
    beds.size;

  if (duplicateBedRows > 0) {
    return {
      result: "CONFLICT",
      reason: "DUPLICATE_OPERATIONAL_BED"
    };
  }

  if (workers.size === 0) {
    return {
      result: "REJECT",
      reason: "NO_CANONICAL_WORKER"
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

function format(value) {
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
  const actual =
    runTarget(test.rows);

  const ok =
    matches(actual, test.expect);

  results.push({
    id: test.id,
    ok,
    actual,
    expected: test.expect
  });
}

const passed =
  results.filter(r => r.ok);

const failed =
  results.filter(r => !r.ok);

console.log("");
console.log("======================================================");
console.log("R1 U01-U10 GREEN CONTRACT RUN");
console.log("======================================================");

console.log(`Contract SHA256 : ${contractHash}`);
console.log(`Source SHA256   : ${sourceHashBefore}`);

console.log("");
console.log("SOURCE GUARDS:");

for (const [name, ok] of Object.entries(guards)) {
  console.log(
    `  ${name.padEnd(30, " ")} : ${ok ? "PASS" : "FAIL"}`
  );
}

console.log("");
console.log("TEST RESULTS:");

for (const result of results) {
  console.log(
    `${result.id} ${result.ok ? "PASS" : "FAIL"}`
  );

  if (!result.ok) {
    console.log(
      `  actual : ${format(result.actual)}`
    );

    console.log(
      `  target : ${format(result.expected)}`
    );
  }
}

const sourceHashAfter =
  sha256(fs.readFileSync(SOURCE));

const sourceUnchangedDuringTest =
  sourceHashAfter ===
  EXPECTED_SOURCE_SHA256;

console.log("");
console.log("======================================================");
console.log("GREEN SUMMARY");
console.log("======================================================");

console.log(`Passed                 : ${passed.length}/10`);
console.log(`Failed                 : ${failed.length}/10`);
console.log(
  `Failed IDs             : ${
    failed.length
      ? failed.map(r => r.id).join(", ")
      : "(none)"
  }`
);

console.log(
  `SOURCE STABLE DURING TEST: ${sourceUnchangedDuringTest}`
);

console.log("");

if (
  failed.length === 0 &&
  sourceUnchangedDuringTest
) {
  console.log("CONTRACT COMPLIANCE    : GREEN");
  console.log("R1 U01-U10 GREEN       : PASS");
  process.exit(0);
}

console.log("CONTRACT COMPLIANCE    : NOT GREEN");
console.log("R1 U01-U10 GREEN       : FAIL");
process.exit(4);