-- ============================================================================
-- GARPI P2.6B — TYPED ATOMIC MUTATION RPCs
-- RELEASE TYPE : EXPAND / HARDEN
-- RUNTIME CUTOVER: NO
-- PRODUCTION DEPLOY: NO (repository migration only until explicit gate)
--
-- This migration introduces typed SECURITY DEFINER RPCs for the current
-- operational mutation surface while preserving the R4 statement-level
-- revision triggers until P2.6C Edge Function cutover is certified.
--
-- Concurrency model during this compatibility stage:
--   * R4-triggered tables:
--       lock + compare operational_revision first;
--       business DML runs in the same transaction;
--       existing R4 AFTER STATEMENT trigger advances the global revision.
--   * settings:
--       lock + compare operational_revision;
--       mutate setting;
--       explicitly advance operational_revision once in the same transaction.
--
-- No last-write-wins is allowed for existing mutable entities: row_revision
-- must match the caller's expected value.
-- ============================================================================


-- ============================================================================
-- 1. INTERNAL REVISION HELPERS
-- ============================================================================

create or replace function public.p2_lock_operational_revision(
    p_expected bigint
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog
as $p2_lock_operational_revision$
declare
    v_value text;
    v_current bigint;
begin
    if p_expected is null
       or p_expected < 1
    then
        raise exception
            'P2_EXPECTED_REVISION_REQUIRED'
            using errcode = '22023';
    end if;


    select s.value
      into v_value
      from public.settings s
     where s.key = 'operational_revision'
     for update;


    if not found
       or v_value !~ '^[0-9]+$'
    then
        raise exception
            'P2_OPERATIONAL_REVISION_UNAVAILABLE'
            using errcode = '55000';
    end if;


    v_current :=
        v_value::bigint;


    if v_current <> p_expected then
        raise exception
            'P2_STATE_CONFLICT current=% expected=%',
            v_current,
            p_expected
            using errcode = '40001';
    end if;


    return v_current;
end
$p2_lock_operational_revision$;


create or replace function public.p2_read_operational_revision()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog
as $p2_read_operational_revision$
declare
    v_value text;
begin
    select s.value
      into v_value
      from public.settings s
     where s.key = 'operational_revision';


    if not found
       or v_value !~ '^[0-9]+$'
    then
        raise exception
            'P2_OPERATIONAL_REVISION_UNAVAILABLE'
            using errcode = '55000';
    end if;


    return v_value::bigint;
end
$p2_read_operational_revision$;


create or replace function public.p2_require_row_revision(
    p_entity_type text,
    p_entity_id text,
    p_expected bigint,
    p_actual bigint
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog
as $p2_require_row_revision$
begin
    if p_expected is null
       or p_expected < 1
    then
        raise exception
            'P2_EXPECTED_ROW_REVISION_REQUIRED entity=% id=%',
            coalesce(p_entity_type, ''),
            coalesce(p_entity_id, '')
            using errcode = '22023';
    end if;


    if p_actual is null then
        raise exception
            'P2_NOT_FOUND entity=% id=%',
            coalesce(p_entity_type, ''),
            coalesce(p_entity_id, '')
            using errcode = 'P0002';
    end if;


    if p_expected <> p_actual then
        raise exception
            'P2_ROW_CONFLICT entity=% id=% current=% expected=%',
            coalesce(p_entity_type, ''),
            coalesce(p_entity_id, ''),
            p_actual,
            p_expected
            using errcode = '40001';
    end if;


    return p_actual;
end
$p2_require_row_revision$;


revoke all
    on function public.p2_lock_operational_revision(bigint)
    from public;

revoke all
    on function public.p2_read_operational_revision()
    from public;

revoke all
    on function public.p2_require_row_revision(text,text,bigint,bigint)
    from public;


do $p2_internal_revision_acl$
declare
    v_role text;
begin
    foreach v_role in array array[
        'anon',
        'authenticated',
        'service_role',
        'camp_app',
        'replit_app'
    ]
    loop
        if exists (
            select 1
            from pg_catalog.pg_roles
            where rolname = v_role
        ) then
            execute pg_catalog.format(
                'revoke execute on function public.p2_lock_operational_revision(bigint) from %I',
                v_role
            );

            execute pg_catalog.format(
                'revoke execute on function public.p2_read_operational_revision() from %I',
                v_role
            );

            execute pg_catalog.format(
                'revoke execute on function public.p2_require_row_revision(text,text,bigint,bigint) from %I',
                v_role
            );
        end if;
    end loop;
end
$p2_internal_revision_acl$;


-- ============================================================================
-- 2. MOVEMENTS
-- ============================================================================

create or replace function public.p2_create_movement(
    p_expected_revision bigint,
    p_movement_date date,
    p_movement_type text,
    p_shift text default '',
    p_company text default '',
    p_people_count integer default 0,
    p_bus_time text default '',
    p_bus text default '',
    p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $p2_create_movement$
declare
    v_current bigint;
    v_state bigint;
    v_type text;
    v_row public.movements%rowtype;
begin
    if p_movement_date is null then
        raise exception
            'P2_INVALID_MOVEMENT_DATE'
            using errcode = '22007';
    end if;


    v_type :=
        upper(
            btrim(
                coalesce(
                    p_movement_type,
                    ''
                )
            )
        );


    if v_type not in (
        'SUBIDA',
        'BAJADA'
    ) then
        raise exception
            'P2_INVALID_MOVEMENT_TYPE:%',
            v_type
            using errcode = '22023';
    end if;


    if p_people_count is null
       or p_people_count < 0
       or p_people_count > 10000
    then
        raise exception
            'P2_INVALID_PEOPLE_COUNT:%',
            coalesce(
                p_people_count::text,
                'null'
            )
            using errcode = '22023';
    end if;


    v_current :=
        public.p2_lock_operational_revision(
            p_expected_revision
        );


    insert into public.movements(
        movement_date,
        movement_type,
        shift,
        company,
        people_count,
        bus_time,
        bus,
        notes,
        lifecycle_status,
        executed_at,
        cancelled_at,
        created_at
    )
    values (
        p_movement_date::text,
        v_type,
        btrim(coalesce(p_shift, '')),
        btrim(coalesce(p_company, '')),
        p_people_count,
        btrim(coalesce(p_bus_time, '')),
        btrim(coalesce(p_bus, '')),
        btrim(coalesce(p_notes, '')),
        'PROGRAMADO',
        null,
        null,
        pg_catalog.clock_timestamp()::text
    )
    returning *
    into v_row;


    v_state :=
        public.p2_read_operational_revision();


    if v_state <= v_current then
        raise exception
            'P2_REVISION_DID_NOT_ADVANCE operation=create_movement current=% resulting=%',
            v_current,
            v_state
            using errcode = '55000';
    end if;


    return pg_catalog.jsonb_build_object(
        'ok',
        true,
        'state_version',
        v_state::text,
        'data',
        to_jsonb(v_row)
    );
end
$p2_create_movement$;


create or replace function public.p2_transition_movement(
    p_expected_revision bigint,
    p_movement_id bigint,
    p_expected_row_revision bigint,
    p_next_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $p2_transition_movement$
declare
    v_current bigint;
    v_state bigint;
    v_next text;
    v_row public.movements%rowtype;
begin
    if p_movement_id is null
       or p_movement_id <= 0
    then
        raise exception
            'P2_INVALID_MOVEMENT_ID'
            using errcode = '22023';
    end if;


    v_next :=
        upper(
            btrim(
                coalesce(
                    p_next_status,
                    ''
                )
            )
        );


    if v_next not in (
        'EJECUTADO',
        'CANCELADO'
    ) then
        raise exception
            'P2_INVALID_MOVEMENT_STATUS:%',
            v_next
            using errcode = '22023';
    end if;


    v_current :=
        public.p2_lock_operational_revision(
            p_expected_revision
        );


    select *
      into v_row
      from public.movements
     where id = p_movement_id
     for update;


    if not found then
        raise exception
            'P2_NOT_FOUND entity=movement id=%',
            p_movement_id
            using errcode = 'P0002';
    end if;


    perform
        public.p2_require_row_revision(
            'movement',
            p_movement_id::text,
            p_expected_row_revision,
            v_row.row_revision
        );


    if v_row.lifecycle_status <> 'PROGRAMADO' then
        raise exception
            'P2_INVALID_MOVEMENT_TRANSITION:%->%',
            v_row.lifecycle_status,
            v_next
            using errcode = '23514';
    end if;


    if v_next = 'EJECUTADO' then
        update public.movements
           set lifecycle_status = 'EJECUTADO',
               executed_at = pg_catalog.clock_timestamp(),
               cancelled_at = null
         where id = p_movement_id
        returning *
        into v_row;
    else
        update public.movements
           set lifecycle_status = 'CANCELADO',
               executed_at = null,
               cancelled_at = pg_catalog.clock_timestamp()
         where id = p_movement_id
        returning *
        into v_row;
    end if;


    v_state :=
        public.p2_read_operational_revision();


    if v_state <= v_current then
        raise exception
            'P2_REVISION_DID_NOT_ADVANCE operation=transition_movement current=% resulting=%',
            v_current,
            v_state
            using errcode = '55000';
    end if;


    return pg_catalog.jsonb_build_object(
        'ok',
        true,
        'state_version',
        v_state::text,
        'data',
        to_jsonb(v_row)
    );
end
$p2_transition_movement$;


-- ============================================================================
-- 3. RESERVATIONS
-- ============================================================================

create or replace function public.p2_create_reservation(
    p_expected_revision bigint,
    p_arrival_date date,
    p_departure_date date,
    p_person_name text,
    p_role_area text default '',
    p_module text default '',
    p_room text default '',
    p_bed text default '',
    p_bed_count integer default 1,
    p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $p2_create_reservation$
declare
    v_current bigint;
    v_state bigint;

    v_name text;
    v_module text;
    v_room text;
    v_bed text;

    v_match_count integer;
    v_end text;

    v_row public.reservations%rowtype;
begin
    if p_arrival_date is null then
        raise exception
            'P2_INVALID_RESERVATION_ARRIVAL'
            using errcode = '22007';
    end if;


    if p_departure_date is not null
       and p_departure_date <= p_arrival_date
    then
        raise exception
            'P2_INVALID_RESERVATION_INTERVAL'
            using errcode = '22023';
    end if;


    v_name :=
        btrim(
            coalesce(
                p_person_name,
                ''
            )
        );


    if v_name = '' then
        raise exception
            'P2_RESERVATION_PERSON_REQUIRED'
            using errcode = '22023';
    end if;


    if p_bed_count is null
       or p_bed_count < 1
       or p_bed_count > 1000
    then
        raise exception
            'P2_INVALID_RESERVATION_BED_COUNT'
            using errcode = '22023';
    end if;


    v_module :=
        btrim(
            coalesce(
                p_module,
                ''
            )
        );

    v_room :=
        btrim(
            coalesce(
                p_room,
                ''
            )
        );

    v_bed :=
        upper(
            btrim(
                coalesce(
                    p_bed,
                    ''
                )
            )
        );


    if v_bed <> ''
       and (
           v_module = ''
           or v_room = ''
       )
    then
        raise exception
            'P2_EXACT_BED_REQUIRES_MODULE_ROOM'
            using errcode = '22023';
    end if;


    if v_bed <> ''
       and p_bed_count <> 1
    then
        raise exception
            'P2_EXACT_BED_REQUIRES_SINGLE_BED_COUNT'
            using errcode = '22023';
    end if;


    v_current :=
        public.p2_lock_operational_revision(
            p_expected_revision
        );


    if v_bed <> '' then
        select
            count(*)::integer,
            min(bi.module),
            min(bi.room),
            min(bi.bed)
          into
            v_match_count,
            v_module,
            v_room,
            v_bed
          from public.bed_inventory bi
         where upper(btrim(bi.module)) =
               upper(btrim(p_module))
           and upper(btrim(bi.room)) =
               upper(btrim(p_room))
           and upper(btrim(bi.bed)) =
               upper(btrim(p_bed));


        if v_match_count <> 1 then
            raise exception
                'P2_BED_NOT_EXACTLY_RESOLVED matches=%',
                v_match_count
                using errcode = '22023';
        end if;


        if exists (
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
                  upper(btrim(v_module))
              and upper(btrim(w.habitacion)) =
                  upper(btrim(v_room))
              and upper(btrim(w.cama)) =
                  upper(btrim(v_bed))
        ) then
            raise exception
                'P2_BED_CURRENTLY_OCCUPIED'
                using errcode = '23514';
        end if;


        v_end :=
            coalesce(
                p_departure_date::text,
                '9999-12-31'
            );


        if exists (
            select 1
            from public.bed_blocks b
            where upper(btrim(b.status)) = 'ACTIVO'
              and upper(btrim(b.module)) =
                  upper(btrim(v_module))
              and upper(btrim(b.room)) =
                  upper(btrim(v_room))
              and upper(btrim(b.bed)) =
                  upper(btrim(v_bed))
              and b.start_date < v_end
              and (
                  nullif(
                      btrim(
                          coalesce(
                              b.end_date,
                              ''
                          )
                      ),
                      ''
                  ) is null
                  or b.end_date >=
                     p_arrival_date::text
              )
        ) then
            raise exception
                'P2_RESERVATION_OVERLAPS_BED_BLOCK'
                using errcode = '23514';
        end if;


        if exists (
            select 1
            from public.reservations r
            where r.status in (
                      'PENDIENTE',
                      'CONFIRMADA'
                  )
              and upper(btrim(coalesce(r.module, ''))) =
                  upper(btrim(v_module))
              and upper(btrim(coalesce(r.room, ''))) =
                  upper(btrim(v_room))
              and upper(btrim(coalesce(r.bed, ''))) =
                  upper(btrim(v_bed))
              and r.arrival_date < v_end
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
                     p_arrival_date::text
              )
        ) then
            raise exception
                'P2_RESERVATION_OVERLAPS_ACTIVE_RESERVATION'
                using errcode = '23514';
        end if;
    end if;


    insert into public.reservations(
        arrival_date,
        departure_date,
        person_name,
        role_area,
        module,
        room,
        bed,
        bed_count,
        notes,
        status,
        created_at,
        updated_at
    )
    values (
        p_arrival_date::text,
        p_departure_date::text,
        v_name,
        btrim(coalesce(p_role_area, '')),
        nullif(v_module, ''),
        nullif(v_room, ''),
        nullif(v_bed, ''),
        p_bed_count,
        btrim(coalesce(p_notes, '')),
        'PENDIENTE',
        pg_catalog.clock_timestamp()::text,
        pg_catalog.clock_timestamp()::text
    )
    returning *
    into v_row;


    v_state :=
        public.p2_read_operational_revision();


    if v_state <= v_current then
        raise exception
            'P2_REVISION_DID_NOT_ADVANCE operation=create_reservation current=% resulting=%',
            v_current,
            v_state
            using errcode = '55000';
    end if;


    return pg_catalog.jsonb_build_object(
        'ok',
        true,
        'state_version',
        v_state::text,
        'data',
        to_jsonb(v_row)
    );
end
$p2_create_reservation$;


create or replace function public.p2_set_reservation_status(
    p_expected_revision bigint,
    p_reservation_id bigint,
    p_expected_row_revision bigint,
    p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $p2_set_reservation_status$
declare
    v_current bigint;
    v_state bigint;
    v_status text;
    v_row public.reservations%rowtype;
begin
    if p_reservation_id is null
       or p_reservation_id <= 0
    then
        raise exception
            'P2_INVALID_RESERVATION_ID'
            using errcode = '22023';
    end if;


    v_status :=
        upper(
            btrim(
                coalesce(
                    p_status,
                    ''
                )
            )
        );


    if v_status not in (
        'PENDIENTE',
        'CONFIRMADA',
        'CANCELADA',
        'ANULADA'
    ) then
        raise exception
            'P2_INVALID_RESERVATION_STATUS:%',
            v_status
            using errcode = '22023';
    end if;


    v_current :=
        public.p2_lock_operational_revision(
            p_expected_revision
        );


    select *
      into v_row
      from public.reservations
     where id = p_reservation_id
     for update;


    if not found then
        raise exception
            'P2_NOT_FOUND entity=reservation id=%',
            p_reservation_id
            using errcode = 'P0002';
    end if;


    perform
        public.p2_require_row_revision(
            'reservation',
            p_reservation_id::text,
            p_expected_row_revision,
            v_row.row_revision
        );


    if v_row.status = v_status then
        return pg_catalog.jsonb_build_object(
            'ok',
            true,
            'idempotent',
            true,
            'state_version',
            v_current::text,
            'data',
            to_jsonb(v_row)
        );
    end if;


    update public.reservations
       set status = v_status,
           updated_at =
               pg_catalog.clock_timestamp()::text
     where id = p_reservation_id
    returning *
    into v_row;


    v_state :=
        public.p2_read_operational_revision();


    if v_state <= v_current then
        raise exception
            'P2_REVISION_DID_NOT_ADVANCE operation=set_reservation_status current=% resulting=%',
            v_current,
            v_state
            using errcode = '55000';
    end if;


    return pg_catalog.jsonb_build_object(
        'ok',
        true,
        'idempotent',
        false,
        'state_version',
        v_state::text,
        'data',
        to_jsonb(v_row)
    );
end
$p2_set_reservation_status$;


-- ============================================================================
-- 4. BED BLOCKS
-- ============================================================================

create or replace function public.p2_create_bed_block(
    p_expected_revision bigint,
    p_module text,
    p_room text,
    p_bed text,
    p_start_date date,
    p_end_date date,
    p_reason text default 'Fuera de servicio'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $p2_create_bed_block$
declare
    v_current bigint;
    v_state bigint;

    v_module text;
    v_room text;
    v_bed text;
    v_match_count integer;

    v_end text;
    v_today date;

    v_row public.bed_blocks%rowtype;
begin
    if p_start_date is null then
        raise exception
            'P2_INVALID_BLOCK_START_DATE'
            using errcode = '22007';
    end if;


    if p_end_date is not null
       and p_end_date < p_start_date
    then
        raise exception
            'P2_INVALID_BLOCK_INTERVAL'
            using errcode = '22023';
    end if;


    if nullif(btrim(coalesce(p_module, '')), '') is null
       or nullif(btrim(coalesce(p_room, '')), '') is null
       or nullif(btrim(coalesce(p_bed, '')), '') is null
    then
        raise exception
            'P2_BLOCK_EXACT_BED_REQUIRED'
            using errcode = '22023';
    end if;


    v_current :=
        public.p2_lock_operational_revision(
            p_expected_revision
        );


    select
        count(*)::integer,
        min(bi.module),
        min(bi.room),
        min(bi.bed)
      into
        v_match_count,
        v_module,
        v_room,
        v_bed
      from public.bed_inventory bi
     where upper(btrim(bi.module)) =
           upper(btrim(p_module))
       and upper(btrim(bi.room)) =
           upper(btrim(p_room))
       and upper(btrim(bi.bed)) =
           upper(btrim(p_bed));


    if v_match_count <> 1 then
        raise exception
            'P2_BED_NOT_EXACTLY_RESOLVED matches=%',
            v_match_count
            using errcode = '22023';
    end if;


    v_today :=
        (
            pg_catalog.clock_timestamp()
            at time zone 'America/Santiago'
        )::date;


    if p_start_date <= v_today
       and exists (
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
                 upper(btrim(v_module))
             and upper(btrim(w.habitacion)) =
                 upper(btrim(v_room))
             and upper(btrim(w.cama)) =
                 upper(btrim(v_bed))
       )
    then
        raise exception
            'P2_BED_CURRENTLY_OCCUPIED'
            using errcode = '23514';
    end if;


    v_end :=
        coalesce(
            p_end_date::text,
            '9999-12-31'
        );


    if exists (
        select 1
        from public.bed_blocks b
        where upper(btrim(b.status)) = 'ACTIVO'
          and upper(btrim(b.module)) =
              upper(btrim(v_module))
          and upper(btrim(b.room)) =
              upper(btrim(v_room))
          and upper(btrim(b.bed)) =
              upper(btrim(v_bed))
          and b.start_date <= v_end
          and (
              nullif(
                  btrim(
                      coalesce(
                          b.end_date,
                          ''
                      )
                  ),
                  ''
              ) is null
              or b.end_date >=
                 p_start_date::text
          )
    ) then
        raise exception
            'P2_BLOCK_OVERLAPS_ACTIVE_BLOCK'
            using errcode = '23514';
    end if;


    if exists (
        select 1
        from public.reservations r
        where r.status in (
                  'PENDIENTE',
                  'CONFIRMADA'
              )
          and upper(btrim(coalesce(r.module, ''))) =
              upper(btrim(v_module))
          and upper(btrim(coalesce(r.room, ''))) =
              upper(btrim(v_room))
          and upper(btrim(coalesce(r.bed, ''))) =
              upper(btrim(v_bed))
          and r.arrival_date <= v_end
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
                 p_start_date::text
          )
    ) then
        raise exception
            'P2_BLOCK_OVERLAPS_ACTIVE_RESERVATION'
            using errcode = '23514';
    end if;


    insert into public.bed_blocks(
        module,
        room,
        bed,
        start_date,
        end_date,
        reason,
        status,
        created_at,
        updated_at
    )
    values (
        v_module,
        v_room,
        v_bed,
        p_start_date::text,
        p_end_date::text,
        coalesce(
            nullif(
                btrim(
                    coalesce(
                        p_reason,
                        ''
                    )
                ),
                ''
            ),
            'Fuera de servicio'
        ),
        'ACTIVO',
        pg_catalog.clock_timestamp()::text,
        pg_catalog.clock_timestamp()::text
    )
    returning *
    into v_row;


    v_state :=
        public.p2_read_operational_revision();


    if v_state <= v_current then
        raise exception
            'P2_REVISION_DID_NOT_ADVANCE operation=create_bed_block current=% resulting=%',
            v_current,
            v_state
            using errcode = '55000';
    end if;


    return pg_catalog.jsonb_build_object(
        'ok',
        true,
        'state_version',
        v_state::text,
        'data',
        to_jsonb(v_row)
    );
end
$p2_create_bed_block$;


create or replace function public.p2_close_bed_block(
    p_expected_revision bigint,
    p_block_id bigint,
    p_expected_row_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $p2_close_bed_block$
declare
    v_current bigint;
    v_state bigint;
    v_row public.bed_blocks%rowtype;
begin
    if p_block_id is null
       or p_block_id <= 0
    then
        raise exception
            'P2_INVALID_BLOCK_ID'
            using errcode = '22023';
    end if;


    v_current :=
        public.p2_lock_operational_revision(
            p_expected_revision
        );


    select *
      into v_row
      from public.bed_blocks
     where id = p_block_id
     for update;


    if not found then
        raise exception
            'P2_NOT_FOUND entity=bed_block id=%',
            p_block_id
            using errcode = 'P0002';
    end if;


    perform
        public.p2_require_row_revision(
            'bed_block',
            p_block_id::text,
            p_expected_row_revision,
            v_row.row_revision
        );


    if v_row.status = 'CERRADO' then
        return pg_catalog.jsonb_build_object(
            'ok',
            true,
            'idempotent',
            true,
            'state_version',
            v_current::text,
            'data',
            to_jsonb(v_row)
        );
    end if;


    update public.bed_blocks
       set status = 'CERRADO',
           updated_at =
               pg_catalog.clock_timestamp()::text
     where id = p_block_id
    returning *
    into v_row;


    v_state :=
        public.p2_read_operational_revision();


    if v_state <= v_current then
        raise exception
            'P2_REVISION_DID_NOT_ADVANCE operation=close_bed_block current=% resulting=%',
            v_current,
            v_state
            using errcode = '55000';
    end if;


    return pg_catalog.jsonb_build_object(
        'ok',
        true,
        'idempotent',
        false,
        'state_version',
        v_state::text,
        'data',
        to_jsonb(v_row)
    );
end
$p2_close_bed_block$;


-- ============================================================================
-- 5. DAILY CAPACITY
-- ============================================================================

create or replace function public.p2_upsert_daily_capacity(
    p_expected_revision bigint,
    p_capacity_date date,
    p_capacity integer,
    p_expected_row_revision bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $p2_upsert_daily_capacity$
declare
    v_current bigint;
    v_state bigint;
    v_existing public.daily_capacity%rowtype;
    v_row public.daily_capacity%rowtype;
begin
    if p_capacity_date is null then
        raise exception
            'P2_INVALID_CAPACITY_DATE'
            using errcode = '22007';
    end if;


    if p_capacity is null
       or p_capacity < 0
       or p_capacity > 10000
    then
        raise exception
            'P2_INVALID_CAPACITY_VALUE:%',
            coalesce(
                p_capacity::text,
                'null'
            )
            using errcode = '22023';
    end if;


    v_current :=
        public.p2_lock_operational_revision(
            p_expected_revision
        );


    select *
      into v_existing
      from public.daily_capacity
     where capacity_date =
           p_capacity_date::text
     for update;


    if found then
        perform
            public.p2_require_row_revision(
                'daily_capacity',
                p_capacity_date::text,
                p_expected_row_revision,
                v_existing.row_revision
            );


        if v_existing.capacity =
           p_capacity
        then
            return pg_catalog.jsonb_build_object(
                'ok',
                true,
                'idempotent',
                true,
                'state_version',
                v_current::text,
                'data',
                to_jsonb(v_existing)
            );
        end if;


        update public.daily_capacity
           set capacity = p_capacity,
               updated_at =
                   pg_catalog.clock_timestamp()::text
         where capacity_date =
               p_capacity_date::text
        returning *
        into v_row;
    else
        if p_expected_row_revision is not null then
            raise exception
                'P2_ROW_CONFLICT entity=daily_capacity id=% current=null expected=%',
                p_capacity_date::text,
                p_expected_row_revision
                using errcode = '40001';
        end if;


        insert into public.daily_capacity(
            capacity_date,
            capacity,
            updated_at
        )
        values (
            p_capacity_date::text,
            p_capacity,
            pg_catalog.clock_timestamp()::text
        )
        returning *
        into v_row;
    end if;


    v_state :=
        public.p2_read_operational_revision();


    if v_state <= v_current then
        raise exception
            'P2_REVISION_DID_NOT_ADVANCE operation=upsert_daily_capacity current=% resulting=%',
            v_current,
            v_state
            using errcode = '55000';
    end if;


    return pg_catalog.jsonb_build_object(
        'ok',
        true,
        'idempotent',
        false,
        'state_version',
        v_state::text,
        'data',
        to_jsonb(v_row)
    );
end
$p2_upsert_daily_capacity$;


-- ============================================================================
-- 6. COST SETTING
-- ============================================================================

create or replace function public.p2_set_cost_per_bed_day(
    p_expected_revision bigint,
    p_value numeric,
    p_expected_row_revision bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $p2_set_cost_per_bed_day$
declare
    v_current bigint;
    v_state bigint;

    v_existing public.settings%rowtype;
    v_row public.settings%rowtype;

    v_text_value text;
begin
    if p_value is null
       or p_value < 0
       or p_value > 100000000
    then
        raise exception
            'P2_INVALID_COST_PER_BED_DAY:%',
            coalesce(
                p_value::text,
                'null'
            )
            using errcode = '22023';
    end if;


    v_current :=
        public.p2_lock_operational_revision(
            p_expected_revision
        );


    v_text_value :=
        p_value::text;


    select *
      into v_existing
      from public.settings
     where key = 'cost_per_bed_day'
     for update;


    if found then
        perform
            public.p2_require_row_revision(
                'setting',
                'cost_per_bed_day',
                p_expected_row_revision,
                v_existing.row_revision
            );


        if v_existing.value =
           v_text_value
        then
            return pg_catalog.jsonb_build_object(
                'ok',
                true,
                'idempotent',
                true,
                'state_version',
                v_current::text,
                'data',
                to_jsonb(v_existing)
            );
        end if;


        update public.settings
           set value =
               v_text_value
         where key =
               'cost_per_bed_day'
        returning *
        into v_row;
    else
        if p_expected_row_revision is not null then
            raise exception
                'P2_ROW_CONFLICT entity=setting id=cost_per_bed_day current=null expected=%',
                p_expected_row_revision
                using errcode = '40001';
        end if;


        insert into public.settings(
            key,
            value
        )
        values (
            'cost_per_bed_day',
            v_text_value
        )
        returning *
        into v_row;
    end if;


    -- settings is intentionally not part of the legacy R4 statement-level
    -- revision trigger set. Advance the already-locked global revision once.
    update public.settings
       set value =
           (v_current + 1)::text
     where key =
           'operational_revision';


    v_state :=
        public.p2_read_operational_revision();


    if v_state <> v_current + 1 then
        raise exception
            'P2_REVISION_ADVANCE_INVALID operation=set_cost current=% resulting=%',
            v_current,
            v_state
            using errcode = '55000';
    end if;


    return pg_catalog.jsonb_build_object(
        'ok',
        true,
        'idempotent',
        false,
        'state_version',
        v_state::text,
        'data',
        to_jsonb(v_row)
    );
end
$p2_set_cost_per_bed_day$;


-- ============================================================================
-- 7. EXECUTION BOUNDARY
-- ============================================================================

revoke all
    on function public.p2_create_movement(bigint,date,text,text,text,integer,text,text,text)
    from public;

revoke all
    on function public.p2_transition_movement(bigint,bigint,bigint,text)
    from public;

revoke all
    on function public.p2_create_reservation(bigint,date,date,text,text,text,text,text,integer,text)
    from public;

revoke all
    on function public.p2_set_reservation_status(bigint,bigint,bigint,text)
    from public;

revoke all
    on function public.p2_create_bed_block(bigint,text,text,text,date,date,text)
    from public;

revoke all
    on function public.p2_close_bed_block(bigint,bigint,bigint)
    from public;

revoke all
    on function public.p2_upsert_daily_capacity(bigint,date,integer,bigint)
    from public;

revoke all
    on function public.p2_set_cost_per_bed_day(bigint,numeric,bigint)
    from public;


do $p2_atomic_mutation_acl$
declare
    v_role text;
    v_signature text;
begin
    foreach v_role in array array[
        'anon',
        'authenticated',
        'camp_app',
        'replit_app'
    ]
    loop
        if exists (
            select 1
            from pg_catalog.pg_roles
            where rolname = v_role
        ) then
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
                execute pg_catalog.format(
                    'revoke execute on function %s from %I',
                    v_signature,
                    v_role
                );
            end loop;
        end if;
    end loop;


    if exists (
        select 1
        from pg_catalog.pg_roles
        where rolname = 'service_role'
    ) then
        grant execute
            on function public.p2_create_movement(bigint,date,text,text,text,integer,text,text,text)
            to service_role;

        grant execute
            on function public.p2_transition_movement(bigint,bigint,bigint,text)
            to service_role;

        grant execute
            on function public.p2_create_reservation(bigint,date,date,text,text,text,text,text,integer,text)
            to service_role;

        grant execute
            on function public.p2_set_reservation_status(bigint,bigint,bigint,text)
            to service_role;

        grant execute
            on function public.p2_create_bed_block(bigint,text,text,text,date,date,text)
            to service_role;

        grant execute
            on function public.p2_close_bed_block(bigint,bigint,bigint)
            to service_role;

        grant execute
            on function public.p2_upsert_daily_capacity(bigint,date,integer,bigint)
            to service_role;

        grant execute
            on function public.p2_set_cost_per_bed_day(bigint,numeric,bigint)
            to service_role;
    end if;
end
$p2_atomic_mutation_acl$;


-- ============================================================================
-- 8. DOCUMENTATION
-- ============================================================================

comment on function public.p2_lock_operational_revision(bigint) is
    'P2.6B internal compatibility lock: validates and locks the current operational revision without advancing it. R4-triggered business DML advances the revision after success.';

comment on function public.p2_require_row_revision(text,text,bigint,bigint) is
    'P2.6B internal optimistic-concurrency assertion. Raises SQLSTATE 40001 P2_ROW_CONFLICT on stale entity revision.';

comment on function public.p2_create_movement(bigint,date,text,text,text,integer,text,text,text) is
    'P2.6B atomic movement creation RPC with global revision fence.';

comment on function public.p2_transition_movement(bigint,bigint,bigint,text) is
    'P2.6B atomic movement terminal transition with global + row revision fences.';

comment on function public.p2_create_reservation(bigint,date,date,text,text,text,text,text,integer,text) is
    'P2.6B atomic reservation creation with exact-bed availability validation under the global revision lock.';

comment on function public.p2_set_reservation_status(bigint,bigint,bigint,text) is
    'P2.6B atomic reservation lifecycle mutation with global + row revision fences.';

comment on function public.p2_create_bed_block(bigint,text,text,text,date,date,text) is
    'P2.6B atomic exact-bed block creation with occupancy and overlap validation.';

comment on function public.p2_close_bed_block(bigint,bigint,bigint) is
    'P2.6B atomic bed-block close with global + row revision fences.';

comment on function public.p2_upsert_daily_capacity(bigint,date,integer,bigint) is
    'P2.6B atomic daily-capacity mutation with expected row revision for existing dates.';

comment on function public.p2_set_cost_per_bed_day(bigint,numeric,bigint) is
    'P2.6B atomic cost setting mutation with explicit operational revision advance.';
