"use strict";

/*
 * GARPI P2.3D resolver foundations.
 *
 * Pure functions only:
 * - no database access
 * - no mutation of source data
 * - no automatic entity creation
 * - no fuzzy matching
 * - no runtime cutover
 */

export const ResolutionState = Object.freeze({
  RESOLVED: "RESOLVED",
  UNRESOLVED: "UNRESOLVED",
  CONFLICT: "CONFLICT"
});

export const InputQuality = Object.freeze({
  VALID: "VALID",
  INVALID: "INVALID",
  MISSING: "MISSING"
});

function text(value) {
  return String(value ?? "");
}

export function classifyRutEvidence(value) {
  const raw =
    text(value)
      .trim()
      .toUpperCase();

  if (!raw) {
    return Object.freeze({
      raw,
      canonical: "",
      inputQuality: InputQuality.MISSING,
      valid: false,
      reason: "MISSING_RUT"
    });
  }

  /*
   * Formatting may be removed.
   * Arbitrary evidence may not.
   */
  if (/[^0-9K.\-\s]/.test(raw)) {
    return Object.freeze({
      raw,
      canonical: "",
      inputQuality: InputQuality.INVALID,
      valid: false,
      reason: "INVALID_RUT"
    });
  }

  const compact =
    raw.replace(
      /[.\-\s]/g,
      ""
    );

  if (!/^\d{5,9}[0-9K]$/.test(compact)) {
    return Object.freeze({
      raw,
      canonical: "",
      inputQuality: InputQuality.INVALID,
      valid: false,
      reason: "INVALID_RUT"
    });
  }

  const body =
    compact.slice(0, -1);

  const dv =
    compact.slice(-1);

  const canonical =
    `${body}-${dv}`;

  let sum = 0;
  let multiplier = 2;

  for (
    let index = body.length - 1;
    index >= 0;
    index--
  ) {
    sum +=
      Number(body[index]) *
      multiplier;

    multiplier =
      multiplier === 7
        ? 2
        : multiplier + 1;
  }

  const result =
    11 - (sum % 11);

  const expected =
    result === 11
      ? "0"
      : result === 10
        ? "K"
        : String(result);

  if (dv !== expected) {
    return Object.freeze({
      raw,
      canonical,
      inputQuality: InputQuality.INVALID,
      valid: false,
      reason: "INVALID_RUT"
    });
  }

  return Object.freeze({
    raw,
    canonical,
    inputQuality: InputQuality.VALID,
    valid: true,
    reason: null
  });
}

export function normalizeCanonicalLabel(value) {
  return text(value)
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

function hasOwn(object, key) {
  return (
    object !== null &&
    typeof object === "object" &&
    Object.prototype.hasOwnProperty.call(
      object,
      key
    )
  );
}

function candidateId(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    typeof value === "object"
  ) {
    if (!hasOwn(value, "id")) {
      return null;
    }

    return candidateId(
      value.id
    );
  }

  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "bigint"
  ) {
    return null;
  }

  if (
    typeof value === "number" &&
    !Number.isFinite(value)
  ) {
    return null;
  }

  const id =
    text(value).trim();

  return id || null;
}

export function resolveDistinctCandidates(
  candidates,
  {
    unresolvedReason = "NO_EXACT_CANDIDATE",
    conflictReason = "MULTIPLE_EXACT_CANDIDATES"
  } = {}
) {
  const distinct =
    [
      ...new Set(
        (Array.isArray(candidates)
          ? candidates
          : []
        )
          .map(candidateId)
          .filter(Boolean)
      )
    ];

  if (distinct.length === 0) {
    return Object.freeze({
      state: ResolutionState.UNRESOLVED,
      entityId: null,
      candidateIds: Object.freeze([]),
      reason: unresolvedReason
    });
  }

  if (distinct.length === 1) {
    return Object.freeze({
      state: ResolutionState.RESOLVED,
      entityId: distinct[0],
      candidateIds: Object.freeze(
        [...distinct]
      ),
      reason: null
    });
  }

  return Object.freeze({
    state: ResolutionState.CONFLICT,
    entityId: null,
    candidateIds: Object.freeze(
      [...distinct].sort()
    ),
    reason: conflictReason
  });
}

function valuesForExactKey(
  map,
  key
) {
  if (!map) {
    return [];
  }

  let value;

  if (map instanceof Map) {
    value =
      map.get(key);
  }
  else {
    if (
      typeof map !== "object" ||
      !hasOwn(map, key)
    ) {
      return [];
    }

    value =
      map[key];
  }

  if (
    value === null ||
    value === undefined
  ) {
    return [];
  }

  return Array.isArray(value)
    ? value
    : [value];
}

export function resolveExactLabelEntity(
  value,
  {
    canonical = new Map(),
    aliases = new Map()
  } = {},
  {
    missingReason = "MISSING_VALUE",
    unknownReason = "UNKNOWN_VALUE",
    conflictReason = "EXACT_LABEL_CONFLICT"
  } = {}
) {
  const raw =
    text(value).trim();

  if (!raw) {
    return Object.freeze({
      state: ResolutionState.UNRESOLVED,
      entityId: null,
      normalizedKey: "",
      candidateIds: Object.freeze([]),
      reason: missingReason
    });
  }

  const normalizedKey =
    normalizeCanonicalLabel(raw);

  const candidates = [
    ...valuesForExactKey(
      canonical,
      normalizedKey
    ),
    ...valuesForExactKey(
      aliases,
      normalizedKey
    )
  ];

  const result =
    resolveDistinctCandidates(
      candidates,
      {
        unresolvedReason: unknownReason,
        conflictReason
      }
    );

  return Object.freeze({
    ...result,
    normalizedKey
  });
}

function getPersonById(
  personsById,
  id
) {
  if (!personsById) {
    return null;
  }

  if (personsById instanceof Map) {
    return (
      personsById.get(id) ??
      null
    );
  }

  if (
    typeof personsById !== "object" ||
    !hasOwn(personsById, id)
  ) {
    return null;
  }

  return (
    personsById[id] ??
    null
  );
}

function getPersonCandidatesByRut(
  personsByRut,
  canonicalRut
) {
  if (!personsByRut) {
    return [];
  }

  let value;

  if (personsByRut instanceof Map) {
    value =
      personsByRut.get(
        canonicalRut
      );
  }
  else {
    if (
      typeof personsByRut !== "object" ||
      !hasOwn(
        personsByRut,
        canonicalRut
      )
    ) {
      return [];
    }

    value =
      personsByRut[
        canonicalRut
      ];
  }

  if (
    value === null ||
    value === undefined
  ) {
    return [];
  }

  return Array.isArray(value)
    ? value
    : [value];
}

export function resolvePersonIdentity(
  evidence,
  {
    personsById = new Map(),
    personsByRut = new Map()
  } = {}
) {
  const personId =
    text(
      evidence?.personId
    ).trim();

  const rutEvidence =
    classifyRutEvidence(
      evidence?.rut
    );

  /*
   * Existing explicit person_id must be verified first.
   * Never silently relink an invalid/unknown explicit ID by RUT.
   */
  if (personId) {
    const linkedPerson =
      getPersonById(
        personsById,
        personId
      );

    if (!linkedPerson) {
      return Object.freeze({
        state: ResolutionState.UNRESOLVED,
        entityId: null,
        inputQuality:
          rutEvidence.inputQuality,
        canonicalRut:
          rutEvidence.canonical,
        reason: "UNKNOWN_PERSON_ID"
      });
    }

    if (
      rutEvidence.inputQuality ===
      InputQuality.MISSING
    ) {
      return Object.freeze({
        state: ResolutionState.RESOLVED,
        entityId: personId,
        inputQuality:
          InputQuality.MISSING,
        canonicalRut: "",
        reason:
          "RESOLVED_BY_EXISTING_PERSON_ID"
      });
    }

    if (!rutEvidence.valid) {
      return Object.freeze({
        state: ResolutionState.UNRESOLVED,
        entityId: null,
        inputQuality:
          rutEvidence.inputQuality,
        canonicalRut:
          rutEvidence.canonical,
        reason: "INVALID_RUT"
      });
    }

    const linkedRut =
      text(
        linkedPerson.rutNormalized ??
        linkedPerson.rut_normalized
      ).trim();

    const rutCandidates =
      resolveDistinctCandidates(
        getPersonCandidatesByRut(
          personsByRut,
          rutEvidence.canonical
        ),
        {
          unresolvedReason:
            "UNKNOWN_RUT",
          conflictReason:
            "DUPLICATE_RUT_CANDIDATES"
        }
      );

    /*
     * Explicit person and valid RUT must describe
     * the same durable identity.
     */
    if (
      linkedRut &&
      linkedRut !== rutEvidence.canonical
    ) {
      return Object.freeze({
        state: ResolutionState.CONFLICT,
        entityId: null,
        inputQuality:
          InputQuality.VALID,
        canonicalRut:
          rutEvidence.canonical,
        reason:
          "PERSON_ID_RUT_MISMATCH"
      });
    }

    if (
      rutCandidates.state ===
      ResolutionState.CONFLICT
    ) {
      return Object.freeze({
        state: ResolutionState.CONFLICT,
        entityId: null,
        inputQuality:
          InputQuality.VALID,
        canonicalRut:
          rutEvidence.canonical,
        reason:
          "DUPLICATE_RUT_CANDIDATES"
      });
    }

    if (
      rutCandidates.state ===
      ResolutionState.RESOLVED &&
      rutCandidates.entityId !==
        personId
    ) {
      return Object.freeze({
        state: ResolutionState.CONFLICT,
        entityId: null,
        inputQuality:
          InputQuality.VALID,
        canonicalRut:
          rutEvidence.canonical,
        reason:
          "PERSON_ID_RUT_MISMATCH"
      });
    }

    return Object.freeze({
      state: ResolutionState.RESOLVED,
      entityId: personId,
      inputQuality:
        InputQuality.VALID,
      canonicalRut:
        rutEvidence.canonical,
      reason: null
    });
  }

  /*
   * No durable person_id:
   * valid RUT is the only automatic person business key.
   */
  if (!rutEvidence.valid) {
    return Object.freeze({
      state: ResolutionState.UNRESOLVED,
      entityId: null,
      inputQuality:
        rutEvidence.inputQuality,
      canonicalRut:
        rutEvidence.canonical,
      reason:
        rutEvidence.reason
    });
  }

  const result =
    resolveDistinctCandidates(
      getPersonCandidatesByRut(
        personsByRut,
        rutEvidence.canonical
      ),
      {
        unresolvedReason:
          "UNKNOWN_RUT",
        conflictReason:
          "DUPLICATE_RUT_CANDIDATES"
      }
    );

  return Object.freeze({
    ...result,
    inputQuality:
      InputQuality.VALID,
    canonicalRut:
      rutEvidence.canonical
  });
}

export function resolveCompanyIdentity(
  value,
  indexes
) {
  return resolveExactLabelEntity(
    value,
    indexes,
    {
      missingReason:
        "MISSING_COMPANY",
      unknownReason:
        "UNKNOWN_COMPANY",
      conflictReason:
        "COMPANY_EXACT_CONFLICT"
    }
  );
}

export function resolveShiftIdentity(
  value,
  indexes
) {
  return resolveExactLabelEntity(
    value,
    indexes,
    {
      missingReason:
        "MISSING_SHIFT",
      unknownReason:
        "UNKNOWN_SHIFT",
      conflictReason:
        "SHIFT_EXACT_CONFLICT"
    }
  );
}