revoke all on schema backup_pre_control_20260828 from public, anon, authenticated;
revoke all on schema backup_pre_integridad_20260828 from public, anon, authenticated;
revoke all on all tables in schema backup_pre_control_20260828 from public, anon, authenticated;
revoke all on all tables in schema backup_pre_integridad_20260828 from public, anon, authenticated;

grant usage on schema backup_pre_control_20260828 to service_role;
grant usage on schema backup_pre_integridad_20260828 to service_role;
grant select on all tables in schema backup_pre_control_20260828 to service_role;
grant select on all tables in schema backup_pre_integridad_20260828 to service_role;;
