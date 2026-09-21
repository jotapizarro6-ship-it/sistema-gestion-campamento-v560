import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const migrationRel =
  "supabase/migrations/20260921043000_p2_typed_atomic_mutation_rpcs.sql";

const contractRel =
  "tests/p2-typed-atomic-mutations.contract.json";

const expectedMigrationBlob =
  "af91b60592aa5368fffd8401b63e2f67f6666064";

function assert(value, message) {
  if (!value) {
    throw new Error(
      "P2_6B_TYPED_ATOMIC_STATIC_FAILED: " +
      message
    );
  }
}

const migrationPath =
  path.resolve(process.cwd(), migrationRel);

const contractPath =
  path.resolve(process.cwd(), contractRel);

assert(
  fs.existsSync(migrationPath),
  "migration missing"
);

assert(
  fs.existsSync(contractPath),
  "contract missing"
);

const raw =
  fs.readFileSync(migrationPath);

const sql =
  raw.toString("utf8");

const contract =
  JSON.parse(
    fs.readFileSync(
      contractPath,
      "utf8"
    )
  );

const blobHeader =
  Buffer.from(
    `blob ${raw.length}\0`,
    "utf8"
  );

const blob =
  crypto
    .createHash("sha1")
    .update(blobHeader)
    .update(raw)
    .digest("hex");

assert(
  blob === expectedMigrationBlob,
  `migration Git blob drift: ${blob}`
);

assert(
  contract.contract ===
    "GARPI_P2_6_TYPED_ATOMIC_MUTATIONS",
  "unexpected contract"
);

assert(
  contract.phase === "P2.6B",
  "unexpected phase"
);

const rpcNames = [
  "p2_create_movement",
  "p2_transition_movement",
  "p2_create_reservation",
  "p2_set_reservation_status",
  "p2_create_bed_block",
  "p2_close_bed_block",
  "p2_upsert_daily_capacity",
  "p2_set_cost_per_bed_day",
];

for (const rpc of rpcNames) {
  assert(
    new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+public\\.${rpc}\\b`,
      "i"
    ).test(sql),
    `typed RPC missing: ${rpc}`
  );
}

for (
  const helper of [
    "p2_lock_operational_revision",
    "p2_read_operational_revision",
    "p2_require_row_revision",
  ]
) {
  assert(
    new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+public\\.${helper}\\b`,
      "i"
    ).test(sql),
    `internal helper missing: ${helper}`
  );
}

const normalized =
  sql.replace(/\s+/g, " ");

for (
  const token of [
    "P2_STATE_CONFLICT",
    "P2_ROW_CONFLICT",
    "P2_NOT_FOUND",
    "using errcode = '40001'",
    "for update",
    "set search_path = pg_catalog",
    "P2_RESERVATION_OVERLAPS_BED_BLOCK",
    "P2_RESERVATION_OVERLAPS_ACTIVE_RESERVATION",
    "P2_BLOCK_OVERLAPS_ACTIVE_BLOCK",
    "P2_BLOCK_OVERLAPS_ACTIVE_RESERVATION",
    "P2_BED_CURRENTLY_OCCUPIED",
    "P2_EXACT_BED_REQUIRES_SINGLE_BED_COUNT",
  ]
) {
  assert(
    sql.toLowerCase().includes(
      token.toLowerCase()
    ),
    `missing token: ${token}`
  );
}

assert(
  /create\s+or\s+replace\s+function\s+public\.p2_lock_operational_revision[\s\S]*?security\s+definer[\s\S]*?set\s+search_path\s*=\s*pg_catalog/i.test(
    sql
  ),
  "operational revision lock hardening missing"
);

assert(
  /select\s+s\.value[\s\S]*?from\s+public\.settings\s+s[\s\S]*?where\s+s\.key\s*=\s*'operational_revision'[\s\S]*?for\s+update/i.test(
    sql
  ),
  "revision row lock missing"
);

const movementBodyMatch =
  sql.match(
    /create\s+or\s+replace\s+function\s+public\.p2_create_movement[\s\S]*?as\s+\$p2_create_movement\$([\s\S]*?)\$p2_create_movement\$;/i
  );

assert(
  movementBodyMatch,
  "movement RPC body not found"
);

assert(
  !/update\s+public\.settings[\s\S]*?operational_revision/i.test(
    movementBodyMatch[1]
  ),
  "movement RPC must not manually double-advance R4 revision"
);

assert(
  /settings is intentionally not part of the legacy R4 statement-level/i.test(
    sql
  ),
  "settings compatibility explanation missing"
);

assert(
  /update\s+public\.settings\s+set\s+value\s*=\s*\(v_current\s*\+\s*1\)::text\s+where\s+key\s*=\s*'operational_revision'/i.test(
    normalized
  ),
  "cost RPC explicit revision advance missing"
);

assert(
  /v_row\.status\s*=\s*v_status[\s\S]*?'idempotent'[\s\S]*?true/i.test(
    sql
  ),
  "reservation status idempotency missing"
);

assert(
  /v_row\.status\s*=\s*'CERRADO'[\s\S]*?'idempotent'[\s\S]*?true/i.test(
    sql
  ),
  "block close idempotency missing"
);

assert(
  /v_existing\.capacity\s*=\s*p_capacity[\s\S]*?'idempotent'[\s\S]*?true/i.test(
    sql
  ),
  "capacity idempotency missing"
);

assert(
  /v_existing\.value\s*=\s*v_text_value[\s\S]*?'idempotent'[\s\S]*?true/i.test(
    sql
  ),
  "cost idempotency missing"
);

const serviceGrantCount =
  (
    normalized.match(
      /grant execute on function public\.p2_(?:create_movement|transition_movement|create_reservation|set_reservation_status|create_bed_block|close_bed_block|upsert_daily_capacity|set_cost_per_bed_day)\([^;]+?\) to service_role/g
    ) || []
  ).length;

assert(
  serviceGrantCount === 8,
  `expected 8 service RPC grants, got ${serviceGrantCount}`
);

for (
  const helper of [
    "p2_lock_operational_revision",
    "p2_read_operational_revision",
    "p2_require_row_revision",
  ]
) {
  assert(
    !new RegExp(
      `grant\\s+execute\\s+on\\s+function\\s+public\\.${helper}\\b`,
      "i"
    ).test(sql),
    `internal helper execute grant introduced: ${helper}`
  );
}

assert(
  !/disable\s+row\s+level\s+security/i.test(sql),
  "RLS disable introduced"
);

assert(
  !/alter\s+(?:table|function|sequence)\b[\s\S]*?\bowner\s+to\b/i.test(
    sql
  ),
  "ownership transfer introduced"
);

assert(
  !/force\s+row\s+level\s+security/i.test(sql),
  "unexpected FORCE RLS introduced"
);

console.log(
  "P2.6B typed atomic mutation static lock: OK"
);

console.log(
  `migration Git blob: ${blob}`
);
