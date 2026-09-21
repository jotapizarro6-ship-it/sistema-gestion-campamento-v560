"use strict";

import fs from "node:fs";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const [
  shadowPath,
  resolverPath,
  contractPath
] = process.argv.slice(2);

if (
  !shadowPath ||
  !resolverPath ||
  !contractPath
) {
  throw new Error(
    "shadowPath, resolverPath and contractPath are required"
  );
}

const contract =
  JSON.parse(
    fs.readFileSync(
      contractPath,
      "utf8"
    )
  );

const shadow =
  await import(
    pathToFileURL(
      shadowPath
    ).href
  );

const resolver =
  await import(
    pathToFileURL(
      resolverPath
    ).href
  );

assert.equal(
  contract.principles
    .worker_is_current_operational_projection,
  true
);

assert.equal(
  contract.principles
    .workers_durable_identity_forbidden,
  true
);

assert.equal(
  contract.principles
    .no_identity_fabrication,
  true
);

const canonical = {
  persons: [
    {
      id: "person-1",
      rut_normalized:
        "12345678-5"
    },
    {
      id: "person-2",
      rut_normalized:
        "10003-K"
    },

    /*
     * Invalid canonical evidence is detected
     * and excluded from the RUT index.
     */
    {
      id: "person-bad-rut",
      rut_normalized:
        "12345678-9"
    },

    /*
     * Malformed canonical row is diagnostic only.
     */
    {
      rut_normalized:
        "12345678-5"
    }
  ],

  companies: [
    {
      id: "company-1",
      normalized_key:
        "ACME MINERIA"
    },
    {
      id: "company-2",
      normalized_key:
        "OMEGA SPA"
    },
    {
      id: "company-1",
      normalized_key:
        "COLLISION"
    }
  ],

  companyAliases: [
    {
      company_id:
        "company-1",
      normalized_key:
        "ACME"
    },
    {
      company_id:
        "company-1",
      normalized_key:
        "MINERA ACME"
    },

    /*
     * Deliberate exact collision.
     */
    {
      company_id:
        "company-2",
      normalized_key:
        "COLLISION"
    },

    /*
     * Dangling alias target must be diagnostic only
     * and must never become a resolvable entity.
     */
    {
      company_id:
        "company-ghost",
      normalized_key:
        "GHOST COMPANY"
    }
  ],

  shifts: [
    {
      id: "shift-1",
      code: "7X7"
    },
    {
      id: "shift-2",
      code: "14X14"
    },
    {
      id: "shift-1",
      code: "DUP"
    }
  ],

  shiftAliases: [
    {
      shift_id:
        "shift-1",
      normalized_key:
        "TURNO 7X7"
    },
    {
      shift_id:
        "shift-2",
      normalized_key:
        "DUP"
    },

    /*
     * Dangling shift alias target.
     */
    {
      shift_id:
        "shift-ghost",
      normalized_key:
        "GHOST SHIFT"
    }
  ]
};

const workers = [
  {
    id: 9001,
    rut: "12.345.678-5",
    nombre: "WORKER ALPHA",
    empresa: "acme mineria",
    turno: "7x7"
  },

  {
    id: 9002,
    rut: "10003k",
    nombre: "WORKER BETA",
    empresa: "ACME",
    turno: "turno 7x7"
  },

  {
    id: 9003,
    rut: "123456789",
    nombre: "WORKER GAMMA",
    empresa: "UNKNOWN COMPANY",
    turno: "8X8"
  },

  {
    id: 9004,
    rut: "123456785",
    nombre: "WORKER DELTA",
    empresa: "COLLISION",
    turno: "DUP"
  },

  /*
   * Same name as an existing conceptual person
   * would still not create identity.
   */
  {
    id: 9005,
    rut: "",
    nombre: "WORKER ALPHA",
    empresa: "",
    turno: ""
  }
];

const canonicalBefore =
  JSON.stringify(canonical);

const workersBefore =
  JSON.stringify(workers);

const indexes =
  shadow.buildIdentityIndexes(
    canonical,
    resolver
  );

assert.deepEqual(
  indexes.diagnostics,
  {
    invalidPersonRows: 1,
    invalidPersonRut: 1,
    invalidCompanyRows: 0,
    invalidCompanyAliasRows: 0,
    danglingCompanyAliasTargets: 1,
    invalidShiftRows: 0,
    invalidShiftAliasRows: 0,
    danglingShiftAliasTargets: 1
  }
);

/*
 * workers.id must never participate in person identity.
 */
assert.equal(
  indexes.persons
    .personsById
    .has("9001"),
  false
);

/*
 * Aliases with nonexistent canonical targets
 * must never resolve.
 */
assert.deepEqual(
  resolver.resolveCompanyIdentity(
    "GHOST COMPANY",
    indexes.companies
  ),
  {
    state: "UNRESOLVED",
    entityId: null,
    candidateIds: [],
    reason: "UNKNOWN_COMPANY",
    normalizedKey:
      "GHOST COMPANY"
  }
);

assert.deepEqual(
  resolver.resolveShiftIdentity(
    "GHOST SHIFT",
    indexes.shifts
  ),
  {
    state: "UNRESOLVED",
    entityId: null,
    candidateIds: [],
    reason: "UNKNOWN_SHIFT",
    normalizedKey:
      "GHOST SHIFT"
  }
);

const report =
  shadow.shadowWorkers(
    workers,
    indexes,
    resolver
  );

/* =========================================================
 * Row-level resolution
 * ======================================================= */

assert.equal(
  report.rows[0].person.state,
  "RESOLVED"
);

assert.equal(
  report.rows[0].person.entityId,
  "person-1"
);

assert.equal(
  report.rows[0].company.entityId,
  "company-1"
);

assert.equal(
  report.rows[0].shift.entityId,
  "shift-1"
);

assert.equal(
  report.rows[1].person.entityId,
  "person-2"
);

assert.equal(
  report.rows[1].company.entityId,
  "company-1"
);

assert.equal(
  report.rows[1].shift.entityId,
  "shift-1"
);

assert.equal(
  report.rows[2].person.state,
  "UNRESOLVED"
);

assert.equal(
  report.rows[2].person.reason,
  "INVALID_RUT"
);

assert.equal(
  report.rows[2].company.state,
  "UNRESOLVED"
);

assert.equal(
  report.rows[2].shift.state,
  "UNRESOLVED"
);

assert.equal(
  report.rows[3].person.entityId,
  "person-1"
);

assert.equal(
  report.rows[3].company.state,
  "CONFLICT"
);

assert.equal(
  report.rows[3].shift.state,
  "CONFLICT"
);

assert.equal(
  report.rows[4].person.state,
  "UNRESOLVED"
);

assert.equal(
  report.rows[4].person.reason,
  "MISSING_RUT"
);

/* =========================================================
 * Aggregate expectations
 * ======================================================= */

assert.deepEqual(
  report.summary.person,
  {
    RESOLVED: 3,
    UNRESOLVED: 2,
    CONFLICT: 0
  }
);

assert.deepEqual(
  report.summary.company,
  {
    RESOLVED: 2,
    UNRESOLVED: 2,
    CONFLICT: 1
  }
);

assert.deepEqual(
  report.summary.shift,
  {
    RESOLVED: 2,
    UNRESOLVED: 2,
    CONFLICT: 1
  }
);

assert.equal(
  report.summary.totalRows,
  5
);

assert.equal(
  report.summary.fullyResolved,
  2
);

assert.equal(
  report.summary.rowsWithConflict,
  1
);

assert.equal(
  report.summary.rowsWithUnresolved,
  2
);

assert.equal(
  report.summary.reasons[
    "PERSON:INVALID_RUT"
  ],
  1
);

assert.equal(
  report.summary.reasons[
    "PERSON:MISSING_RUT"
  ],
  1
);

assert.equal(
  report.summary.reasons[
    "COMPANY:COMPANY_EXACT_CONFLICT"
  ],
  1
);

assert.equal(
  report.summary.reasons[
    "SHIFT:SHIFT_EXACT_CONFLICT"
  ],
  1
);

/* =========================================================
 * PII minimization
 * ======================================================= */

const serializedReport =
  JSON.stringify(report);

/*
 * Shadow output deliberately excludes raw values.
 */
for (
  const forbidden of [
    "WORKER ALPHA",
    "WORKER BETA",
    "12345678-5",
    "10003-K",
    "ACME MINERIA",
    "UNKNOWN COMPANY"
  ]
) {
  assert.equal(
    serializedReport.includes(
      forbidden
    ),
    false,
    `shadow report leaked raw evidence: ${forbidden}`
  );
}

assert.equal(
  own(report.rows[0], "rut"),
  false
);

assert.equal(
  own(report.rows[0], "nombre"),
  false
);

assert.equal(
  own(report.rows[0], "empresa"),
  false
);

assert.equal(
  own(report.rows[0], "turno"),
  false
);

assert.equal(
  own(report.rows[0].person, "canonicalRut"),
  false
);

/* =========================================================
 * Side-effect-free proof
 * ======================================================= */

assert.equal(
  JSON.stringify(canonical),
  canonicalBefore
);

assert.equal(
  JSON.stringify(workers),
  workersBefore
);

/*
 * Re-running must be deterministic.
 */
const report2 =
  shadow.shadowWorkers(
    workers,
    indexes,
    resolver
  );

assert.deepEqual(
  report2,
  report
);

console.log(
  "P2.3 shadow identity resolution engine: OK"
);

function own(object, key) {
  return (
    Object.prototype.hasOwnProperty.call(
      object,
      key
    )
  );
}