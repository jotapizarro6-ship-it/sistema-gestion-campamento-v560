import fs from "node:fs";
import assert from "node:assert/strict";

const path =
  new URL(
    "./p2-data-core-canonical.contract.json",
    import.meta.url
  );

const contract =
  JSON.parse(
    fs.readFileSync(path, "utf8")
  );

assert.equal(
  contract.contract,
  "GARPI_P2_DATA_CORE_CANONICAL"
);

assert.equal(
  contract.revision,
  1
);

assert.equal(
  contract.semantic_version,
  "P2-DATA-CORE-V1"
);

assert.equal(
  contract.release_strategy,
  "EXPAND_SHADOW_VALIDATE_CUTOVER"
);

const requiredEntities = [
  "person",
  "company",
  "shift",
  "camp",
  "module",
  "room",
  "bed",
  "assignment",
  "reservation",
  "reservation_member",
  "movement",
  "movement_member",
  "bed_block",
  "daily_capacity",
  "snapshot",
  "import",
  "audit_event"
];

for (const entity of requiredEntities) {
  assert.ok(
    contract.entities?.[entity],
    `Missing canonical entity: ${entity}`
  );
}

assert.equal(
  contract.entities.person.internal_identity,
  "person_id"
);

assert.equal(
  contract.entities.person.business_key,
  "rut_normalized"
);

assert.equal(
  contract.entities.reservation_member.worker_fk,
  "FORBIDDEN"
);

assert.equal(
  contract.entities.assignment.internal_identity,
  "assignment_id"
);

assert.deepEqual(
  contract.entities.assignment.states,
  [
    "ACTIVA",
    "FINALIZADA",
    "CANCELADA",
    "LEGACY_UNRESOLVED"
  ]
);

assert.deepEqual(
  contract.entities.reservation.active_states,
  [
    "PENDIENTE",
    "CONFIRMADA"
  ]
);

assert.deepEqual(
  contract.entities.reservation.inactive_states,
  [
    "CANCELADA",
    "ANULADA"
  ]
);

assert.equal(
  contract.entities.reservation.interval_semantics,
  "[arrival_date,departure_date)"
);

assert.deepEqual(
  contract.entities.movement.states,
  [
    "PROGRAMADO",
    "EJECUTADO",
    "CANCELADO",
    "LEGACY_UNRESOLVED"
  ]
);

assert.equal(
  contract.entities.movement.independent_from_reservation,
  true
);

assert.equal(
  contract.entities.movement_member.required_for_existing_movements,
  false
);

assert.equal(
  contract.entities.daily_capacity.legacy_132,
  "FORBIDDEN_RUNTIME_FALLBACK"
);

assert.equal(
  contract.entities.snapshot.provenance_required_for_new_closures,
  true
);

assert.equal(
  contract.entities.audit_event.target_mode,
  "APPEND_ONLY"
);

assert.equal(
  contract.concurrency.current_contract,
  "operational_revision"
);

assert.equal(
  contract.concurrency.last_write_wins,
  "FORBIDDEN"
);

const globals =
  new Set(
    contract.global_invariants || []
  );

assert.ok(
  globals.has(
    "workers.id is not durable historical person identity"
  )
);

assert.ok(
  globals.has(
    "person identity is never inferred from person_name alone"
  )
);

assert.ok(
  globals.has(
    "historical relationships are never fabricated when evidence is insufficient"
  )
);

const forbidden =
  new Set(
    contract.migration_policy
      ?.forbidden_before_cutover || []
  );

for (
  const item of [
    "DROP legacy business table",
    "DROP legacy business column",
    "TRUNCATE legacy business history",
    "rewrite historical identity from person_name",
    "manufacture movement members from people_count",
    "silent fuzzy company merges",
    "silent fuzzy shift merges",
    "remove certified Capacity V1 semantics",
    "replace operational_revision without certified compatibility"
  ]
) {
  assert.ok(
    forbidden.has(item),
    `Missing forbidden migration rule: ${item}`
  );
}

console.log(
  "P2 canonical Data Core contract: OK"
);