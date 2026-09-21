import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const migrationRel =
  "supabase/migrations/20260921023000_p2_atomic_audit_coverage.sql";

const contractRel =
  "tests/p2-audit-coverage.contract.json";

const expectedMigrationBlob =
  "46d6fe82b5cf0f4ea256e983a80af2f6052c1747";

function assert(value, message) {
  if (!value) {
    throw new Error(
      "P2_5_AUDIT_COVERAGE_STATIC_FAILED: " +
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
    "GARPI_P2_5_AUDIT_COVERAGE",
  "unexpected contract"
);

assert(
  contract.phase ===
    "P2.5B_P2.5C_P2.5D",
  "unexpected phase"
);

assert(
  Array.isArray(
    contract.automatic_database_audit
  ),
  "coverage matrix missing"
);

assert(
  contract.automatic_database_audit.length === 21,
  `expected 21 audited tables, got ${contract.automatic_database_audit.length}`
);

const normalized =
  sql.replace(/\s+/g, " ");

for (
  const token of [
    "public.p2_audit_row_change()",
    "security definer",
    "set search_path = pg_catalog",
    "DATABASE_TRIGGER",
    "ROW_",
    "transaction_id",
    "old_fingerprint",
    "new_fingerprint",
    "pg_current_xact_id",
    "P2_AUDIT_TRIGGER_CONFIG",
    "P2_AUDIT_EXPECTED_TABLE_MISSING",
    "P2_AUDIT_EXPECTED_ID_KEY_MISSING",
  ]
) {
  assert(
    sql.toLowerCase().includes(
      token.toLowerCase()
    ),
    `missing token: ${token}`
  );
}

for (
  const entry of
    contract.automatic_database_audit
) {
  const signature =
    `{"table":"${entry.table}","entity_type":"${entry.entity_type}","id_key":"${entry.id_key}"}`;

  assert(
    sql.includes(signature),
    `coverage entry missing: ${entry.table}`
  );
}

for (
  const forbiddenTable of [
    "workers",
    "bed_inventory",
    "consultation_log",
    "audit_log",
    "p2_bed_resolution_current",
    "p2_bed_resolution_ledger",
  ]
) {
  const triggerPattern =
    new RegExp(
      `create\\s+trigger[\\s\\S]*?on\\s+public\\.${forbiddenTable}\\b`,
      "i"
    );

  assert(
    !triggerPattern.test(sql),
    `forbidden automatic trigger target: ${forbiddenTable}`
  );
}

assert(
  /after\s+insert\s+or\s+update\s+or\s+delete/i.test(
    normalized
  ),
  "atomic AFTER mutation trigger missing"
);

assert(
  /insert\s+into\s+public\.audit_log/i.test(
    normalized
  ),
  "audit insert missing"
);

assert(
  !/to_jsonb\s*\([^)]*\)\s*(?:as|,)?\s*(?:old_row|new_row|payload)/i.test(
    sql
  ),
  "full row payload alias introduced"
);

assert(
  !/jsonb_build_object\s*\([\s\S]*?['"](?:old|new|row|payload)['"]\s*,\s*to_jsonb/i.test(
    sql
  ),
  "full row JSON persisted in audit details"
);

assert(
  !/grant\s+execute\s+on\s+function\s+public\.p2_audit_row_change/i.test(
    normalized
  ),
  "direct trigger function execute grant introduced"
);

assert(
  !/^\s*(?:update|delete\s+from|truncate)\s+public\.audit_log\b/gim.test(
    sql
  ),
  "audit history mutation introduced"
);

assert(
  !/disable\s+row\s+level\s+security/i.test(
    sql
  ),
  "RLS disable introduced"
);

assert(
  !/alter\s+(?:table|function|sequence)\b[\s\S]*?\bowner\s+to\b/i.test(
    sql
  ),
  "ownership transfer introduced"
);

console.log(
  "P2.5 audit coverage static lock: OK"
);

console.log(
  `migration Git blob: ${blob}`
);
