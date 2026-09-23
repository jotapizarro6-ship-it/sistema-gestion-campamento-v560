import assert from "node:assert/strict";
import fs from "node:fs";

const migrationPath =
  "supabase/migrations/20260923183500_p2_request_correlation_provenance.sql";

const rawPath =
  "supabase/functions/campamento-v560-raw/index.ts";

const migration =
  fs.readFileSync(migrationPath, "utf8");

const raw =
  fs.readFileSync(rawPath, "utf8");

function count(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

// ---------------------------------------------------------------------------
// Database provenance must be request-context grounded.
// ---------------------------------------------------------------------------

assert.match(
  migration,
  /create\s+or\s+replace\s+function\s+public\.p2_enrich_audit_request_provenance\s*\(\s*\)/i,
  "P2.6D provenance trigger function missing"
);

assert.match(
  migration,
  /current_setting\s*\(\s*['"]request\.headers['"]\s*,\s*true\s*\)/i,
  "P2.6D must use transaction-scoped PostgREST request.headers"
);

assert.match(
  migration,
  /['"]x-request-id['"]/i,
  "P2.6D request_id source header missing"
);

assert.match(
  migration,
  /['"]x-correlation-id['"]/i,
  "P2.6D correlation_id source header missing"
);

assert.match(
  migration,
  /['"]request_id['"]/i,
  "P2.6D request_id audit detail missing"
);

assert.match(
  migration,
  /['"]correlation_id['"]/i,
  "P2.6D correlation_id audit detail missing"
);

assert.match(
  migration,
  /create\s+trigger\s+audit_log_p2_request_provenance_bi[\s\S]*?before\s+insert[\s\S]*?on\s+public\.audit_log/i,
  "P2.6D audit_log BEFORE INSERT provenance trigger missing"
);

assert.doesNotMatch(
  migration,
  /pg_catalog\.(?:coalesce|nullif)\s*\(/i,
  "P2.6D must not schema-qualify SQL conditional expressions COALESCE/NULLIF"
);

// schema-qualified COALESCE/NULLIF are forbidden above.
assert.doesNotMatch(
  migration,
  /alter\s+table\s+public\.audit_log[\s\S]*?add\s+column/i,
  "P2.6D must not add request/correlation columns to audit_log"
);

assert.doesNotMatch(
  migration,
  /create\s+or\s+replace\s+function\s+public\.p2_(?:create|transition|set|upsert|close)_/i,
  "P2.6D must not redefine typed mutation RPC signatures"
);

assert.doesNotMatch(
  migration,
  /alter\s+(?:table|function|sequence)\b[\s\S]*?\bowner\s+to\b/i,
  "P2.6D ownership transfer introduced"
);

assert.doesNotMatch(
  migration,
  /disable\s+row\s+level\s+security/i,
  "P2.6D must not disable RLS"
);

// ---------------------------------------------------------------------------
// Edge request boundary.
// ---------------------------------------------------------------------------

assert.match(
  raw,
  /requestId\s*:\s*crypto\.randomUUID\s*\(\s*\)/,
  "RAW must generate a request_id at request ingress"
);

assert.match(
  raw,
  /correlationId\s*:\s*traceToken\s*\(\s*u\.searchParams\.get\s*\(\s*["']cid["']\s*\)/,
  "RAW correlation_id must derive from the real client cid"
);

assert.match(
  raw,
  /["']x-request-id["']\s*:\s*trace\.requestId/,
  "RAW traced PostgREST client missing x-request-id"
);

assert.match(
  raw,
  /h\[['"]x-correlation-id['"]\]\s*=\s*trace\.correlationId/,
  "RAW traced PostgREST client missing x-correlation-id"
);

assert.match(
  raw,
  /async function addReservation\(b:any,expected:number\)\{/,
  "P2.6D must preserve certified addReservation helper signature"
);

assert.match(
  raw,
  /async function addBlock\(b:any,expected:number\)\{/,
  "P2.6D must preserve certified addBlock helper signature"
);

assert.doesNotMatch(
  raw,
  /async function addReservation\(b:any,expected:number,rpcDb:any\)/,
  "P2.6D must not expand addReservation certified helper signature"
);

assert.doesNotMatch(
  raw,
  /async function addBlock\(b:any,expected:number,rpcDb:any\)/,
  "P2.6D must not expand addBlock certified helper signature"
);

assert.match(
  raw,
  /const requestRpcDb=Symbol\(["']requestRpcDb["']\)/,
  "P2.6D request-local RPC binding symbol missing"
);

assert.match(
  raw,
  /Object\.defineProperty\([\s\S]*?requestRpcDb[\s\S]*?enumerable:false/,
  "P2.6D request-local binding must remain non-enumerable"
);

assert.equal(
  [...raw.matchAll(/bindRpcDb\(\s*await\s+body\(req\),\s*rpcDb\s*\)/g)].length,
  2,
  "P2.6D reservation/block body binding count drift"
);
const typedRpcs = [
  "p2_create_movement",
  "p2_transition_movement",
  "p2_create_reservation",
  "p2_set_reservation_status",
  "p2_create_bed_block",
  "p2_close_bed_block",
  "p2_upsert_daily_capacity",
  "p2_set_cost_per_bed_day",
];

for (const rpc of typedRpcs) {
  const escaped =
    rpc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  assert.equal(
    count(
      raw,
      new RegExp(
        `rpcDb\\.rpc\\s*\\(\\s*["']${escaped}["']`,
        "g"
      )
    ),
    1,
    `${rpc} must use exactly one request-scoped traced RPC call`
  );

  assert.equal(
    count(
      raw,
      new RegExp(
        `\\bdb\\.rpc\\s*\\(\\s*["']${escaped}["']`,
        "g"
      )
    ),
    0,
    `${rpc} must have zero remaining untraced global db.rpc calls`
  );
}

// Non-P2 snapshot mechanics are deliberately outside this A3a change.
assert.match(
  raw,
  /db\.rpc\(\s*["']upsert_open_snapshot_r4["']/,
  "A3a must not accidentally rewrite unrelated snapshot RPC plumbing"
);

console.log(
  "P2.6D request/correlation provenance static contract: OK"
);
/* -------------------------------------------------------------------------
 * P2.6D semantic audit provenance
 * ---------------------------------------------------------------------- */

const semanticSources = {
  control: fs.readFileSync(
    "supabase/functions/campamento-control-api/index.ts",
    "utf8"
  ),
  workforce: fs.readFileSync(
    "supabase/functions/campamento-workforce-api/index.ts",
    "utf8"
  ),
  consults: fs.readFileSync(
    "supabase/functions/campamento-consults-api/index.ts",
    "utf8"
  ),
  recovery: fs.readFileSync(
    "supabase/functions/campamento-recovery-api/index.ts",
    "utf8"
  ),
};

for (const [name, src] of Object.entries(semanticSources)) {
  assert.match(
    src,
    /requestId\s*:\s*crypto\.randomUUID\s*\(\s*\)/,
    `${name}: trusted request_id generation missing`
  );

  assert.match(
    src,
    /u\.searchParams\.get\s*\(\s*["']cid["']\s*\)/,
    `${name}: real cid correlation source missing`
  );

  assert.match(
    src,
    /delete\s+out\.request_id/,
    `${name}: caller request_id suppression missing`
  );

  assert.match(
    src,
    /delete\s+out\.correlation_id/,
    `${name}: caller correlation_id suppression missing`
  );

  assert.match(
    src,
    /out\.request_id\s*=\s*trace\.requestId/,
    `${name}: trusted request_id enrichment missing`
  );

  assert.match(
    src,
    /out\.correlation_id\s*=\s*trace\.correlationId/,
    `${name}: trusted correlation_id enrichment missing`
  );

  assert.doesNotMatch(
    src,
    /\bactor_id\b|\bactor_user\b|\bactor_email\b/,
    `${name}: P2.6E actor provenance leaked into P2.6D`
  );
}

assert.match(
  semanticSources.control,
  /details:traceDetails\(safeDetails\(details\),trace\)/,
  "control semantic provenance missing"
);

assert.match(
  semanticSources.workforce,
  /details:traceDetails\(\{classification\},trace\)/,
  "workforce semantic provenance missing"
);

assert.match(
  semanticSources.consults,
  /details:traceDetails\(\{date:dateKey,deleted_count:deleted,timezone:TZ\},trace\)/,
  "consults semantic provenance missing"
);

assert.match(
  semanticSources.recovery,
  /details:traceDetails\(details,trace\)/,
  "recovery semantic provenance missing"
);

console.log(
  "P2.6D semantic audit provenance: OK"
);