-- ============================================================================
-- GARPI P2.5B/C/D — ATOMIC BUSINESS AUDIT COVERAGE
-- RELEASE TYPE : EXPAND / HARDEN
-- RUNTIME CUTOVER: NO
-- DATA BACKFILL: NO
-- PRODUCTION DEPLOY: NO (repository migration only until explicit deployment gate)
--
-- Requires P2.5A append-only audit_log hardening.
--
-- Design:
--   * automatic AFTER-row events for durable business/canonical tables;
--   * audit insert happens in the SAME PostgreSQL transaction;
--   * audit failure aborts the audited business write;
--   * no full OLD/NEW payload is stored;
--   * only deterministic metadata + row fingerprints are persisted;
--   * high-volume replaceable projections are intentionally excluded.
-- ============================================================================


-- ============================================================================
-- ATOMIC ROW-CHANGE AUDIT FUNCTION
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


    -- operational_revision is a high-frequency technical concurrency counter,
    -- not a business event. The settings trigger deliberately ignores it.
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


    -- Secret-bearing settings are still auditable as named setting mutations,
    -- but their row fingerprints are deliberately suppressed. This avoids
    -- persisting a stable digest derived from credential material.
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


do $p2_audit_function_acl$
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
            execute format(
                'revoke execute on function public.p2_audit_row_change() from %I',
                v_role
            );
        end if;
    end loop;
end
$p2_audit_function_acl$;


-- ============================================================================
-- TRIGGER INSTALLER
--
-- Every configured target is a durable business/canonical table.
-- Missing expected tables fail the migration rather than silently reducing
-- audit coverage.
-- ============================================================================

do $p2_audit_coverage$
declare
    v_entry jsonb;
    v_table text;
    v_entity_type text;
    v_id_key text;
    v_trigger text;
    v_target regclass;
begin
    for v_entry in
        select value
        from pg_catalog.jsonb_array_elements(
            $coverage$
            [
              {"table":"reservations","entity_type":"reservation","id_key":"id"},
              {"table":"reservation_members","entity_type":"reservation_member","id_key":"id"},
              {"table":"movements","entity_type":"movement","id_key":"id"},
              {"table":"bed_blocks","entity_type":"bed_block","id_key":"id"},
              {"table":"daily_capacity","entity_type":"daily_capacity","id_key":"capacity_date"},
              {"table":"settings","entity_type":"setting","id_key":"key"},
              {"table":"daily_snapshots","entity_type":"daily_snapshot","id_key":"snapshot_date"},
              {"table":"operational_actions","entity_type":"operational_action","id_key":"id"},
              {"table":"master_plan_events","entity_type":"master_plan_event","id_key":"id"},
              {"table":"what_if_scenarios","entity_type":"what_if_scenario","id_key":"id"},
              {"table":"import_history","entity_type":"import","id_key":"id"},
              {"table":"assignments","entity_type":"assignment","id_key":"id"},
              {"table":"persons","entity_type":"person","id_key":"id"},
              {"table":"companies","entity_type":"company","id_key":"id"},
              {"table":"company_aliases","entity_type":"company_alias","id_key":"id"},
              {"table":"shifts","entity_type":"shift","id_key":"id"},
              {"table":"shift_aliases","entity_type":"shift_alias","id_key":"id"},
              {"table":"camps","entity_type":"camp","id_key":"id"},
              {"table":"camp_modules","entity_type":"camp_module","id_key":"id"},
              {"table":"camp_rooms","entity_type":"camp_room","id_key":"id"},
              {"table":"camp_beds","entity_type":"camp_bed","id_key":"id"}
            ]
            $coverage$::jsonb
        )
    loop
        v_table :=
            v_entry ->> 'table';

        v_entity_type :=
            v_entry ->> 'entity_type';

        v_id_key :=
            v_entry ->> 'id_key';

        v_target :=
            pg_catalog.to_regclass(
                format(
                    'public.%I',
                    v_table
                )
            );


        if v_target is null then
            raise exception
                'P2_AUDIT_EXPECTED_TABLE_MISSING:%',
                v_table
                using errcode = '55000';
        end if;


        if not exists (
            select 1
            from pg_catalog.pg_attribute
            where attrelid = v_target
              and attname = v_id_key
              and attnum > 0
              and not attisdropped
        ) then
            raise exception
                'P2_AUDIT_EXPECTED_ID_KEY_MISSING:%:%',
                v_table,
                v_id_key
                using errcode = '55000';
        end if;


        v_trigger :=
            'p2_audit_row_change';


        execute format(
            'drop trigger if exists %I on public.%I',
            v_trigger,
            v_table
        );


        execute format(
            'create trigger %I
               after insert or update or delete
               on public.%I
               for each row
               execute function public.p2_audit_row_change(%L,%L)',
            v_trigger,
            v_table,
            v_entity_type,
            v_id_key
        );
    end loop;
end
$p2_audit_coverage$;


-- ============================================================================
-- EXPLICIT EXCLUSIONS
--
-- No automatic audit trigger is installed on:
--   workers                   replaceable high-volume projection
--   bed_inventory             replaceable high-volume projection
--   consultation_log          high-volume lookup telemetry
--   operational_revision      technical concurrency primitive
--   audit_log                 recursion forbidden
--   p2_bed_resolution_*       E1 owns its shadow observation ledger
-- ============================================================================


-- ============================================================================
-- DOCUMENTATION
-- ============================================================================

comment on function public.p2_audit_row_change() is
    'GARPI P2.5 atomic database row-change auditor. Stores only entity identity, operation, transaction id and OLD/NEW fingerprints; never stores full row payloads.';

