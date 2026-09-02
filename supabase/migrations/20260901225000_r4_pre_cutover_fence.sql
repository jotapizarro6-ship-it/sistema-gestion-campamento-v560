-- GARPI R4 PRE-CUTOVER CONCURRENCY FENCE
--
-- Additive hardening after:
--   20260901193000_r4_capacity_v1_close.sql
--
-- The certified R4 migration remains immutable.
--
-- Every operational source mutation advances operational_revision
-- inside the same PostgreSQL transaction as the source write.
--
-- snapshot_today records source_operational_revision and
-- close_day_r4 rejects stale open snapshots.

create or replace function public.bump_operational_revision_r4()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $r4_revision_fence$
declare
  v_revision_text text;
  v_next_revision bigint;
begin
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

  v_next_revision :=
    v_revision_text::bigint + 1;

  update public.settings
  set value=v_next_revision::text
  where key='operational_revision';

  return null;
end;
$r4_revision_fence$;


revoke all
on function public.bump_operational_revision_r4()
from public;


do $r4_revision_security$
begin
  if exists (
    select 1
    from pg_roles
    where rolname='anon'
  ) then
    revoke all
    on function public.bump_operational_revision_r4()
    from anon;
  end if;

  if exists (
    select 1
    from pg_roles
    where rolname='authenticated'
  ) then
    revoke all
    on function public.bump_operational_revision_r4()
    from authenticated;
  end if;
end;
$r4_revision_security$;


do $r4_revision_triggers$
declare
  v_table text;
  v_trigger text;
begin
  foreach v_table in array array[
    'workers',
    'bed_inventory',
    'bed_blocks',
    'reservations',
    'reservation_members',
    'movements',
    'daily_capacity',
    'import_history'
  ]
  loop
    v_trigger :=
      'r4_revision_' || v_table;

    execute format(
      'drop trigger if exists %I on public.%I',
      v_trigger,
      v_table
    );

    execute format(
      'create trigger %I ' ||
      'after insert or update or delete or truncate ' ||
      'on public.%I ' ||
      'for each statement ' ||
      'execute function public.bump_operational_revision_r4()',
      v_trigger,
      v_table
    );
  end loop;
end;
$r4_revision_triggers$;

create or replace function public.close_day_r4(
  p_snapshot_date text,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $r4_close$
declare
  v_snapshot public.daily_snapshots%rowtype;

  v_revision_text text;
  v_source_revision bigint;
  v_next_revision bigint;

  v_universe_count integer;
  v_universe_fingerprint text;

  v_base integer;
  v_capacity_source text;

  v_blocked integer;
  v_effective integer;

  v_import_id bigint;

  v_occupied integer;
  v_reserved integer;
  v_committed integer;
  v_free integer;

  v_occupancy double precision;
  v_committed_occupancy double precision;

  v_closed_at text;
begin
  if p_snapshot_date is null
     or p_snapshot_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  then
    raise exception using
      errcode='22007',
      message='INVALID_SNAPSHOT_DATE';
  end if;

  begin
    if (p_snapshot_date::date)::text <> p_snapshot_date then
      raise exception 'INVALID';
    end if;
  exception
    when others then
      raise exception using
        errcode='22007',
        message='INVALID_SNAPSHOT_DATE';
  end;


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

  v_source_revision :=
    v_revision_text::bigint;

  if p_expected_revision is null
     or p_expected_revision <> v_source_revision
  then
    raise exception using
      errcode='P0001',
      message=
        'STATE_CONFLICT current=' ||
        v_source_revision::text ||
        ' expected=' ||
        coalesce(
          p_expected_revision::text,
          'null'
        );
  end if;


  select *
  into v_snapshot
  from public.daily_snapshots
  where snapshot_date=p_snapshot_date
  for update;

  if not found then
    raise exception using
      errcode='P0001',
      message='SNAPSHOT_REQUIRED';
  end if;


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
    if v_snapshot.provenance_status='CAPTURED'
       and v_snapshot.provenance_version='CAPACITY_V1'
    then
      return jsonb_build_object(
        'ok',true,
        'idempotent',true,
        'legacy',false,
        'state_version',v_source_revision::text,
        'source_operational_revision',
          v_snapshot.source_operational_revision,
        'snapshot',to_jsonb(v_snapshot)
      );
    end if;

    return jsonb_build_object(
      'ok',true,
      'idempotent',true,
      'legacy',true,
      'state_version',v_source_revision::text,
      'message','LEGACY_CLOSED_SNAPSHOT_PRESERVED',
      'snapshot',to_jsonb(v_snapshot)
    );
  end if;


  -- R4 PRE-CUTOVER CONCURRENCY FENCE.
  --
  -- Closed snapshots have already returned above, preserving
  -- idempotence. Every open snapshot must have been calculated
  -- from exactly the operational revision currently locked by
  -- close_day_r4.
  if v_snapshot.source_operational_revision is null
     or v_snapshot.source_operational_revision <> v_source_revision
  then
    raise exception using
      errcode='P0001',
      message=
        'STATE_CONFLICT snapshot_revision=' ||
        coalesce(
          v_snapshot.source_operational_revision::text,
          'null'
        ) ||
        ' current=' ||
        v_source_revision::text;
  end if;

  select
    count(*)::integer,
    md5(
      coalesce(
        string_agg(
          u.location_key,
          E'\n'
          order by u.location_key
        ),
        ''
      )
    )
  into
    v_universe_count,
    v_universe_fingerprint
  from (
    select distinct
      upper(btrim(b.module)) ||
      '|' ||
      upper(btrim(b.room)) ||
      '|' ||
      upper(btrim(b.bed))
      as location_key
    from public.bed_inventory b
    where nullif(btrim(b.module),'') is not null
      and nullif(btrim(b.room),'') is not null
      and nullif(btrim(b.bed),'') is not null
  ) u;


  select c.capacity
  into v_base
  from public.daily_capacity c
  where c.capacity_date=p_snapshot_date;

  if found then
    if v_base is null
       or v_base < 0
    then
      raise exception using
        errcode='P0001',
        message='CAPACITY_UNAVAILABLE';
    end if;

    v_capacity_source :=
      'DAILY_CAPACITY';

  elsif v_universe_count > 0 then
    v_base :=
      v_universe_count;

    v_capacity_source :=
      'OPERATIONAL_UNIVERSE';

  else
    raise exception using
      errcode='P0001',
      message='CAPACITY_UNAVAILABLE';
  end if;


  select count(*)::integer
  into v_blocked
  from (
    select distinct
      upper(btrim(bb.module)) ||
      '|' ||
      upper(btrim(bb.room)) ||
      '|' ||
      upper(btrim(bb.bed))
      as location_key
    from public.bed_blocks bb
    where upper(btrim(bb.status))='ACTIVO'
      and bb.start_date <= p_snapshot_date
      and (
        nullif(
          btrim(
            coalesce(
              bb.end_date,
              ''
            )
          ),
          ''
        ) is null
        or bb.end_date >= p_snapshot_date
      )
  ) active_block
  where exists (
    select 1
    from public.bed_inventory bi
    where
      upper(btrim(bi.module)) ||
      '|' ||
      upper(btrim(bi.room)) ||
      '|' ||
      upper(btrim(bi.bed))
      =
      active_block.location_key
  );


  v_effective :=
    greatest(
      v_base-v_blocked,
      0
    );


  v_occupied :=
    greatest(
      coalesce(
        v_snapshot.occupied,
        0
      ),
      0
    );

  v_reserved :=
    greatest(
      coalesce(
        v_snapshot.reserved_today,
        v_snapshot.reserved,
        0
      ),
      0
    );

  v_committed :=
    v_occupied +
    v_reserved;

  v_free :=
    greatest(
      v_effective-v_committed,
      0
    );


  v_occupancy :=
    case
      when v_effective > 0 then
        round(
          v_occupied::numeric *
          100.0 /
          v_effective::numeric,
          1
        )::double precision
      when v_occupied > 0 then
        100.0
      else
        0.0
    end;


  v_committed_occupancy :=
    case
      when v_effective > 0 then
        round(
          v_committed::numeric *
          100.0 /
          v_effective::numeric,
          1
        )::double precision
      when v_committed > 0 then
        100.0
      else
        0.0
    end;


  select max(i.id)
  into v_import_id
  from public.import_history i
  where upper(btrim(i.status))='OK';

  if v_import_id is null then
    raise exception using
      errcode='P0001',
      message='PROVENANCE_UNAVAILABLE';
  end if;


  v_closed_at :=
    (
      clock_timestamp()
      at time zone 'America/Santiago'
    )::text;


  update public.daily_snapshots
  set
    base_capacity=v_base,
    blocked=v_blocked,
    capacity=v_effective,

    free=v_free,
    occupancy=v_occupancy,
    committed_occupancy=v_committed_occupancy,

    provenance_status='CAPTURED',
    capacity_source=v_capacity_source,

    operational_universe_count=v_universe_count,
    operational_universe_fingerprint=v_universe_fingerprint,

    source_import_id=v_import_id,
    source_operational_revision=v_source_revision,

    semantic_version='R4_CAPACITY_V1',
    provenance_version='CAPACITY_V1',

    closed_at=v_closed_at,
    updated_at=v_closed_at

  where snapshot_date=p_snapshot_date

  returning *
  into v_snapshot;


  v_next_revision :=
    v_source_revision + 1;

  update public.settings
  set value=v_next_revision::text
  where key='operational_revision';


  return jsonb_build_object(
    'ok',true,
    'idempotent',false,
    'legacy',false,

    'capacity_available',true,
    'capacity_source',v_capacity_source,

    'operational_universe_count',
      v_universe_count,

    'operational_universe_fingerprint',
      v_universe_fingerprint,

    'source_import_id',
      v_import_id,

    'source_operational_revision',
      v_source_revision,

    'semantic_version',
      'R4_CAPACITY_V1',

    'provenance_version',
      'CAPACITY_V1',

    'state_version',
      v_next_revision::text,

    'snapshot',
      to_jsonb(v_snapshot)
  );
end;
$r4_close$;

-- Reassert close RPC security boundary.

revoke all
on function public.close_day_r4(text,bigint)
from public;


do $r4_close_security$
begin
  if exists (
    select 1
    from pg_roles
    where rolname='anon'
  ) then
    revoke all
    on function public.close_day_r4(text,bigint)
    from anon;
  end if;

  if exists (
    select 1
    from pg_roles
    where rolname='authenticated'
  ) then
    revoke all
    on function public.close_day_r4(text,bigint)
    from authenticated;
  end if;

  if exists (
    select 1
    from pg_roles
    where rolname='service_role'
  ) then
    grant execute
    on function public.close_day_r4(text,bigint)
    to service_role;
  end if;
end;
$r4_close_security$;

-- End GARPI R4 PRE-CUTOVER CONCURRENCY FENCE.