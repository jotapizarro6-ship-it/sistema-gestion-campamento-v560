import fs from "node:fs";
import assert from "node:assert/strict";

const migrationPath =
  new URL(
    "../supabase/migrations/20260919235000_p2_data_core_schema_foundations.sql",
    import.meta.url
  );

const sql =
  fs.readFileSync(
    migrationPath,
    "utf8"
  );

const executable =
  sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ");

const has =
  pattern =>
    pattern.test(executable);

const absent =
  pattern =>
    !pattern.test(executable);

/* ---------------------------------------------------------
 * Canonical person identity
 * --------------------------------------------------------- */

assert.ok(
  has(
    /create\s+table\s+if\s+not\s+exists\s+public\.persons/i
  )
);

assert.ok(
  has(
    /\brut_normalized\s+text/i
  )
);

assert.ok(
  has(
    /persons_rut_normalized_uidx/i
  )
);

assert.ok(
  absent(
    /references\s+(?:public\.)?workers\s*\(/i
  )
);

/* ---------------------------------------------------------
 * Company + shift normalization
 * --------------------------------------------------------- */

for (
  const table of [
    "companies",
    "company_aliases",
    "shifts",
    "shift_aliases"
  ]
) {
  assert.ok(
    has(
      new RegExp(
        String.raw`create\s+table\s+if\s+not\s+exists\s+public\.${table}\b`,
        "i"
      )
    ),
    `Missing ${table}`
  );
}

assert.ok(
  has(
    /company_aliases_normalized_uidx/i
  )
);

assert.ok(
  has(
    /shift_aliases_normalized_uidx/i
  )
);

/* ---------------------------------------------------------
 * Canonical physical hierarchy
 * --------------------------------------------------------- */

for (
  const table of [
    "camps",
    "camp_modules",
    "camp_rooms",
    "camp_beds"
  ]
) {
  assert.ok(
    has(
      new RegExp(
        String.raw`create\s+table\s+if\s+not\s+exists\s+public\.${table}\b`,
        "i"
      )
    ),
    `Missing ${table}`
  );
}

assert.ok(
  has(
    /camp_id\s+bigint\s+not\s+null[\s\S]*?references\s+public\.camps\(id\)/i
  )
);

assert.ok(
  has(
    /module_id\s+bigint\s+not\s+null[\s\S]*?references\s+public\.camp_modules\(id\)/i
  )
);

assert.ok(
  has(
    /room_id\s+bigint\s+not\s+null[\s\S]*?references\s+public\.camp_rooms\(id\)/i
  )
);

/* ---------------------------------------------------------
 * Temporal assignment
 * --------------------------------------------------------- */

assert.ok(
  has(
    /create\s+table\s+if\s+not\s+exists\s+public\.assignments/i
  )
);

assert.ok(
  has(
    /legacy_source\s+jsonb/i
  )
);

assert.ok(
  has(
    /valid_from\s+timestamptz\s*,/i
  )
);

assert.ok(
  absent(
    /valid_from\s+timestamptz\s+not\s+null/i
  )
);

assert.ok(
  has(
    /status\s*<>\s*'LEGACY_UNRESOLVED'[\s\S]*?person_id\s+is\s+not\s+null[\s\S]*?bed_id\s+is\s+not\s+null[\s\S]*?valid_from\s+is\s+not\s+null/i
  )
);

assert.ok(
  has(
    /assignments_identity_resolution_chk/i
  )
);

assert.ok(
  has(
    /assignments_one_active_person_uidx/i
  )
);

assert.ok(
  has(
    /assignments_one_active_bed_uidx/i
  )
);

assert.ok(
  has(
    /source_import_id\s+bigint[\s\S]*?references\s+public\.import_history\(id\)/i
  )
);

assert.ok(
  has(
    /source_operational_revision\s+bigint/i
  )
);

/* ---------------------------------------------------------
 * Reservation â†’ canonical person bridge
 * --------------------------------------------------------- */

assert.ok(
  has(
    /alter\s+table\s+public\.reservation_members[\s\S]*?add\s+column\s+if\s+not\s+exists\s+person_id\s+bigint/i
  )
);

assert.ok(
  has(
    /reservation_members_person_id_fkey/i
  )
);

assert.ok(
  has(
    /reservation_members_person_id_fkey[\s\S]*?not\s+valid/i
  )
);

assert.ok(
  has(
    /reservation_members_reservation_person_uidx/i
  )
);

/* ---------------------------------------------------------
 * Security
 * --------------------------------------------------------- */

for (
  const table of [
    "persons",
    "companies",
    "company_aliases",
    "shifts",
    "shift_aliases",
    "camps",
    "camp_modules",
    "camp_rooms",
    "camp_beds",
    "assignments"
  ]
) {
  assert.ok(
    has(
      new RegExp(
        String.raw`alter\s+table\s+public\.${table}\s+enable\s+row\s+level\s+security`,
        "i"
      )
    ),
    `RLS missing on ${table}`
  );
}

assert.ok(
  has(
    /revoke all on table public\.%I from public/i
  )
);

assert.ok(
  has(
    /grant select, insert, update, delete on table public\.%I to service_role/i
  )
);

assert.ok(
  absent(
    /grant\s+usage\s*,\s*select\s+on\s+all\s+sequences/i
  )
);

/* ---------------------------------------------------------
 * No premature cutover / no backfill
 * --------------------------------------------------------- */

for (
  const pattern of [
    /\balter\s+table\s+public\.workers\b/i,
    /\balter\s+table\s+public\.bed_inventory\b/i,
    /\balter\s+table\s+public\.reservations\b/i,
    /\balter\s+table\s+public\.movements\b/i,
    /\balter\s+table\s+public\.daily_capacity\b/i,
    /\balter\s+table\s+public\.daily_snapshots\b/i,
    /\balter\s+table\s+public\.audit_log\b/i,
    /\bdrop\s+table\b/i,
    /\bdrop\s+column\b/i,
    /\btruncate\b/i,
    /\binsert\s+into\b/i,
    /\bdelete\s+from\b/i,
    /\bcreate\s+(?:or\s+replace\s+)?trigger\b/i,
    /\bcreate\s+(?:or\s+replace\s+)?function\b/i
  ]
) {
  assert.ok(
    absent(pattern),
    `Forbidden P2.2 semantic: ${pattern}`
  );
}

/* ---------------------------------------------------------
 * Concurrency preservation
 * --------------------------------------------------------- */

for (
  const pattern of [
    /create\s+(?:or\s+replace\s+)?function\s+public\.claim_operational_revision/i,
    /alter\s+function\s+public\.claim_operational_revision/i,
    /drop\s+function[\s\S]*?claim_operational_revision/i,
    /alter\s+table\s+public\.settings/i,
    /insert\s+into\s+public\.settings/i,
    /update\s+public\.settings/i,
    /delete\s+from\s+public\.settings/i
  ]
) {
  assert.ok(
    absent(pattern),
    `Concurrency mutation detected: ${pattern}`
  );
}

/* ---------------------------------------------------------
 * Capacity V1 preservation
 * --------------------------------------------------------- */

assert.ok(
  absent(
    /(?<![0-9])132(?![0-9])/
  )
);

console.log(
  "P2 Data Core schema foundations static contract: OK"
);