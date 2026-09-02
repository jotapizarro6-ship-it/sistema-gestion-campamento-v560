# GARPI R4 PRE-CUTOVER HARDENING

Status: GREEN (local hardening; production cutover still HOLD)
Scope: local/reversible only
Production changes: NONE

## Confirmed findings

1. campamento-v560-raw was deployed in Supabase but was not versioned in main.

2. RAW snapshot_today still contains legacy Capacity semantics:
   daily_capacity_default / 132 fallback.

3. RAW update_capacity currently rejects capacity = 0.

4. R4 Capacity V1 requires:
   - exact daily_capacity first, including zero;
   - operational universe fallback;
   - CAPACITY_UNAVAILABLE otherwise;
   - never fallback to 132.

5. RAW snapshot_today calculates occupied and reserved before close_day_r4.

6. close_day_r4 currently consumes occupied and reserved values from the
   pre-existing daily snapshot.

7. snapshot_today and close_day_r4 therefore do not currently form a single
   transactional population fence.

8. claim_operational_revision increments operational_revision in a database
   transaction that ends before the proxied RAW mutation is executed.

9. claim_revision -> HTTP RAW mutation therefore does not itself constitute
   an atomic database mutation fence.

## Cutover decision

R4 backend cutover remains HOLD until these RED contracts are made GREEN.

## Safety

Do not:
- deploy an Edge Function;
- apply an R4 migration;
- merge to main;
- modify production data;
- weaken HMAC;
- weaken RLS;
- expose service_role.

## GREEN hardening design

The historical RED findings are preserved in commit
c4f42084d26f9ad71d0e275cdab96eb4dcf69be4.

The local GREEN hardening adds:

1. Versioned campamento-v560-raw source.
2. No legacy capacity fallback 132.
3. daily_capacity = 0 support.
4. Operational-universe Capacity V1 fallback.
5. source_operational_revision certificate on snapshot_today.
6. Revision checks before/after population reads and before snapshot write.
7. Transactional statement triggers on operational source tables.
8. operational_revision advance in the same PostgreSQL transaction as
   each source-table mutation.
9. close_day_r4 rejection of stale open snapshots.
10. Existing closed snapshots remain idempotent before the new fence.

No production migration or Edge deploy is performed by this branch work.