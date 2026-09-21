-- ============================================================================
-- GARPI P2.6A — CONCURRENCY + PROVENANCE FOUNDATIONS
-- RELEASE TYPE : EXPAND / HARDEN
-- RUNTIME CUTOVER: NO
-- DATA BACKFILL: NO
-- PRODUCTION DEPLOY: NO (repository migration only until explicit gate)
--
-- Goals:
--   * durable per-entity monotonic row_revision on audited business tables;
--   * hardened global operational revision primitive;
--   * internal atomic conflict helper for future typed mutation RPCs;
--   * audit provenance binds operational + row revisions in the same DB txn.
--
-- Deliberately NOT done here:
--   * no Edge Function write-path cutover;
--   * no new public mutation RPC surface;
--   * no request/correlation identifier claims without grounded request context;
--   * no production migration execution.
-- ============================================================================


-- ============================================================================
-- 1. ROW REVISION COLUMNS
-- ============================================================================

do $p2_row_revision_columns$
declare
    v_table text;
    v_constraint text;
begin
    foreach v_table in array array[
        'reservations',
        'reservation_members',
        'movements',
        'bed_blocks',
        'daily_capacity',
        'settings',
        'daily_snapshots',
        'operational_actions',
        'master_plan_events',
        'what_if_scenarios',
        'import_history',
        'assignments',
        'persons',
        'companies',
        'company_aliases',
        'shifts',
        'shift_aliases',
        'camps',
        'camp_modules',
        'camp_rooms',
        'camp_beds'
    ]
    loop
        if pg_catalog.to_regclass(
            pg_catalog.format(
                'public.%I',
                v_table
            )
        ) is null then
            raise exception
                'P2_ROW_REVISION_EXPECTED_TABLE_MISSING:%',
                v_table
                using errcode = '55000';
        end if;


        execute pg_catalog.format(
            'alter table public.%I
               add column if not exists row_revision bigint not null default 1',
            v_table
        );


        v_constraint :=
            v_table ||
            '_p2_row_revision_chk';


        if not exists (
            select 1
            from pg_catalog.pg_constraint
            where conrelid =
                pg_catalog.to_regclass(
                    pg_catalog.format(
                        'public.%I',
                        v_table
                    )
                )
              and conname =
                  v_constraint
        ) then
            execute pg_catalog.format(
                'alter table public.%I
                   add constraint %I
                   check (row_revision >= 1)
                   not valid',
                v_table,
                v_constraint
            );
        end if;
    end loop;
end
$p2_row_revision_columns$;


-- ============================================================================
-- 2. GENERIC MONOTONIC ROW REVISION
-- ============================================================================

create or replace function public.p2_bump_row_revision()
returns trigger
language plpgsql
set search_path = pg_catalog
as $p2_bump_row_revision$
declare
    v_old_payload jsonb;
    v_new_payload jsonb;
    v_old_revision bigint;
begin
    v_old_revision :=
        greatest(
            coalesce(
                old.row_revision,
                1
            ),
            1
        );


    v_old_payload :=
        to_jsonb(old) -
        'row_revision';

    v_new_payload :=
        to_jsonb(new) -
        'row_revision';


    if v_new_payload
       is distinct from
       v_old_payload
    then
        new.row_revision :=
            v_old_revision + 1;
    else
        new.row_revision :=
            v_old_revision;
    end if;


    return new;
end
$p2_bump_row_revision$;


revoke all
    on function public.p2_bump_row_revision()
    from public;


do $p2_row_revision_function_acl$
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
                'revoke execute on function public.p2_bump_row_revision() from %I',
                v_role
            );
        end if;
    end loop;
end
$p2_row_revision_function_acl$;


do $p2_row_revision_triggers$
declare
    v_table text;
begin
    foreach v_table in array array[
        'reservations',
        'reservation_members',
        'movements',
        'bed_blocks',
        'daily_capacity',
        'settings',
        'daily_snapshots',
        'operational_actions',
        'master_plan_events',
        'what_if_scenarios',
        'import_history',
        'assignments',
        'persons',
        'companies',
        'company_aliases',
        'shifts',
        'shift_aliases',
        'camps',
        'camp_modules',
        'camp_rooms',
        'camp_beds'
    ]
    loop
        execute pg_catalog.format(
            'drop trigger if exists p2_row_revision_bu on public.%I',
            v_table
        );

        execute pg_catalog.format(
            'create trigger p2_row_revision_bu
               before update
               on public.%I
               for each row
               execute function public.p2_bump_row_revision()',
            v_table
        );
    end loop;
end
$p2_row_revision_triggers$;


-- ============================================================================
-- 3. HARDEN EXISTING GLOBAL OPERATIONAL REVISION
--
-- Compatibility is preserved:
--   claim_operational_revision(expected) still returns JSON.
-- Security is tightened:
--   fixed pg_catalog search_path + explicit public.settings references.
-- ============================================================================

create or replace function public.claim_operational_revision(
    p_expected bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $p2_claim_operational_revision$
declare
    v_current bigint;
    v_next bigint;
begin
    insert into public.settings(
        key,
        value
    )
    values (
        'operational_revision',
        '1'
    )
    on conflict (key)
    do nothing;


    select
        case
            when value ~ '^[0-9]+$'
            then value::bigint
            else 1
        end
      into v_current
      from public.settings
     where key =
           'operational_revision'
     for update;


    if p_expected is not null
       and p_expected <> v_current
    then
        return pg_catalog.jsonb_build_object(
            'ok',
            false,
            'current_revision',
            v_current,
            'expected_revision',
            p_expected
        );
    end if;


    v_next :=
        v_current + 1;


    update public.settings
       set value =
           v_next::text
     where key =
           'operational_revision';


    return pg_catalog.jsonb_build_object(
        'ok',
        true,
        'previous_revision',
        v_current,
        'revision',
        v_next
    );
end
$p2_claim_operational_revision$;


revoke all
    on function public.claim_operational_revision(bigint)
    from public;


do $p2_claim_revision_acl$
declare
    v_role text;
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
            execute pg_catalog.format(
                'revoke execute on function public.claim_operational_revision(bigint) from %I',
                v_role
            );
        end if;
    end loop;


    if exists (
        select 1
        from pg_catalog.pg_roles
        where rolname = 'service_role'
    ) then
        grant execute
            on function public.claim_operational_revision(bigint)
            to service_role;
    end if;
end
$p2_claim_revision_acl$;


-- ============================================================================
-- 4. INTERNAL ATOMIC CONFLICT HELPER
--
-- Future typed mutation RPCs call this INSIDE the same PostgreSQL transaction
-- as their business DML. A stale expected revision raises SQLSTATE 40001 and
-- does not advance the operational revision.
-- ============================================================================

create or replace function public.p2_require_operational_revision(
    p_expected bigint
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog
as $p2_require_operational_revision$
declare
    v_result jsonb;
    v_ok boolean;
    v_current bigint;
    v_next bigint;
begin
    if p_expected is null
       or p_expected < 1
    then
        raise exception
            'P2_EXPECTED_REVISION_REQUIRED'
            using errcode = '22023';
    end if;


    v_result :=
        public.claim_operational_revision(
            p_expected
        );


    v_ok :=
        coalesce(
            (v_result ->> 'ok')::boolean,
            false
        );


    if not v_ok then
        v_current :=
            nullif(
                v_result ->> 'current_revision',
                ''
            )::bigint;


        raise exception
            'P2_STATE_CONFLICT current=% expected=%',
            v_current,
            p_expected
            using errcode = '40001';
    end if;


    v_next :=
        nullif(
            v_result ->> 'revision',
            ''
        )::bigint;


    if v_next is null
       or v_next <= p_expected
    then
        raise exception
            'P2_REVISION_CLAIM_INVALID'
            using errcode = '55000';
    end if;


    return v_next;
end
$p2_require_operational_revision$;


revoke all
    on function public.p2_require_operational_revision(bigint)
    from public;


do $p2_require_revision_acl$
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
                'revoke execute on function public.p2_require_operational_revision(bigint) from %I',
                v_role
            );
        end if;
    end loop;
end
$p2_require_revision_acl$;


-- ============================================================================
-- 5. ENRICH ATOMIC BUSINESS AUDIT WITH REVISION PROVENANCE
-- ============================================================================

create or replace function public.p2_audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $p2_audit_row_change$
declare
    v_entity_type text;
    v_id_key text;
    v_row jsonb;
    v_entity_id text;

    v_old_fingerprint text;
    v_new_fingerprint text;

    v_old_row_revision bigint;
    v_new_row_revision bigint;

    v_source_operational_revision bigint;
    v_txid text;
begin
    v_entity_type :=
        nullif(
            btrim(
                coalesce(
                    tg_argv[0],
                    ''
                )
            ),
            ''
        );


    v_id_key :=
        nullif(
            btrim(
                coalesce(
                    tg_argv[1],
                    ''
                )
            ),
            ''
        );


    if v_entity_type is null
       or v_id_key is null
    then
        raise exception
            'P2_AUDIT_TRIGGER_CONFIG:%:%',
            tg_table_name,
            tg_op
            using errcode = '55000';
    end if;


    if tg_op = 'DELETE' then
        v_row :=
            to_jsonb(old);
    else
        v_row :=
            to_jsonb(new);
    end if;


    v_entity_id :=
        nullif(
            btrim(
                coalesce(
                    v_row ->> v_id_key,
                    ''
                )
            ),
            ''
        );


    if v_entity_id is null then
        v_entity_id :=
            'fp:' ||
            md5(
                v_row::text
            );
    end if;


    -- High-frequency technical concurrency state is not a business event.
    if tg_table_name = 'settings'
       and coalesce(
           v_row ->> 'key',
           ''
       ) = 'operational_revision'
    then
        if tg_op = 'DELETE' then
            return old;
        end if;

        return new;
    end if;


    if tg_op in (
        'UPDATE',
        'DELETE'
    ) then
        v_old_row_revision :=
            nullif(
                to_jsonb(old) ->> 'row_revision',
                ''
            )::bigint;
    end if;


    if tg_op in (
        'INSERT',
        'UPDATE'
    ) then
        v_new_row_revision :=
            nullif(
                to_jsonb(new) ->> 'row_revision',
                ''
            )::bigint;
    end if;


    -- Secret-bearing settings are auditable by key but never fingerprinted.
    if tg_table_name = 'settings'
       and coalesce(
           v_row ->> 'key',
           ''
       ) in (
           'admin_password_hash',
           'admin_password_salt',
           'session_secret'
       )
    then
        v_old_fingerprint :=
            null;

        v_new_fingerprint :=
            null;
    else
        if tg_op in (
            'UPDATE',
            'DELETE'
        ) then
            v_old_fingerprint :=
                md5(
                    to_jsonb(old)::text
                );
        end if;


        if tg_op in (
            'INSERT',
            'UPDATE'
        ) then
            v_new_fingerprint :=
                md5(
                    to_jsonb(new)::text
                );
        end if;
    end if;


    select
        case
            when value ~ '^[0-9]+$'
            then value::bigint
            else null
        end
      into v_source_operational_revision
      from public.settings
     where key =
           'operational_revision';


    v_txid :=
        pg_catalog.pg_current_xact_id()::text;


    insert into public.audit_log(
        occurred_at,
        profile,
        action,
        entity_type,
        entity_id,
        endpoint,
        result,
        details
    )
    values (
        pg_catalog.clock_timestamp(),
        'SYSTEM',
        'ROW_' || tg_op,
        left(
            v_entity_type,
            50
        ),
        left(
            v_entity_id,
            80
        ),
        'DATABASE_TRIGGER',
        'OK',
        pg_catalog.jsonb_build_object(
            'schema',
            tg_table_schema,
            'table',
            tg_table_name,
            'operation',
            tg_op,
            'transaction_id',
            v_txid,
            'source_operational_revision',
            v_source_operational_revision,
            'old_row_revision',
            v_old_row_revision,
            'new_row_revision',
            v_new_row_revision,
            'old_fingerprint',
            v_old_fingerprint,
            'new_fingerprint',
            v_new_fingerprint
        )
    );


    if tg_op = 'DELETE' then
        return old;
    end if;

    return new;
end
$p2_audit_row_change$;


revoke all
    on function public.p2_audit_row_change()
    from public;


do $p2_audit_provenance_acl$
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
                'revoke execute on function public.p2_audit_row_change() from %I',
                v_role
            );
        end if;
    end loop;
end
$p2_audit_provenance_acl$;


-- ============================================================================
-- 6. DOCUMENTATION
-- ============================================================================

comment on function public.p2_bump_row_revision() is
    'GARPI P2.6 monotonic per-row revision trigger. Increments only when non-revision row content changes.';

comment on function public.p2_require_operational_revision(bigint) is
    'GARPI P2.6 internal atomic concurrency helper. Raises SQLSTATE 40001 P2_STATE_CONFLICT for stale expected revisions.';

comment on function public.claim_operational_revision(bigint) is
    'GARPI global operational revision claim, hardened with fixed pg_catalog search_path. Compatibility API retained during P2.6 migration.';

comment on function public.p2_audit_row_change() is
    'GARPI P2.5/P2.6 atomic row-change auditor with operational revision and per-row revision provenance; full row payloads are never persisted.';
