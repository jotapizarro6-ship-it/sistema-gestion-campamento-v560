import assert from "node:assert/strict";
import fs from "node:fs";

const path = process.argv[2];
if (!path) throw new Error("contract path required");

const c = JSON.parse(fs.readFileSync(path, "utf8"));

assert.equal(c.contract, "GARPI_P2_4_REFERENTIAL_STATE_INTEGRITY");
assert.equal(c.version, "P2.4C-v1");

assert.equal(c.baseline.p2_4a, "CERTIFIED");
assert.equal(c.baseline.p2_4b, "CERTIFIED");
assert.equal(c.baseline.critical_gap_count, 5);
assert.equal(c.baseline.high_gap_count, 4);

assert.deepEqual(c.rollout.pattern, ["EXPAND","SHADOW","VALIDATE","CUTOVER","DEPRECATE_LEGACY"]);
assert.equal(c.rollout.destructive_rewrite, false);
assert.equal(c.rollout.fabricate_legacy_identity, false);
assert.equal(c.rollout.fabricate_historical_time, false);
assert.equal(c.rollout.fuzzy_linking, false);

assert.deepEqual(c.assignments.states, ["ACTIVA","FINALIZADA","CANCELADA","LEGACY_UNRESOLVED"]);
assert.deepEqual(c.assignments.transitions.ACTIVA, ["FINALIZADA","CANCELADA"]);
assert.deepEqual(c.assignments.transitions.FINALIZADA, []);
assert.deepEqual(c.assignments.transitions.CANCELADA, []);
assert.deepEqual(c.assignments.transitions.LEGACY_UNRESOLVED, []);

assert.deepEqual(c.reservations.states, ["PENDIENTE","CONFIRMADA","CANCELADA","ANULADA"]);
assert.deepEqual(c.reservations.active_states, ["PENDIENTE","CONFIRMADA"]);
assert.deepEqual(c.reservations.transitions.PENDIENTE, ["CONFIRMADA","CANCELADA","ANULADA"]);
assert.deepEqual(c.reservations.transitions.CONFIRMADA, ["CANCELADA","ANULADA"]);
assert.deepEqual(c.reservations.transitions.CANCELADA, []);
assert.deepEqual(c.reservations.transitions.ANULADA, []);
assert.equal(c.reservations.terminal_reopen, false);
assert.equal(c.reservations.interval, "[arrival_date,departure_date)");
assert.equal(c.reservations.canonical_bed.missing_mapping, "UNRESOLVED");
assert.equal(c.reservations.canonical_bed.ambiguous_mapping, "CONFLICT");
assert.equal(c.reservations.canonical_bed.mismatch, "FAIL_CLOSED");

assert.deepEqual(c.movements.states, ["PROGRAMADO","EJECUTADO","CANCELADO","LEGACY_UNRESOLVED"]);
assert.deepEqual(c.movements.transitions.PROGRAMADO, ["EJECUTADO","CANCELADO"]);
assert.deepEqual(c.movements.transitions.EJECUTADO, []);
assert.deepEqual(c.movements.transitions.CANCELADO, []);
assert.deepEqual(c.movements.transitions.LEGACY_UNRESOLVED, []);
assert.ok(c.movements.timestamp_rules.EJECUTADO.includes("executed_at IS NOT NULL"));
assert.ok(c.movements.timestamp_rules.CANCELADO.includes("cancelled_at IS NOT NULL"));

assert.deepEqual(c.bed_blocks.states, ["ACTIVO","CERRADO"]);
assert.deepEqual(c.bed_blocks.transitions.ACTIVO, ["CERRADO"]);
assert.deepEqual(c.bed_blocks.transitions.CERRADO, []);
assert.equal(c.bed_blocks.canonical_bed.missing_mapping, "UNRESOLVED");
assert.equal(c.bed_blocks.canonical_bed.ambiguous_mapping, "CONFLICT");

assert.equal(c.cross_entity.invariants.length, 5);
assert.ok(c.cross_entity.invariants.some(x => x.includes("concurrency-safe")));

assert.equal(c.p2_4b_gaps.critical.length, 5);
assert.equal(c.p2_4b_gaps.high.length, 4);
assert.equal(c.existing_db_claims_requiring_exact_object_proof.length, 3);

assert.ok(c.implementation_rules.some(x => x.includes("NOT VALID")));
assert.ok(c.implementation_rules.some(x => x.includes("transition guards")));
assert.ok(c.implementation_rules.some(x => x.includes("canonical bed_id")));
assert.ok(c.implementation_rules.some(x => x.includes("workers.id")));
assert.ok(c.implementation_rules.some(x => x.includes("person_name")));
assert.ok(c.implementation_rules.some(x => x.includes("aggregate movements")));

assert.ok(c.non_goals.includes("production backfill"));
assert.ok(c.non_goals.includes("runtime cutover"));
assert.ok(c.non_goals.includes("campamento-api source reconciliation"));

console.log("P2.4 canonical referential + state integrity contract: OK");
