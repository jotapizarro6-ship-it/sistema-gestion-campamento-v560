create schema if not exists backup_pre_control_20260828;
revoke all on schema backup_pre_control_20260828 from public, anon, authenticated;

create table backup_pre_control_20260828.workers as table public.workers;
create table backup_pre_control_20260828.bed_inventory as table public.bed_inventory;
create table backup_pre_control_20260828.reservations as table public.reservations;
create table backup_pre_control_20260828.movements as table public.movements;
create table backup_pre_control_20260828.bed_blocks as table public.bed_blocks;
create table backup_pre_control_20260828.daily_snapshots as table public.daily_snapshots;
create table backup_pre_control_20260828.daily_capacity as table public.daily_capacity;
create table backup_pre_control_20260828.settings as table public.settings;
create table backup_pre_control_20260828.import_history as table public.import_history;
create table backup_pre_control_20260828.consultation_log as table public.consultation_log;

comment on schema backup_pre_control_20260828 is 'Respaldo lógico previo a Centro de Control, What-if, Plan Maestro y Trazabilidad - 2026-08-28';;
