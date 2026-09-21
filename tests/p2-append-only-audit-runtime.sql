-- GARPI P2.5A runtime certification
-- Intended only for an isolated PostgreSQL 17 CI database.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Catalog shape
-- ---------------------------------------------------------------------------

do $p2_audit_catalog$
declare
    v_count integer;
    v_search_path_ok boolean;
    v_rls boolean;
    v_constraint_validated boolean;
begin
    select count(*)
      into v_count
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n
        on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'p2_guard_audit_log_append_only';

    if v_count <> 1 then
        raise exception
            'P2_AUDIT_RUNTIME:function_count:%',
            v_count;
    end if;


    select
        coalesce(
            array_to_string(
                p.proconfig,
                ','
            ),
            ''
        ) like '%search_path=pg_catalog%'
      into v_search_path_ok
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n
        on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'p2_guard_audit_log_append_only';

    if not coalesce(v_search_path_ok, false) then
        raise exception
            'P2_AUDIT_RUNTIME:guard_search_path';
    end if;


    select c.relrowsecurity
      into v_rls
      from pg_catalog.pg_class c
     where c.oid = 'public.audit_log'::regclass;

    if not coalesce(v_rls, false) then
        raise exception
            'P2_AUDIT_RUNTIME:rls_not_enabled';
    end if;


    select convalidated
      into v_constraint_validated
      from pg_catalog.pg_constraint
     where conrelid = 'public.audit_log'::regclass
       and conname =
           'audit_log_p2_action_nonblank_chk';

    if v_constraint_validated is distinct from false then
        raise exception
            'P2_AUDIT_RUNTIME:constraint_not_not_valid';
    end if;


    select count(*)
      into v_count
      from pg_catalog.pg_trigger
     where tgrelid = 'public.audit_log'::regclass
       and not tgisinternal
       and tgname in (
           'audit_log_p2_no_update_delete',
           'audit_log_p2_no_truncate'
       );

    if v_count <> 2 then
        raise exception
            'P2_AUDIT_RUNTIME:trigger_count:%',
            v_count;
    end if;
end
$p2_audit_catalog$;


-- ---------------------------------------------------------------------------
-- Permission model
-- ---------------------------------------------------------------------------

do $p2_audit_acl$
declare
    v_role text;
    v_sequence text;
begin
    if not has_table_privilege(
        'service_role',
        'public.audit_log',
        'SELECT'
    ) then
        raise exception
            'P2_AUDIT_RUNTIME:service_select_missing';
    end if;

    if not has_table_privilege(
        'service_role',
        'public.audit_log',
        'INSERT'
    ) then
        raise exception
            'P2_AUDIT_RUNTIME:service_insert_missing';
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
            'P2_AUDIT_RUNTIME:service_mutation_privilege_present';
    end if;


    if has_function_privilege(
        'service_role',
        'public.p2_guard_audit_log_append_only()',
        'EXECUTE'
    ) then
        raise exception
            'P2_AUDIT_RUNTIME:service_guard_execute_present';
    end if;


    foreach v_role in array array[
        'anon',
        'authenticated',
        'camp_app',
        'replit_app'
    ]
    loop
        if has_table_privilege(
            v_role,
            'public.audit_log',
            'SELECT'
        )
        or has_table_privilege(
            v_role,
            'public.audit_log',
            'INSERT'
        )
        or has_table_privilege(
            v_role,
            'public.audit_log',
            'UPDATE'
        )
        or has_table_privilege(
            v_role,
            'public.audit_log',
            'DELETE'
        )
        or has_table_privilege(
            v_role,
            'public.audit_log',
            'TRUNCATE'
        ) then
            raise exception
                'P2_AUDIT_RUNTIME:external_table_privilege:%',
                v_role;
        end if;


        if has_function_privilege(
            v_role,
            'public.p2_guard_audit_log_append_only()',
            'EXECUTE'
        ) then
            raise exception
                'P2_AUDIT_RUNTIME:external_guard_execute:%',
                v_role;
        end if;
    end loop;


    v_sequence :=
        pg_catalog.pg_get_serial_sequence(
            'public.audit_log',
            'id'
        );

    if v_sequence is null then
        raise exception
            'P2_AUDIT_RUNTIME:audit_sequence_missing';
    end if;


    if not has_sequence_privilege(
        'service_role',
        v_sequence,
        'USAGE'
    )
    or not has_sequence_privilege(
        'service_role',
        v_sequence,
        'SELECT'
    ) then
        raise exception
            'P2_AUDIT_RUNTIME:service_sequence_privilege_missing';
    end if;


    foreach v_role in array array[
        'anon',
        'authenticated',
        'camp_app',
        'replit_app'
    ]
    loop
        if has_sequence_privilege(
            v_role,
            v_sequence,
            'USAGE'
        )
        or has_sequence_privilege(
            v_role,
            v_sequence,
            'SELECT'
        )
        or has_sequence_privilege(
            v_role,
            v_sequence,
            'UPDATE'
        ) then
            raise exception
                'P2_AUDIT_RUNTIME:external_sequence_privilege:%',
                v_role;
        end if;
    end loop;
end
$p2_audit_acl$;


-- ---------------------------------------------------------------------------
-- Normal service role can append and read.
-- ---------------------------------------------------------------------------

set role service_role;

insert into public.audit_log(
    profile,
    action,
    entity_type,
    entity_id,
    endpoint,
    result,
    details
)
values (
    'ADMINISTRADOR',
    'P2_AUDIT_SERVICE_INSERT',
    'audit_certification',
    'service-role',
    'p2-audit-runtime',
    'OK',
    '{"source":"P2.5A"}'::jsonb
);

select id
from public.audit_log
where action = 'P2_AUDIT_SERVICE_INSERT'
order by id desc
limit 1;

reset role;


do $p2_audit_service_insert$
begin
    if not exists (
        select 1
        from public.audit_log
        where action =
            'P2_AUDIT_SERVICE_INSERT'
    ) then
        raise exception
            'P2_AUDIT_RUNTIME:service_insert_not_visible';
    end if;
end
$p2_audit_service_insert$;


-- ---------------------------------------------------------------------------
-- Database-level append-only protection.
-- Use postgres deliberately to prove the trigger also protects privileged
-- accidental history mutation beyond normal application ACLs.
-- ---------------------------------------------------------------------------

do $p2_audit_append_only$
declare
    v_id bigint;
    v_blocked boolean;
begin
    insert into public.audit_log(
        profile,
        action,
        entity_type,
        entity_id,
        endpoint,
        result,
        details
    )
    values (
        'ADMINISTRADOR',
        'P2_AUDIT_PRIVILEGED_GUARD',
        'audit_certification',
        'postgres',
        'p2-audit-runtime',
        'OK',
        '{"source":"P2.5A"}'::jsonb
    )
    returning id
    into v_id;


    v_blocked := false;

    begin
        update public.audit_log
           set result = 'MUTATED'
         where id = v_id;
    exception
        when sqlstate '55000' then
            if position(
                'P2_AUDIT_APPEND_ONLY:UPDATE'
                in sqlerrm
            ) > 0 then
                v_blocked := true;
            else
                raise;
            end if;
    end;

    if not v_blocked then
        raise exception
            'P2_AUDIT_RUNTIME:update_not_blocked';
    end if;


    v_blocked := false;

    begin
        delete from public.audit_log
         where id = v_id;
    exception
        when sqlstate '55000' then
            if position(
                'P2_AUDIT_APPEND_ONLY:DELETE'
                in sqlerrm
            ) > 0 then
                v_blocked := true;
            else
                raise;
            end if;
    end;

    if not v_blocked then
        raise exception
            'P2_AUDIT_RUNTIME:delete_not_blocked';
    end if;


    v_blocked := false;

    begin
        truncate table public.audit_log;
    exception
        when sqlstate '55000' then
            if position(
                'P2_AUDIT_APPEND_ONLY:TRUNCATE'
                in sqlerrm
            ) > 0 then
                v_blocked := true;
            else
                raise;
            end if;
    end;

    if not v_blocked then
        raise exception
            'P2_AUDIT_RUNTIME:truncate_not_blocked';
    end if;


    if not exists (
        select 1
        from public.audit_log
        where id = v_id
          and result = 'OK'
    ) then
        raise exception
            'P2_AUDIT_RUNTIME:guard_row_changed';
    end if;
end
$p2_audit_append_only$;


-- ---------------------------------------------------------------------------
-- New-write action integrity.
-- ---------------------------------------------------------------------------

do $p2_audit_action_integrity$
declare
    v_blocked boolean := false;
begin
    begin
        insert into public.audit_log(
            profile,
            action,
            entity_type,
            entity_id,
            endpoint,
            result,
            details
        )
        values (
            'ADMINISTRADOR',
            '   ',
            'audit_certification',
            'invalid-action',
            'p2-audit-runtime',
            'OK',
            '{}'::jsonb
        );
    exception
        when check_violation then
            v_blocked := true;
    end;

    if not v_blocked then
        raise exception
            'P2_AUDIT_RUNTIME:blank_action_not_blocked';
    end if;
end
$p2_audit_action_integrity$;


select
    'P2.5 append-only audit runtime: OK'
    as certification;
