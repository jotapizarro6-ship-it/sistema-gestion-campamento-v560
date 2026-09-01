"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");

const root=path.resolve(__dirname,"..");

const migration=fs.readFileSync(
  path.join(
    root,
    "supabase",
    "migrations",
    "20260901193000_r4_capacity_v1_close.sql"
  ),
  "utf8"
);

const safe=fs.readFileSync(
  path.join(
    root,
    "supabase",
    "functions",
    "campamento-v560-safe",
    "index.ts"
  ),
  "utf8"
);

assert(
  /create\s+or\s+replace\s+function\s+public\.close_day_r4/i.test(
    migration
  )
);

assert(
  /security\s+definer/i.test(
    migration
  )
);

assert(
  /set\s+search_path\s*=\s*pg_catalog\s*,\s*public/i.test(
    migration
  )
);

assert(
  /select\s+c\.capacity[\s\S]*?where\s+c\.capacity_date\s*=\s*p_snapshot_date/i.test(
    migration
  )
);

assert(
  /if\s+found\s+then/i.test(
    migration
  )
);

assert(
  migration.includes("'DAILY_CAPACITY'")
);

assert(
  migration.includes("'OPERATIONAL_UNIVERSE'")
);

assert(
  migration.includes("'CAPACITY_UNAVAILABLE'")
);

assert(
  !/daily_capacity_default/i.test(
    migration
  )
);

assert(
  !/\|\|\s*132\b/.test(
    migration
  )
);

assert(
  /provenance_status\s*=\s*'CAPTURED'/i.test(
    migration
  )
);

assert(
  /provenance_version\s*=\s*'CAPACITY_V1'/i.test(
    migration
  )
);

assert(
  /semantic_version\s*=\s*'R4_CAPACITY_V1'/i.test(
    migration
  )
);

assert(
  migration.includes(
    "LEGACY_CLOSED_SNAPSHOT_PRESERVED"
  )
);

for(
  const field of [
    "capacity_source",
    "operational_universe_count",
    "operational_universe_fingerprint",
    "source_import_id",
    "source_operational_revision"
  ]
){
  assert(
    migration.includes(field),
    "Missing provenance field: "+field
  );
}

const exactPos=
  migration.indexOf(
    "select c.capacity"
  );

const fallbackPos=
  migration.indexOf(
    "elsif v_universe_count > 0"
  );

const effectivePos=
  migration.indexOf(
    "v_effective :="
  );

assert(
  exactPos>=0 &&
  fallbackPos>exactPos &&
  effectivePos>fallbackPos
);

assert(
  /for\s+update/i.test(
    migration
  )
);

assert(
  /update\s+public\.daily_snapshots/i.test(
    migration
  )
);

assert(
  /update\s+public\.settings/i.test(
    migration
  )
);

assert(
  migration.includes(
    "v_next_revision"
  )
);

assert(
  /revoke\s+all/i.test(
    migration
  )
);

assert(
  migration.includes(
    "service_role"
  )
);

assert(
  safe.startsWith(
    'import { createClient } from "jsr:@supabase/supabase-js@2";'
  )
);

assert(
  safe.includes(
    "refreshTodaySnapshot"
  )
);

assert(
  /db\.rpc\(\s*'close_day_r4'/m.test(
    safe
  )
);

assert(
  safe.includes(
    "R4_PROVENANCE_INCOMPLETE"
  )
);

assert(
  safe.includes(
    "x-garpi-capacity-version"
  )
);

assert(
  safe.includes(
    "CONCURRENCY_EXEMPT=new Set(['snapshot_today','close_day'])"
  )
);

const closeStart=
  safe.indexOf(
    "if(req.method==='POST'&&action==='close_day'){"
  );

const nextGate=
  safe.indexOf(
    "if(req.method==='POST'&&!CONCURRENCY_EXEMPT.has(action)){",
    closeStart
  );

assert(
  closeStart>=0 &&
  nextGate>closeStart
);

const closeBlock=
  safe.slice(
    closeStart,
    nextGate
  );

assert(
  closeBlock.includes(
    "close_day_r4"
  )
);

assert(
  !closeBlock.includes(
    "UPSTREAM+u.search"
  )
);

console.log(
  "R4 C U09 atomic close RPC       : PASS"
);
console.log(
  "R4 C exact zero DB semantics    : PASS"
);
console.log(
  "R4 C operational fallback       : PASS"
);
console.log(
  "R4 C capacity unavailable       : PASS"
);
console.log(
  "R4 C snapshot provenance V1     : PASS"
);
console.log(
  "R4 C legacy snapshot preserved  : PASS"
);
console.log(
  "R4 C revision atomicity         : PASS"
);
console.log(
  "R4 C security definer/revokes   : PASS"
);
console.log(
  "R4 C safe Edge direct close RPC : PASS"
);
console.log(
  "R4 CLOSE/PROVENANCE SMOKE: PASS"
);