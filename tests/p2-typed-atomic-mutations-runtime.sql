-- GARPI P2.6B typed atomic mutation runtime certification
-- Intended only for an isolated PostgreSQL 17 CI database.

\set ON_ERROR_STOP on


-- ============================================================================
-- 1. ACL / FUNCTION SURFACE
-- ============================================================================

do $p2_atomic_rpc_acl$
declare
    v_signature text;
    v_role text;
begin
    foreach v_signature in array array[
        'public.p2_create_movement(bigint,date,text,text,text,integer,text,text,text)',
        'public.p2_transition_movement(bigint,bigint,bigint,text)',
        'public.p2_create_reservation(bigint,date,date,text,text,text,text,text,integer,text)',
        'public.p2_set_reservation_status(bigint,bigint,bigint,text)',
        'public.p2_create_bed_block(bigint,text,text,text,date,date,text)',
        'public.p2_close_bed_block(bigint,bigint,bigint)',
        'public.p2_upsert_daily_capacity(bigint,date,integer,bigint)',
        'public.p2_set_cost_per_bed_day(bigint,numeric,bigint)'
    ]
    loop
        if not has_function_privilege(
            'service_role',
            v_signature,
            'EXECUTE'
        ) then
            raise exception
                'P2_ATOMIC_RPC:service_execute_missing:%',
                v_signature;
        end if;


        foreach v_role in array array[
            'anon',
            'authenticated',
            'camp_app',
            'replit_app'
        ]
        loop
            if has_function_privilege(
                v_role,
                v_signature,
                'EXECUTE'
            ) then
                raise exception
                    'P2_ATOMIC_RPC:client_execute_present:%:%',
                    v_role,
                    v_signature;
            end if;
        end loop;
    end loop;


    foreach v_signature in array array[
        'public.p2_lock_operational_revision(bigint)',
        'public.p2_read_operational_revision()',
        'public.p2_require_row_revision(text,text,bigint,bigint)'
    ]
    loop
        foreach v_role in array array[
            'anon',
            'authenticated',
            'service_role',
            'camp_app',
            'replit_app'
        ]
        loop
            if has_function_privilege(
                v_role,
                v_signature,
                'EXECUTE'
            ) then
                raise exception
                    'P2_ATOMIC_RPC:internal_execute_present:%:%',
                    v_role,
                    v_signature;
            end if;
        end loop;
    end loop;
end
$p2_atomic_rpc_acl$;


-- ============================================================================
-- 2. SERVICE_ROLE CAN INVOKE A TYPED RPC
-- ============================================================================

select value::bigint as service_expected_revision
from public.settings
where key = 'operational_revision'
\gset

set role service_role;

select public.p2_create_movement(
    :service_expected_revision,
    date '2099-01-01',
    'SUBIDA',
    'A',
    'P2 CERT',
    3,
    '08:00',
    'BUS-CERT',
    'service-role execution certification'
);

reset role;


-- ============================================================================
-- 3. MOVEMENT — GLOBAL + ROW CONCURRENCY
-- ============================================================================

do $p2_movement_runtime$
declare
    v_id bigint;
    v_row_revision bigint;
    v_before bigint;
    v_after bigint;
    v_result jsonb;
    v_blocked boolean;
    v_status text;
    v_noise bigint;
begin
    -- Use the service-role-created movement as the first certified row.
    select
        id,
        row_revision
      into
        v_id,
        v_row_revision
      from public.movements
     where movement_date = '2099-01-01'
       and company = 'P2 CERT'
       and bus = 'BUS-CERT'
     order by id desc
     limit 1;


    if v_id is null
       or v_row_revision <> 1
    then
        raise exception
            'P2_ATOMIC_RPC:movement_create_missing:%:%',
            v_id,
            v_row_revision;
    end if;


    select value::bigint
      into v_after
      from public.settings
     where key = 'operational_revision';


    -- Stale global revision must fail and leave everything unchanged.
    v_before := v_after;
    v_blocked := false;

    begin
        perform public.p2_create_movement(
            v_before - 1,
            date '2099-01-02',
            'BAJADA',
            '',
            'P2 STALE',
            1,
            '',
            '',
            'must not persist'
        );
    exception
        when sqlstate '40001' then
            if position(
                'P2_STATE_CONFLICT'
                in sqlerrm
            ) > 0 then
                v_blocked := true;
            else
                raise;
            end if;
    end;


    if not v_blocked then
        raise exception
            'P2_ATOMIC_RPC:stale_global_not_blocked';
    end if;


    if exists (
        select 1
        from public.movements
        where company = 'P2 STALE'
    ) then
        raise exception
            'P2_ATOMIC_RPC:stale_global_write_persisted';
    end if;


    if (
        select value::bigint
        from public.settings
        where key = 'operational_revision'
    ) <> v_before then
        raise exception
            'P2_ATOMIC_RPC:stale_global_advanced_revision';
    end if;


    -- Stale row revision must fail without advancing global revision.
    v_blocked := false;

    begin
        perform public.p2_transition_movement(
            v_before,
            v_id,
            v_row_revision + 9,
            'EJECUTADO'
        );
    exception
        when sqlstate '40001' then
            if position(
                'P2_ROW_CONFLICT'
                in sqlerrm
            ) > 0 then
                v_blocked := true;
            else
                raise;
            end if;
    end;


    if not v_blocked then
        raise exception
            'P2_ATOMIC_RPC:stale_row_not_blocked';
    end if;


    if (
        select value::bigint
        from public.settings
        where key = 'operational_revision'
    ) <> v_before then
        raise exception
            'P2_ATOMIC_RPC:stale_row_advanced_revision';
    end if;


    select lifecycle_status
      into v_status
      from public.movements
     where id = v_id;


    if v_status <> 'PROGRAMADO' then
        raise exception
            'P2_ATOMIC_RPC:stale_row_changed_entity:%',
            v_status;
    end if;


    v_result :=
        public.p2_transition_movement(
            v_before,
            v_id,
            v_row_revision,
            'EJECUTADO'
        );


    v_after :=
        (v_result ->> 'state_version')::bigint;


    if v_after <> v_before + 1 then
        raise exception
            'P2_ATOMIC_RPC:movement_transition_revision:%:%',
            v_before,
            v_after;
    end if;


    if (
        v_result -> 'data' ->> 'lifecycle_status'
    ) <> 'EJECUTADO'
       or (
           v_result -> 'data' ->> 'row_revision'
       )::bigint <> 2
    then
        raise exception
            'P2_ATOMIC_RPC:movement_transition_result:%',
            v_result;
    end if;


    -- Audit provenance must bind to pre-mutation global revision.
    select count(*)
      into v_noise
      from public.audit_log
     where entity_type = 'movement'
       and entity_id = v_id::text
       and action = 'ROW_UPDATE'
       and endpoint = 'DATABASE_TRIGGER'
       and (
           details ->> 'source_operational_revision'
       )::bigint = v_before
       and (
           details ->> 'old_row_revision'
       )::bigint = 1
       and (
           details ->> 'new_row_revision'
       )::bigint = 2;


    if v_noise <> 1 then
        raise exception
            'P2_ATOMIC_RPC:movement_audit_provenance:%',
            v_noise;
    end if;
end
$p2_movement_runtime$;


-- ============================================================================
-- 4. RESERVATION — EXACT BED + ROW REVISION + IDEMPOTENCY
-- ============================================================================

do $p2_reservation_runtime$
declare
    v_module text;
    v_room text;
    v_bed text;

    v_before bigint;
    v_after bigint;

    v_result jsonb;
    v_id bigint;
    v_row_revision bigint;

    v_blocked boolean;
begin
    select
        bi.module,
        bi.room,
        bi.bed
      into
        v_module,
        v_room,
        v_bed
      from public.bed_inventory bi
     where not exists (
               select 1
               from public.workers w
               where nullif(
                         btrim(
                             coalesce(
                                 w.rut,
                                 ''
                             )
                         ),
                         ''
                     ) is not null
                 and upper(btrim(w.modulo)) =
                     upper(btrim(bi.module))
                 and upper(btrim(w.habitacion)) =
                     upper(btrim(bi.room))
                 and upper(btrim(w.cama)) =
                     upper(btrim(bi.bed))
           )
     order by
        bi.module,
        bi.room,
        bi.bed
     limit 1;


    if v_bed is null then
        raise exception
            'P2_ATOMIC_RPC:no_free_inventory_bed_for_reservation_test';
    end if;


    select value::bigint
      into v_before
      from public.settings
     where key = 'operational_revision';


    v_result :=
        public.p2_create_reservation(
            v_before,
            date '2099-02-01',
            date '2099-02-05',
            'P2 Atomic Reservation',
            'CERT',
            v_module,
            v_room,
            v_bed,
            1,
            'runtime certification'
        );


    v_after :=
        (v_result ->> 'state_version')::bigint;

    v_id :=
        (v_result -> 'data' ->> 'id')::bigint;

    v_row_revision :=
        (
            v_result -> 'data' ->> 'row_revision'
        )::bigint;


    if v_after <> v_before + 1
       or v_id is null
       or v_row_revision <> 1
    then
        raise exception
            'P2_ATOMIC_RPC:reservation_create:%',
            v_result;
    end if;


    -- Same-state mutation is idempotent and must not advance global revision.
    v_result :=
        public.p2_set_reservation_status(
            v_after,
            v_id,
            1,
            'PENDIENTE'
        );


    if coalesce(
           (v_result ->> 'idempotent')::boolean,
           false
       ) is not true
       or (
           v_result ->> 'state_version'
       )::bigint <> v_after
    then
        raise exception
            'P2_ATOMIC_RPC:reservation_idempotency:%',
            v_result;
    end if;


    -- Real transition increments both row and global revision.
    v_result :=
        public.p2_set_reservation_status(
            v_after,
            v_id,
            1,
            'CONFIRMADA'
        );


    if (
        v_result ->> 'state_version'
    )::bigint <> v_after + 1
       or (
           v_result -> 'data' ->> 'row_revision'
       )::bigint <> 2
       or (
           v_result ->
           'data' ->>
           'status'
       ) <> 'CONFIRMADA'
    then
        raise exception
            'P2_ATOMIC_RPC:reservation_transition:%',
            v_result;
    end if;


    -- Re-using stale row revision must conflict.
    v_blocked := false;

    begin
        perform public.p2_set_reservation_status(
            (v_result ->> 'state_version')::bigint,
            v_id,
            1,
            'ANULADA'
        );
    exception
        when sqlstate '40001' then
            if position(
                'P2_ROW_CONFLICT'
                in sqlerrm
            ) > 0 then
                v_blocked := true;
            else
                raise;
            end if;
    end;


    if not v_blocked then
        raise exception
            'P2_ATOMIC_RPC:reservation_stale_row_not_blocked';
    end if;
end
$p2_reservation_runtime$;


-- ============================================================================
-- 5. BED BLOCK — OVERLAP-SAFE CREATE + CLOSE
-- ============================================================================

do $p2_block_runtime$
declare
    v_module text;
    v_room text;
    v_bed text;

    v_before bigint;
    v_result jsonb;
    v_id bigint;
begin
    select
        bi.module,
        bi.room,
        bi.bed
      into
        v_module,
        v_room,
        v_bed
      from public.bed_inventory bi
     where not exists (
               select 1
               from public.workers w
               where nullif(
                         btrim(
                             coalesce(
                                 w.rut,
                                 ''
                             )
                         ),
                         ''
                     ) is not null
                 and upper(btrim(w.modulo)) =
                     upper(btrim(bi.module))
                 and upper(btrim(w.habitacion)) =
                     upper(btrim(bi.room))
                 and upper(btrim(w.cama)) =
                     upper(btrim(bi.bed))
           )
       and not exists (
               select 1
               from public.reservations r
               where r.status in (
                         'PENDIENTE',
                         'CONFIRMADA'
                     )
                 and upper(btrim(coalesce(r.module, ''))) =
                     upper(btrim(bi.module))
                 and upper(btrim(coalesce(r.room, ''))) =
                     upper(btrim(bi.room))
                 and upper(btrim(coalesce(r.bed, ''))) =
                     upper(btrim(bi.bed))
                 and r.arrival_date <= '2099-02-15'
                 and (
                     nullif(
                         btrim(
                             coalesce(
                                 r.departure_date,
                                 ''
                             )
                         ),
                         ''
                     ) is null
                     or r.departure_date >
                        '2099-02-10'
                 )
           )
     order by
        bi.module,
        bi.room,
        bi.bed
     limit 1;


    if v_bed is null then
        raise exception
            'P2_ATOMIC_RPC:no_inventory_bed_for_block_test';
    end if;


    select value::bigint
      into v_before
      from public.settings
     where key = 'operational_revision';


    v_result :=
        public.p2_create_bed_block(
            v_before,
            v_module,
            v_room,
            v_bed,
            date '2099-02-10',
            date '2099-02-15',
            'P2 atomic block'
        );


    if (
        v_result ->> 'state_version'
    )::bigint <> v_before + 1
       or (
           v_result -> 'data' ->> 'row_revision'
       )::bigint <> 1
    then
        raise exception
            'P2_ATOMIC_RPC:block_create:%',
            v_result;
    end if;


    v_id :=
        (
            v_result ->
            'data' ->
            'id'
        )::bigint;


    v_before :=
        (
            v_result ->>
            'state_version'
        )::bigint;


    v_result :=
        public.p2_close_bed_block(
            v_before,
            v_id,
            1
        );


    if (
        v_result ->> 'state_version'
    )::bigint <> v_before + 1
       or (
           v_result -> 'data' ->> 'row_revision'
       )::bigint <> 2
       or (
           v_result ->
           'data' ->>
           'status'
       ) <> 'CERRADO'
    then
        raise exception
            'P2_ATOMIC_RPC:block_close:%',
            v_result;
    end if;
end
$p2_block_runtime$;


-- ============================================================================
-- 6. DAILY CAPACITY — CREATE / IDEMPOTENT / UPDATE / ROW CONFLICT
-- ============================================================================

do $p2_capacity_runtime$
declare
    v_before bigint;
    v_result jsonb;
    v_after bigint;
    v_blocked boolean;
begin
    delete from public.daily_capacity
     where capacity_date = '2099-03-01';

    -- The cleanup itself is an operational source write and therefore bumps
    -- the revision even if no rows existed, because R4 uses statement triggers.
    select value::bigint
      into v_before
      from public.settings
     where key = 'operational_revision';


    v_result :=
        public.p2_upsert_daily_capacity(
            v_before,
            date '2099-03-01',
            250,
            null
        );


    v_after :=
        (v_result ->> 'state_version')::bigint;


    if v_after <> v_before + 1
       or (
           v_result -> 'data' ->> 'row_revision'
       )::bigint <> 1
    then
        raise exception
            'P2_ATOMIC_RPC:capacity_create:%',
            v_result;
    end if;


    v_result :=
        public.p2_upsert_daily_capacity(
            v_after,
            date '2099-03-01',
            250,
            1
        );


    if coalesce(
           (v_result ->> 'idempotent')::boolean,
           false
       ) is not true
       or (
           v_result ->> 'state_version'
       )::bigint <> v_after
    then
        raise exception
            'P2_ATOMIC_RPC:capacity_idempotency:%',
            v_result;
    end if;


    v_result :=
        public.p2_upsert_daily_capacity(
            v_after,
            date '2099-03-01',
            251,
            1
        );


    if (
        v_result ->> 'state_version'
    )::bigint <> v_after + 1
       or (
           v_result -> 'data' ->> 'row_revision'
       )::bigint <> 2
    then
        raise exception
            'P2_ATOMIC_RPC:capacity_update:%',
            v_result;
    end if;


    v_blocked := false;

    begin
        perform public.p2_upsert_daily_capacity(
            (
                v_result ->>
                'state_version'
            )::bigint,
            date '2099-03-01',
            252,
            1
        );
    exception
        when sqlstate '40001' then
            if position(
                'P2_ROW_CONFLICT'
                in sqlerrm
            ) > 0 then
                v_blocked := true;
            else
                raise;
            end if;
    end;


    if not v_blocked then
        raise exception
            'P2_ATOMIC_RPC:capacity_stale_row_not_blocked';
    end if;
end
$p2_capacity_runtime$;


-- ============================================================================
-- 7. COST SETTING — MANUAL GLOBAL REVISION ADVANCE EXACTLY ONCE
-- ============================================================================

do $p2_cost_runtime$
declare
    v_before bigint;
    v_existing_revision bigint;
    v_old_value text;
    v_new_value numeric;
    v_result jsonb;
    v_after bigint;
    v_blocked boolean;
begin
    select value::bigint
      into v_before
      from public.settings
     where key = 'operational_revision';


    select
        row_revision,
        value
      into
        v_existing_revision,
        v_old_value
      from public.settings
     where key = 'cost_per_bed_day'
     for update;


    if found then
        begin
            v_new_value :=
                coalesce(
                    nullif(v_old_value, '')::numeric,
                    0
                ) + 1;
        exception
            when others then
                v_new_value := 1;
        end;


        if v_new_value > 100000000 then
            v_new_value := 1;
        end if;


        v_result :=
            public.p2_set_cost_per_bed_day(
                v_before,
                v_new_value,
                v_existing_revision
            );
    else
        v_new_value := 1;

        v_result :=
            public.p2_set_cost_per_bed_day(
                v_before,
                v_new_value,
                null
            );
    end if;


    v_after :=
        (v_result ->> 'state_version')::bigint;


    if v_after <> v_before + 1 then
        raise exception
            'P2_ATOMIC_RPC:cost_global_revision:%:%',
            v_before,
            v_after;
    end if;


    if (
        v_result -> 'data' ->> 'row_revision'
    )::bigint < 1 then
        raise exception
            'P2_ATOMIC_RPC:cost_row_revision:%',
            v_result;
    end if;


    -- A deliberately impossible future row revision must conflict
    -- without changing the setting or advancing global state.
    v_blocked := false;

    begin
        perform public.p2_set_cost_per_bed_day(
            v_after,
            v_new_value + 1,
            (
                v_result -> 'data' ->> 'row_revision'
            )::bigint + 99
        );
    exception
        when sqlstate '40001' then
            if position(
                'P2_ROW_CONFLICT'
                in sqlerrm
            ) > 0 then
                v_blocked := true;
            else
                raise;
            end if;
    end;


    if not v_blocked then
        raise exception
            'P2_ATOMIC_RPC:cost_stale_row_not_blocked';
    end if;


    if (
        select value::bigint
        from public.settings
        where key = 'operational_revision'
    ) <> v_after then
        raise exception
            'P2_ATOMIC_RPC:cost_conflict_advanced_global_revision';
    end if;
end
$p2_cost_runtime$;


-- ============================================================================
-- 8. P2.5 / P2.6A FOUNDATIONS STILL HOLD
-- ============================================================================

do $p2_atomic_foundation_lock$
declare
    v_count integer;
begin
    select count(*)
      into v_count
      from pg_catalog.pg_trigger
     where tgrelid =
           'public.audit_log'::regclass
       and tgname in (
           'audit_log_p2_no_update_delete',
           'audit_log_p2_no_truncate'
       )
       and not tgisinternal;


    if v_count <> 2 then
        raise exception
            'P2_ATOMIC_RPC:append_only_drift:%',
            v_count;
    end if;


    select count(*)
      into v_count
      from pg_catalog.pg_trigger t
      join pg_catalog.pg_class c
        on c.oid = t.tgrelid
      join pg_catalog.pg_namespace n
        on n.oid = c.relnamespace
     where n.nspname = 'public'
       and t.tgname = 'p2_row_revision_bu'
       and not t.tgisinternal;


    if v_count <> 21 then
        raise exception
            'P2_ATOMIC_RPC:row_revision_trigger_drift:%',
            v_count;
    end if;
end
$p2_atomic_foundation_lock$;


select
    'P2.6B typed atomic mutation runtime: OK'
    as certification;
