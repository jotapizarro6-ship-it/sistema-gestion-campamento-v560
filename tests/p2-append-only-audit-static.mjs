import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const migrationRel =
  "supabase/migrations/20260921013000_p2_append_only_audit_hardening.sql";

const contractRel =
  "tests/p2-append-only-audit.contract.json";

const expectedMigrationSha =
  "85E0511937466ADC31C0C37634A092EF3EC4B28A9855E0399A26AD3230E52A4B";

function assert(value, message) {
  if (!value) {
    throw new Error(
      "P2_5_AUDIT_STATIC_LOCK_FAILED: " + message
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

const sha =
  crypto
    .createHash("sha256")
    .update(raw)
    .digest("hex")
    .toUpperCase();

assert(
  sha === expectedMigrationSha,
  `migration SHA drift: ${sha}`
);

assert(
  contract.contract ===
    "GARPI_P2_5_APPEND_ONLY_AUDIT",
  "unexpected contract"
);

assert(
  contract.phase === "P2.5A",
  "unexpected phase"
);

for (
  const token of [
    "public.p2_guard_audit_log_append_only()",
    "audit_log_p2_no_update_delete",
    "audit_log_p2_no_truncate",
    "audit_log_p2_action_nonblank_chk",
    "P2_AUDIT_APPEND_ONLY",
    "grant select, insert",
    "audit_log_p2_service_select",
    "audit_log_p2_service_insert",
    "enable row level security",
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
  /set\s+search_path\s*=\s*pg_catalog/i.test(sql),
  "guard search_path must remain pg_catalog"
);

assert(
  /before\s+update\s+or\s+delete\s+on\s+public\.audit_log/i.test(
    sql.replace(/\s+/g, " ")
  ),
  "UPDATE/DELETE append-only trigger missing"
);

assert(
  /before\s+truncate\s+on\s+public\.audit_log/i.test(
    sql.replace(/\s+/g, " ")
  ),
  "TRUNCATE append-only trigger missing"
);

assert(
  /revoke\s+all\s+on\s+table\s+public\.audit_log\s+from\s+service_role/i.test(
    sql.replace(/\s+/g, " ")
  ),
  "service_role broad audit privileges not revoked"
);

assert(
  /grant\s+select\s*,\s*insert\s+on\s+table\s+public\.audit_log\s+to\s+service_role/i.test(
    sql.replace(/\s+/g, " ")
  ),
  "service_role SELECT/INSERT grant missing"
);

assert(
  !/grant\s+all\s+on\s+(?:table\s+)?public\.audit_log\s+to\s+service_role/i.test(
    sql.replace(/\s+/g, " ")
  ),
  "service_role GRANT ALL reintroduced"
);

assert(
  !/grant\s+(?:update|delete|truncate)\b[\s\S]*?public\.audit_log/i.test(
    sql
  ),
  "historical audit mutation privilege introduced"
);

assert(
  /not\s+valid/i.test(sql),
  "expand constraint must remain NOT VALID"
);

assert(
  !/^\s*update\s+public\.audit_log\b/gim.test(sql),
  "audit history UPDATE/backfill introduced"
);

assert(
  !/^\s*delete\s+from\s+public\.audit_log\b/gim.test(sql),
  "audit history DELETE introduced"
);

assert(
  !/^\s*truncate\s+(?:table\s+)?public\.audit_log\b/gim.test(sql),
  "audit history TRUNCATE introduced"
);

assert(
  !/disable\s+row\s+level\s+security/i.test(sql),
  "RLS disable introduced"
);

assert(
  !/force\s+row\s+level\s+security/i.test(sql),
  "FORCE RLS introduced unexpectedly"
);

assert(
  !/alter\s+(?:table|function|sequence)\b[\s\S]*?\bowner\s+to\b/i.test(
    sql
  ),
  "ownership transfer introduced"
);

console.log(
  "P2.5 append-only audit static lock: OK"
);

console.log(
  `migration SHA256: ${sha}`
);
