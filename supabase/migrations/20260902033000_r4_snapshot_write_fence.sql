-- GARPI R4 SNAPSHOT WRITE FENCE
--
-- Additive hardening after:
--   20260901193000_r4_capacity_v1_close.sql
--   20260901225000_r4_pre_cutover_fence.sql
--
-- snapshot_today must never be able to reopen a snapshot that was
-- concurrently closed by close_day_r4.
--
-- The revision row lock also makes the final revision check and
-- snapshot persistence one PostgreSQL transaction.

create or replace function public.upsert_open_snapshot_r4(
  p_snapshot_date text,
  p_expected_revision bigint,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $r4_snapshot_write$
declare
  v_revision_text text;
  v_revision bigint;

  v_candidate public.daily_snapshots%rowtype;
  v_snapshot public.daily_snapshots%rowtype;
begin
  if p_snapshot_date is null
     or p_snapshot_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  then
    raise exception using
      errcode='22007',
      message='INVALID_SNAPSHOT_DATE';
  end if;

  if p_snapshot is null
     or jsonb_typeof(p_snapshot) <> 'object'
  then
    raise exception using
      errcode='22023',
      message='INVALID_SNAPSHOT_PAYLOAD';
  end if;

  -- Same transaction fence used by all operational source triggers
  -- and close_day_r4.
  select s.value
  into v_revision_text
  from public.settings s
  where s.key='operational_revision'
  for update;

  if not found
     or v_revision_text !~ '^[0-9]+$'
  then
    raise exception using
      errcode='P0001',
      message='OPERATIONAL_REVISION_UNAVAILABLE';
  end if;

  v_revision := v_revision_text::bigint;

  if p_expected_revision is null
     or p_expected_revision <> v_revision
  then
    raise exception using
      errcode='P0001',
      message=
        'STATE_CONFLICT current=' ||
        v_revision::text ||
        ' expected=' ||
        coalesce(p_expected_revision::text,'null');
  end if;

  select *
  into v_candidate
  from jsonb_populate_record(
    null::public.daily_snapshots,
    p_snapshot
  );

  if v_candidate.snapshot_date is null
     or v_candidate.snapshot_date <> p_snapshot_date
  then
    raise exception using
      errcode='22023',
      message='SNAPSHOT_DATE_MISMATCH';
  end if;

  if v_candidate.source_operational_revision is null
     or v_candidate.source_operational_revision <> v_revision
  then
    raise exception using
      errcode='P0001',
      message='SNAPSHOT_REVISION_MISMATCH';
  end if;

  -- First creation. closed_at is intentionally omitted:
  -- this RPC may only persist OPEN snapshots.
  insert into public.daily_snapshots (
    snapshot_date,

    base_capacity,
    blocked,
    capacity,

    occupied,
    reserved,
    reserved_today,
    free,

    occupancy,
    committed_occupancy,

    total_workers,
    female,
    male,

    companies_json,
    shifts_json,
    modules_json,

    movements_json,
    reservations_json,

    capacity_source,
    operational_universe_count,
    source_operational_revision,
    semantic_version,

    created_at,
    updated_at
  )
  values (
    v_candidate.snapshot_date,

    v_candidate.base_capacity,
    v_candidate.blocked,
    v_candidate.capacity,

    v_candidate.occupied,
    v_candidate.reserved,
    v_candidate.reserved_today,
    v_candidate.free,

    v_candidate.occupancy,
    v_candidate.committed_occupancy,

    v_candidate.total_workers,
    v_candidate.female,
    v_candidate.male,

    v_candidate.companies_json,
    v_candidate.shifts_json,
    v_candidate.modules_json,

    v_candidate.movements_json,
    v_candidate.reservations_json,

    v_candidate.capacity_source,
    v_candidate.operational_universe_count,
    v_revision,
    v_candidate.semantic_version,

    v_candidate.created_at,
    v_candidate.updated_at
  )
  on conflict (snapshot_date)
  do nothing;

  -- Serialize against close_day_r4 on the target snapshot row.
  select *
  into v_snapshot
  from public.daily_snapshots
  where snapshot_date=p_snapshot_date
  for update;

  if not found then
    raise exception using
      errcode='P0001',
      message='SNAPSHOT_WRITE_FAILED';
  end if;

  -- Critical invariant:
  -- once a snapshot is closed this RPC NEVER modifies it.
  if nullif(
       btrim(
         coalesce(
           v_snapshot.closed_at,
           ''
         )
       ),
       ''
     ) is not null
  then
    return jsonb_build_object(
      'ok',true,
      'idempotent',true,
      'closed',true,
      'state_version',v_revision::text,
      'snapshot',to_jsonb(v_snapshot)
    );
  end if;

  update public.daily_snapshots
  set
    base_capacity=v_candidate.base_capacity,
    blocked=v_candidate.blocked,
    capacity=v_candidate.capacity,

    occupied=v_candidate.occupied,
    reserved=v_candidate.reserved,
    reserved_today=v_candidate.reserved_today,
    free=v_candidate.free,

    occupancy=v_candidate.occupancy,
    committed_occupancy=v_candidate.committed_occupancy,

    total_workers=v_candidate.total_workers,
    female=v_candidate.female,
    male=v_candidate.male,

    companies_json=v_candidate.companies_json,
    shifts_json=v_candidate.shifts_json,
    modules_json=v_candidate.modules_json,

    movements_json=v_candidate.movements_json,
    reservations_json=v_candidate.reservations_json,

    capacity_source=v_candidate.capacity_source,
    operational_universe_count=
      v_candidate.operational_universe_count,

    source_operational_revision=v_revision,
    semantic_version=v_candidate.semantic_version,

    created_at=
      coalesce(
        v_snapshot.created_at,
        v_candidate.created_at
      ),

    updated_at=v_candidate.updated_at

  where snapshot_date=p_snapshot_date

  returning *
  into v_snapshot;

  return jsonb_build_object(
    'ok',true,
    'idempotent',false,
    'closed',false,
    'state_version',v_revision::text,
    'snapshot',to_jsonb(v_snapshot)
  );
end;
$r4_snapshot_write$;


revoke all
on function public.upsert_open_snapshot_r4(text,bigint,jsonb)
from public;


do $r4_snapshot_write_security$
begin
  if exists (
    select 1
    from pg_roles
    where rolname='anon'
  ) then
    revoke all
    on function public.upsert_open_snapshot_r4(text,bigint,jsonb)
    from anon;
  end if;

  if exists (
    select 1
    from pg_roles
    where rolname='authenticated'
  ) then
    revoke all
    on function public.upsert_open_snapshot_r4(text,bigint,jsonb)
    from authenticated;
  end if;

  if exists (
    select 1
    from pg_roles
    where rolname='service_role'
  ) then
    grant execute
    on function public.upsert_open_snapshot_r4(text,bigint,jsonb)
    to service_role;
  end if;
end;
$r4_snapshot_write_security$;

-- End GARPI R4 SNAPSHOT WRITE FENCE.