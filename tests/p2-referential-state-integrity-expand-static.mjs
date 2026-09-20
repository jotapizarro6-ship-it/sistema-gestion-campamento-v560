import fs from "node:fs";
import path from "node:path";

function fail(message) {
  console.error(`P2.4 EXPAND static guard: FAIL :: ${message}`);
  process.exit(1);
}

function requireFragment(text, fragment) {
  if (!text.toLowerCase().includes(fragment.toLowerCase())) {
    fail(`required fragment missing :: ${fragment}`);
  }
}

function countMatches(text, regex) {
  return [...text.matchAll(regex)].length;
}

const expectedFile =
  "20260920060000_p2_referential_state_integrity_expand.sql";

const migrationPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(
      process.cwd(),
      "supabase",
      "migrations",
      expectedFile
    );

if (!fs.existsSync(migrationPath)) {
  fail(`migration not found :: ${migrationPath}`);
}

if (path.basename(migrationPath) !== expectedFile) {
  fail(`unexpected migration filename :: ${path.basename(migrationPath)}`);
}

const raw = fs.readFileSync(migrationPath, "utf8");
const sql = raw.replace(/\r\n/g, "\n");

/*
 * The certified migration contains ordinary SQL line/block comments.
 * Strip those for forbidden executable-surface checks.
 *
 * Exact byte identity is certified separately by the GARPI gate;
 * this permanent test intentionally locks semantic structure rather
 * than platform-specific line endings.
 */
const executable = sql
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/--[^\n]*$/gm, "");

const required = [
  "alter table public.reservations",
  "add column if not exists bed_id bigint",
  "add column if not exists arrival_on date",
  "add column if not exists departure_on date",
  "add column if not exists active_period daterange",

  "reservations_p2_status_chk",
  "reservations_p2_bed_id_fkey",
  "reservations_p2_temporal_chk",
  "p2_guard_reservation_transition",
  "reservations_p2_transition_bu",

  "alter table public.bed_blocks",
  "add column if not exists start_on date",
  "add column if not exists end_on date",
  "bed_blocks_p2_status_chk",
  "bed_blocks_p2_bed_id_fkey",
  "bed_blocks_p2_temporal_chk",
  "p2_guard_bed_block_transition",
  "bed_blocks_p2_transition_bu",

  "p2_guard_assignment_transition",
  "assignments_p2_transition_bu",

  "p2_guard_movement_transition",
  "movements_p2_transition_bu",
  "movements_p2_timestamp_coherence_chk",

  "references public.camp_beds(id)",
  "legacy_unresolved"
];

for (const fragment of required) {
  requireFragment(executable, fragment);
}

const counts = [
  {
    name: "NOT VALID constraints",
    regex: /\bnot\s+valid\b/gi,
    expected: 7
  },
  {
    name: "transition functions",
    regex: /\bcreate\s+or\s+replace\s+function\b/gi,
    expected: 4
  },
  {
    name: "transition triggers",
    regex: /\bcreate\s+trigger\b/gi,
    expected: 4
  }
];

for (const rule of counts) {
  const actual = countMatches(executable, rule.regex);

  if (actual !== rule.expected) {
    fail(
      `${rule.name} count expected=${rule.expected} actual=${actual}`
    );
  }
}

const requiredPatterns = [
  {
    name: "reservation [arrival,departure) range",
    regex:
      /daterange\s*\(\s*arrival_on\s*,\s*departure_on\s*,\s*'\[\)'\s*\)/i
  },
  {
    name: "bed-block [start,end] range",
    regex:
      /daterange\s*\(\s*start_on\s*,\s*end_on\s*,\s*'\[\]'\s*\)/i
  },
  {
    name: "reservation status domain",
    regex:
      /status\s+in\s*\(\s*'PENDIENTE'\s*,\s*'CONFIRMADA'\s*,\s*'CANCELADA'\s*,\s*'ANULADA'\s*\)/i
  },
  {
    name: "reservation terminal transition fence",
    regex:
      /old\.status\s*=\s*'CONFIRMADA'[\s\S]*?new\.status\s+in\s*\(\s*'CANCELADA'\s*,\s*'ANULADA'\s*\)/i
  },
  {
    name: "bed-block state transition",
    regex:
      /old\.status\s*=\s*'ACTIVO'[\s\S]*?new\.status\s*=\s*'CERRADO'/i
  },
  {
    name: "assignment legal transition",
    regex:
      /old\.status\s*=\s*'ACTIVA'[\s\S]*?new\.status\s+in\s*\(\s*'FINALIZADA'\s*,\s*'CANCELADA'\s*\)/i
  },
  {
    name: "movement legal transition",
    regex:
      /old\.lifecycle_status\s*=\s*'PROGRAMADO'[\s\S]*?new\.lifecycle_status\s+in\s*\(\s*'EJECUTADO'\s*,\s*'CANCELADO'\s*\)/i
  }
];

for (const rule of requiredPatterns) {
  if (!rule.regex.test(executable)) {
    fail(`required semantic pattern missing :: ${rule.name}`);
  }
}

const forbidden = [
  {
    name: "CREATE EXTENSION",
    regex: /^\s*create\s+extension\b/im
  },
  {
    name: "GiST exclusion",
    regex: /\bexclude\s+using\s+gist\b/im
  },
  {
    name: "transaction advisory lock",
    regex: /\bpg_advisory_xact_lock\s*\(/im
  },
  {
    name: "try advisory lock",
    regex: /\bpg_try_advisory_xact_lock\s*\(/im
  },
  {
    name: "VALIDATE CONSTRAINT",
    regex: /\bvalidate\s+constraint\b/im
  },
  {
    name: "INSERT backfill",
    regex: /^\s*insert\s+into\b/im
  },
  {
    name: "UPDATE backfill",
    regex: /^\s*update\s+public\./im
  },
  {
    name: "DELETE",
    regex: /^\s*delete\s+from\b/im
  },
  {
    name: "TRUNCATE",
    regex: /^\s*truncate\b/im
  },
  {
    name: "DROP TABLE",
    regex: /^\s*drop\s+table\b/im
  },
  {
    name: "DROP COLUMN",
    regex: /\bdrop\s+column\b/im
  },
  {
    name: "SET NOT NULL",
    regex: /\bset\s+not\s+null\b/im
  }
];

for (const rule of forbidden) {
  if (rule.regex.test(executable)) {
    fail(`forbidden executable surface :: ${rule.name}`);
  }
}

console.log("P2.4 EXPAND repository migration static guard: OK");