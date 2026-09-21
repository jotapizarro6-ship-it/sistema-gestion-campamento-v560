-- GARPI P2.5B/C/D runtime certification
-- Intended only for an isolated PostgreSQL 17 CI database.

\set ON_ERROR_STOP on


-- ============================================================================
-- CATALOG / COVERAGE
-- ============================================================================

do $p2_audit_coverage_catalog$
declare
    v_count integer;
    v_search_path_ok boolean;
    v_security_definer boolean;
    v_role text;
begin
    select count(*)
      into v_count
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n
        on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'p2_audit_row_change';

    if v_count <> 1 then
        raise exception
            'P2_AUDIT_COVERAGE:function_count:%',
            v_count;
    end if;


    select
        p.prosecdef,
        coalesce(
            array_to_string(
                p.proconfig,
                ','
            ),
            ''
        ) like '%search_path=pg_catalog%'
      into
        v_security_definer,
        v_search_path_ok
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n
        on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'p2_audit_row_change';


    if not coalesce(
        v_security_definer,
        false
    ) then
        raise exception
            'P2_AUDIT_COVERAGE:not_security_definer';
    end if;


    if not coalesce(
        v_search_path_ok,
        false
    ) then
        raise exception
            'P2_AUDIT_COVERAGE:search_path';
    end if;


    select count(*)
      into v_count
      from pg_catalog.pg_trigger t
      join pg_catalog.pg_class c
        on c.oid = t.tgrelid
      join pg_catalog.pg_namespace n
        on n.oid = c.relnamespace
     where n.nspname = 'public'
       and t.tgname = 'p2_audit_row_change'
       and not t.tgisinternal;

    if v_count <> 21 then
        raise exception
            'P2_AUDIT_COVERAGE:trigger_count:%',
            v_count;
    end if;


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
            'public.p2_audit_row_change()',
            'EXECUTE'
        ) then
            raise exception
                'P2_AUDIT_COVERAGE:direct_execute:%',
                v_role;
        end if;
    end loop;
end
$p2_audit_coverage_catalog$;


-- ============================================================================
-- EXACT TARGET SET
-- ============================================================================

do $p2_audit_target_set$
declare
    v_expected text[] := array[
        'assignments',
        'bed_blocks',
        'camp_beds',
        'camp_modules',
        'camp_rooms',
        'camps',
        'companies',
        'company_aliases',
        'daily_capacity',
        'daily_snapshots',
        'import_history',
        'master_plan_events',
        'movements',
        'operational_actions',
        'persons',
        'reservation_members',
        'reservations',
        'settings',
        'shift_aliases',
        'shifts',
        'what_if_scenarios'
    ];

    v_actual text[];
    v_forbidden text;
begin
    select array_agg(
               c.relname
               order by c.relname
           )
      into v_actual
      from pg_catalog.pg_trigger t
      join pg_catalog.pg_class c
        on c.oid = t.tgrelid
      join pg_catalog.pg_namespace n
        on n.oid = c.relnamespace
     where n.nspname = 'public'
       and t.tgname = 'p2_audit_row_change'
       and not t.tgisinternal;


    if v_actual is distinct from v_expected then
        raise exception
            'P2_AUDIT_COVERAGE:target_set:%',
            v_actual;
    end if;


    foreach v_forbidden in array array[
        'workers',
        'bed_inventory',
        'consultation_log',
        'audit_log',
        'operational_revision',
        'p2_bed_resolution_current',
        'p2_bed_resolution_ledger'
    ]
    loop
        if exists (
            select 1
            from pg_catalog.pg_trigger t
            join pg_catalog.pg_class c
              on c.oid = t.tgrelid
            join pg_catalog.pg_namespace n
              on n.oid = c.relnamespace
            where n.nspname = 'public'
              and c.relname = v_forbidden
              and t.tgname =
                  'p2_audit_row_change'
              and not t.tgisinternal
        ) then
            raise exception
                'P2_AUDIT_COVERAGE:forbidden_target:%',
                v_forbidden;
        end if;
    end loop;
end
$p2_audit_target_set$;


-- ============================================================================
-- AUTOMATIC INSERT / UPDATE / DELETE EVENTS
-- ============================================================================

do $p2_audit_row_events$
declare
    v_id bigint;
    v_insert_audit bigint;
    v_update_audit bigint;
    v_delete_audit bigint;
    v_details jsonb;
begin
    insert into public.operational_actions(
        title,
        detail,
        category,
        severity,
        status,
        owner_name,
        source_type
    )
    values (
        'P2.5 audit runtime',
        'isolated certification',
        'CERTIFICATION',
        'INFO',
        'PENDIENTE',
        '',
        'SYSTEM_TEST'
    )
    returning id
    into v_id;


    select
        id,
        details
      into
        v_insert_audit,
        v_details
      from public.audit_log
     where action = 'ROW_INSERT'
       and entity_type =
           'operational_action'
       and entity_id = v_id::text
       and endpoint =
           'DATABASE_TRIGGER'
     order by id desc
     limit 1;


    if v_insert_audit is null then
        raise exception
            'P2_AUDIT_COVERAGE:insert_event_missing';
    end if;


    if coalesce(
        v_details ->> 'table',
        ''
    ) <> 'operational_actions'
    or coalesce(
        v_details ->> 'operation',
        ''
    ) <> 'INSERT'
    or nullif(
        v_details ->> 'transaction_id',
        ''
    ) is null
    or nullif(
        v_details ->> 'new_fingerprint',
        ''
    ) is null
    or v_details ? 'row'
    or v_details ? 'payload'
    or v_details ? 'new'
    or v_details ? 'old'
    then
        raise exception
            'P2_AUDIT_COVERAGE:insert_details:%',
            v_details;
    end if;


    update public.operational_actions
       set status = 'EN_GESTION',
           updated_at = pg_catalog.clock_timestamp()
     where id = v_id;


    select id
      into v_update_audit
      from public.audit_log
     where action = 'ROW_UPDATE'
       and entity_type =
           'operational_action'
       and entity_id = v_id::text
       and endpoint =
           'DATABASE_TRIGGER'
     order by id desc
     limit 1;


    if v_update_audit is null then
        raise exception
            'P2_AUDIT_COVERAGE:update_event_missing';
    end if;


    delete from public.operational_actions
     where id = v_id;


    select id
      into v_delete_audit
      from public.audit_log
     where action = 'ROW_DELETE'
       and entity_type =
           'operational_action'
       and entity_id = v_id::text
       and endpoint =
           'DATABASE_TRIGGER'
     order by id desc
     limit 1;


    if v_delete_audit is null then
        raise exception
            'P2_AUDIT_COVERAGE:delete_event_missing';
    end if;


    if not (
        v_insert_audit <
        v_update_audit
        and
        v_update_audit <
        v_delete_audit
    ) then
        raise exception
            'P2_AUDIT_COVERAGE:event_order:%:%:%',
            v_insert_audit,
            v_update_audit,
            v_delete_audit;
    end if;
end
$p2_audit_row_events$;


-- ============================================================================
-- BUSINESS-KEY ENTITY ID (NON-ID PRIMARY KEY)
-- ============================================================================

do $p2_audit_business_key$
declare
    v_date text :=
        '2099-12-31';
begin
    insert into public.daily_capacity(
        capacity_date,
        capacity,
        updated_at
    )
    values (
        v_date,
        0,
        pg_catalog.clock_timestamp()::text
    )
    on conflict (capacity_date)
    do update
       set capacity = excluded.capacity,
           updated_at = excluded.updated_at;


    if not exists (
        select 1
        from public.audit_log
        where entity_type =
            'daily_capacity'
          and entity_id =
            v_date
          and endpoint =
            'DATABASE_TRIGGER'
    ) then
        raise exception
            'P2_AUDIT_COVERAGE:business_key_entity_id';
    end if;
end
$p2_audit_business_key$;


-- ============================================================================
-- AUDIT FAILURE MUST ABORT BUSINESS WRITE
-- ============================================================================

create or replace function public.p2_audit_runtime_force_failure()
returns trigger
language plpgsql
set search_path = pg_catalog
as $p2_audit_runtime_failure$
begin
    if new.endpoint =
           'DATABASE_TRIGGER'
       and new.entity_type =
           'operational_action'
       and new.action =
           'ROW_INSERT'
       and new.details ->> 'table' =
           'operational_actions'
    then
        raise exception
            'P2_AUDIT_RUNTIME_FORCED_FAILURE'
            using errcode = '55000';
    end if;

    return new;
end
$p2_audit_runtime_failure$;


create trigger p2_audit_runtime_force_failure
before insert
on public.audit_log
for each row
execute function public.p2_audit_runtime_force_failure();


do $p2_audit_atomicity$
declare
    v_blocked boolean :=
        false;
begin
    begin
        insert into public.operational_actions(
            title,
            detail,
            category,
            severity,
            status,
            owner_name,
            source_type
        )
        values (
            'P2.5 forced atomic rollback',
            'must never persist',
            'CERTIFICATION',
            'INFO',
            'PENDIENTE',
            '',
            'SYSTEM_TEST'
        );
    exception
        when sqlstate '55000' then
            if position(
                'P2_AUDIT_RUNTIME_FORCED_FAILURE'
                in sqlerrm
            ) > 0 then
                v_blocked :=
                    true;
            else
                raise;
            end if;
    end;


    if not v_blocked then
        raise exception
            'P2_AUDIT_COVERAGE:audit_failure_not_propagated';
    end if;


    if exists (
        select 1
        from public.operational_actions
        where title =
            'P2.5 forced atomic rollback'
    ) then
        raise exception
            'P2_AUDIT_COVERAGE:business_write_survived_audit_failure';
    end if;
end
$p2_audit_atomicity$;


drop trigger p2_audit_runtime_force_failure
    on public.audit_log;

drop function public.p2_audit_runtime_force_failure();


-- ============================================================================
-- TECHNICAL REVISION EXCLUSION
-- ============================================================================

do $p2_audit_revision_exclusion$
declare
    v_before bigint;
    v_after bigint;
begin
    select count(*)
      into v_before
      from public.audit_log
     where entity_type = 'setting'
       and entity_id = 'operational_revision'
       and endpoint = 'DATABASE_TRIGGER';


    update public.settings
       set value =
           (
               case
                   when value ~ '^[0-9]+$'
                   then (value::bigint + 1)::text
                   else '1'
               end
           )
     where key = 'operational_revision';


    select count(*)
      into v_after
      from public.audit_log
     where entity_type = 'setting'
       and entity_id = 'operational_revision'
       and endpoint = 'DATABASE_TRIGGER';


    if v_after <> v_before then
        raise exception
            'P2_AUDIT_COVERAGE:operational_revision_noise:%:%',
            v_before,
            v_after;
    end if;
end
$p2_audit_revision_exclusion$;


-- ============================================================================
-- SECRET-BEARING SETTING FINGERPRINT SUPPRESSION
-- ============================================================================

do $p2_audit_secret_fingerprint$
declare
    v_details jsonb;
begin
    insert into public.settings(
        key,
        value
    )
    values (
        'session_secret',
        'P2_RUNTIME_SECRET_TEST'
    )
    on conflict (key)
    do update
       set value = excluded.value;


    select details
      into v_details
      from public.audit_log
     where entity_type = 'setting'
       and entity_id = 'session_secret'
       and endpoint = 'DATABASE_TRIGGER'
     order by id desc
     limit 1;


    if v_details is null then
        raise exception
            'P2_AUDIT_COVERAGE:secret_setting_event_missing';
    end if;


    if v_details ->> 'old_fingerprint' is not null
       or v_details ->> 'new_fingerprint' is not null
    then
        raise exception
            'P2_AUDIT_COVERAGE:secret_fingerprint_persisted:%',
            v_details;
    end if;
end
$p2_audit_secret_fingerprint$;


-- ============================================================================
-- APPEND-ONLY FOUNDATION MUST STILL HOLD
-- ============================================================================

do $p2_audit_foundation_lock$
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
            'P2_AUDIT_COVERAGE:append_only_foundation_drift:%',
            v_count;
    end if;


    if has_table_privilege(
        'service_role',
        'public.audit_log',
        'UPDATE'
    )
    or has_table_privilege(
        'service_role',
        'public.audit_log',
        'DELETE'
    )
    or has_table_privilege(
        'service_role',
        'public.audit_log',
        'TRUNCATE'
    ) then
        raise exception
            'P2_AUDIT_COVERAGE:service_history_mutation';
    end if;
end
$p2_audit_foundation_lock$;


select
    'P2.5 atomic audit coverage runtime: OK'
    as certification;
