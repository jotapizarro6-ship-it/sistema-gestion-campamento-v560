# GARPI R4 PRE-CUTOVER HARDENING

Status: RED
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