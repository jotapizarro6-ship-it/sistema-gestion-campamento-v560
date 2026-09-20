-- ============================================================================
-- GARPI P2 DATA CORE SCHEMA FOUNDATIONS V1
-- RELEASE TYPE : EXPAND ONLY
-- RUNTIME CUTOVER: NO
-- LEGACY REWRITE: NO
-- DATA BACKFILL: NO
--
-- Rollback classification:
-- PRE-CUTOVER foundation objects only.
-- Once shadow data exists, prefer forward-fix over destructive rollback.
-- ============================================================================


-- ============================================================================
-- PERSON
-- Stable internal identity.
-- RUT remains the governed business key when available.
-- ============================================================================

create table if not exists public.persons (
  id bigint generated always as identity primary key,
  rut_normalized text,
  canonical_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint persons_rut_format_chk
    check (
      rut_normalized is null
      or rut_normalized ~ '^[0-9]{5,9}-[0-9K]$'
    )
);

create unique index if not exists persons_rut_normalized_uidx
  on public.persons(rut_normalized)
  where rut_normalized is not null;


-- ============================================================================
-- COMPANY
-- Canonical company identity + explicit aliases.
-- No fuzzy automatic merge.
-- ============================================================================

create table if not exists public.companies (
  id bigint generated always as identity primary key,
  canonical_name text not null,
  normalized_key text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint companies_normalized_key_chk
    check (length(trim(normalized_key)) > 0)
);

create unique index if not exists companies_normalized_key_uidx
  on public.companies(normalized_key);


create table if not exists public.company_aliases (
  id bigint generated always as identity primary key,
  company_id bigint not null
    references public.companies(id)
    on delete restrict,

  alias_display text not null,
  alias_normalized text not null,

  created_at timestamptz not null default now(),

  constraint company_aliases_key_chk
    check (length(trim(alias_normalized)) > 0)
);

create unique index if not exists company_aliases_normalized_uidx
  on public.company_aliases(alias_normalized);

create index if not exists company_aliases_company_idx
  on public.company_aliases(company_id);


-- ============================================================================
-- SHIFT
-- Canonical shift identity + explicit aliases.
-- ============================================================================

create table if not exists public.shifts (
  id bigint generated always as identity primary key,
  canonical_code text not null,
  canonical_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint shifts_code_chk
    check (length(trim(canonical_code)) > 0)
);

create unique index if not exists shifts_code_uidx
  on public.shifts(canonical_code);


create table if not exists public.shift_aliases (
  id bigint generated always as identity primary key,
  shift_id bigint not null
    references public.shifts(id)
    on delete restrict,

  alias_display text not null,
  alias_normalized text not null,

  created_at timestamptz not null default now(),

  constraint shift_aliases_key_chk
    check (length(trim(alias_normalized)) > 0)
);

create unique index if not exists shift_aliases_normalized_uidx
  on public.shift_aliases(alias_normalized);

create index if not exists shift_aliases_shift_idx
  on public.shift_aliases(shift_id);


-- ============================================================================
-- PHYSICAL HIERARCHY
-- camp -> module -> room -> bed
--
-- Existing bed_inventory remains authoritative for current runtime.
-- These tables are shadow foundations only during P2.
-- ============================================================================

create table if not exists public.camps (
  id bigint generated always as identity primary key,
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists camps_code_uidx
  on public.camps(code);


create table if not exists public.camp_modules (
  id bigint generated always as identity primary key,
  camp_id bigint not null
    references public.camps(id)
    on delete restrict,

  code text not null,
  name text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint camp_modules_code_chk
    check (length(trim(code)) > 0),

  constraint camp_modules_camp_code_uq
    unique(camp_id, code)
);


create table if not exists public.camp_rooms (
  id bigint generated always as identity primary key,
  module_id bigint not null
    references public.camp_modules(id)
    on delete restrict,

  code text not null,
  room_type text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint camp_rooms_code_chk
    check (length(trim(code)) > 0),

  constraint camp_rooms_module_code_uq
    unique(module_id, code)
);


create table if not exists public.camp_beds (
  id bigint generated always as identity primary key,
  room_id bigint not null
    references public.camp_rooms(id)
    on delete restrict,

  code text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint camp_beds_code_chk
    check (length(trim(code)) > 0),

  constraint camp_beds_room_code_uq
    unique(room_id, code)
);


-- ============================================================================
-- ASSIGNMENTS
-- Temporal person -> bed relationship.
-- No worker.id dependency.
-- ============================================================================

create table if not exists public.assignments (
  id bigint generated always as identity primary key,

  person_id bigint
    references public.persons(id)
    on delete restrict,

  bed_id bigint
    references public.camp_beds(id)
    on delete restrict,

  reservation_id bigint
    references public.reservations(id)
    on delete restrict,

  status text not null default 'ACTIVA'
    check (
      status in (
        'ACTIVA',
        'FINALIZADA',
        'CANCELADA',
        'LEGACY_UNRESOLVED'
      )
    ),

  -- Nullable only for LEGACY_UNRESOLVED.
  -- Never fabricate an unknown historical assignment start.
  valid_from timestamptz,
  valid_to timestamptz,

  source_import_id bigint
    references public.import_history(id)
    on delete restrict,

  source_operational_revision bigint,

  legacy_source jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint assignments_time_chk
    check (
      valid_to is null
      or valid_to > valid_from
    ),

  constraint assignments_active_open_chk
    check (
      status <> 'ACTIVA'
      or valid_to is null
    ),

  constraint assignments_identity_resolution_chk
    check (
      (
        status = 'LEGACY_UNRESOLVED'
        and legacy_source is not null
      )
      or
      (
        status <> 'LEGACY_UNRESOLVED'
        and person_id is not null
        and bed_id is not null
        and valid_from is not null
      )
    )
);

create unique index if not exists assignments_one_active_person_uidx
  on public.assignments(person_id)
  where status = 'ACTIVA';

create unique index if not exists assignments_one_active_bed_uidx
  on public.assignments(bed_id)
  where status = 'ACTIVA';

create index if not exists assignments_person_history_idx
  on public.assignments(person_id, valid_from desc);

create index if not exists assignments_bed_history_idx
  on public.assignments(bed_id, valid_from desc);

create index if not exists assignments_reservation_idx
  on public.assignments(reservation_id)
  where reservation_id is not null;

create index if not exists assignments_source_import_idx
  on public.assignments(source_import_id)
  where source_import_id is not null;


-- ============================================================================
-- RESERVATION IDENTITY BRIDGE
--
-- Existing reservation_members.rut remains supported.
-- person_id is nullable during EXPAND/SHADOW.
-- No foreign key to workers.
-- ============================================================================

alter table public.reservation_members
  add column if not exists person_id bigint;

do $p2_reservation_member_person$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid =
      'public.reservation_members'::regclass
      and conname =
        'reservation_members_person_id_fkey'
  ) then

    alter table public.reservation_members
      add constraint
        reservation_members_person_id_fkey
      foreign key (person_id)
      references public.persons(id)
      on delete restrict
      not valid;

  end if;
end;
$p2_reservation_member_person$;

create index if not exists reservation_members_person_id_idx
  on public.reservation_members(person_id)
  where person_id is not null;

create unique index if not exists
  reservation_members_reservation_person_uidx
  on public.reservation_members(
    reservation_id,
    person_id
  )
  where person_id is not null;


-- ============================================================================
-- SECURITY
--
-- New canonical/shadow tables are service-role mediated.
-- No broad "all sequences in schema" grant is used.
-- ============================================================================

alter table public.persons enable row level security;
alter table public.companies enable row level security;
alter table public.company_aliases enable row level security;
alter table public.shifts enable row level security;
alter table public.shift_aliases enable row level security;
alter table public.camps enable row level security;
alter table public.camp_modules enable row level security;
alter table public.camp_rooms enable row level security;
alter table public.camp_beds enable row level security;
alter table public.assignments enable row level security;

do $p2_security$
declare
  v_table text;
  v_sequence text;
begin

  foreach v_table in array array[
    'persons',
    'companies',
    'company_aliases',
    'shifts',
    'shift_aliases',
    'camps',
    'camp_modules',
    'camp_rooms',
    'camp_beds',
    'assignments'
  ]
  loop

    execute format(
      'revoke all on table public.%I from public',
      v_table
    );

    if exists (
      select 1
      from pg_roles
      where rolname = 'anon'
    ) then
      execute format(
        'revoke all on table public.%I from anon',
        v_table
      );
    end if;

    if exists (
      select 1
      from pg_roles
      where rolname = 'authenticated'
    ) then
      execute format(
        'revoke all on table public.%I from authenticated',
        v_table
      );
    end if;

    if exists (
      select 1
      from pg_roles
      where rolname = 'service_role'
    ) then

      execute format(
        'grant select, insert, update, delete on table public.%I to service_role',
        v_table
      );

      v_sequence :=
        pg_get_serial_sequence(
          format('public.%I', v_table),
          'id'
        );

      if v_sequence is not null then
        execute format(
          'grant usage, select on sequence %s to service_role',
          v_sequence::regclass
        );
      end if;

    end if;

  end loop;

end;
$p2_security$;


-- ============================================================================
-- DOCUMENTATION
-- ============================================================================

comment on table public.persons is
  'P2 canonical durable person identity. workers remains the current operational projection until certified cutover.';

comment on table public.companies is
  'P2 canonical companies. Text aliases require explicit governed mapping.';

comment on table public.company_aliases is
  'Explicit legacy/source company aliases mapped to canonical company identity.';

comment on table public.shifts is
  'P2 canonical shift identities.';

comment on table public.shift_aliases is
  'Explicit legacy/source shift aliases mapped to canonical shift identity.';

comment on table public.camps is
  'Canonical camp identity foundation.';

comment on table public.camp_modules is
  'Canonical module identity scoped to camp.';

comment on table public.camp_rooms is
  'Canonical room identity scoped to module.';

comment on table public.camp_beds is
  'Canonical bed identity scoped to room. bed_inventory remains current runtime source until cutover.';

comment on table public.assignments is
  'Temporal canonical person-to-bed assignment history. No dependency on workers.id.';