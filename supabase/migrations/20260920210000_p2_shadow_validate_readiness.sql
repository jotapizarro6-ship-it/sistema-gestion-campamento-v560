-- GARPI P2.4E1 R4C-C COMPATIBILITY CANDIDATE
-- TEMP ONLY - NOT A REPOSITORY MIGRATION

-- CANONICAL NORMALIZATION
-- ============================================================

create or replace function public.p2_canonical_text(
    p_value text
)
returns text
language sql
immutable
parallel safe
as $p2_text$
    select btrim(
        regexp_replace(
            upper(
                translate(
                    normalize(
                        btrim(
                            coalesce(
                                p_value,
                                ''
                            )
                        ),
                        NFD
                    ),
                    (
                        select string_agg(
                            chr(x),
                            ''
                            order by x
                        )
                        from generate_series(
                            768,
                            879
                        ) as g(x)
                    ),
                    ''
                )
            ),
            '[^A-Z0-9]+',
            ' ',
            'g'
        )
    )
$p2_text$;


create or replace function public.p2_canonical_room(
    p_value text
)
returns text
language plpgsql
immutable
as $p2_room$
declare
    v_raw text;
    v_num numeric;
    v_text text;
begin
    v_raw :=
        btrim(
            coalesce(
                p_value,
                ''
            )
        );

    if v_raw='' then
        return '';
    end if;

    begin
        v_num :=
            replace(
                v_raw,
                ',',
                '.'
            )::numeric;
    exception
        when others then
            return public.p2_canonical_text(
                v_raw
            );
    end;

    if v_num=trunc(v_num) then
        return trunc(v_num)::text;
    end if;

    v_text :=
        rtrim(
            rtrim(
                v_num::text,
                '0'
            ),
            '.'
        );

    return v_text;
end
$p2_room$;


create or replace function public.p2_canonical_bed(
    p_value text
)
returns text
language plpgsql
immutable
as $p2_bed$
declare
    v text;
begin
    v :=
        public.p2_canonical_text(
            p_value
        );

    if left(v,5)='CAMA ' then
        v :=
            btrim(
                substr(
                    v,
                    6
                )
            );
    end if;

    return v;
end
$p2_bed$;


create or replace function public.p2_iso_date(
    p_value text
)
returns date
language plpgsql
immutable
as $p2_date$
declare
    v date;
begin
    if p_value is null
       or btrim(p_value)=''
    then
        return null;
    end if;

    if p_value !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    then
        return null;
    end if;

    begin
        v :=
            p_value::date;
    exception
        when others then
            return null;
    end;

    if v::text<>p_value then
        return null;
    end if;

    return v;
end
$p2_date$;


create or replace function public.p2_reservation_dates_ok(
    p_start text,
    p_end text
)
returns boolean
language plpgsql
immutable
as $p2_res_dates$
declare
    v_start date;
    v_end date;
    v_end_supplied boolean;
begin
    v_start :=
        public.p2_iso_date(
            p_start
        );

    if v_start is null then
        return false;
    end if;

    v_end_supplied :=
        nullif(
            btrim(
                coalesce(
                    p_end,
                    ''
                )
            ),
            ''
        ) is not null;

    if not v_end_supplied then
        return true;
    end if;

    v_end :=
        public.p2_iso_date(
            p_end
        );

    return
        v_end is not null
        and
        v_end>v_start;
end
$p2_res_dates$;


create or replace function public.p2_block_dates_ok(
    p_start text,
    p_end text
)
returns boolean
language plpgsql
immutable
as $p2_block_dates$
declare
    v_start date;
    v_end date;
    v_end_supplied boolean;
begin
    v_start :=
        public.p2_iso_date(
            p_start
        );

    if v_start is null then
        return false;
    end if;

    v_end_supplied :=
        nullif(
            btrim(
                coalesce(
                    p_end,
                    ''
                )
            ),
            ''
        ) is not null;

    if not v_end_supplied then
        return true;
    end if;

    v_end :=
        public.p2_iso_date(
            p_end
        );

    return
        v_end is not null
        and
        v_end>=v_start;
end
$p2_block_dates$;


create or replace function public.p2_source_fingerprint(
    p_source_kind text,
    p_camp text,
    p_module text,
    p_room text,
    p_bed text
)
returns text
language sql
immutable
parallel safe
as $p2_fp$
    select md5(
        jsonb_build_array(
            coalesce(p_source_kind,''),
            coalesce(p_camp,''),
            coalesce(p_module,''),
            coalesce(p_room,''),
            coalesce(p_bed,'')
        )::text
    )
$p2_fp$;


-- ============================================================


-- CURRENT RESOLUTION MAP
-- ============================================================

create table if not exists public.p2_bed_resolution_current (
    legacy_camp text,

    legacy_module text not null,

    legacy_room text not null,

    legacy_bed text not null,

    camp_code text,

    module_code text,

    room_code text,

    bed_code text,

    resolution_status text not null
        check (
            resolution_status in (
                'RESOLVED_EXACT',
                'UNRESOLVED_MISSING_CAMP',
                'UNRESOLVED_SOURCE_ABSENT',
                'UNRESOLVED_HISTORICAL_PROVENANCE',
                'CONFLICT_NORMALIZATION_COLLISION',
                'CONFLICT_CANONICAL_MISMATCH'
            )
        ),

    canonical_bed_id bigint
        references public.camp_beds(id)
        on delete restrict,

    reason_code text not null,

    source_fingerprint text not null,

    source_import_id bigint
        references public.import_history(id)
        on delete restrict,

    observed_at timestamptz not null
        default clock_timestamp(),

    primary key(
        legacy_module,
        legacy_room,
        legacy_bed
    )
);


-- ============================================================
-- APPEND-ONLY RESOLUTION LEDGER
-- ============================================================

create table if not exists public.p2_bed_resolution_ledger (
    id bigint generated always as identity
        primary key,

    source_kind text not null,

    source_row_id bigint,

    source_import_id bigint
        references public.import_history(id)
        on delete restrict,

    source_operational_revision bigint,

    legacy_camp text,

    legacy_module text,

    legacy_room text,

    legacy_bed text,

    camp_code text,

    module_code text,

    room_code text,

    bed_code text,

    resolution_status text not null,

    canonical_bed_id bigint
        references public.camp_beds(id)
        on delete restrict,

    reason_code text not null,

    date_shadow_status text,

    source_fingerprint text not null,

    observed_at timestamptz not null
        default clock_timestamp(),

    details jsonb
        default '{}'::jsonb
);


create unique index if not exists p2_ledger_import_observation_uq
on public.p2_bed_resolution_ledger(
    source_kind,
    source_import_id,
    source_fingerprint
)
where source_kind='BED_INVENTORY_IMPORT'
  and source_import_id is not null;


create or replace function public.p2_guard_ledger_append_only()
returns trigger
language plpgsql
as $p2_ledger_guard$
begin
    raise exception using
        errcode='55000',
        message='P2_LEDGER_APPEND_ONLY';
end
$p2_ledger_guard$;


drop trigger if exists p2_ledger_no_update_delete on public.p2_bed_resolution_ledger;

create trigger p2_ledger_no_update_delete
before update or delete
on public.p2_bed_resolution_ledger
for each row
execute function public.p2_guard_ledger_append_only();


drop trigger if exists p2_ledger_no_truncate on public.p2_bed_resolution_ledger;

create trigger p2_ledger_no_truncate
before truncate
on public.p2_bed_resolution_ledger
for each statement
execute function public.p2_guard_ledger_append_only();


-- ============================================================
-- FULL CANONICAL BOOTSTRAP / CURRENT REFRESH
-- ============================================================

create or replace function public.p2_refresh_canonical_bed_shadow(
    p_import_id bigint
)
returns jsonb
language plpgsql
as $p2_refresh$
declare
    v_total integer;
    v_resolved integer;
    v_unresolved integer;
    v_conflict integer;
    v_latest_import_id bigint;
begin

    if not exists (
        select 1
        from public.import_history i
        where i.id=p_import_id
    ) then
        raise exception using
            errcode='23503',
            message='P2_IMPORT_NOT_FOUND';
    end if;

    select max(i.id)
    into v_latest_import_id
    from public.import_history i;

    if p_import_id is distinct from v_latest_import_id then
        raise exception using
            errcode='P0001',
            message='P2_STALE_IMPORT_REPLAY';
    end if;


    -- ========================================================
    -- CAMPS
    -- ========================================================

    with normalized as (
        select
            nullif(
                btrim(b.camp),
                ''
            ) as legacy_camp,

            b.module as legacy_module,
            b.room as legacy_room,
            b.bed as legacy_bed,
            b.room_type,

            public.p2_canonical_text(
                b.camp
            ) as camp_code,

            public.p2_canonical_text(
                b.module
            ) as module_code,

            public.p2_canonical_room(
                b.room
            ) as room_code,

            public.p2_canonical_bed(
                b.bed
            ) as bed_code

        from public.bed_inventory b
    ),
    counted as (
        select
            n.*,

            count(*) over (
                partition by
                    n.camp_code,
                    n.module_code,
                    n.room_code,
                    n.bed_code
            )::integer
            as canonical_collision_count,

            count(*) over (
                partition by
                    n.module_code,
                    n.room_code,
                    n.bed_code
            )::integer
            as lookup_collision_count

        from normalized n
    ),
    classified as (
        select
            c.*,

            case
                when c.legacy_camp is null
                  or c.camp_code=''
                then
                    'UNRESOLVED_MISSING_CAMP'

                when c.module_code=''
                  or c.room_code=''
                  or c.bed_code=''
                then
                    'UNRESOLVED_SOURCE_ABSENT'

                when c.canonical_collision_count>1
                  or c.lookup_collision_count>1
                then
                    'CONFLICT_NORMALIZATION_COLLISION'

                else
                    'RESOLVED_EXACT'
            end
            as resolution_status

        from counted c
    )
    insert into public.camps(
        code,
        name
    )
    select
        s.camp_code,

        case
            when count(
                distinct btrim(
                    s.legacy_camp
                )
            )=1
            then
                min(
                    btrim(
                        s.legacy_camp
                    )
                )
            else
                s.camp_code
        end

    from classified s

    where s.resolution_status='RESOLVED_EXACT'

    group by
        s.camp_code

    on conflict(code)
    do nothing;


    -- ========================================================
    -- MODULES
    -- ========================================================

    with normalized as (
        select
            nullif(
                btrim(b.camp),
                ''
            ) as legacy_camp,

            b.module as legacy_module,
            b.room as legacy_room,
            b.bed as legacy_bed,
            b.room_type,

            public.p2_canonical_text(
                b.camp
            ) as camp_code,

            public.p2_canonical_text(
                b.module
            ) as module_code,

            public.p2_canonical_room(
                b.room
            ) as room_code,

            public.p2_canonical_bed(
                b.bed
            ) as bed_code

        from public.bed_inventory b
    ),
    counted as (
        select
            n.*,

            count(*) over (
                partition by
                    n.camp_code,
                    n.module_code,
                    n.room_code,
                    n.bed_code
            )::integer
            as canonical_collision_count,

            count(*) over (
                partition by
                    n.module_code,
                    n.room_code,
                    n.bed_code
            )::integer
            as lookup_collision_count

        from normalized n
    ),
    classified as (
        select
            c.*,

            case
                when c.legacy_camp is null
                  or c.camp_code=''
                then
                    'UNRESOLVED_MISSING_CAMP'

                when c.module_code=''
                  or c.room_code=''
                  or c.bed_code=''
                then
                    'UNRESOLVED_SOURCE_ABSENT'

                when c.canonical_collision_count>1
                  or c.lookup_collision_count>1
                then
                    'CONFLICT_NORMALIZATION_COLLISION'

                else
                    'RESOLVED_EXACT'
            end
            as resolution_status

        from counted c
    )
    insert into public.camp_modules(
        camp_id,
        code,
        name
    )
    select
        c.id,
        s.module_code,

        case
            when count(
                distinct btrim(
                    s.legacy_module
                )
            )=1
            then
                min(
                    btrim(
                        s.legacy_module
                    )
                )
            else
                s.module_code
        end

    from classified s

    join public.camps c
      on c.code=s.camp_code

    where s.resolution_status='RESOLVED_EXACT'

    group by
        c.id,
        s.module_code

    on conflict(
        camp_id,
        code
    )
    do nothing;


    -- ========================================================
    -- ROOMS
    -- ========================================================

    with normalized as (
        select
            nullif(
                btrim(b.camp),
                ''
            ) as legacy_camp,

            b.module as legacy_module,
            b.room as legacy_room,
            b.bed as legacy_bed,
            b.room_type,

            public.p2_canonical_text(
                b.camp
            ) as camp_code,

            public.p2_canonical_text(
                b.module
            ) as module_code,

            public.p2_canonical_room(
                b.room
            ) as room_code,

            public.p2_canonical_bed(
                b.bed
            ) as bed_code

        from public.bed_inventory b
    ),
    counted as (
        select
            n.*,

            count(*) over (
                partition by
                    n.camp_code,
                    n.module_code,
                    n.room_code,
                    n.bed_code
            )::integer
            as canonical_collision_count,

            count(*) over (
                partition by
                    n.module_code,
                    n.room_code,
                    n.bed_code
            )::integer
            as lookup_collision_count

        from normalized n
    ),
    classified as (
        select
            c.*,

            case
                when c.legacy_camp is null
                  or c.camp_code=''
                then
                    'UNRESOLVED_MISSING_CAMP'

                when c.module_code=''
                  or c.room_code=''
                  or c.bed_code=''
                then
                    'UNRESOLVED_SOURCE_ABSENT'

                when c.canonical_collision_count>1
                  or c.lookup_collision_count>1
                then
                    'CONFLICT_NORMALIZATION_COLLISION'

                else
                    'RESOLVED_EXACT'
            end
            as resolution_status

        from counted c
    )
    insert into public.camp_rooms(
        module_id,
        code,
        room_type
    )
    select
        m.id,
        s.room_code,

        case
            when count(
                distinct nullif(
                    btrim(
                        coalesce(
                            s.room_type,
                            ''
                        )
                    ),
                    ''
                )
            )<=1
            then
                min(
                    nullif(
                        btrim(
                            coalesce(
                                s.room_type,
                                ''
                            )
                        ),
                        ''
                    )
                )
            else
                null
        end

    from classified s

    join public.camps c
      on c.code=s.camp_code

    join public.camp_modules m
      on m.camp_id=c.id
     and m.code=s.module_code

    where s.resolution_status='RESOLVED_EXACT'

    group by
        m.id,
        s.room_code

    on conflict(
        module_id,
        code
    )
    do nothing;


    -- ========================================================
    -- BEDS
    -- ========================================================

    with normalized as (
        select
            nullif(
                btrim(b.camp),
                ''
            ) as legacy_camp,

            b.module as legacy_module,
            b.room as legacy_room,
            b.bed as legacy_bed,

            b.room_type,

            public.p2_canonical_text(
                b.room_type
            ) as room_type_code,

            public.p2_canonical_text(
                b.camp
            ) as camp_code,

            public.p2_canonical_text(
                b.module
            ) as module_code,

            public.p2_canonical_room(
                b.room
            ) as room_code,

            public.p2_canonical_bed(
                b.bed
            ) as bed_code

        from public.bed_inventory b
    ),
    counted as (
        select
            n.*,

            count(*) over (
                partition by
                    n.camp_code,
                    n.module_code,
                    n.room_code,
                    n.bed_code
            )::integer
            as canonical_collision_count,

            count(*) over (
                partition by
                    n.module_code,
                    n.room_code,
                    n.bed_code
            )::integer
            as lookup_collision_count

        from normalized n
    ),
    classified as (
        select
            c.*,

            case
                when c.legacy_camp is null
                  or c.camp_code=''
                then
                    'UNRESOLVED_MISSING_CAMP'

                when c.module_code=''
                  or c.room_code=''
                  or c.bed_code=''
                then
                    'UNRESOLVED_SOURCE_ABSENT'

                when c.canonical_collision_count>1
                  or c.lookup_collision_count>1
                then
                    'CONFLICT_NORMALIZATION_COLLISION'

                else
                    'RESOLVED_EXACT'
            end
            as resolution_status

        from counted c
    )
    insert into public.camp_beds(
        room_id,
        code
    )
    select distinct
        r.id,
        s.bed_code

    from classified s

    join public.camps c
      on c.code=s.camp_code

    join public.camp_modules m
      on m.camp_id=c.id
     and m.code=s.module_code

    join public.camp_rooms r
      on r.module_id=m.id
     and r.code=s.room_code

    where s.resolution_status='RESOLVED_EXACT'

      and not (
          s.room_type_code<>''
          and public.p2_canonical_text(r.room_type)<>''
          and s.room_type_code<>
              public.p2_canonical_text(r.room_type)
      )
    on conflict(
        room_id,
        code
    )
    do nothing;


    -- ========================================================
    -- CURRENT PROJECTION
    -- ========================================================

    delete
    from public.p2_bed_resolution_current;


    with normalized as (
        select
            nullif(
                btrim(b.camp),
                ''
            ) as legacy_camp,

            b.module as legacy_module,
            b.room as legacy_room,
            b.bed as legacy_bed,


            b.room_type,

            public.p2_canonical_text(
                b.room_type
            ) as room_type_code,

            public.p2_canonical_text(
                b.camp
            ) as camp_code,

            public.p2_canonical_text(
                b.module
            ) as module_code,

            public.p2_canonical_room(
                b.room
            ) as room_code,

            public.p2_canonical_bed(
                b.bed
            ) as bed_code,

            public.p2_source_fingerprint(
                'BED_INVENTORY_IMPORT',
                b.camp,
                b.module,
                b.room,
                b.bed
            ) as source_fingerprint

        from public.bed_inventory b
    ),
    counted as (
        select
            n.*,

            count(*) over (
                partition by
                    n.camp_code,
                    n.module_code,
                    n.room_code,
                    n.bed_code
            )::integer
            as canonical_collision_count,

            count(*) over (
                partition by
                    n.module_code,
                    n.room_code,
                    n.bed_code
            )::integer
            as lookup_collision_count

        from normalized n
    ),
    classified as (
        select
            c.*,

            case
                when c.legacy_camp is null
                  or c.camp_code=''
                then
                    'UNRESOLVED_MISSING_CAMP'

                when c.module_code=''
                  or c.room_code=''
                  or c.bed_code=''
                then
                    'UNRESOLVED_SOURCE_ABSENT'

                when c.canonical_collision_count>1
                  or c.lookup_collision_count>1
                then
                    'CONFLICT_NORMALIZATION_COLLISION'

                else
                    'RESOLVED_EXACT'
            end
            as resolution_status,

            case
                when c.legacy_camp is null
                  or c.camp_code=''
                then
                    'MISSING_CAMP'

                when c.module_code=''
                  or c.room_code=''
                  or c.bed_code=''
                then
                    'EMPTY_LOCATION_COMPONENT'

                when c.canonical_collision_count>1
                  or c.lookup_collision_count>1
                then
                    'NORMALIZATION_COLLISION'

                else
                    'EXACT'
            end
            as reason_code

        from counted c
    )
    insert into public.p2_bed_resolution_current(
        legacy_camp,
        legacy_module,
        legacy_room,
        legacy_bed,

        camp_code,
        module_code,
        room_code,
        bed_code,

        resolution_status,
        canonical_bed_id,
        reason_code,

        source_fingerprint,
        source_import_id,
        observed_at
    )
    select
        s.legacy_camp,
        s.legacy_module,
        s.legacy_room,
        s.legacy_bed,

        s.camp_code,
        s.module_code,
        s.room_code,
        s.bed_code,
        case
            when s.resolution_status='RESOLVED_EXACT'
             and s.room_type_code<>''
             and public.p2_canonical_text(r.room_type)<>''
             and s.room_type_code<>
                 public.p2_canonical_text(r.room_type)
            then 'CONFLICT_CANONICAL_MISMATCH'
            else s.resolution_status
        end,

        case
            when s.resolution_status='RESOLVED_EXACT'
             and s.room_type_code<>''
             and public.p2_canonical_text(r.room_type)<>''
             and s.room_type_code<>
                 public.p2_canonical_text(r.room_type)
            then null
            when s.resolution_status='RESOLVED_EXACT'
            then b.id
            else null
        end,

        case
            when s.resolution_status='RESOLVED_EXACT'
             and s.room_type_code<>''
             and public.p2_canonical_text(r.room_type)<>''
             and s.room_type_code<>
                 public.p2_canonical_text(r.room_type)
            then 'ROOM_TYPE_MISMATCH'
            else s.reason_code
        end,

        s.source_fingerprint,
        p_import_id,
        clock_timestamp()

    from classified s

    left join public.camps c
      on c.code=s.camp_code

    left join public.camp_modules m
      on m.camp_id=c.id
     and m.code=s.module_code

    left join public.camp_rooms r
      on r.module_id=m.id
     and r.code=s.room_code

    left join public.camp_beds b
      on b.room_id=r.id
     and b.code=s.bed_code;


    if exists (
        select 1
        from public.p2_bed_resolution_current c
        where c.resolution_status='RESOLVED_EXACT'
          and c.canonical_bed_id is null
    ) then
        raise exception using
            errcode='P0001',
            message='P2_CANONICAL_BIND_FAILED';
    end if;


    -- ========================================================
    -- APPEND-ONLY IMPORT OBSERVATIONS
    -- ========================================================

    with normalized as (
        select
            nullif(
                btrim(b.camp),
                ''
            ) as legacy_camp,

            b.module as legacy_module,
            b.room as legacy_room,
            b.bed as legacy_bed,

            public.p2_canonical_text(
                b.camp
            ) as camp_code,

            public.p2_canonical_text(
                b.module
            ) as module_code,

            public.p2_canonical_room(
                b.room
            ) as room_code,

            public.p2_canonical_bed(
                b.bed
            ) as bed_code

        from public.bed_inventory b
    ),
    counted as (
        select
            n.*,

            count(*) over (
                partition by
                    n.camp_code,
                    n.module_code,
                    n.room_code,
                    n.bed_code
            )::integer
            as canonical_collision_count,

            count(*) over (
                partition by
                    n.module_code,
                    n.room_code,
                    n.bed_code
            )::integer
            as lookup_collision_count

        from normalized n
    )
    insert into public.p2_bed_resolution_ledger(
        source_kind,
        source_import_id,

        legacy_camp,
        legacy_module,
        legacy_room,
        legacy_bed,

        camp_code,
        module_code,
        room_code,
        bed_code,

        resolution_status,
        canonical_bed_id,
        reason_code,

        date_shadow_status,
        source_fingerprint,
        details
    )
    select
        'BED_INVENTORY_IMPORT',
        p_import_id,

        cur.legacy_camp,
        cur.legacy_module,
        cur.legacy_room,
        cur.legacy_bed,

        cur.camp_code,
        cur.module_code,
        cur.room_code,
        cur.bed_code,

        cur.resolution_status,
        cur.canonical_bed_id,
        cur.reason_code,

        null,

        cur.source_fingerprint,

        jsonb_build_object(
            'canonical_collision_count',
            n.canonical_collision_count,

            'lookup_collision_count',
            n.lookup_collision_count
        )

    from public.p2_bed_resolution_current cur

    join counted n
      on n.legacy_module=cur.legacy_module
     and n.legacy_room=cur.legacy_room
     and n.legacy_bed=cur.legacy_bed

    where cur.source_import_id=p_import_id

    on conflict
    do nothing;


    select
        count(*)::integer,

        count(*) filter (
            where resolution_status='RESOLVED_EXACT'
        )::integer,

        count(*) filter (
            where resolution_status like 'UNRESOLVED_%'
        )::integer,

        count(*) filter (
            where resolution_status like 'CONFLICT_%'
        )::integer

    into
        v_total,
        v_resolved,
        v_unresolved,
        v_conflict

    from public.p2_bed_resolution_current;


    return jsonb_build_object(
        'total',
        v_total,

        'resolved_exact',
        v_resolved,

        'unresolved',
        v_unresolved,

        'conflict',
        v_conflict
    );

end
$p2_refresh$;

create or replace function public.p2_after_import_refresh_bed_shadow()
returns trigger
language plpgsql
as $p2_import_hook$
begin
    if upper(
        btrim(
            coalesce(
                new.status,
                ''
            )
        )
    )='OK'
    then
        perform
            public.p2_refresh_canonical_bed_shadow(
                new.id
            );
    end if;

    return new;
end
$p2_import_hook$;


drop trigger if exists import_history_p2_bed_shadow_ai on public.import_history;

create trigger import_history_p2_bed_shadow_ai
after insert
on public.import_history
for each row
execute function public.p2_after_import_refresh_bed_shadow();


-- ============================================================
-- CURRENT SERVER-SIDE RESOLVER
-- ============================================================

create or replace function public.p2_resolve_current_bed(
    p_module text,
    p_room text,
    p_bed text
)
returns table(
    resolution_status text,
    canonical_bed_id bigint,
    reason_code text,
    source_fingerprint text
)
language plpgsql
stable
as $p2_resolver$
declare
    v_module text;
    v_room text;
    v_bed text;

    v_count integer;

    v_row public.p2_bed_resolution_current%rowtype;
begin
    v_module :=
        public.p2_canonical_text(
            p_module
        );

    v_room :=
        public.p2_canonical_room(
            p_room
        );

    v_bed :=
        public.p2_canonical_bed(
            p_bed
        );


    select count(*)::integer
    into v_count
    from public.p2_bed_resolution_current c
    where c.module_code=v_module
      and c.room_code=v_room
      and c.bed_code=v_bed;


    if v_count=0 then

        return query
        select
            'UNRESOLVED_SOURCE_ABSENT'::text,
            null::bigint,
            'SOURCE_ABSENT'::text,
            null::text;

        return;
    end if;


    if v_count>1 then

        return query
        select
            'CONFLICT_NORMALIZATION_COLLISION'::text,
            null::bigint,
            'MULTIPLE_CURRENT_MATCHES'::text,
            null::text;

        return;
    end if;


    select c.*
    into v_row
    from public.p2_bed_resolution_current c
    where c.module_code=v_module
      and c.room_code=v_room
      and c.bed_code=v_bed;


    return query
    select
        v_row.resolution_status,
        v_row.canonical_bed_id,
        v_row.reason_code,
        v_row.source_fingerprint;
end
$p2_resolver$;


create or replace function public.p2_expected_current_bed_id(
    p_module text,
    p_room text,
    p_bed text
)
returns bigint
language sql
stable
as $p2_expected$
    select
        case
            when r.resolution_status='RESOLVED_EXACT'
            then r.canonical_bed_id
            else null
        end

    from public.p2_resolve_current_bed(
        p_module,
        p_room,
        p_bed
    ) r

    limit 1
$p2_expected$;


-- ============================================================


-- RESERVATION SHADOW BEFORE
-- ============================================================

create or replace function public.p2_shadow_reservation()
returns trigger
language plpgsql
as $p2_shadow_res$
declare
    v_resolution record;
begin

    if public.p2_reservation_dates_ok(
        new.arrival_date,
        new.departure_date
    )
    then
        new.arrival_on :=
            public.p2_iso_date(
                new.arrival_date
            );

        new.departure_on :=
            public.p2_iso_date(
                new.departure_date
            );
    else
        new.arrival_on :=
            null;

        new.departure_on :=
            null;
    end if;


    new.bed_id :=
        null;


    if nullif(
           btrim(
               coalesce(
                   new.module,
                   ''
               )
           ),
           ''
       ) is not null

       and nullif(
           btrim(
               coalesce(
                   new.room,
                   ''
               )
           ),
           ''
       ) is not null

       and nullif(
           btrim(
               coalesce(
                   new.bed,
                   ''
               )
           ),
           ''
       ) is not null

       and new.bed_count=1
    then

        select *
        into v_resolution
        from public.p2_resolve_current_bed(
            new.module,
            new.room,
            new.bed
        );


        if v_resolution.resolution_status='RESOLVED_EXACT'
        then
            new.bed_id :=
                v_resolution.canonical_bed_id;
        end if;
    end if;


    return new;
end
$p2_shadow_res$;


-- ============================================================
-- RESERVATION OBSERVATION
-- ============================================================

create or replace function public.p2_observe_reservation_shadow()
returns trigger
language plpgsql
as $p2_obs_res$
declare
    v_resolution record;

    v_status text;
    v_reason text;
    v_fp text;
begin

    if nullif(
           btrim(
               coalesce(
                   new.module,
                   ''
               )
           ),
           ''
       ) is not null

       and nullif(
           btrim(
               coalesce(
                   new.room,
                   ''
               )
           ),
           ''
       ) is not null

       and nullif(
           btrim(
               coalesce(
                   new.bed,
                   ''
               )
           ),
           ''
       ) is not null

       and new.bed_count=1
    then

        select *
        into v_resolution
        from public.p2_resolve_current_bed(
            new.module,
            new.room,
            new.bed
        );

        v_status :=
            v_resolution.resolution_status;

        v_reason :=
            v_resolution.reason_code;

        v_fp :=
            coalesce(
                v_resolution.source_fingerprint,
                public.p2_source_fingerprint(
                    'RESERVATION_WRITE',
                    null,
                    new.module,
                    new.room,
                    new.bed
                )
            );

    else

        v_status :=
            'UNRESOLVED_SOURCE_ABSENT';

        v_reason :=
            'NON_EXACT_RESERVATION';

        v_fp :=
            public.p2_source_fingerprint(
                'RESERVATION_WRITE',
                null,
                new.module,
                new.room,
                new.bed
            );
    end if;


    insert into public.p2_bed_resolution_ledger(
        source_kind,
        source_row_id,

        legacy_module,
        legacy_room,
        legacy_bed,

        resolution_status,
        canonical_bed_id,
        reason_code,

        date_shadow_status,

        source_fingerprint,
        details
    )
    values (
        'RESERVATION_WRITE',
        new.id,

        new.module,
        new.room,
        new.bed,

        v_status,
        new.bed_id,
        v_reason,

        case
            when public.p2_reservation_dates_ok(
                new.arrival_date,
                new.departure_date
            )
            then 'OK'
            else 'INVALID_OR_INCOHERENT'
        end,

        v_fp,

        jsonb_build_object(
            'status',
            new.status,
            'bed_count',
            new.bed_count
        )
    );


    return new;
end
$p2_obs_res$;


-- ============================================================
-- BED BLOCK SHADOW BEFORE
-- ============================================================

create or replace function public.p2_shadow_bed_block()
returns trigger
language plpgsql
as $p2_shadow_block$
declare
    v_resolution record;
begin

    if public.p2_block_dates_ok(
        new.start_date,
        new.end_date
    )
    then
        new.start_on :=
            public.p2_iso_date(
                new.start_date
            );

        new.end_on :=
            public.p2_iso_date(
                new.end_date
            );
    else
        new.start_on :=
            null;

        new.end_on :=
            null;
    end if;


    new.bed_id :=
        null;


    if nullif(
           btrim(
               coalesce(
                   new.module,
                   ''
               )
           ),
           ''
       ) is not null

       and nullif(
           btrim(
               coalesce(
                   new.room,
                   ''
               )
           ),
           ''
       ) is not null

       and nullif(
           btrim(
               coalesce(
                   new.bed,
                   ''
               )
           ),
           ''
       ) is not null
    then

        select *
        into v_resolution
        from public.p2_resolve_current_bed(
            new.module,
            new.room,
            new.bed
        );


        if v_resolution.resolution_status='RESOLVED_EXACT'
        then
            new.bed_id :=
                v_resolution.canonical_bed_id;
        end if;
    end if;


    return new;
end
$p2_shadow_block$;


create or replace function public.p2_observe_bed_block_shadow()
returns trigger
language plpgsql
as $p2_obs_block$
declare
    v_resolution record;

    v_status text;
    v_reason text;
    v_fp text;
begin

    select *
    into v_resolution
    from public.p2_resolve_current_bed(
        new.module,
        new.room,
        new.bed
    );


    v_status :=
        v_resolution.resolution_status;

    v_reason :=
        v_resolution.reason_code;

    v_fp :=
        coalesce(
            v_resolution.source_fingerprint,
            public.p2_source_fingerprint(
                'BED_BLOCK_WRITE',
                null,
                new.module,
                new.room,
                new.bed
            )
        );


    insert into public.p2_bed_resolution_ledger(
        source_kind,
        source_row_id,

        legacy_module,
        legacy_room,
        legacy_bed,

        resolution_status,
        canonical_bed_id,
        reason_code,

        date_shadow_status,

        source_fingerprint,
        details
    )
    values (
        'BED_BLOCK_WRITE',
        new.id,

        new.module,
        new.room,
        new.bed,

        v_status,
        new.bed_id,
        v_reason,

        case
            when public.p2_block_dates_ok(
                new.start_date,
                new.end_date
            )
            then 'OK'
            else 'INVALID_OR_INCOHERENT'
        end,

        v_fp,

        jsonb_build_object(
            'status',
            new.status
        )
    );


    return new;
end
$p2_obs_block$;


-- ============================================================
-- R4B-R1 TRIGGER COLUMN FENCE
-- ============================================================

drop trigger if exists reservations_p2_shadow_bi on public.reservations;

create trigger reservations_p2_shadow_bi
before insert
on public.reservations
for each row
execute function public.p2_shadow_reservation();


drop trigger if exists reservations_p2_shadow_bu on public.reservations;

create trigger reservations_p2_shadow_bu
before update of
    module,
    room,
    bed,
    bed_count,
    arrival_date,
    departure_date,
    bed_id,
    arrival_on,
    departure_on
on public.reservations
for each row
execute function public.p2_shadow_reservation();


drop trigger if exists reservations_p2_shadow_observe_ai on public.reservations;

create trigger reservations_p2_shadow_observe_ai
after insert
on public.reservations
for each row
execute function public.p2_observe_reservation_shadow();


drop trigger if exists reservations_p2_shadow_observe_au on public.reservations;

create trigger reservations_p2_shadow_observe_au
after update of
    module,
    room,
    bed,
    bed_count,
    arrival_date,
    departure_date,
    bed_id,
    arrival_on,
    departure_on
on public.reservations
for each row
execute function public.p2_observe_reservation_shadow();


drop trigger if exists bed_blocks_p2_shadow_bi on public.bed_blocks;

create trigger bed_blocks_p2_shadow_bi
before insert
on public.bed_blocks
for each row
execute function public.p2_shadow_bed_block();


drop trigger if exists bed_blocks_p2_shadow_bu on public.bed_blocks;

create trigger bed_blocks_p2_shadow_bu
before update of
    module,
    room,
    bed,
    start_date,
    end_date,
    bed_id,
    start_on,
    end_on
on public.bed_blocks
for each row
execute function public.p2_shadow_bed_block();


drop trigger if exists bed_blocks_p2_shadow_observe_ai on public.bed_blocks;

create trigger bed_blocks_p2_shadow_observe_ai
after insert
on public.bed_blocks
for each row
execute function public.p2_observe_bed_block_shadow();


drop trigger if exists bed_blocks_p2_shadow_observe_au on public.bed_blocks;

create trigger bed_blocks_p2_shadow_observe_au
after update of
    module,
    room,
    bed,
    start_date,
    end_date,
    bed_id,
    start_on,
    end_on
on public.bed_blocks
for each row
execute function public.p2_observe_bed_block_shadow();


-- ============================================================
-- READINESS VIEW
-- ============================================================
create or replace view public.p2_shadow_readiness_v as
with
combining_marks as (
    select
        string_agg(
            chr(x),
            ''
            order by x
        ) as chars
    from generate_series(
        768,
        879
    ) as g(x)
),

current_metrics as (
    select
        count(*)::integer
            as current_inventory_total,

        count(*) filter (
            where c.resolution_status='RESOLVED_EXACT'
        )::integer
            as current_inventory_resolved_exact,

        count(*) filter (
            where c.resolution_status like 'UNRESOLVED_%'
        )::integer
            as current_inventory_unresolved,

        count(*) filter (
            where c.resolution_status like 'CONFLICT_%'
        )::integer
            as current_inventory_conflict,

        count(*) filter (
            where c.resolution_status=
                  'CONFLICT_NORMALIZATION_COLLISION'
        )::integer
            as normalization_collision_count,

        count(*) filter (
            where c.resolution_status=
                  'CONFLICT_CANONICAL_MISMATCH'
        )::integer
            as canonical_mismatch_count

    from public.p2_bed_resolution_current c
),

reservation_norm_1 as (
    select
        r.bed_id,
        r.arrival_date,
        r.departure_date,

        btrim(
            regexp_replace(
                upper(
                    translate(
                        normalize(
                            btrim(
                                coalesce(
                                    r.module,
                                    ''
                                )
                            ),
                            NFD
                        ),
                        cm.chars,
                        ''
                    )
                ),
                '[^A-Z0-9]+',
                ' ',
                'g'
            )
        ) as module_code,

        case

            when btrim(
                coalesce(
                    r.room,
                    ''
                )
            )=''
            then ''

            when pg_catalog.pg_input_is_valid(
                replace(
                    btrim(
                        coalesce(
                            r.room,
                            ''
                        )
                    ),
                    ',',
                    '.'
                ),
                'numeric'
            )
            then
                case

                    when
                        replace(
                            btrim(
                                coalesce(
                                    r.room,
                                    ''
                                )
                            ),
                            ',',
                            '.'
                        )::numeric
                        =
                        trunc(
                            replace(
                                btrim(
                                    coalesce(
                                        r.room,
                                        ''
                                    )
                                ),
                                ',',
                                '.'
                            )::numeric
                        )

                    then
                        trunc(
                            replace(
                                btrim(
                                    coalesce(
                                        r.room,
                                        ''
                                    )
                                ),
                                ',',
                                '.'
                            )::numeric
                        )::text

                    else
                        rtrim(
                            rtrim(
                                (
                                    replace(
                                        btrim(
                                            coalesce(
                                                r.room,
                                                ''
                                            )
                                        ),
                                        ',',
                                        '.'
                                    )::numeric
                                )::text,
                                '0'
                            ),
                            '.'
                        )
                end

            else
                btrim(
                    regexp_replace(
                        upper(
                            translate(
                                normalize(
                                    btrim(
                                        coalesce(
                                            r.room,
                                            ''
                                        )
                                    ),
                                    NFD
                                ),
                                cm.chars,
                                ''
                            )
                        ),
                        '[^A-Z0-9]+',
                        ' ',
                        'g'
                    )
                )
        end as room_code,

        btrim(
            regexp_replace(
                upper(
                    translate(
                        normalize(
                            btrim(
                                coalesce(
                                    r.bed,
                                    ''
                                )
                            ),
                            NFD
                        ),
                        cm.chars,
                        ''
                    )
                ),
                '[^A-Z0-9]+',
                ' ',
                'g'
            )
        ) as bed_text

    from public.reservations r
    cross join combining_marks cm

    where
        r.status = any(
            array[
                'PENDIENTE'::text,
                'CONFIRMADA'::text
            ]
        )

        and r.bed_count=1

        and nullif(
            btrim(
                coalesce(
                    r.module,
                    ''
                )
            ),
            ''
        ) is not null

        and nullif(
            btrim(
                coalesce(
                    r.room,
                    ''
                )
            ),
            ''
        ) is not null

        and nullif(
            btrim(
                coalesce(
                    r.bed,
                    ''
                )
            ),
            ''
        ) is not null
),

reservation_norm as (
    select
        x.*,

        case
            when left(
                x.bed_text,
                5
            )='CAMA '
            then
                btrim(
                    substr(
                        x.bed_text,
                        6
                    )
                )
            else
                x.bed_text
        end as bed_code,

        case
            when x.arrival_date is null
                 or btrim(
                     x.arrival_date
                 )=''
            then null::date

            when x.arrival_date !~
                 '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
            then null::date

            when not pg_catalog.pg_input_is_valid(
                x.arrival_date,
                'date'
            )
            then null::date

            when (
                x.arrival_date::date
            )::text<>x.arrival_date
            then null::date

            else
                x.arrival_date::date
        end as start_iso,

        case
            when x.departure_date is null
                 or btrim(
                     x.departure_date
                 )=''
            then null::date

            when x.departure_date !~
                 '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
            then null::date

            when not pg_catalog.pg_input_is_valid(
                x.departure_date,
                'date'
            )
            then null::date

            when (
                x.departure_date::date
            )::text<>x.departure_date
            then null::date

            else
                x.departure_date::date
        end as end_iso,

        nullif(
            btrim(
                coalesce(
                    x.departure_date,
                    ''
                )
            ),
            ''
        ) is not null
            as end_supplied

    from reservation_norm_1 x
),

reservation_eval as (
    select
        r.*,

        e.expected_bed_id

    from reservation_norm r

    cross join lateral (
        select
            case

                when count(*)=1
                     and max(
                         c.resolution_status
                     )='RESOLVED_EXACT'

                then
                    max(
                        c.canonical_bed_id
                    )

                else
                    null::bigint
            end as expected_bed_id

        from public.p2_bed_resolution_current c

        where
            c.module_code=r.module_code
            and c.room_code=r.room_code
            and c.bed_code=r.bed_code
    ) e
),

active_reservations as (
    select
        count(*)::integer
            as active_exact_reservations_total,

        count(*) filter (
            where r.bed_id is null
        )::integer
            as active_exact_reservations_bed_id_null,

        count(*) filter (
            where r.bed_id is not null
              and r.bed_id is distinct from
                  r.expected_bed_id
        )::integer
            as active_exact_reservations_bed_id_mismatch,

        count(*) filter (
            where not (
                r.start_iso is not null

                and (
                    not r.end_supplied

                    or (
                        r.end_iso is not null
                        and r.end_iso>r.start_iso
                    )
                )
            )
        )::integer
            as active_reservation_date_shadow_failures

    from reservation_eval r
),

block_norm_1 as (
    select
        b.bed_id,
        b.start_date,
        b.end_date,

        btrim(
            regexp_replace(
                upper(
                    translate(
                        normalize(
                            btrim(
                                coalesce(
                                    b.module,
                                    ''
                                )
                            ),
                            NFD
                        ),
                        cm.chars,
                        ''
                    )
                ),
                '[^A-Z0-9]+',
                ' ',
                'g'
            )
        ) as module_code,

        case

            when btrim(
                coalesce(
                    b.room,
                    ''
                )
            )=''
            then ''

            when pg_catalog.pg_input_is_valid(
                replace(
                    btrim(
                        coalesce(
                            b.room,
                            ''
                        )
                    ),
                    ',',
                    '.'
                ),
                'numeric'
            )
            then
                case

                    when
                        replace(
                            btrim(
                                coalesce(
                                    b.room,
                                    ''
                                )
                            ),
                            ',',
                            '.'
                        )::numeric
                        =
                        trunc(
                            replace(
                                btrim(
                                    coalesce(
                                        b.room,
                                        ''
                                    )
                                ),
                                ',',
                                '.'
                            )::numeric
                        )

                    then
                        trunc(
                            replace(
                                btrim(
                                    coalesce(
                                        b.room,
                                        ''
                                    )
                                ),
                                ',',
                                '.'
                            )::numeric
                        )::text

                    else
                        rtrim(
                            rtrim(
                                (
                                    replace(
                                        btrim(
                                            coalesce(
                                                b.room,
                                                ''
                                            )
                                        ),
                                        ',',
                                        '.'
                                    )::numeric
                                )::text,
                                '0'
                            ),
                            '.'
                        )
                end

            else
                btrim(
                    regexp_replace(
                        upper(
                            translate(
                                normalize(
                                    btrim(
                                        coalesce(
                                            b.room,
                                            ''
                                        )
                                    ),
                                    NFD
                                ),
                                cm.chars,
                                ''
                            )
                        ),
                        '[^A-Z0-9]+',
                        ' ',
                        'g'
                    )
                )
        end as room_code,

        btrim(
            regexp_replace(
                upper(
                    translate(
                        normalize(
                            btrim(
                                coalesce(
                                    b.bed,
                                    ''
                                )
                            ),
                            NFD
                        ),
                        cm.chars,
                        ''
                    )
                ),
                '[^A-Z0-9]+',
                ' ',
                'g'
            )
        ) as bed_text

    from public.bed_blocks b
    cross join combining_marks cm

    where
        b.status='ACTIVO'
),

block_norm as (
    select
        x.*,

        case
            when left(
                x.bed_text,
                5
            )='CAMA '
            then
                btrim(
                    substr(
                        x.bed_text,
                        6
                    )
                )
            else
                x.bed_text
        end as bed_code,

        case
            when x.start_date is null
                 or btrim(
                     x.start_date
                 )=''
            then null::date

            when x.start_date !~
                 '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
            then null::date

            when not pg_catalog.pg_input_is_valid(
                x.start_date,
                'date'
            )
            then null::date

            when (
                x.start_date::date
            )::text<>x.start_date
            then null::date

            else
                x.start_date::date
        end as start_iso,

        case
            when x.end_date is null
                 or btrim(
                     x.end_date
                 )=''
            then null::date

            when x.end_date !~
                 '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
            then null::date

            when not pg_catalog.pg_input_is_valid(
                x.end_date,
                'date'
            )
            then null::date

            when (
                x.end_date::date
            )::text<>x.end_date
            then null::date

            else
                x.end_date::date
        end as end_iso,

        nullif(
            btrim(
                coalesce(
                    x.end_date,
                    ''
                )
            ),
            ''
        ) is not null
            as end_supplied

    from block_norm_1 x
),

block_eval as (
    select
        b.*,

        e.expected_bed_id

    from block_norm b

    cross join lateral (
        select
            case

                when count(*)=1
                     and max(
                         c.resolution_status
                     )='RESOLVED_EXACT'

                then
                    max(
                        c.canonical_bed_id
                    )

                else
                    null::bigint
            end as expected_bed_id

        from public.p2_bed_resolution_current c

        where
            c.module_code=b.module_code
            and c.room_code=b.room_code
            and c.bed_code=b.bed_code
    ) e
),

active_blocks as (
    select
        count(*)::integer
            as active_blocks_total,

        count(*) filter (
            where b.bed_id is null
        )::integer
            as active_blocks_bed_id_null,

        count(*) filter (
            where b.bed_id is not null
              and b.bed_id is distinct from
                  b.expected_bed_id
        )::integer
            as active_blocks_bed_id_mismatch,

        count(*) filter (
            where not (
                b.start_iso is not null

                and (
                    not b.end_supplied

                    or (
                        b.end_iso is not null
                        and b.end_iso>=b.start_iso
                    )
                )
            )
        )::integer
            as active_block_date_shadow_failures

    from block_eval b
)

select
    c.current_inventory_total,
    c.current_inventory_resolved_exact,
    c.current_inventory_unresolved,
    c.current_inventory_conflict,

    r.active_exact_reservations_total,
    r.active_exact_reservations_bed_id_null,
    r.active_exact_reservations_bed_id_mismatch,
    r.active_reservation_date_shadow_failures,

    b.active_blocks_total,
    b.active_blocks_bed_id_null,
    b.active_blocks_bed_id_mismatch,
    b.active_block_date_shadow_failures,

    c.normalization_collision_count,
    c.canonical_mismatch_count,

    (
        r.active_exact_reservations_bed_id_null
        +
        b.active_blocks_bed_id_null
    ) as collision_relevant_active_unresolved,

    (
        c.current_inventory_unresolved=0

        and
        c.current_inventory_conflict=0

        and
        r.active_exact_reservations_bed_id_null=0

        and
        r.active_exact_reservations_bed_id_mismatch=0

        and
        r.active_reservation_date_shadow_failures=0

        and
        b.active_blocks_bed_id_null=0

        and
        b.active_blocks_bed_id_mismatch=0

        and
        b.active_block_date_shadow_failures=0
    ) as c04_c06_c07_validate_ready,

    false
        as c08_cutover_ready

from current_metrics c
cross join active_reservations r
cross join active_blocks b;


-- ============================================================

alter table public.p2_bed_resolution_current
enable row level security;

alter table public.p2_bed_resolution_ledger
enable row level security;

revoke all
on table public.p2_bed_resolution_current
from public;

revoke all
on table public.p2_bed_resolution_ledger
from public;

do $p2_e1_roles$
begin
    if exists (
        select 1
        from pg_roles
        where rolname='anon'
    ) then
        revoke all
        on table public.p2_bed_resolution_current
        from anon;

        revoke all
        on table public.p2_bed_resolution_ledger
        from anon;
    end if;

    if exists (
        select 1
        from pg_roles
        where rolname='authenticated'
    ) then
        revoke all
        on table public.p2_bed_resolution_current
        from authenticated;

        revoke all
        on table public.p2_bed_resolution_ledger
        from authenticated;
    end if;

    if exists (
        select 1
        from pg_roles
        where rolname='service_role'
    ) then
        grant select
        on table public.p2_bed_resolution_current
        to service_role;

        grant select
        on table public.p2_bed_resolution_ledger
        to service_role;
    end if;
end
$p2_e1_roles$;


-- ============================================================
-- P2.4E1-R5C SECURITY HARDENING
-- ============================================================

-- ------------------------------------------------------------
-- Explicit search_path on every E1 function.
-- ------------------------------------------------------------

alter function public.p2_after_import_refresh_bed_shadow()
set search_path = pg_catalog;

alter function public.p2_block_dates_ok(text,text)
set search_path = pg_catalog;

alter function public.p2_canonical_bed(text)
set search_path = pg_catalog;

alter function public.p2_canonical_room(text)
set search_path = pg_catalog;

alter function public.p2_canonical_text(text)
set search_path = pg_catalog;

alter function public.p2_expected_current_bed_id(text,text,text)
set search_path = pg_catalog;

alter function public.p2_guard_ledger_append_only()
set search_path = pg_catalog;

alter function public.p2_iso_date(text)
set search_path = pg_catalog;

alter function public.p2_observe_bed_block_shadow()
set search_path = pg_catalog;

alter function public.p2_observe_reservation_shadow()
set search_path = pg_catalog;

alter function public.p2_refresh_canonical_bed_shadow(bigint)
set search_path = pg_catalog;

alter function public.p2_reservation_dates_ok(text,text)
set search_path = pg_catalog;

alter function public.p2_resolve_current_bed(text,text,text)
set search_path = pg_catalog;

alter function public.p2_shadow_bed_block()
set search_path = pg_catalog;

alter function public.p2_shadow_reservation()
set search_path = pg_catalog;

alter function public.p2_source_fingerprint(text,text,text,text,text)
set search_path = pg_catalog;


-- ------------------------------------------------------------
-- Exactly five trigger entrypoints are SECURITY DEFINER.
-- Helpers remain SECURITY INVOKER.
-- ------------------------------------------------------------

alter function public.p2_after_import_refresh_bed_shadow()
security definer;

alter function public.p2_observe_bed_block_shadow()
security definer;

alter function public.p2_observe_reservation_shadow()
security definer;

alter function public.p2_shadow_bed_block()
security definer;

alter function public.p2_shadow_reservation()
security definer;


alter function public.p2_block_dates_ok(text,text)
security invoker;

alter function public.p2_canonical_bed(text)
security invoker;

alter function public.p2_canonical_room(text)
security invoker;

alter function public.p2_canonical_text(text)
security invoker;

alter function public.p2_expected_current_bed_id(text,text,text)
security invoker;

alter function public.p2_guard_ledger_append_only()
security invoker;

alter function public.p2_iso_date(text)
security invoker;

alter function public.p2_refresh_canonical_bed_shadow(bigint)
security invoker;

alter function public.p2_reservation_dates_ok(text,text)
security invoker;

alter function public.p2_resolve_current_bed(text,text,text)
security invoker;

alter function public.p2_source_fingerprint(text,text,text,text,text)
security invoker;


-- ------------------------------------------------------------
-- PUBLIC must have no direct EXECUTE.
-- ------------------------------------------------------------

revoke execute on function
    public.p2_after_import_refresh_bed_shadow()
from public;

revoke execute on function
    public.p2_block_dates_ok(text,text)
from public;

revoke execute on function
    public.p2_canonical_bed(text)
from public;

revoke execute on function
    public.p2_canonical_room(text)
from public;

revoke execute on function
    public.p2_canonical_text(text)
from public;

revoke execute on function
    public.p2_expected_current_bed_id(text,text,text)
from public;

revoke execute on function
    public.p2_guard_ledger_append_only()
from public;

revoke execute on function
    public.p2_iso_date(text)
from public;

revoke execute on function
    public.p2_observe_bed_block_shadow()
from public;

revoke execute on function
    public.p2_observe_reservation_shadow()
from public;

revoke execute on function
    public.p2_refresh_canonical_bed_shadow(bigint)
from public;

revoke execute on function
    public.p2_reservation_dates_ok(text,text)
from public;

revoke execute on function
    public.p2_resolve_current_bed(text,text,text)
from public;

revoke execute on function
    public.p2_shadow_bed_block()
from public;

revoke execute on function
    public.p2_shadow_reservation()
from public;

revoke execute on function
    public.p2_source_fingerprint(text,text,text,text,text)
from public;


-- ------------------------------------------------------------
-- Explicit revocation from known runtime roles.
-- Optional roles are handled conditionally.
-- ------------------------------------------------------------

do $p2_revoke_exec$
declare
    v_role text;

    v_sig text;

    v_roles text[] :=
        array[
            'anon',
            'authenticated',
            'service_role',
            'camp_app',
            'replit_app'
        ];

    v_functions text[] :=
        array[
            'public.p2_after_import_refresh_bed_shadow()',
            'public.p2_block_dates_ok(text,text)',
            'public.p2_canonical_bed(text)',
            'public.p2_canonical_room(text)',
            'public.p2_canonical_text(text)',
            'public.p2_expected_current_bed_id(text,text,text)',
            'public.p2_guard_ledger_append_only()',
            'public.p2_iso_date(text)',
            'public.p2_observe_bed_block_shadow()',
            'public.p2_observe_reservation_shadow()',
            'public.p2_refresh_canonical_bed_shadow(bigint)',
            'public.p2_reservation_dates_ok(text,text)',
            'public.p2_resolve_current_bed(text,text,text)',
            'public.p2_shadow_bed_block()',
            'public.p2_shadow_reservation()',
            'public.p2_source_fingerprint(text,text,text,text,text)'
        ];
begin

    foreach v_role in array v_roles
    loop

        if exists (
            select 1
            from pg_catalog.pg_roles
            where rolname=v_role
        )
        then

            foreach v_sig in array v_functions
            loop

                execute
                    format(
                        'revoke execute on function %s from %I',
                        v_sig,
                        v_role
                    );

            end loop;

        end if;

    end loop;

end
$p2_revoke_exec$;


-- ------------------------------------------------------------
-- Shadow tables are internal.
-- ------------------------------------------------------------

alter table public.p2_bed_resolution_current
enable row level security;

alter table public.p2_bed_resolution_ledger
enable row level security;


revoke all
on table public.p2_bed_resolution_current
from public;

revoke all
on table public.p2_bed_resolution_ledger
from public;


do $p2_shadow_acl$
declare
    v_role text;

    v_roles text[] :=
        array[
            'anon',
            'authenticated',
            'service_role',
            'camp_app',
            'replit_app'
        ];
begin

    foreach v_role in array v_roles
    loop

        if exists (
            select 1
            from pg_catalog.pg_roles
            where rolname=v_role
        )
        then

            execute format(
                'revoke all on table public.p2_bed_resolution_current from %I',
                v_role
            );

            execute format(
                'revoke all on table public.p2_bed_resolution_ledger from %I',
                v_role
            );

        end if;

    end loop;


    if exists (
        select 1
        from pg_catalog.pg_roles
        where rolname='service_role'
    )
    then

        grant select
        on table public.p2_bed_resolution_current
        to service_role;

        grant select
        on table public.p2_bed_resolution_ledger
        to service_role;

    end if;

end
$p2_shadow_acl$;


-- ------------------------------------------------------------
-- Explicit service_role read-only RLS policies.
-- ------------------------------------------------------------

drop policy if exists
    p2_bed_resolution_current_service_select
on public.p2_bed_resolution_current;

drop policy if exists
    p2_bed_resolution_ledger_service_select
on public.p2_bed_resolution_ledger;


do $p2_shadow_policies$
begin

    if exists (
        select 1
        from pg_catalog.pg_roles
        where rolname='service_role'
    )
    then

        create policy
            p2_bed_resolution_current_service_select
        on public.p2_bed_resolution_current
        for select
        to service_role
        using (true);


        create policy
            p2_bed_resolution_ledger_service_select
        on public.p2_bed_resolution_ledger
        for select
        to service_role
        using (true);

    end if;

end
$p2_shadow_policies$;


-- ------------------------------------------------------------
-- Readiness diagnostic view is caller-context / service-only.
-- ------------------------------------------------------------

alter view public.p2_shadow_readiness_v
set (
    security_invoker = true
);


revoke all
on table public.p2_shadow_readiness_v
from public;


do $p2_readiness_acl$
declare
    v_role text;

    v_roles text[] :=
        array[
            'anon',
            'authenticated',
            'service_role',
            'camp_app',
            'replit_app'
        ];
begin

    foreach v_role in array v_roles
    loop

        if exists (
            select 1
            from pg_catalog.pg_roles
            where rolname=v_role
        )
        then

            execute format(
                'revoke all on table public.p2_shadow_readiness_v from %I',
                v_role
            );

        end if;

    end loop;


    if exists (
        select 1
        from pg_catalog.pg_roles
        where rolname='service_role'
    )
    then

        grant select
        on table public.p2_shadow_readiness_v
        to service_role;

    end if;

end
$p2_readiness_acl$;


-- ------------------------------------------------------------
-- Runtime roles never need direct identity-sequence privileges.
-- ------------------------------------------------------------

do $p2_sequence_acl$
declare
    v_seq text;
    v_role text;

    v_roles text[] :=
        array[
            'anon',
            'authenticated',
            'service_role',
            'camp_app',
            'replit_app'
        ];
begin

    v_seq :=
        pg_catalog.pg_get_serial_sequence(
            'public.p2_bed_resolution_ledger',
            'id'
        );


    if v_seq is not null then

        execute
            'revoke all on sequence ' ||
            v_seq ||
            ' from public';


        foreach v_role in array v_roles
        loop

            if exists (
                select 1
                from pg_catalog.pg_roles
                where rolname=v_role
            )
            then

                execute format(
                    'revoke all on sequence %s from %I',
                    v_seq,
                    v_role
                );

            end if;

        end loop;

    end if;

end
$p2_sequence_acl$;


-- ============================================================
-- END P2.4E1-R5C SECURITY HARDENING
-- ============================================================
