"use strict";

/*
 * GARPI P2.3E shadow resolution.
 *
 * This module is diagnostic only.
 *
 * It:
 * - does not write to a database
 * - does not create canonical entities
 * - does not mutate workers
 * - does not mutate canonical inputs
 * - does not use workers.id as durable identity
 * - does not expose raw worker PII in result rows
 * - does not make a cutover decision
 */

function text(value) {
  return String(value ?? "").trim();
}

function own(object, key) {
  return (
    object !== null &&
    typeof object === "object" &&
    Object.prototype.hasOwnProperty.call(
      object,
      key
    )
  );
}

function entityId(entity) {
  if (
    entity === null ||
    entity === undefined
  ) {
    return null;
  }

  if (
    typeof entity !== "object" ||
    !own(entity, "id")
  ) {
    return null;
  }

  const id =
    text(entity.id);

  return id || null;
}

function addIndexValue(
  map,
  key,
  id
) {
  if (!key || !id) {
    return;
  }

  const current =
    map.get(key) ?? [];

  if (!current.includes(id)) {
    map.set(
      key,
      [
        ...current,
        id
      ]
    );
  }
}

function freezeCounts(value) {
  return Object.freeze({
    RESOLVED:
      Number(value.RESOLVED ?? 0),
    UNRESOLVED:
      Number(value.UNRESOLVED ?? 0),
    CONFLICT:
      Number(value.CONFLICT ?? 0)
  });
}

function newCounts() {
  return {
    RESOLVED: 0,
    UNRESOLVED: 0,
    CONFLICT: 0
  };
}

function addState(
  counts,
  state
) {
  if (own(counts, state)) {
    counts[state] += 1;
  }
}

function safeResult(result) {
  return Object.freeze({
    state:
      result?.state ?? "UNRESOLVED",
    entityId:
      result?.entityId ?? null,
    reason:
      result?.reason ?? null,
    inputQuality:
      result?.inputQuality ?? null
  });
}

export function buildIdentityIndexes(
  canonical,
  resolver
) {
  if (
    !resolver ||
    typeof resolver.classifyRutEvidence !== "function" ||
    typeof resolver.normalizeCanonicalLabel !== "function"
  ) {
    throw new TypeError(
      "A valid GARPI identity resolver is required."
    );
  }

  const personsById =
    new Map();

  const personsByRut =
    new Map();

  const companyCanonical =
    new Map();

  const companyAliases =
    new Map();

  const shiftCanonical =
    new Map();

  const shiftAliases =
    new Map();

  /*
   * Alias targets are only eligible when their canonical
   * entity row was itself accepted as valid shadow input.
   */
  const validCompanyIds =
    new Set();

  const validShiftIds =
    new Set();

  const diagnostics = {
    invalidPersonRows: 0,
    invalidPersonRut: 0,
    invalidCompanyRows: 0,
    invalidCompanyAliasRows: 0,
    danglingCompanyAliasTargets: 0,
    invalidShiftRows: 0,
    invalidShiftAliasRows: 0,
    danglingShiftAliasTargets: 0
  };

  for (
    const person of
    Array.isArray(canonical?.persons)
      ? canonical.persons
      : []
  ) {
    const id =
      entityId(person);

    if (!id) {
      diagnostics.invalidPersonRows += 1;
      continue;
    }

    /*
     * Preserve explicit entity lookup.
     * Database PK uniqueness is assumed for real rows,
     * but shadow code never invents a replacement.
     */
    if (!personsById.has(id)) {
      personsById.set(
        id,
        person
      );
    }

    const rawRut =
      text(
        person.rut_normalized ??
        person.rutNormalized
      );

    if (!rawRut) {
      continue;
    }

    const evidence =
      resolver.classifyRutEvidence(
        rawRut
      );

    if (!evidence.valid) {
      diagnostics.invalidPersonRut += 1;
      continue;
    }

    addIndexValue(
      personsByRut,
      evidence.canonical,
      id
    );
  }

  for (
    const company of
    Array.isArray(canonical?.companies)
      ? canonical.companies
      : []
  ) {
    const id =
      entityId(company);

    const rawKey =
      text(
        company?.normalized_key ??
        company?.normalizedKey
      );

    if (!id || !rawKey) {
      diagnostics.invalidCompanyRows += 1;
      continue;
    }

    validCompanyIds.add(
      id
    );

    const key =
      resolver.normalizeCanonicalLabel(
        rawKey
      );

    addIndexValue(
      companyCanonical,
      key,
      id
    );
  }

  for (
    const alias of
    Array.isArray(canonical?.companyAliases)
      ? canonical.companyAliases
      : []
  ) {
    const id =
      text(
        alias?.company_id ??
        alias?.companyId
      );

    const rawKey =
      text(
        alias?.normalized_key ??
        alias?.normalizedKey
      );

    if (!id || !rawKey) {
      diagnostics.invalidCompanyAliasRows += 1;
      continue;
    }

    if (
      !validCompanyIds.has(id)
    ) {
      diagnostics.danglingCompanyAliasTargets += 1;
      continue;
    }

    const key =
      resolver.normalizeCanonicalLabel(
        rawKey
      );

    addIndexValue(
      companyAliases,
      key,
      id
    );
  }

  for (
    const shift of
    Array.isArray(canonical?.shifts)
      ? canonical.shifts
      : []
  ) {
    const id =
      entityId(shift);

    const rawCode =
      text(
        shift?.code
      );

    if (!id || !rawCode) {
      diagnostics.invalidShiftRows += 1;
      continue;
    }

    validShiftIds.add(
      id
    );

    const key =
      resolver.normalizeCanonicalLabel(
        rawCode
      );

    addIndexValue(
      shiftCanonical,
      key,
      id
    );
  }

  for (
    const alias of
    Array.isArray(canonical?.shiftAliases)
      ? canonical.shiftAliases
      : []
  ) {
    const id =
      text(
        alias?.shift_id ??
        alias?.shiftId
      );

    const rawKey =
      text(
        alias?.normalized_key ??
        alias?.normalizedKey
      );

    if (!id || !rawKey) {
      diagnostics.invalidShiftAliasRows += 1;
      continue;
    }

    if (
      !validShiftIds.has(id)
    ) {
      diagnostics.danglingShiftAliasTargets += 1;
      continue;
    }

    const key =
      resolver.normalizeCanonicalLabel(
        rawKey
      );

    addIndexValue(
      shiftAliases,
      key,
      id
    );
  }

  return Object.freeze({
    persons: Object.freeze({
      personsById,
      personsByRut
    }),

    companies: Object.freeze({
      canonical:
        companyCanonical,
      aliases:
        companyAliases
    }),

    shifts: Object.freeze({
      canonical:
        shiftCanonical,
      aliases:
        shiftAliases
    }),

    diagnostics:
      Object.freeze({
        ...diagnostics
      })
  });
}

export function shadowWorker(
  worker,
  sourceIndex,
  indexes,
  resolver
) {
  if (!resolver) {
    throw new TypeError(
      "A valid GARPI identity resolver is required."
    );
  }

  /*
   * IMPORTANT:
   * worker.id is deliberately ignored.
   *
   * workers is the current operational projection,
   * not durable historical identity.
   */
  const person =
    resolver.resolvePersonIdentity(
      {
        rut:
          worker?.rut
      },
      indexes?.persons
    );

  const company =
    resolver.resolveCompanyIdentity(
      worker?.empresa,
      indexes?.companies
    );

  const shift =
    resolver.resolveShiftIdentity(
      worker?.turno,
      indexes?.shifts
    );

  return Object.freeze({
    sourceIndex,

    person:
      safeResult(person),

    company:
      safeResult(company),

    shift:
      safeResult(shift)
  });
}

export function summarizeShadowRows(
  rows
) {
  const person =
    newCounts();

  const company =
    newCounts();

  const shift =
    newCounts();

  let fullyResolved = 0;
  let rowsWithConflict = 0;
  let rowsWithUnresolved = 0;

  const reasons = new Map();

  for (const row of rows) {
    addState(
      person,
      row.person.state
    );

    addState(
      company,
      row.company.state
    );

    addState(
      shift,
      row.shift.state
    );

    const states = [
      row.person.state,
      row.company.state,
      row.shift.state
    ];

    if (
      states.every(
        state =>
          state === "RESOLVED"
      )
    ) {
      fullyResolved += 1;
    }

    if (
      states.includes(
        "CONFLICT"
      )
    ) {
      rowsWithConflict += 1;
    }

    if (
      states.includes(
        "UNRESOLVED"
      )
    ) {
      rowsWithUnresolved += 1;
    }

    for (
      const dimension of
      [
        ["PERSON", row.person],
        ["COMPANY", row.company],
        ["SHIFT", row.shift]
      ]
    ) {
      const [
        domain,
        result
      ] = dimension;

      if (!result.reason) {
        continue;
      }

      const key =
        `${domain}:${result.reason}`;

      reasons.set(
        key,
        (reasons.get(key) ?? 0) + 1
      );
    }
  }

  return Object.freeze({
    totalRows:
      rows.length,

    person:
      freezeCounts(person),

    company:
      freezeCounts(company),

    shift:
      freezeCounts(shift),

    fullyResolved,

    rowsWithConflict,

    rowsWithUnresolved,

    reasons:
      Object.freeze(
        Object.fromEntries(
          [...reasons.entries()]
            .sort(
              (a, b) =>
                a[0].localeCompare(
                  b[0]
                )
            )
        )
      )
  });
}

export function shadowWorkers(
  workers,
  indexes,
  resolver
) {
  const source =
    Array.isArray(workers)
      ? workers
      : [];

  const rows =
    source.map(
      (worker, index) =>
        shadowWorker(
          worker,
          index,
          indexes,
          resolver
        )
    );

  return Object.freeze({
    rows:
      Object.freeze(rows),

    summary:
      summarizeShadowRows(
        rows
      ),

    indexDiagnostics:
      indexes?.diagnostics ??
      Object.freeze({})
  });
}