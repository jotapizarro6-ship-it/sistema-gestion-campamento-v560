import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const migrationRel =
  "supabase/migrations/20260920210000_p2_shadow_validate_readiness.sql";

const expectedSha =
  "8E7DE51B3886124B4228489BD36B179C87C1E4118B7A2B8A1FA21534A54AFB67";

const migration =
  path.resolve(process.cwd(), migrationRel);

function assert(value, message) {
  if (!value) {
    throw new Error(
      "P2_E1_STATIC_LOCK_FAILED: " + message
    );
  }
}

assert(
  fs.existsSync(migration),
  "migration missing"
);

const raw =
  fs.readFileSync(migration);

const sql =
  raw.toString("utf8");

const sha =
  crypto
    .createHash("sha256")
    .update(raw)
    .digest("hex")
    .toUpperCase();

assert(
  sha === expectedSha,
  `migration SHA drift: ${sha}`
);

const functionCount =
  (
    sql.match(
      /^\s*create\s+or\s+replace\s+function\s+public\.p2_[A-Za-z0-9_]+\s*\(/gim
    ) || []
  ).length;

assert(
  functionCount === 16,
  `expected 16 P2 functions, got ${functionCount}`
);

const refreshCount =
  (
    sql.match(
      /^\s*create\s+or\s+replace\s+function\s+public\.p2_refresh_canonical_bed_shadow\s*\(\s*p_import_id\s+bigint\s*\)/gim
    ) || []
  ).length;

assert(
  refreshCount === 1,
  `refresh(bigint) count: ${refreshCount}`
);

for (
  const token of [
    "P2_STALE_IMPORT_REPLAY",
    "CONFLICT_CANONICAL_MISMATCH",
    "ROOM_TYPE_MISMATCH",
    "p2_shadow_readiness_v",
    "p2_guard_ledger_append_only",
  ]
) {
  assert(
    sql.includes(token),
    `missing token: ${token}`
  );
}

assert(
  /security_invoker\s*=\s*true/i.test(sql),
  "readiness view must remain security_invoker=true"
);

assert(
  !/\bgrant\s+execute\b/i.test(sql),
  "direct function EXECUTE grant introduced"
);

assert(
  !/\bvalidate\s+constraint\b/i.test(sql),
  "VALIDATE CONSTRAINT introduced in E1"
);

assert(
  !/\bcreate\s+extension\b/i.test(sql),
  "extension creation introduced in E1"
);

assert(
  !/\bpg_advisory_/i.test(sql),
  "advisory locking introduced before P2.6"
);

assert(
  !/\bexclude\s+using\s+gist\b/i.test(sql),
  "GiST exclusion introduced before its certified gate"
);

assert(
  !/\bforce\s+row\s+level\s+security\b/i.test(sql),
  "FORCE RLS introduced"
);

assert(
  !/\bdisable\s+row\s+level\s+security\b/i.test(sql),
  "RLS disable introduced"
);

assert(
  !/\balter\s+(?:function|table|view|sequence)\b[\s\S]*?\bowner\s+to\b/i.test(sql),
  "ownership transfer introduced"
);

const staleReplayCount =
  (
    sql.match(
      /P2_STALE_IMPORT_REPLAY/g
    ) || []
  ).length;

assert(
  staleReplayCount === 1,
  `stale replay token count: ${staleReplayCount}`
);

const mismatchCount =
  (
    sql.match(
      /CONFLICT_CANONICAL_MISMATCH/g
    ) || []
  ).length;

assert(
  mismatchCount >= 1,
  "canonical mismatch state missing"
);

const reasonCount =
  (
    sql.match(
      /ROOM_TYPE_MISMATCH/g
    ) || []
  ).length;

assert(
  reasonCount >= 1,
  "room_type mismatch reason missing"
);

assert(
  /create\s+trigger\s+import_history_p2_bed_shadow_ai/i.test(sql),
  "import shadow trigger missing"
);

assert(
  /create\s+trigger\s+reservations_p2_shadow_bi/i.test(sql),
  "reservation BEFORE INSERT trigger missing"
);

assert(
  /create\s+trigger\s+bed_blocks_p2_shadow_bi/i.test(sql),
  "bed-block BEFORE INSERT trigger missing"
);

assert(
  /revoke\s+all\s+on\s+table\s+public\.p2_bed_resolution_current/i.test(sql),
  "current shadow table hardening missing"
);

assert(
  /revoke\s+all\s+on\s+table\s+public\.p2_bed_resolution_ledger/i.test(sql),
  "ledger shadow table hardening missing"
);

assert(
  /grant\s+select\s+on\s+table\s+public\.p2_shadow_readiness_v\s+to\s+service_role/i.test(sql),
  "service readiness SELECT missing"
);

console.log(
  "P2 E1 shadow/validate readiness static lock: OK"
);
console.log(
  `migration SHA256: ${sha}`
);