create schema if not exists backup_pre_integridad_20260828;
revoke all on schema backup_pre_integridad_20260828 from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['workers','bed_inventory','reservations','movements','bed_blocks','daily_snapshots','daily_capacity','settings','import_history','consultation_log','operational_actions','master_plan_events','what_if_scenarios','audit_log']
  loop
    execute format('create table backup_pre_integridad_20260828.%I as table public.%I', t, t);
  end loop;
end $$;

comment on schema backup_pre_integridad_20260828 is 'Copia lógica previa a Integridad + Semáforo + Prueba de Recuperación + Informe Ejecutivo, 2026-08-28';;
