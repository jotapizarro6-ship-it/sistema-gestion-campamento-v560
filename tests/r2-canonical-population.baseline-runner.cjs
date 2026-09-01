"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const files = {
  contract: path.join(
    ROOT,
    "tests",
    "r2-canonical-population.contract.json"
  ),
  bi: path.join(
    ROOT,
    "assets",
    "bi-dashboard.js"
  ),
  resilience: path.join(
    ROOT,
    "assets",
    "resilience-runtime.js"
  ),
  workforce: path.join(
    ROOT,
    "assets",
    "workforce-mod-moi.js"
  ),
  semantic: path.join(
    ROOT,
    "assets",
    "semantic-model-runtime.js"
  )
};

function read(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing required file: ${file}`);
  }

  return fs.readFileSync(file, "utf8");
}

function normalize(source) {
  return String(source)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function compact(source) {
  return normalize(source)
    .replace(/\s+/g, " ")
    .trim();
}

function windowAround(source, token, radius = 1200) {
  const index = source.indexOf(token);

  if (index < 0) {
    return "";
  }

  const start = Math.max(0, index - radius);
  const end = Math.min(
    source.length,
    index + token.length + radius
  );

  return source.slice(start, end);
}

function result(id, pass, evidence) {
  return {
    id,
    pass: Boolean(pass),
    evidence: String(evidence || "")
  };
}

const contract =
  JSON.parse(read(files.contract));

const bi =
  compact(read(files.bi));

const resilience =
  compact(read(files.resilience));

const workforce =
  compact(read(files.workforce));

const semantic =
  compact(read(files.semantic));

if (
  contract.contract !==
  "GARPI_R2_CANONICAL_POPULATION"
) {
  throw new Error(
    "Unexpected R2 contract identity."
  );
}

if (Number(contract.revision) !== 1) {
  throw new Error(
    "Unexpected R2 contract revision."
  );
}

if (
  !Array.isArray(contract.tests) ||
  contract.tests.length !== 10
) {
  throw new Error(
    "R2 contract must contain exactly 10 tests."
  );
}

/*
 * ---------------------------------------------------------
 * Baseline semantic probes
 * ---------------------------------------------------------
 */

const assignedWindow =
  windowAround(
    workforce,
    "const assigned",
    600
  );

const workforceChecksLocation =
  /modulo/i.test(assignedWindow) &&
  /habitacion/i.test(assignedWindow) &&
  /cama/i.test(assignedWindow);

const workforceChecksRut =
  /rutValid|validRut|validateRut/i.test(
    assignedWindow
  );

const workforceChecksInventory =
  /inventory|bed_inventory|inventoryKeys|bedKey/i.test(
    assignedWindow
  );

const assignedWorkersWindow =
  windowAround(
    semantic,
    "assignedWorkers",
    1600
  );

const semanticChecksRut =
  /rutValid|validRut|validateRut/i.test(
    assignedWorkersWindow
  );

const semanticChecksInventory =
  /inventoryKeys|inventory.*has|bed_inventory|workerByBed/i.test(
    assignedWorkersWindow
  );

const semanticChecksLocation =
  /modulo/i.test(assignedWorkersWindow) &&
  /habitacion/i.test(assignedWorkersWindow) &&
  /cama/i.test(assignedWorkersWindow);

const semanticCanonical =
  semanticChecksRut &&
  semanticChecksInventory &&
  semanticChecksLocation;

const fastOccupancyUsesAssignedWorkers =
  /function fastOccupiedWorkers\(data\)\{return getModel\(data\)\.assignedWorkers\}/
    .test(semantic);

const fixedBusiness504 =
  /EXPECTED_BEDS\s*=\s*504\b/.test(bi);

const fixed504Gap =
  /inventoryGap\s*=\s*Math\.abs\([^;]*EXPECTED_BEDS/i
    .test(bi);

const qualityCountsFixed504Gap =
  /inventoryGap\s*\?\s*1\s*:\s*0/i
    .test(bi);

const http504Preserved =
  /RETRYABLE_STATUS[^;]*\b504\b/i
    .test(resilience);

const capacity132Preserved =
  /daily_capacity_default\s*\|\|\s*132/i
    .test(semantic) ||
  /\|\|\s*132\b/.test(semantic);

/*
 * ---------------------------------------------------------
 * Contract tests
 * ---------------------------------------------------------
 */

const tests = [];

/*
 * U01
 * The baseline does not yet expose one canonical population
 * predicate satisfying all RUT + location + inventory rules.
 */
tests.push(
  result(
    "R2-U01",
    semanticCanonical &&
      workforceChecksRut &&
      workforceChecksInventory,
    [
      `semanticCanonical=${semanticCanonical}`,
      `workforceRut=${workforceChecksRut}`,
      `workforceInventory=${workforceChecksInventory}`
    ].join(", ")
  )
);

/*
 * U02
 * Invalid RUT must not enter workforce / MOD-MOI.
 */
tests.push(
  result(
    "R2-U02",
    workforceChecksRut &&
      semanticChecksRut,
    [
      `workforceRut=${workforceChecksRut}`,
      `semanticRut=${semanticChecksRut}`
    ].join(", ")
  )
);

/*
 * U03
 * Current MOD/MOI assigned() already requires the three
 * physical location fields. This is expected to PASS baseline.
 */
tests.push(
  result(
    "R2-U03",
    workforceChecksLocation,
    `workforceLocation=${workforceChecksLocation}`
  )
);

/*
 * U04
 * Complete text location is insufficient: the bed must
 * actually exist in operational inventory.
 */
tests.push(
  result(
    "R2-U04",
    workforceChecksInventory &&
      semanticChecksInventory,
    [
      `workforceInventory=${workforceChecksInventory}`,
      `semanticInventory=${semanticChecksInventory}`
    ].join(", ")
  )
);

/*
 * U05
 * Fast occupancy already points to assignedWorkers, but that
 * collection itself must be canonical.
 */
tests.push(
  result(
    "R2-U05",
    fastOccupancyUsesAssignedWorkers &&
      semanticCanonical,
    [
      `fastUsesAssignedWorkers=${fastOccupancyUsesAssignedWorkers}`,
      `semanticCanonical=${semanticCanonical}`
    ].join(", ")
  )
);

/*
 * U06
 * MOD/MOI must consume the same canonical population.
 */
tests.push(
  result(
    "R2-U06",
    workforceChecksLocation &&
      workforceChecksRut &&
      workforceChecksInventory,
    [
      `location=${workforceChecksLocation}`,
      `rut=${workforceChecksRut}`,
      `inventory=${workforceChecksInventory}`
    ].join(", ")
  )
);

/*
 * U07
 * Fixed business assumption EXPECTED_BEDS=504 is forbidden.
 */
tests.push(
  result(
    "R2-U07",
    !fixedBusiness504,
    `fixedBusiness504=${fixedBusiness504}`
  )
);

/*
 * U08
 * HTTP 504 Gateway Timeout is unrelated to bed count and must
 * remain retryable.
 */
tests.push(
  result(
    "R2-U08",
    http504Preserved,
    `http504Preserved=${http504Preserved}`
  )
);

/*
 * U09
 * Quality must not become REVISAR merely because inventory
 * differs from a fixed 504 reference.
 */
tests.push(
  result(
    "R2-U09",
    !fixed504Gap &&
      !qualityCountsFixed504Gap,
    [
      `fixed504Gap=${fixed504Gap}`,
      `qualityCountsFixedGap=${qualityCountsFixed504Gap}`
    ].join(", ")
  )
);

/*
 * U10
 * Capacity V1 / 132 is deliberately protected from R2.
 * At baseline it must still be present.
 */
tests.push(
  result(
    "R2-U10",
    capacity132Preserved,
    `capacity132Preserved=${capacity132Preserved}`
  )
);

/*
 * ---------------------------------------------------------
 * Baseline RED expectation
 * ---------------------------------------------------------
 *
 * Baseline is expected to fail exactly the defects already
 * identified during the read-only R2 audit.
 */

const expectedFailures = new Set([
  "R2-U01",
  "R2-U02",
  "R2-U04",
  "R2-U05",
  "R2-U06",
  "R2-U07",
  "R2-U09"
]);

const actualFailures =
  new Set(
    tests
      .filter(test => !test.pass)
      .map(test => test.id)
  );

const expectedPasses =
  contract.tests
    .map(test => test.id)
    .filter(id => !expectedFailures.has(id));

function sameSet(a, b) {
  if (a.size !== b.size) {
    return false;
  }

  for (const item of a) {
    if (!b.has(item)) {
      return false;
    }
  }

  return true;
}

const baselineShapeExact =
  sameSet(
    expectedFailures,
    actualFailures
  );

const passed =
  tests.filter(test => test.pass).length;

const failed =
  tests.length - passed;

console.log("");
console.log(
  "======================================================"
);
console.log(
  "R2 CANONICAL POPULATION — BASELINE RED"
);
console.log(
  "======================================================"
);
console.log("");

for (const test of tests) {
  const status =
    test.pass ? "PASS" : "FAIL";

  console.log(
    `${test.id} ${status} :: ${test.evidence}`
  );
}

console.log("");
console.log(
  `TOTAL : ${tests.length}`
);
console.log(
  `PASS  : ${passed}`
);
console.log(
  `FAIL  : ${failed}`
);
console.log("");

console.log(
  "EXPECTED BASELINE FAILURES:"
);

for (
  const id of
  [...expectedFailures].sort()
) {
  console.log(`  ${id}`);
}

console.log("");
console.log(
  "EXPECTED BASELINE PASSES:"
);

for (
  const id of
  expectedPasses.sort()
) {
  console.log(`  ${id}`);
}

console.log("");

if (!baselineShapeExact) {
  console.error(
    "R2 BASELINE RED SHAPE: STOP"
  );

  console.error(
    "Actual failures:"
  );

  for (
    const id of
    [...actualFailures].sort()
  ) {
    console.error(`  ${id}`);
  }

  process.exit(1);
}

console.log(
  "R2 BASELINE RED SHAPE: PASS"
);

console.log(
  "R2 BASELINE STATUS: RED AS EXPECTED"
);

process.exit(0);