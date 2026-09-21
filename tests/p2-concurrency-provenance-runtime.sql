-- GARPI P2.6A runtime certification
-- Intended only for an isolated PostgreSQL 17 CI database.

\set ON_ERROR_STOP on


-- ============================================================================
-- 1. EXACT ROW REVISION SURFACE
-- ============================================================================

do $p2_row_revision_catalog$
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
    v_trigger_count integer;
    v_constraint_count integer;
begin
    select array_agg(
               c.relname
               order by c.relname
           )
      into v_actual
      from pg_catalog.pg_attribute a
      join pg_catalog.pg_class c
        on c.oid = a.attrelid
      join pg_catalog.pg_namespace n
        on n.oid = c.relnamespace
     where n.nspname = 'public'
       and a.attname = 'row_revision'
       and a.attnum > 0
       and not a.attisdropped
       and c.relname = any(v_expected);


    if v_actual is distinct from v_expected then
        raise exception
            'P2_CONCURRENCY:row_revision_table_set:%',
            v_actual;
    end if;


    if exists (
        select 1
        from pg_catalog.pg_attribute a
        join pg_catalog.pg_class c
          on c.oid = a.attrelid
        join pg_catalog.pg_namespace n
          on n.oid = c.relnamespace
        left join pg_catalog.pg_attrdef ad
          on ad.adrelid = a.attrelid
         and ad.adnum = a.attnum
        where n.nspname = 'public'
          and c.relname = any(v_expected)
          and a.attname = 'row_revision'
          and (
              a.atttypid <> 'bigint'::regtype
              or not a.attnotnull
              or pg_catalog.pg_get_expr(
                     ad.adbin,
                     ad.adrelid
                 ) <> '1'
          )
    ) then
        raise exception
            'P2_CONCURRENCY:row_revision_column_contract';
    end if;


    select count(*)
      into v_trigger_count
      from pg_catalog.pg_trigger t
      join pg_catalog.pg_class c
        on c.oid = t.tgrelid
      join pg_catalog.pg_namespace n
        on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = any(v_expected)
       and t.tgname = 'p2_row_revision_bu'
       and not t.tgisinternal;


    if v_trigger_count <> 21 then
        raise exception
            'P2_CONCURRENCY:row_revision_trigger_count:%',
            v_trigger_count;
    end if;


    select count(*)
      into v_constraint_count
      from pg_catalog.pg_constraint con
      join pg_catalog.pg_class c
        on c.oid = con.conrelid
      join pg_catalog.pg_namespace n
        on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = any(v_expected)
       and con.conname like '%_p2_row_revision_chk'
       and not con.convalidated;


    if v_constraint_count <> 21 then
        raise exception
            'P2_CONCURRENCY:row_revision_constraint_count:%',
            v_constraint_count;
    end if;
end
$p2_row_revision_catalog$;


-- ============================================================================
-- 2. FUNCTION SECURITY / SEARCH PATH
-- ============================================================================

do $p2_concurrency_function_security$
declare
    v_search_path_ok boolean;
    v_secdef boolean;
    v_role text;
begin
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
        v_secdef,
        v_search_path_ok
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n
        on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname =
           'claim_operational_revision';


    if not coalesce(v_secdef, false)
       or not coalesce(v_search_path_ok, false)
    then
        raise exception
            'P2_CONCURRENCY:claim_hardening';
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
        v_secdef,
        v_search_path_ok
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n
        on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname =
           'p2_require_operational_revision';


    if not coalesce(v_secdef, false)
       or not coalesce(v_search_path_ok, false)
    then
        raise exception
            'P2_CONCURRENCY:require_hardening';
    end if;


    if not has_function_privilege(
        'service_role',
        'public.claim_operational_revision(bigint)',
        'EXECUTE'
    ) then
        raise exception
            'P2_CONCURRENCY:service_claim_execute_missing';
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
            'public.p2_require_operational_revision(bigint)',
            'EXECUTE'
        ) then
            raise exception
                'P2_CONCURRENCY:direct_require_execute:%',
                v_role;
        end if;


        if has_function_privilege(
            v_role,
            'public.p2_bump_row_revision()',
            'EXECUTE'
        ) then
            raise exception
                'P2_CONCURRENCY:direct_bump_execute:%',
                v_role;
        end if;
    end loop;
end
$p2_concurrency_function_security$;


-- ============================================================================
-- 3. ROW REVISION MONOTONICITY
-- ============================================================================

do $p2_row_revision_runtime$
declare
    v_id bigint;
    v_revision bigint;
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
        'P2.6 row revision runtime',
        'isolated certification',
        'CERTIFICATION',
        'INFO',
        'PENDIENTE',
        '',
        'SYSTEM_TEST'
    )
    returning id, row_revision
    into v_id, v_revision;


    if v_revision <> 1 then
        raise exception
            'P2_CONCURRENCY:initial_row_revision:%',
            v_revision;
    end if;


    update public.operational_actions
       set status = status
     where id = v_id
    returning row_revision
    into v_revision;


    if v_revision <> 1 then
        raise exception
            'P2_CONCURRENCY:no_op_revision_bump:%',
            v_revision;
    end if;


    update public.operational_actions
       set status = 'EN_GESTION'
     where id = v_id
    returning row_revision
    into v_revision;


    if v_revision <> 2 then
        raise exception
            'P2_CONCURRENCY:real_update_revision:%',
            v_revision;
    end if;


    update public.operational_actions
       set row_revision = 999
     where id = v_id
    returning row_revision
    into v_revision;


    if v_revision <> 2 then
        raise exception
            'P2_CONCURRENCY:caller_revision_override:%',
            v_revision;
    end if;
end
$p2_row_revision_runtime$;


-- ============================================================================
-- 4. ATOMIC OPERATIONAL REVISION CLAIM / REAL CONFLICT
-- ============================================================================

do $p2_operational_revision_runtime$
declare
    v_current bigint;
    v_next bigint;
    v_after_conflict bigint;
    v_blocked boolean := false;
    v_noise_before bigint;
    v_noise_after bigint;
begin
    select value::bigint
      into v_current
      from public.settings
     where key = 'operational_revision';


    select count(*)
      into v_noise_before
      from public.audit_log
     where entity_type = 'setting'
       and entity_id = 'operational_revision'
       and endpoint = 'DATABASE_TRIGGER';


    v_next :=
        public.p2_require_operational_revision(
            v_current
        );


    if v_next <> v_current + 1 then
        raise exception
            'P2_CONCURRENCY:exact_claim_next:%:%',
            v_current,
            v_next;
    end if;


    if (
        select value::bigint
        from public.settings
        where key = 'operational_revision'
    ) <> v_next then
        raise exception
            'P2_CONCURRENCY:claim_not_persisted';
    end if;


    begin
        perform
            public.p2_require_operational_revision(
                v_current
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
            'P2_CONCURRENCY:stale_claim_not_blocked';
    end if;


    select value::bigint
      into v_after_conflict
      from public.settings
     where key = 'operational_revision';


    if v_after_conflict <> v_next then
        raise exception
            'P2_CONCURRENCY:conflict_advanced_revision:%:%',
            v_next,
            v_after_conflict;
    end if;


    select count(*)
      into v_noise_after
      from public.audit_log
     where entity_type = 'setting'
       and entity_id = 'operational_revision'
       and endpoint = 'DATABASE_TRIGGER';


    if v_noise_after <> v_noise_before then
        raise exception
            'P2_CONCURRENCY:operational_revision_audit_noise:%:%',
            v_noise_before,
            v_noise_after;
    end if;
end
$p2_operational_revision_runtime$;


-- ============================================================================
-- 5. AUDIT PROVENANCE BINDS GLOBAL + ROW REVISION
-- ============================================================================

do $p2_audit_revision_provenance$
declare
    v_current bigint;
    v_id bigint;
    v_details jsonb;
    v_revision bigint;
begin
    select value::bigint
      into v_current
      from public.settings
     where key = 'operational_revision';


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
        'P2.6 provenance runtime',
        'isolated certification',
        'CERTIFICATION',
        'INFO',
        'PENDIENTE',
        '',
        'SYSTEM_TEST'
    )
    returning id, row_revision
    into v_id, v_revision;


    select details
      into v_details
      from public.audit_log
     where action = 'ROW_INSERT'
       and entity_type = 'operational_action'
       and entity_id = v_id::text
       and endpoint = 'DATABASE_TRIGGER'
     order by id desc
     limit 1;


    if v_details is null then
        raise exception
            'P2_CONCURRENCY:audit_insert_missing';
    end if;


    if (
        v_details ->> 'source_operational_revision'
    )::bigint <> v_current
       or (
           v_details ->> 'new_row_revision'
       )::bigint <> 1
       or v_details ->> 'old_row_revision'
          is not null
    then
        raise exception
            'P2_CONCURRENCY:audit_insert_provenance:%',
            v_details;
    end if;


    update public.operational_actions
       set status = 'EN_GESTION'
     where id = v_id
    returning row_revision
    into v_revision;


    if v_revision <> 2 then
        raise exception
            'P2_CONCURRENCY:provenance_update_row_revision:%',
            v_revision;
    end if;


    select details
      into v_details
      from public.audit_log
     where action = 'ROW_UPDATE'
       and entity_type = 'operational_action'
       and entity_id = v_id::text
       and endpoint = 'DATABASE_TRIGGER'
     order by id desc
     limit 1;


    if (
        v_details ->> 'source_operational_revision'
    )::bigint <> v_current
       or (
           v_details ->> 'old_row_revision'
       )::bigint <> 1
       or (
           v_details ->> 'new_row_revision'
       )::bigint <> 2
    then
        raise exception
            'P2_CONCURRENCY:audit_update_provenance:%',
            v_details;
    end if;
end
$p2_audit_revision_provenance$;


-- ============================================================================
-- 6. P2.5 PRIVACY GUARANTEE STILL HOLDS
-- ============================================================================

do $p2_secret_revision_provenance$
declare
    v_details jsonb;
begin
    insert into public.settings(
        key,
        value
    )
    values (
        'session_secret',
        'P2_6_RUNTIME_SECRET'
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
            'P2_CONCURRENCY:secret_audit_missing';
    end if;


    if v_details ->> 'old_fingerprint'
       is not null
       or v_details ->> 'new_fingerprint'
          is not null
    then
        raise exception
            'P2_CONCURRENCY:secret_fingerprint_leak:%',
            v_details;
    end if;


    if v_details ->> 'new_row_revision'
       is null
       or v_details ->> 'source_operational_revision'
          is null
    then
        raise exception
            'P2_CONCURRENCY:secret_revision_provenance_missing:%',
            v_details;
    end if;
end
$p2_secret_revision_provenance$;


-- ============================================================================
-- 7. P2.5 APPEND-ONLY FOUNDATION STILL HOLDS
-- ============================================================================

do $p2_append_only_lock$
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
            'P2_CONCURRENCY:append_only_trigger_count:%',
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
            'P2_CONCURRENCY:service_audit_history_mutation';
    end if;
end
$p2_append_only_lock$;


select
    'P2.6 concurrency provenance foundations runtime: OK'
    as certification;
