-- ============================================================================
-- GARPI P2.5A — APPEND-ONLY AUDIT STORE HARDENING
-- RELEASE TYPE : EXPAND / HARDEN
-- RUNTIME CUTOVER: NO
-- DATA BACKFILL: NO
-- PRODUCTION DEPLOY: NO (repository migration only until explicit deployment gate)
--
-- Scope:
--   * preserve the existing public.audit_log event shape;
--   * make historical events append-only at database level;
--   * narrow service_role to SELECT + INSERT on audit_log;
--   * deny direct audit access to public/client application roles;
--   * keep existing historical rows untouched.
--
-- Deliberately deferred to later P2.5 gates:
--   * complete mutation-endpoint audit coverage;
--   * atomic business-write + audit-write orchestration;
--   * request/correlation identifiers and richer actor provenance;
--   * operational deployment/cutover.
-- ============================================================================


-- ============================================================================
-- BASIC NEW-WRITE INTEGRITY
-- Existing rows are not scanned during EXPAND.
-- PostgreSQL enforces this CHECK for new/changed rows.
-- ============================================================================

do $p2_audit_action_constraint$
begin
    if not exists (
        select 1
        from pg_catalog.pg_constraint
        where conrelid = 'public.audit_log'::regclass
          and conname = 'audit_log_p2_action_nonblank_chk'
    ) then
        alter table public.audit_log
            add constraint audit_log_p2_action_nonblank_chk
            check (
                length(
                    btrim(action)
                ) > 0
            )
            not valid;
    end if;
end
$p2_audit_action_constraint$;


-- ============================================================================
-- APPEND-ONLY GUARD
-- Protects even privileged accidental UPDATE / DELETE / TRUNCATE operations.
-- Normal application roles additionally lose those table privileges below.
-- ============================================================================

create or replace function public.p2_guard_audit_log_append_only()
returns trigger
language plpgsql
set search_path = pg_catalog
as $p2_audit_guard$
begin
    raise exception
        'P2_AUDIT_APPEND_ONLY:%',
        tg_op
        using errcode = '55000';

    return null;
end
$p2_audit_guard$;


drop trigger if exists audit_log_p2_no_update_delete
    on public.audit_log;

create trigger audit_log_p2_no_update_delete
before update or delete
on public.audit_log
for each row
execute function public.p2_guard_audit_log_append_only();


drop trigger if exists audit_log_p2_no_truncate
    on public.audit_log;

create trigger audit_log_p2_no_truncate
before truncate
on public.audit_log
for each statement
execute function public.p2_guard_audit_log_append_only();


-- ============================================================================
-- SECURITY
-- audit_log is readable + appendable only through the backend service role.
-- Historical mutation privileges are explicitly removed.
-- Trigger function is not directly executable by application roles.
-- ============================================================================

alter table public.audit_log
    enable row level security;

revoke all
    on table public.audit_log
    from public;

revoke all
    on function public.p2_guard_audit_log_append_only()
    from public;


do $p2_audit_security$
declare
    v_sequence text;
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
            execute format(
                'revoke all on table public.audit_log from %I',
                v_role
            );

            execute format(
                'revoke execute on function public.p2_guard_audit_log_append_only() from %I',
                v_role
            );
        end if;
    end loop;


    if exists (
        select 1
        from pg_catalog.pg_roles
        where rolname = 'service_role'
    ) then
        revoke all
            on table public.audit_log
            from service_role;

        grant select, insert
            on table public.audit_log
            to service_role;

        revoke execute
            on function public.p2_guard_audit_log_append_only()
            from service_role;


        v_sequence :=
            pg_catalog.pg_get_serial_sequence(
                'public.audit_log',
                'id'
            );

        if v_sequence is not null then
            execute format(
                'revoke all on sequence %s from public',
                v_sequence::regclass
            );

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
                    execute format(
                        'revoke all on sequence %s from %I',
                        v_sequence::regclass,
                        v_role
                    );
                end if;
            end loop;

            execute format(
                'revoke all on sequence %s from service_role',
                v_sequence::regclass
            );

            execute format(
                'grant usage, select on sequence %s to service_role',
                v_sequence::regclass
            );
        end if;


        if not exists (
            select 1
            from pg_catalog.pg_policies
            where schemaname = 'public'
              and tablename = 'audit_log'
              and policyname = 'audit_log_p2_service_select'
        ) then
            execute
                'create policy audit_log_p2_service_select
                   on public.audit_log
                   for select
                   to service_role
                   using (true)';
        end if;


        if not exists (
            select 1
            from pg_catalog.pg_policies
            where schemaname = 'public'
              and tablename = 'audit_log'
              and policyname = 'audit_log_p2_service_insert'
        ) then
            execute
                'create policy audit_log_p2_service_insert
                   on public.audit_log
                   for insert
                   to service_role
                   with check (true)';
        end if;
    end if;
end
$p2_audit_security$;


-- ============================================================================
-- DOCUMENTATION
-- ============================================================================

comment on table public.audit_log is
    'GARPI durable audit event store. P2.5 hardening makes historical rows append-only; normal backend access is SELECT + INSERT only.';

comment on function public.p2_guard_audit_log_append_only() is
    'P2.5 database guard that rejects UPDATE, DELETE and TRUNCATE of audit history.';

comment on constraint audit_log_p2_action_nonblank_chk
    on public.audit_log is
    'P2.5 new-write integrity: audit action must be nonblank. Added NOT VALID to avoid rewriting legacy history.';
