create or replace function public.campamento_state_v2()
returns jsonb
language sql
stable
set search_path = public
as $$
select jsonb_build_object(
  'workers', coalesce((select jsonb_agg(to_jsonb(w) order by w.id) from public.workers w), '[]'::jsonb),
  'inventory', coalesce((select jsonb_agg(to_jsonb(b) order by b.module, b.room, b.bed) from public.bed_inventory b), '[]'::jsonb),
  'blocks', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.bed_blocks x), '[]'::jsonb),
  'reservations', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.reservations r), '[]'::jsonb),
  'movements', coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from public.movements m), '[]'::jsonb),
  'capacities', coalesce((select jsonb_agg(to_jsonb(c) order by c.capacity_date) from public.daily_capacity c), '[]'::jsonb),
  'snapshots', coalesce((select jsonb_agg(to_jsonb(s) order by s.snapshot_date) from public.daily_snapshots s), '[]'::jsonb),
  'settings', coalesce((select jsonb_object_agg(s.key, s.value) from public.settings s where s.key not in ('admin_password_hash','admin_password_salt','session_secret')), '{}'::jsonb),
  'imports', coalesce((select jsonb_agg(to_jsonb(i) order by i.id desc) from public.import_history i), '[]'::jsonb)
);
$$;

revoke all on function public.campamento_state_v2() from public;
revoke all on function public.campamento_state_v2() from anon;
revoke all on function public.campamento_state_v2() from authenticated;
grant execute on function public.campamento_state_v2() to service_role;;
