-- ============================================================================
-- GARPI / DATA CORE HARDENING
-- P2.4E0-R2 — EXPAND MIGRATION SQL CANDIDATE
--
-- CANDIDATE ONLY.
-- This file is NOT a repository migration yet.
--
-- Frozen inputs:
--   P2.4C canonical referential/state contract
--   P2.4D1-R2 effective 15-gap baseline
--   P2.4D2 enforcement mechanism design
--   P2.4D3 PostgreSQL feasibility/concurrency certification
--   P2.4E0-R1 exact EXPAND migration specification
--
-- EXPAND principles:
--   * no destructive legacy rewrite
--   * no guessed canonical bed mapping
--   * no fuzzy matching
--   * no data backfill
--   * legacy text remains authoritative during EXPAND/SHADOW
--   * canonical bed_id remains nullable until exact resolution
--   * temporal DATE/range fields begin as nullable shadows
--   * legacy rows are not retroactively validated here
--
-- DELIBERATELY DEFERRED:
--   C04 GiST reservation exclusion       -> VALIDATE
--   C06 GiST bed-block exclusion         -> VALIDATE
--   C07 reservation/block cross guard    -> VALIDATE
--   C08 assignment/block semantics       -> CUTOVER_GUARDED
--
-- Therefore this candidate MUST NOT contain:
--   CREATE EXTENSION btree_gist
--   EXCLUDE USING gist
--   pg_advisory_xact_lock
--   legacy UPDATE/backfill
--   VALIDATE CONSTRAINT
-- ============================================================================


-- ============================================================================
-- C01 / C03 / H01
-- RESERVATIONS — CANONICAL EXPAND SURFACE
-- ============================================================================

alter table public.reservations
  add column if not exists bed_id bigint;

alter table public.reservations
  add column if not exists arrival_on date;

alter table public.reservations
  add column if not exists departure_on date;

alter table public.reservations
  add column if not exists active_period daterange
  generated always as (
    case
      when arrival_on is null
        then null
      else daterange(
        arrival_on,
        departure_on,
        '[)'
      )
    end
  ) stored;


-- GAP C01
-- New/changed rows must use the canonical reservation status domain.
-- Existing legacy rows are not scanned during EXPAND.

do $p2_reservation_status$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.reservations'::regclass
      and conname = 'reservations_p2_status_chk'
  ) then
    alter table public.reservations
      add constraint reservations_p2_status_chk
      check (
        status in (
          'PENDIENTE',
          'CONFIRMADA',
          'CANCELADA',
          'ANULADA'
        )
      )
      not valid;
  end if;
end
$p2_reservation_status$;


-- GAP C03
-- Exact-only canonical relation.
-- bed_id stays NULL when the legacy text location is unresolved/ambiguous.

do $p2_reservation_bed_fk$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.reservations'::regclass
      and conname = 'reservations_p2_bed_id_fkey'
  ) then
    alter table public.reservations
      add constraint reservations_p2_bed_id_fkey
      foreign key (bed_id)
      references public.camp_beds(id)
      on delete restrict
      not valid;
  end if;
end
$p2_reservation_bed_fk$;


-- GAP H01
-- Typed shadow temporal coherence.
--
-- During EXPAND:
--   NULL/NULL means "shadow not resolved/populated yet".
--
-- Once arrival_on is present:
--   departure_on may be NULL (open-ended)
--   or must be strictly greater than arrival_on.
--
-- No legacy TEXT parsing/backfill occurs in this migration.

do $p2_reservation_time$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.reservations'::regclass
      and conname = 'reservations_p2_temporal_chk'
  ) then
    alter table public.reservations
      add constraint reservations_p2_temporal_chk
      check (
        (
          arrival_on is null
          and departure_on is null
        )
        or
        (
          arrival_on is not null
          and (
            departure_on is null
            or departure_on > arrival_on
          )
        )
      )
      not valid;
  end if;
end
$p2_reservation_time$;


-- ============================================================================
-- C02
-- RESERVATION STATE MACHINE
--
-- PENDIENTE  -> CONFIRMADA / CANCELADA / ANULADA
-- CONFIRMADA -> CANCELADA / ANULADA
-- CANCELADA  -> terminal
-- ANULADA    -> terminal
-- same-state update remains idempotent
-- ============================================================================

create or replace function public.p2_guard_reservation_transition()
returns trigger
language plpgsql
as $p2_fn$
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if old.status = 'PENDIENTE'
     and new.status in (
       'CONFIRMADA',
       'CANCELADA',
       'ANULADA'
     ) then
    return new;
  end if;

  if old.status = 'CONFIRMADA'
     and new.status in (
       'CANCELADA',
       'ANULADA'
     ) then
    return new;
  end if;

  raise exception using
    errcode = '23514',
    message = format(
      'P2_INVALID_RESERVATION_TRANSITION: %s -> %s',
      old.status,
      new.status
    );
end
$p2_fn$;


do $p2_reservation_transition_trigger$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.reservations'::regclass
      and tgname = 'reservations_p2_transition_bu'
      and not tgisinternal
  ) then
    execute
      'create trigger reservations_p2_transition_bu
       before update of status
       on public.reservations
       for each row
       execute function public.p2_guard_reservation_transition()';
  end if;
end
$p2_reservation_transition_trigger$;


-- ============================================================================
-- C05 / H05 / H06
-- BED_BLOCKS — CANONICAL EXPAND SURFACE
-- ============================================================================

alter table public.bed_blocks
  add column if not exists bed_id bigint;

alter table public.bed_blocks
  add column if not exists start_on date;

alter table public.bed_blocks
  add column if not exists end_on date;

alter table public.bed_blocks
  add column if not exists active_period daterange
  generated always as (
    case
      when start_on is null
        then null
      else daterange(
        start_on,
        end_on,
        '[]'
      )
    end
  ) stored;


-- GAP C05
-- Exact-only canonical bed relation.

do $p2_block_bed_fk$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.bed_blocks'::regclass
      and conname = 'bed_blocks_p2_bed_id_fkey'
  ) then
    alter table public.bed_blocks
      add constraint bed_blocks_p2_bed_id_fkey
      foreign key (bed_id)
      references public.camp_beds(id)
      on delete restrict
      not valid;
  end if;
end
$p2_block_bed_fk$;


-- GAP H05

do $p2_block_status$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.bed_blocks'::regclass
      and conname = 'bed_blocks_p2_status_chk'
  ) then
    alter table public.bed_blocks
      add constraint bed_blocks_p2_status_chk
      check (
        status in (
          'ACTIVO',
          'CERRADO'
        )
      )
      not valid;
  end if;
end
$p2_block_status$;


-- GAP H06
-- Contract semantics are [start,end] inclusive.
-- The typed shadows remain NULL until controlled SHADOW resolution.

do $p2_block_time$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.bed_blocks'::regclass
      and conname = 'bed_blocks_p2_temporal_chk'
  ) then
    alter table public.bed_blocks
      add constraint bed_blocks_p2_temporal_chk
      check (
        (
          start_on is null
          and end_on is null
        )
        or
        (
          start_on is not null
          and (
            end_on is null
            or end_on >= start_on
          )
        )
      )
      not valid;
  end if;
end
$p2_block_time$;


-- ============================================================================
-- H07
-- BED BLOCK STATE MACHINE
--
-- ACTIVO  -> CERRADO
-- CERRADO -> terminal
-- same-state update remains idempotent
-- ============================================================================

create or replace function public.p2_guard_bed_block_transition()
returns trigger
language plpgsql
as $p2_fn$
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if old.status = 'ACTIVO'
     and new.status = 'CERRADO' then
    return new;
  end if;

  raise exception using
    errcode = '23514',
    message = format(
      'P2_INVALID_BED_BLOCK_TRANSITION: %s -> %s',
      old.status,
      new.status
    );
end
$p2_fn$;


do $p2_block_transition_trigger$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.bed_blocks'::regclass
      and tgname = 'bed_blocks_p2_transition_bu'
      and not tgisinternal
  ) then
    execute
      'create trigger bed_blocks_p2_transition_bu
       before update of status
       on public.bed_blocks
       for each row
       execute function public.p2_guard_bed_block_transition()';
  end if;
end
$p2_block_transition_trigger$;


-- ============================================================================
-- H02
-- ASSIGNMENT STATE MACHINE
--
-- ACTIVA            -> FINALIZADA / CANCELADA
-- FINALIZADA        -> terminal
-- CANCELADA         -> terminal
-- LEGACY_UNRESOLVED -> no ordinary lifecycle transition
--
-- Reconciliation of LEGACY_UNRESOLVED is deliberately outside
-- ordinary state-transition semantics.
-- ============================================================================

create or replace function public.p2_guard_assignment_transition()
returns trigger
language plpgsql
as $p2_fn$
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if old.status = 'ACTIVA'
     and new.status in (
       'FINALIZADA',
       'CANCELADA'
     ) then
    return new;
  end if;

  raise exception using
    errcode = '23514',
    message = format(
      'P2_INVALID_ASSIGNMENT_TRANSITION: %s -> %s',
      old.status,
      new.status
    );
end
$p2_fn$;


do $p2_assignment_transition_trigger$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.assignments'::regclass
      and tgname = 'assignments_p2_transition_bu'
      and not tgisinternal
  ) then
    execute
      'create trigger assignments_p2_transition_bu
       before update of status
       on public.assignments
       for each row
       execute function public.p2_guard_assignment_transition()';
  end if;
end
$p2_assignment_transition_trigger$;


-- ============================================================================
-- H03 / H04
-- MOVEMENT LIFECYCLE
--
-- PROGRAMADO         -> EJECUTADO / CANCELADO
-- EJECUTADO          -> terminal
-- CANCELADO          -> terminal
-- LEGACY_UNRESOLVED  -> no ordinary lifecycle transition
--
-- Historical unresolved movements are never inferred to PROGRAMADO.
-- ============================================================================

create or replace function public.p2_guard_movement_transition()
returns trigger
language plpgsql
as $p2_fn$
begin
  if old.lifecycle_status
       is not distinct from
     new.lifecycle_status then
    return new;
  end if;

  if old.lifecycle_status = 'PROGRAMADO'
     and new.lifecycle_status in (
       'EJECUTADO',
       'CANCELADO'
     ) then
    return new;
  end if;

  raise exception using
    errcode = '23514',
    message = format(
      'P2_INVALID_MOVEMENT_TRANSITION: %s -> %s',
      old.lifecycle_status,
      new.lifecycle_status
    );
end
$p2_fn$;


do $p2_movement_transition_trigger$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.movements'::regclass
      and tgname = 'movements_p2_transition_bu'
      and not tgisinternal
  ) then
    execute
      'create trigger movements_p2_transition_bu
       before update of lifecycle_status
       on public.movements
       for each row
       execute function public.p2_guard_movement_transition()';
  end if;
end
$p2_movement_transition_trigger$;


-- GAP H04
--
-- PROGRAMADO:
--   neither terminal timestamp exists.
--
-- EJECUTADO:
--   executed_at exists and cancelled_at does not.
--
-- CANCELADO:
--   cancelled_at exists and executed_at does not.
--
-- LEGACY_UNRESOLVED:
--   no timestamp history is invented; existing evidence is preserved.

do $p2_movement_timestamp_coherence$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.movements'::regclass
      and conname = 'movements_p2_timestamp_coherence_chk'
  ) then
    alter table public.movements
      add constraint movements_p2_timestamp_coherence_chk
      check (
        (
          lifecycle_status = 'PROGRAMADO'
          and executed_at is null
          and cancelled_at is null
        )
        or
        (
          lifecycle_status = 'EJECUTADO'
          and executed_at is not null
          and cancelled_at is null
        )
        or
        (
          lifecycle_status = 'CANCELADO'
          and executed_at is null
          and cancelled_at is not null
        )
        or
        lifecycle_status = 'LEGACY_UNRESOLVED'
      )
      not valid;
  end if;
end
$p2_movement_timestamp_coherence$;


-- ============================================================================
-- END OF P2.4 EXPAND CANDIDATE
--
-- Intentionally absent:
--
-- C04 reservations GiST exclusion
-- C06 bed_blocks GiST exclusion
-- C07 reservation/block advisory-lock guards
-- C08 assignment/block rejection semantics
-- btree_gist installation
-- shadow backfill
-- constraint validation
-- legacy column removal
-- ============================================================================
