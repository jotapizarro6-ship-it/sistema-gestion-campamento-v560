import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

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

const blob =
  execFileSync(
    "git",
    [
      "hash-object",
      migrationRel
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8"
    }
  ).trim();
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

/*
 * P2.6C A1 static regression lock.
 *
 * Protects the complete typed create-mutation path:
 *
 * client
 *   -> state_version transport
 *   -> SAFE without legacy pre-claim
 *   -> FAST generic proxy without claim
 *   -> RAW typed RPC
 *   -> authoritative state_version reconciliation.
 *
 * A2 / Batch B remain legacy until their own cutovers.
 */

const p26cA1Root =
  process.cwd();

const p26cA1Files = {
  runtime:
    "assets/resilience-runtime.js",

  app1:
    "assets/app-1.js",

  safe:
    "supabase/functions/campamento-v560-safe/index.ts",

  fast:
    "supabase/functions/campamento-v560-fast/index.ts",

  raw:
    "supabase/functions/campamento-v560-raw/index.ts"
};

const p26cA1Read =
  rel => {
    const absolute =
      path.resolve(
        p26cA1Root,
        rel
      );

    assert(
      fs.existsSync(
        absolute
      ),
      `P2.6C A1 source missing: ${rel}`
    );

    return fs.readFileSync(
      absolute,
      "utf8"
    );
  };

const p26cA1Runtime =
  p26cA1Read(
    p26cA1Files.runtime
  );

const p26cA1App1 =
  p26cA1Read(
    p26cA1Files.app1
  );

const p26cA1Safe =
  p26cA1Read(
    p26cA1Files.safe
  );

const p26cA1Fast =
  p26cA1Read(
    p26cA1Files.fast
  );

const p26cA1Raw =
  p26cA1Read(
    p26cA1Files.raw
  );

const p26cA1Count =
  (text, needle) =>
    text
      .split(needle)
      .length - 1;

const p26cA1SetBody =
  (source, name) => {
    const match =
      source.match(
        new RegExp(
          `const\\s+${name}\\s*=\\s*new\\s+Set\\s*\\(\\s*\\[([\\s\\S]*?)\\]\\s*\\)`
        )
      );

    assert(
      match,
      `P2.6C A1 set missing: ${name}`
    );

    return match[1];
  };

const p26cA1ActionCount =
  (body, action) =>
    p26cA1Count(
      body,
      `'${action}'`
    ) +
    p26cA1Count(
      body,
      `"${action}"`
    );

const p26cA1WindowAfter =
  (
    source,
    marker,
    length=2200
  ) => {
    const index =
      source.indexOf(
        marker
      );

    assert(
      index >= 0,
      `P2.6C A1 marker missing: ${marker}`
    );

    return source.slice(
      index,
      index + length
    );
  };


/*
 * Client endpoint must remain SAFE.
 */

assert(
  p26cA1Count(
    p26cA1App1,
    "campamento-v560-safe"
  ) === 1,
  "P2.6C A1 ADV_API no longer resolves exactly once to SAFE"
);


/*
 * Typed mutation actions must keep state_version transport enabled.
 */

const p26cA1VersionExempt =
  p26cA1SetBody(
    p26cA1Runtime,
    "VERSION_EXEMPT_ACTIONS"
  );

for(
  const action of [
    "add_movement",
    "movement_status",
    "add_res_advanced",
    "add_block",
    "update_capacity",
    "update_cost",
    "reservation_status",
    "close_block"
  ]
){
  assert(
    p26cA1ActionCount(
      p26cA1VersionExempt,
      action
    ) === 0,
    `P2.6C typed mutation unexpectedly VERSION_EXEMPT: ${action}`
  );
}

assert(
  p26cA1Runtime.includes(
    "async function captureStateVersion(u,method,res)"
  ),
  "P2.6C authoritative state-version capture missing"
);

assert(
  p26cA1Runtime.includes(
    "data?.state_version"
  ),
  "P2.6C response state_version capture missing"
);

assert(
  p26cA1Runtime.includes(
    "versionCaptured=false"
  ),
  "P2.6C legacy version fallback guard missing"
);

assert(
  !p26cA1Runtime.includes(
    "async function captureStateVersion(u,res)"
  ),
  "P2.6C legacy advanced_state-only capture returned"
);


/*
 * SAFE must bypass pre-claim only for actions already backed by
 * typed PostgreSQL mutation RPCs.
 */

const p26cA1ConcurrencyExempt =
  p26cA1SetBody(
    p26cA1Safe,
    "CONCURRENCY_EXEMPT"
  );

for(
  const action of [
    "add_movement",
    "movement_status",
    "add_res_advanced",
    "add_block",
    "update_capacity",
    "update_cost",
    "reservation_status",
    "close_block"
  ]
){
  assert(
    p26cA1ActionCount(
      p26cA1ConcurrencyExempt,
      action
    ) === 1,
    `P2.6C typed mutation SAFE exemption mismatch: ${action}`
  );
}

/*
 * reservation_status and close_block are now part of the typed
 * CONCURRENCY_EXEMPT ownership set above.
 */

assert(
  p26cA1Safe.includes(
    "CONCURRENCY_EXEMPT.has(action)"
  ),
  "P2.6C SAFE pre-claim guard missing"
);

assert(
  p26cA1Safe.includes(
    "campamento-v560-fast"
  ),
  "P2.6C SAFE upstream no longer targets FAST"
);

assert(
  p26cA1Safe.includes(
    "UPSTREAM+u.search"
  ),
  "P2.6C SAFE no longer preserves mutation query string"
);


/*
 * FAST may claim only through the explicit claim_revision action.
 */

assert(
  p26cA1Count(
    p26cA1Fast,
    "action==='claim_revision'"
  ) === 1,
  "P2.6C FAST explicit claim_revision route drift"
);

assert(
  p26cA1Count(
    p26cA1Fast,
    "await claim("
  ) === 1,
  "P2.6C FAST claim invocation drift"
);

assert(
  p26cA1Fast.includes(
    "campamento-v560-raw"
  ),
  "P2.6C FAST RAW upstream missing"
);

assert(
  p26cA1Fast.includes(
    "RAW+u.search"
  ),
  "P2.6C FAST no longer preserves query string to RAW"
);


/*
 * A1 RAW handlers must consume state_version and delegate to the
 * typed create RPCs. Direct INSERTs may not return.
 */

const p26cA1ReservationRoute =
  p26cA1WindowAfter(
    p26cA1Raw,
    'a==="add_res_advanced"'
  );

const p26cA1BlockRoute =
  p26cA1WindowAfter(
    p26cA1Raw,
    'a==="add_block"'
  );

assert(
  p26cA1ReservationRoute.includes(
    "state_version"
  ),
  "P2.6C add_res_advanced no longer consumes state_version"
);

assert(
  p26cA1ReservationRoute.includes(
    "addReservation"
  ),
  "P2.6C add_res_advanced typed helper missing"
);

assert(
  p26cA1BlockRoute.includes(
    "state_version"
  ),
  "P2.6C add_block no longer consumes state_version"
);

assert(
  p26cA1BlockRoute.includes(
    "addBlock"
  ),
  "P2.6C add_block typed helper missing"
);

assert(
  p26cA1Raw.includes(
    "async function addReservation(b:any,expected:number)"
  ),
  "P2.6C addReservation expected revision contract missing"
);

assert(
  p26cA1Raw.includes(
    "async function addBlock(b:any,expected:number)"
  ),
  "P2.6C addBlock expected revision contract missing"
);

assert(
  p26cA1Count(
    p26cA1Raw,
    "p2_create_reservation"
  ) === 1,
  "P2.6C p2_create_reservation call count drift"
);

assert(
  p26cA1Count(
    p26cA1Raw,
    "p2_create_bed_block"
  ) === 1,
  "P2.6C p2_create_bed_block call count drift"
);

assert(
  !p26cA1Raw.includes(
    '.from("reservations").insert('
  ),
  "P2.6C direct reservation INSERT returned"
);

assert(
  !p26cA1Raw.includes(
    '.from("bed_blocks").insert('
  ),
  "P2.6C direct bed-block INSERT returned"
);


/*
 * Batch B is now typed. Direct RAW reservation/block UPDATE paths
 * must never return.
 */

assert(
  !p26cA1Raw.includes(
    '.from("reservations").update('
  ),
  "P2.6C direct reservation UPDATE returned"
);

assert(
  !p26cA1Raw.includes(
    '.from("bed_blocks").update('
  ),
  "P2.6C direct bed-block UPDATE returned"
);

console.log(
  "P2.6C A1 static regression lock: OK"
);

/*
 * P2.6C A2a daily-capacity typed mutation regression lock.
 */

const p26cA2aApp4Path =
  path.resolve(
    process.cwd(),
    "assets/app-4-core.js"
  );

assert(
  fs.existsSync(
    p26cA2aApp4Path
  ),
  "P2.6C A2a app-4-core missing"
);

const p26cA2aApp4 =
  fs.readFileSync(
    p26cA2aApp4Path,
    "utf8"
  );

const p26cA2aCapacityStart =
  p26cA2aApp4.indexOf(
    "$('#capacityForm').addEventListener('submit'"
  );

const p26cA2aCapacityEnd =
  p26cA2aApp4.indexOf(
    "function switchView",
    p26cA2aCapacityStart
  );

assert(
  p26cA2aCapacityStart >= 0 &&
  p26cA2aCapacityEnd > p26cA2aCapacityStart,
  "P2.6C A2a update_capacity handler window missing"
);

const p26cA2aCapacityWindow =
  p26cA2aApp4.slice(
    p26cA2aCapacityStart,
    p26cA2aCapacityEnd
  );

const p26cA2aCapacityCallerMatches =
  p26cA2aCapacityWindow.match(
    /advApi\s*\(\s*['"]update_capacity['"]/g
  ) || [];

assert(
  p26cA2aCapacityCallerMatches.length === 1,
  "P2.6C A2a update_capacity caller count drift"
);

assert(
  p26cA1Count(
    p26cA2aCapacityWindow,
    "expected_row_revision:"
  ) === 1,
  "P2.6C A2a expected_row_revision transport missing"
);

assert(
  p26cA2aCapacityWindow.includes(
    "current.row_revision"
  ),
  "P2.6C A2a daily_capacity row_revision source missing"
);

assert(
  p26cA2aCapacityWindow.includes(
    "d.capacities"
  ),
  "P2.6C A2a capacities state source missing"
);

assert(
  p26cA1ActionCount(
    p26cA1VersionExempt,
    "update_capacity"
  ) === 0,
  "P2.6C A2a update_capacity unexpectedly VERSION_EXEMPT"
);

assert(
  p26cA1ActionCount(
    p26cA1ConcurrencyExempt,
    "update_capacity"
  ) === 1,
  "P2.6C A2a update_capacity SAFE exemption missing"
);

assert(
  p26cA1Count(
    p26cA1Raw,
    "p2_upsert_daily_capacity"
  ) === 1,
  "P2.6C A2a p2_upsert_daily_capacity call count drift"
);

assert(
  !p26cA1Raw.includes(
    '.from("daily_capacity").upsert('
  ),
  "P2.6C A2a direct daily_capacity UPSERT returned"
);

assert(
  p26cA1Raw.includes(
    "P2_EXPECTED_ROW_REVISION_REQUIRED"
  ),
  "P2.6C A2a missing-row-token conflict mapping disappeared"
);

assert(
  p26cA1Raw.includes(
    "p_expected_row_revision:"
  ),
  "P2.6C A2a RPC row revision argument missing"
);

console.log(
  "P2.6C A2a capacity static regression lock: OK"
);

/*
 * P2.6C A2b cost-setting typed mutation regression lock.
 *
 * FAST publishes value + row revision from the same observed
 * settings row, the client sends that token, SAFE does not pre-claim,
 * and RAW delegates the mutation to p2_set_cost_per_bed_day.
 */

const p26cA2bApp3Path =
  path.resolve(
    process.cwd(),
    "assets/app-3b.js"
  );

assert(
  fs.existsSync(
    p26cA2bApp3Path
  ),
  "P2.6C A2b app-3b missing"
);

const p26cA2bApp3 =
  fs.readFileSync(
    p26cA2bApp3Path,
    "utf8"
  );

const p26cA2bStartMarker =
  "$('#costForm').addEventListener('submit'";

const p26cA2bStart =
  p26cA2bApp3.indexOf(
    p26cA2bStartMarker
  );

assert(
  p26cA2bStart >= 0,
  "P2.6C A2b cost handler missing"
);

assert(
  p26cA2bApp3.indexOf(
    p26cA2bStartMarker,
    p26cA2bStart + p26cA2bStartMarker.length
  ) < 0,
  "P2.6C A2b cost handler is not unique"
);

const p26cA2bEnd =
  p26cA2bApp3.indexOf(
    "const dim=",
    p26cA2bStart
  );

assert(
  p26cA2bEnd > p26cA2bStart,
  "P2.6C A2b cost handler end anchor missing"
);

const p26cA2bCostWindow =
  p26cA2bApp3.slice(
    p26cA2bStart,
    p26cA2bEnd
  );

assert(
  (
    p26cA2bCostWindow.match(
      /advApi\s*\(\s*['"]update_cost['"]/g
    ) || []
  ).length === 1,
  "P2.6C A2b update_cost caller count drift"
);

assert(
  p26cA1Count(
    p26cA2bCostWindow,
    "settings_row_revisions"
  ) === 1,
  "P2.6C A2b observed settings token source missing"
);

assert(
  p26cA1Count(
    p26cA2bCostWindow,
    "expected_row_revision:"
  ) === 1,
  "P2.6C A2b expected_row_revision transport missing"
);

assert(
  p26cA2bCostWindow.includes(
    "cost_per_bed_day"
  ),
  "P2.6C A2b cost value missing"
);


/*
 * FAST observation contract.
 */

assert(
  p26cA1Count(
    p26cA1Fast,
    "async function readCostObservation()"
  ) === 1,
  "P2.6C A2b readCostObservation missing"
);

assert(
  p26cA1Count(
    p26cA1Fast,
    ".select('value,row_revision')"
  ) === 1,
  "P2.6C A2b FAST value+row_revision read drift"
);

assert(
  p26cA1Count(
    p26cA1Fast,
    ".eq('key','cost_per_bed_day')"
  ) === 1,
  "P2.6C A2b FAST exact cost key read drift"
);

assert(
  p26cA1Count(
    p26cA1Fast,
    "decorateCostObservation("
  ) === 3,
  "P2.6C A2b FAST must decorate v2 and raw-fallback"
);

assert(
  p26cA1Fast.includes(
    "data.settings_row_revisions"
  ),
  "P2.6C A2b settings_row_revisions publication missing"
);

assert(
  p26cA1Fast.includes(
    "settings.cost_per_bed_day="
  ),
  "P2.6C A2b scalar settings compatibility assignment missing"
);

assert(
  p26cA1Fast.includes(
    "revisions.cost_per_bed_day="
  ),
  "P2.6C A2b cost row revision publication missing"
);


/*
 * Mutation transport and ownership.
 */

assert(
  p26cA1ActionCount(
    p26cA1VersionExempt,
    "update_cost"
  ) === 0,
  "P2.6C A2b update_cost unexpectedly VERSION_EXEMPT"
);

assert(
  p26cA1ActionCount(
    p26cA1ConcurrencyExempt,
    "update_cost"
  ) === 1,
  "P2.6C A2b update_cost SAFE exemption missing"
);

assert(
  p26cA1Count(
    p26cA1Raw,
    "p2_set_cost_per_bed_day"
  ) === 1,
  "P2.6C A2b typed cost RPC call count drift"
);

assert(
  !p26cA1Raw.includes(
    '.from("settings").upsert({key:"cost_per_bed_day"'
  ),
  "P2.6C A2b direct settings cost UPSERT returned"
);

assert(
  p26cA1Raw.includes(
    "p_expected_row_revision:"
  ),
  "P2.6C A2b RPC expected row revision missing"
);

assert(
  p26cA1Raw.includes(
    "P2_EXPECTED_ROW_REVISION_REQUIRED"
  ),
  "P2.6C A2b missing row-token conflict mapping disappeared"
);


/*
 * Batch B typed ownership is closed. These direct RAW writers
 * must remain absent.
 */

assert(
  !p26cA1Raw.includes(
    '.from("reservations").update('
  ),
  "P2.6C Batch B direct reservation UPDATE returned"
);

assert(
  !p26cA1Raw.includes(
    '.from("bed_blocks").update('
  ),
  "P2.6C Batch B direct bed-block UPDATE returned"
);

console.log(
  "P2.6C A2b cost static regression lock: OK"
);

/*
 * P2.6C Batch B typed mutation regression lock.
 */

const p26cBatchBApp4Path =
  path.resolve(
    process.cwd(),
    "assets/app-4-core.js"
  );

assert(
  fs.existsSync(
    p26cBatchBApp4Path
  ),
  "P2.6C Batch B app-4-core missing"
);

const p26cBatchBApp4 =
  fs.readFileSync(
    p26cBatchBApp4Path,
    "utf8"
  );

const p26cBatchBReservationStart =
  p26cBatchBApp4.indexOf(
    "function renderReservations()"
  );

const p26cBatchBReservationEnd =
  p26cBatchBApp4.indexOf(
    "function renderBlocks()",
    p26cBatchBReservationStart
  );

assert(
  p26cBatchBReservationStart >= 0 &&
  p26cBatchBReservationEnd >
    p26cBatchBReservationStart,
  "P2.6C Batch B reservation render window missing"
);

const p26cBatchBReservationWindow =
  p26cBatchBApp4.slice(
    p26cBatchBReservationStart,
    p26cBatchBReservationEnd
  );

assert(
  (
    p26cBatchBReservationWindow.match(
      /data-row-revision="\$\{r\.row_revision\}"/g
    ) || []
  ).length === 2,
  "P2.6C Batch B reservation buttons lost row revision"
);

assert(
  (
    p26cBatchBReservationWindow.match(
      /advApi\s*\(\s*['"]reservation_status['"]/g
    ) || []
  ).length === 1,
  "P2.6C Batch B reservation_status caller count drift"
);

assert(
  p26cA1Count(
    p26cBatchBReservationWindow,
    "expected_row_revision:"
  ) === 1,
  "P2.6C Batch B reservation row token transport missing"
);


const p26cBatchBBlockStart =
  p26cBatchBApp4.indexOf(
    "function renderBlocks()"
  );

const p26cBatchBBlockEnd =
  p26cBatchBApp4.indexOf(
    "function renderWorkers()",
    p26cBatchBBlockStart
  );

assert(
  p26cBatchBBlockStart >= 0 &&
  p26cBatchBBlockEnd >
    p26cBatchBBlockStart,
  "P2.6C Batch B block render window missing"
);

const p26cBatchBBlockWindow =
  p26cBatchBApp4.slice(
    p26cBatchBBlockStart,
    p26cBatchBBlockEnd
  );

assert(
  (
    p26cBatchBBlockWindow.match(
      /data-row-revision="\$\{r\.row_revision\}"/g
    ) || []
  ).length === 1,
  "P2.6C Batch B close-block button lost row revision"
);

assert(
  (
    p26cBatchBBlockWindow.match(
      /advApi\s*\(\s*['"]close_block['"]/g
    ) || []
  ).length === 1,
  "P2.6C Batch B close_block caller count drift"
);

assert(
  p26cA1Count(
    p26cBatchBBlockWindow,
    "expected_row_revision:"
  ) === 1,
  "P2.6C Batch B block row token transport missing"
);


for(
  const action of [
    "reservation_status",
    "close_block"
  ]
){
  assert(
    p26cA1ActionCount(
      p26cA1VersionExempt,
      action
    ) === 0,
    `P2.6C Batch B ${action} unexpectedly VERSION_EXEMPT`
  );

  assert(
    p26cA1ActionCount(
      p26cA1ConcurrencyExempt,
      action
    ) === 1,
    `P2.6C Batch B ${action} SAFE exemption missing`
  );
}


assert(
  p26cA1Count(
    p26cA1Raw,
    "p2_set_reservation_status"
  ) === 1,
  "P2.6C Batch B reservation typed RPC count drift"
);

assert(
  p26cA1Count(
    p26cA1Raw,
    "p2_close_bed_block"
  ) === 1,
  "P2.6C Batch B close-block typed RPC count drift"
);

assert(
  !p26cA1Raw.includes(
    '.from("reservations").update('
  ),
  "P2.6C Batch B direct reservation UPDATE returned"
);

assert(
  !p26cA1Raw.includes(
    '.from("bed_blocks").update('
  ),
  "P2.6C Batch B direct bed-block UPDATE returned"
);

const p26cBatchBDirectDml =
  (
    p26cA1Raw.match(
      /\.(?:insert|update|upsert|delete)\s*\(/gi
    ) || []
  ).length;

assert(
  p26cBatchBDirectDml === 0,
  `P2.6C RAW direct business DML remains: ${p26cBatchBDirectDml}`
);

console.log(
  "P2.6C Batch B static regression lock: OK"
);
