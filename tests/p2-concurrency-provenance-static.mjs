import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const migrationRel =
  "supabase/migrations/20260921033000_p2_concurrency_provenance_foundations.sql";

const contractRel =
  "tests/p2-concurrency-provenance.contract.json";

const expectedMigrationBlob =
  "c5faaad07489b0ecc137f576772f9ee7edbeebbd";

function assert(value, message) {
  if (!value) {
    throw new Error(
      "P2_6_CONCURRENCY_PROVENANCE_STATIC_FAILED: " +
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

const canonicalRaw = Buffer.from(
  raw
    .toString("utf8")
    .replace(/\r\n/g, "\n"),
  "utf8"
);
const blobHeader =
  Buffer.from(
    `blob ${canonicalRaw.length}\0`,
    "utf8"
  );

const blob =
  crypto
    .createHash("sha1")
    .update(blobHeader)
    .update(canonicalRaw)
    .digest("hex");

assert(
  blob === expectedMigrationBlob,
  `migration Git blob drift: ${blob}`
);

assert(
  contract.contract ===
    "GARPI_P2_6_CONCURRENCY_PROVENANCE",
  "unexpected contract"
);

assert(
  contract.phase === "P2.6A",
  "unexpected phase"
);

assert(
  Array.isArray(contract.row_revision_tables),
  "row revision table set missing"
);

assert(
  contract.row_revision_tables.length === 21,
  `expected 21 row revision tables, got ${contract.row_revision_tables.length}`
);

const normalized =
  sql.replace(/\s+/g, " ");

for (
  const token of [
    "public.p2_bump_row_revision()",
    "public.p2_require_operational_revision",
    "P2_STATE_CONFLICT",
    "40001",
    "row_revision bigint not null default 1",
    "p2_row_revision_bu",
    "source_operational_revision",
    "old_row_revision",
    "new_row_revision",
    "public.claim_operational_revision",
    "set search_path = pg_catalog",
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
  const table of
    contract.row_revision_tables
) {
  assert(
    sql.includes(`'${table}'`),
    `row revision table missing: ${table}`
  );
}

assert(
  /create\s+or\s+replace\s+function\s+public\.claim_operational_revision[\s\S]*?security\s+definer[\s\S]*?set\s+search_path\s*=\s*pg_catalog/i.test(
    sql
  ),
  "claim_operational_revision hardening missing"
);

assert(
  /for\s+update/i.test(sql),
  "operational revision row lock missing"
);

assert(
  /create\s+or\s+replace\s+function\s+public\.p2_require_operational_revision[\s\S]*?security\s+definer[\s\S]*?set\s+search_path\s*=\s*pg_catalog/i.test(
    sql
  ),
  "atomic conflict helper hardening missing"
);

assert(
  /using\s+errcode\s*=\s*'40001'/i.test(
    sql
  ),
  "real conflict SQLSTATE missing"
);

assert(
  /before\s+update/i.test(
    normalized
  ),
  "row revision BEFORE UPDATE trigger missing"
);

assert(
  /to_jsonb\s*\(old\)\s*-\s*'row_revision'/i.test(
    sql
  ),
  "old business payload comparison missing"
);

assert(
  /to_jsonb\s*\(new\)\s*-\s*'row_revision'/i.test(
    sql
  ),
  "new business payload comparison missing"
);

assert(
  !/grant\s+execute\s+on\s+function\s+public\.p2_require_operational_revision/i.test(
    normalized
  ),
  "internal conflict helper must not be granted directly"
);

assert(
  !/grant\s+execute\s+on\s+function\s+public\.p2_bump_row_revision/i.test(
    normalized
  ),
  "row revision trigger function must not be granted directly"
);

assert(
  /grant\s+execute\s+on\s+function\s+public\.claim_operational_revision\(bigint\)\s+to\s+service_role/i.test(
    normalized
  ),
  "compatibility claim execute grant missing"
);

assert(
  sql.includes(
    "= 'operational_revision'"
  ),
  "operational revision audit exclusion missing"
);

for (
  const secretKey of [
    "admin_password_hash",
    "admin_password_salt",
    "session_secret",
  ]
) {
  assert(
    sql.includes(secretKey),
    `secret fingerprint suppression missing: ${secretKey}`
  );
}

assert(
  !/request_id|correlation_id/i.test(sql),
  "P2.6A must not fabricate request/correlation provenance"
);

assert(
  !/alter\s+(?:table|function|sequence)\b[\s\S]*?\bowner\s+to\b/i.test(
    sql
  ),
  "ownership transfer introduced"
);

assert(
  !/disable\s+row\s+level\s+security/i.test(
    sql
  ),
  "RLS disable introduced"
);

console.log(
  "P2.6 concurrency provenance static lock: OK"
);

console.log(
  `migration Git blob: ${blob}`
);
