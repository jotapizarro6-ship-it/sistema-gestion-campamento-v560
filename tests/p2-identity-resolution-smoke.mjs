import fs from "node:fs";
import assert from "node:assert/strict";

const file = process.argv[2];

if (!file) {
  throw new Error("Contract file argument missing.");
}

const contract =
  JSON.parse(
    fs.readFileSync(
      file,
      "utf8"
    )
  );

assert.equal(
  contract.contract,
  "GARPI_P2_3_CANONICAL_IDENTITY_RESOLUTION"
);

assert.deepEqual(
  contract.resolution_states,
  [
    "RESOLVED",
    "UNRESOLVED",
    "CONFLICT"
  ]
);

assert.deepEqual(
  contract.input_quality,
  [
    "VALID",
    "INVALID",
    "MISSING"
  ]
);

assert.equal(
  contract.principles.person_is_not_worker_row,
  true
);

assert.equal(
  contract.principles.worker_is_current_operational_projection,
  true
);

assert.equal(
  contract.principles.workers_durable_identity_forbidden,
  true
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

assert.equal(
  contract.person.name.identity_key,
  false
);

assert.equal(
  contract.person.name.may_resolve_person_alone,
  false
);

assert.equal(
  contract.person.rut.invalid.create_person,
  false
);

assert.equal(
  contract.person.rut.reject_other_characters,
  true
);

assert.equal(
  contract.person.rut_resolution.resolver_may_create_person,
  false
);

assert.equal(
  contract.company.resolution.exact_only,
  true
);

assert.equal(
  contract.company.resolution.fuzzy_auto_merge,
  false
);

assert.equal(
  contract.shift.resolution.exact_only,
  true
);

assert.equal(
  contract.shift.resolution.fuzzy_auto_merge,
  false
);

assert.equal(
  contract.source_semantics.legacy_reservation.invent_person,
  false
);

assert.equal(
  contract.source_semantics.movement_aggregate
    .people_count_must_not_expand_to_person_rows,
  true
);

assert.equal(
  contract.source_semantics.historical_snapshot
    .rewrite_to_canonical_ids,
  "FORBIDDEN"
);

function canonicalRut(value) {
  const raw =
    String(value ?? "")
      .trim()
      .toUpperCase();

  if (!raw) {
    return "";
  }

  /*
   * Normalization may remove presentation separators only.
   * It must never erase arbitrary invalid evidence and thereby
   * transform contaminated input into a valid identity.
   */
  if (/[^0-9K.\-\s]/.test(raw)) {
    return "";
  }

  const chars =
    raw.replace(
      /[.\-\s]/g,
      ""
    );

  /*
   * BODY = 5..9 digits
   * DV   = digit or K
   */
  if (!/^\d{5,9}[0-9K]$/.test(chars)) {
    return "";
  }

  return (
    chars.slice(0, -1) +
    "-" +
    chars.slice(-1)
  );
}

function validRut(value) {
  const canonical =
    canonicalRut(value);

  const match =
    /^(\d{5,9})-([0-9K])$/
      .exec(canonical);

  if (!match) {
    return false;
  }

  let sum = 0;
  let multiplier = 2;

  for (
    let i = match[1].length - 1;
    i >= 0;
    i--
  ) {
    sum +=
      Number(match[1][i]) *
      multiplier;

    multiplier =
      multiplier === 7
        ? 2
        : multiplier + 1;
  }

  const rawDv =
    11 - (sum % 11);

  const expected =
    rawDv === 11
      ? "0"
      : rawDv === 10
        ? "K"
        : String(rawDv);

  return match[2] === expected;
}

function classifyRut(value) {
  const raw =
    String(value ?? "").trim();

  if (!raw) {
    return {
      canonical: "",
      input_quality: "MISSING",
      resolution_state: "UNRESOLVED",
      reason: "MISSING_RUT"
    };
  }

  const canonical =
    canonicalRut(raw);

  if (!validRut(raw)) {
    return {
      canonical,
      input_quality: "INVALID",
      resolution_state: "UNRESOLVED",
      reason: "INVALID_RUT"
    };
  }

  return {
    canonical,
    input_quality: "VALID",
    resolution_state: null,
    reason: null
  };
}

function normalizeLabel(value) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toUpperCase()
    .replace(
      /\s+/g,
      " "
    );
}

function resolveDistinctCandidates(
  candidateIds
) {
  const distinct =
    [
      ...new Set(
        candidateIds
          .filter(
            value =>
              value !== null &&
              value !== undefined &&
              String(value) !== ""
          )
          .map(String)
      )
    ];

  if (distinct.length === 0) {
    return {
      state: "UNRESOLVED",
      id: null
    };
  }

  if (distinct.length === 1) {
    return {
      state: "RESOLVED",
      id: distinct[0]
    };
  }

  return {
    state: "CONFLICT",
    id: null
  };
}

/* =========================================================
 * RUT parity / semantics
 * ======================================================= */

assert.equal(
  canonicalRut("12.345.678-5"),
  "12345678-5"
);

assert.equal(
  canonicalRut("123456785"),
  "12345678-5"
);

assert.equal(
  canonicalRut("10003K"),
  "10003-K"
);

assert.equal(
  canonicalRut(" 12.345.678-5 "),
  "12345678-5"
);

assert.equal(
  canonicalRut("12 345 678-5"),
  "12345678-5"
);

/*
 * Contaminated evidence must NOT normalize into identity.
 */
assert.equal(
  canonicalRut("ABC12.345.678-5"),
  ""
);

assert.equal(
  validRut("ABC12.345.678-5"),
  false
);

assert.equal(
  canonicalRut("12/345/678-5"),
  ""
);

assert.equal(
  validRut("12/345/678-5"),
  false
);

assert.equal(
  canonicalRut("12345K67-8"),
  ""
);

assert.equal(
  validRut("12.345.678-5"),
  true
);

assert.equal(
  validRut("123456785"),
  true
);

assert.equal(
  validRut("10003K"),
  true
);

assert.equal(
  validRut("123456789"),
  false
);

assert.equal(
  validRut("183540265"),
  false
);

assert.equal(
  validRut("1234"),
  false
);

assert.deepEqual(
  classifyRut(""),
  {
    canonical: "",
    input_quality: "MISSING",
    resolution_state: "UNRESOLVED",
    reason: "MISSING_RUT"
  }
);

assert.deepEqual(
  classifyRut("123456789"),
  {
    canonical: "12345678-9",
    input_quality: "INVALID",
    resolution_state: "UNRESOLVED",
    reason: "INVALID_RUT"
  }
);

assert.deepEqual(
  classifyRut("ABC12.345.678-5"),
  {
    canonical: "",
    input_quality: "INVALID",
    resolution_state: "UNRESOLVED",
    reason: "INVALID_RUT"
  }
);

/* =========================================================
 * Company / shift conservative normalization
 * ======================================================= */

assert.equal(
  normalizeLabel(
    "Compa\u00F1\u00EDa   Minera"
  ),
  "COMPANIA MINERA"
);

assert.equal(
  normalizeLabel(
    " turno   7x7 "
  ),
  "TURNO 7X7"
);

/*
 * Punctuation is intentionally preserved.
 * Conservative normalization must not silently collapse
 * potentially distinct business labels.
 */

assert.equal(
  normalizeLabel("A-B"),
  "A-B"
);

assert.equal(
  normalizeLabel("AB"),
  "AB"
);

assert.notEqual(
  normalizeLabel("A-B"),
  normalizeLabel("AB")
);

/* =========================================================
 * Candidate cardinality semantics
 * ======================================================= */

assert.deepEqual(
  resolveDistinctCandidates([]),
  {
    state: "UNRESOLVED",
    id: null
  }
);

assert.deepEqual(
  resolveDistinctCandidates(["10"]),
  {
    state: "RESOLVED",
    id: "10"
  }
);

/*
 * Canonical key and alias may both point to the same entity.
 * That is still exactly one distinct candidate.
 */

assert.deepEqual(
  resolveDistinctCandidates(
    ["10", "10"]
  ),
  {
    state: "RESOLVED",
    id: "10"
  }
);

assert.deepEqual(
  resolveDistinctCandidates(
    ["10", "11"]
  ),
  {
    state: "CONFLICT",
    id: null
  }
);

/* =========================================================
 * Explicit prohibitions
 * ======================================================= */

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
  contract.conflict_rules
    .existing_person_id_vs_valid_rut_mismatch,
  "CONFLICT"
);

assert.equal(
  contract.conflict_rules
    .conflict_auto_fix,
  false
);

assert.equal(
  contract.migration_policy
    .p2_3c_actions
    .db_write,
  false
);

assert.equal(
  contract.migration_policy
    .p2_3c_actions
    .backfill,
  false
);

assert.equal(
  contract.migration_policy
    .p2_3c_actions
    .runtime_cutover,
  false
);

console.log(
  "P2.3 canonical identity resolution contract: OK"
);