-- Permisos mínimos para que la prueba segura de recuperación pueda leer
-- los esquemas lógicos de respaldo desde la Edge Function con service_role.
-- Los respaldos permanecen fuera del Data API público y sin acceso para
-- anon/authenticated.

revoke all on schema backup_pre_control_20260828 from public, anon, authenticated;
revoke all on schema backup_pre_integridad_20260828 from public, anon, authenticated;
revoke all on all tables in schema backup_pre_control_20260828 from public, anon, authenticated;
revoke all on all tables in schema backup_pre_integridad_20260828 from public, anon, authenticated;

grant usage on schema backup_pre_control_20260828 to service_role;
grant usage on schema backup_pre_integridad_20260828 to service_role;
grant select on all tables in schema backup_pre_control_20260828 to service_role;
grant select on all tables in schema backup_pre_integridad_20260828 to service_role;
