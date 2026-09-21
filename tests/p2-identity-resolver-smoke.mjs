"use strict";

import fs from "node:fs";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const [
  resolverPath,
  contractPath
] = process.argv.slice(2);

if (!resolverPath || !contractPath) {
  throw new Error(
    "resolverPath and contractPath are required"
  );
}

const contract =
  JSON.parse(
    fs.readFileSync(
      contractPath,
      "utf8"
    )
  );

const api =
  await import(
    pathToFileURL(
      resolverPath
    ).href
  );

const {
  ResolutionState,
  InputQuality,
  classifyRutEvidence,
  normalizeCanonicalLabel,
  resolveDistinctCandidates,
  resolveCompanyIdentity,
  resolveShiftIdentity,
  resolvePersonIdentity
} = api;

/* =========================================================
 * Frozen contract linkage
 * ======================================================= */

assert.equal(
  contract.contract,
  "GARPI_P2_3_CANONICAL_IDENTITY_RESOLUTION"
);

assert.deepEqual(
  Object.values(ResolutionState),
  contract.resolution_states
);

assert.deepEqual(
  Object.values(InputQuality),
  contract.input_quality
);

assert.equal(
  contract.principles.resolver_is_side_effect_free,
  true
);

assert.equal(
  contract.principles.no_identity_fabrication,
  true
);

assert.equal(
  contract.principles.no_fuzzy_auto_merge,
  true
);

/* =========================================================
 * Strict RUT evidence
 * ======================================================= */

assert.deepEqual(
  classifyRutEvidence(
    "12.345.678-5"
  ),
  {
    raw: "12.345.678-5",
    canonical: "12345678-5",
    inputQuality: "VALID",
    valid: true,
    reason: null
  }
);

assert.equal(
  classifyRutEvidence(
    "123456785"
  ).canonical,
  "12345678-5"
);

assert.equal(
  classifyRutEvidence(
    "10003k"
  ).canonical,
  "10003-K"
);

assert.deepEqual(
  classifyRutEvidence(
    "ABC12.345.678-5"
  ),
  {
    raw: "ABC12.345.678-5",
    canonical: "",
    inputQuality: "INVALID",
    valid: false,
    reason: "INVALID_RUT"
  }
);

assert.equal(
  classifyRutEvidence(
    "12/345/678-5"
  ).valid,
  false
);

assert.equal(
  classifyRutEvidence(
    ""
  ).inputQuality,
  "MISSING"
);

assert.equal(
  classifyRutEvidence(
    "123456789"
  ).canonical,
  "12345678-9"
);

assert.equal(
  classifyRutEvidence(
    "123456789"
  ).valid,
  false
);

/* =========================================================
 * Conservative label normalization
 * ======================================================= */

assert.equal(
  normalizeCanonicalLabel(
    "Compa\u00F1\u00EDa   Minera"
  ),
  "COMPANIA MINERA"
);

assert.equal(
  normalizeCanonicalLabel(
    " turno   7x7 "
  ),
  "TURNO 7X7"
);

assert.equal(
  normalizeCanonicalLabel(
    "A-B"
  ),
  "A-B"
);

assert.notEqual(
  normalizeCanonicalLabel(
    "A-B"
  ),
  normalizeCanonicalLabel(
    "AB"
  )
);

/* =========================================================
 * Candidate cardinality
 * ======================================================= */

assert.equal(
  resolveDistinctCandidates([])
    .state,
  "UNRESOLVED"
);

assert.deepEqual(
  resolveDistinctCandidates(
    ["10", "10"]
  ),
  {
    state: "RESOLVED",
    entityId: "10",
    candidateIds: ["10"],
    reason: null
  }
);

assert.deepEqual(
  resolveDistinctCandidates(
    ["10", "11"]
  ),
  {
    state: "CONFLICT",
    entityId: null,
    candidateIds: ["10", "11"],
    reason:
      "MULTIPLE_EXACT_CANDIDATES"
  }
);

/*
 * Malformed candidate objects must never become
 * "[object Object]" identity values.
 */
assert.deepEqual(
  resolveDistinctCandidates(
    [
      { notId: "bad" }
    ]
  ),
  {
    state: "UNRESOLVED",
    entityId: null,
    candidateIds: [],
    reason:
      "NO_EXACT_CANDIDATE"
  }
);

assert.deepEqual(
  resolveDistinctCandidates(
    [
      { id: "10" },
      { id: "10" }
    ]
  ),
  {
    state: "RESOLVED",
    entityId: "10",
    candidateIds: ["10"],
    reason: null
  }
);

assert.equal(
  resolveDistinctCandidates(
    [true]
  ).state,
  "UNRESOLVED"
);

assert.equal(
  resolveDistinctCandidates(
    [Number.NaN]
  ).state,
  "UNRESOLVED"
);

/* =========================================================
 * Company exact resolution
 * ======================================================= */

const companyCanonical =
  new Map([
    [
      "ACME MINERIA",
      "company-1"
    ],
    [
      "OMEGA SPA",
      "company-2"
    ],
    [
      "COLLISION",
      "company-1"
    ]
  ]);

const companyAliases =
  new Map([
    [
      "ACME",
      "company-1"
    ],
    [
      "MINERA ACME",
      "company-1"
    ],
    [
      "COLLISION",
      "company-2"
    ]
  ]);

assert.equal(
  resolveCompanyIdentity(
    "acme mineria",
    {
      canonical:
        companyCanonical,
      aliases:
        companyAliases
    }
  ).entityId,
  "company-1"
);

assert.equal(
  resolveCompanyIdentity(
    " minera   acme ",
    {
      canonical:
        companyCanonical,
      aliases:
        companyAliases
    }
  ).entityId,
  "company-1"
);

assert.deepEqual(
  resolveCompanyIdentity(
    "empresa desconocida",
    {
      canonical:
        companyCanonical,
      aliases:
        companyAliases
    }
  ),
  {
    state: "UNRESOLVED",
    entityId: null,
    candidateIds: [],
    reason: "UNKNOWN_COMPANY",
    normalizedKey:
      "EMPRESA DESCONOCIDA"
  }
);

assert.equal(
  resolveCompanyIdentity(
    "COLLISION",
    {
      canonical:
        companyCanonical,
      aliases:
        companyAliases
    }
  ).state,
  "CONFLICT"
);

/*
 * No fuzzy behavior:
 * similar text is still unknown.
 */
assert.equal(
  resolveCompanyIdentity(
    "ACME MINERI",
    {
      canonical:
        companyCanonical,
      aliases:
        companyAliases
    }
  ).state,
  "UNRESOLVED"
);

/* =========================================================
 * Shift exact resolution
 * ======================================================= */

const shiftCanonical =
  new Map([
    ["7X7", "shift-1"],
    ["14X14", "shift-2"],
    ["DUP", "shift-1"]
  ]);

const shiftAliases =
  new Map([
    ["TURNO 7X7", "shift-1"],
    ["SEVEN SEVEN", "shift-1"],
    ["DUP", "shift-2"]
  ]);

assert.equal(
  resolveShiftIdentity(
    " turno 7x7 ",
    {
      canonical:
        shiftCanonical,
      aliases:
        shiftAliases
    }
  ).entityId,
  "shift-1"
);

assert.equal(
  resolveShiftIdentity(
    "7x7",
    {
      canonical:
        shiftCanonical,
      aliases:
        shiftAliases
    }
  ).entityId,
  "shift-1"
);

assert.equal(
  resolveShiftIdentity(
    "DUP",
    {
      canonical:
        shiftCanonical,
      aliases:
        shiftAliases
    }
  ).state,
  "CONFLICT"
);

assert.equal(
  resolveShiftIdentity(
    "8X8",
    {
      canonical:
        shiftCanonical,
      aliases:
        shiftAliases
    }
  ).state,
  "UNRESOLVED"
);

/* =========================================================
 * Person resolution
 * ======================================================= */

const person1 = Object.freeze({
  id: "person-1",
  rutNormalized:
    "12345678-5"
});

const person2 = Object.freeze({
  id: "person-2",
  rutNormalized:
    "10003-K"
});

const personsById =
  new Map([
    ["person-1", person1],
    ["person-2", person2]
  ]);

const personsByRut =
  new Map([
    [
      "12345678-5",
      "person-1"
    ],
    [
      "10003-K",
      "person-2"
    ]
  ]);

/*
 * Valid RUT can resolve without worker.id.
 */
assert.deepEqual(
  resolvePersonIdentity(
    {
      rut: "12.345.678-5"
    },
    {
      personsById,
      personsByRut
    }
  ),
  {
    state: "RESOLVED",
    entityId: "person-1",
    candidateIds: [
      "person-1"
    ],
    reason: null,
    inputQuality: "VALID",
    canonicalRut:
      "12345678-5"
  }
);

/*
 * Unknown valid RUT does not auto-create a person.
 */
assert.equal(
  resolvePersonIdentity(
    {
      rut: "23.456.785-0"
    },
    {
      personsById,
      personsByRut
    }
  ).state,
  "UNRESOLVED"
);

/*
 * Name alone is intentionally irrelevant to identity.
 */
assert.equal(
  resolvePersonIdentity(
    {
      name:
        "SAME NAME AS SOMEONE"
    },
    {
      personsById,
      personsByRut
    }
  ).state,
  "UNRESOLVED"
);

/*
 * Existing durable person_id resolves when RUT evidence
 * is absent.
 */
assert.deepEqual(
  resolvePersonIdentity(
    {
      personId:
        "person-1"
    },
    {
      personsById,
      personsByRut
    }
  ),
  {
    state: "RESOLVED",
    entityId: "person-1",
    inputQuality: "MISSING",
    canonicalRut: "",
    reason:
      "RESOLVED_BY_EXISTING_PERSON_ID"
  }
);

/*
 * Existing ID + matching valid RUT is consistent.
 */
assert.equal(
  resolvePersonIdentity(
    {
      personId:
        "person-1",
      rut:
        "12.345.678-5"
    },
    {
      personsById,
      personsByRut
    }
  ).state,
  "RESOLVED"
);

/*
 * Existing ID + another person's valid RUT is a conflict.
 */
assert.deepEqual(
  resolvePersonIdentity(
    {
      personId:
        "person-1",
      rut:
        "10003-K"
    },
    {
      personsById,
      personsByRut
    }
  ),
  {
    state: "CONFLICT",
    entityId: null,
    inputQuality: "VALID",
    canonicalRut:
      "10003-K",
    reason:
      "PERSON_ID_RUT_MISMATCH"
  }
);

/*
 * Invalid explicit ID is never silently replaced by
 * a RUT-resolved person.
 */
assert.deepEqual(
  resolvePersonIdentity(
    {
      personId:
        "person-missing",
      rut:
        "12.345.678-5"
    },
    {
      personsById,
      personsByRut
    }
  ),
  {
    state: "UNRESOLVED",
    entityId: null,
    inputQuality: "VALID",
    canonicalRut:
      "12345678-5",
    reason:
      "UNKNOWN_PERSON_ID"
  }
);

/*
 * Plain object prototype properties are not entity IDs.
 */
assert.deepEqual(
  resolvePersonIdentity(
    {
      personId:
        "constructor"
    },
    {
      personsById: {},
      personsByRut: {}
    }
  ),
  {
    state: "UNRESOLVED",
    entityId: null,
    inputQuality: "MISSING",
    canonicalRut: "",
    reason:
      "UNKNOWN_PERSON_ID"
  }
);

/*
 * Contaminated RUT remains unresolved even with an
 * otherwise valid existing ID.
 */
assert.deepEqual(
  resolvePersonIdentity(
    {
      personId:
        "person-1",
      rut:
        "ABC12.345.678-5"
    },
    {
      personsById,
      personsByRut
    }
  ),
  {
    state: "UNRESOLVED",
    entityId: null,
    inputQuality: "INVALID",
    canonicalRut: "",
    reason: "INVALID_RUT"
  }
);

/*
 * Duplicate RUT evidence cannot silently choose one person.
 */
const duplicateRutMap =
  new Map([
    [
      "12345678-5",
      [
        "person-1",
        "person-X"
      ]
    ]
  ]);

assert.equal(
  resolvePersonIdentity(
    {
      rut:
        "12.345.678-5"
    },
    {
      personsById,
      personsByRut:
        duplicateRutMap
    }
  ).state,
  "CONFLICT"
);

/* =========================================================
 * Side-effect-free proof
 * ======================================================= */

const mutableCompanyCanonical = {
  "ACME MINERIA": "company-1"
};

const mutableAliases = {
  "ACME": "company-1"
};

const before =
  JSON.stringify({
    mutableCompanyCanonical,
    mutableAliases
  });

resolveCompanyIdentity(
  "ACME",
  {
    canonical:
      mutableCompanyCanonical,
    aliases:
      mutableAliases
  }
);

const after =
  JSON.stringify({
    mutableCompanyCanonical,
    mutableAliases
  });

assert.equal(
  after,
  before,
  "resolver must not mutate source indexes"
);

/* =========================================================
 * Explicit safety invariants
 * ======================================================= */

assert.equal(
  contract.person.rut_resolution
    .resolver_may_create_person,
  false
);

assert.equal(
  contract.company.resolution
    .unknown_label_auto_create,
  false
);

assert.equal(
  contract.shift.resolution
    .unknown_label_auto_create,
  false
);

assert.equal(
  contract.company.resolution
    .fuzzy_auto_merge,
  false
);

assert.equal(
  contract.shift.resolution
    .fuzzy_auto_merge,
  false
);

console.log(
  "P2.3 pure identity resolver foundations: OK"
);