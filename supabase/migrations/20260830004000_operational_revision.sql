-- Control atómico de concurrencia para escrituras administrativas.
-- Es aditivo: no modifica ni elimina datos operacionales existentes.

insert into public.settings(key,value)
values ('operational_revision','1')
on conflict (key) do nothing;

create or replace function public.claim_operational_revision(p_expected bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current bigint;
  v_next bigint;
begin
  insert into public.settings(key,value)
  values ('operational_revision','1')
  on conflict (key) do nothing;

  select case when value ~ '^\d+$' then value::bigint else 1 end
    into v_current
  from public.settings
  where key='operational_revision'
  for update;

  if p_expected is not null and p_expected <> v_current then
    return jsonb_build_object(
      'ok', false,
      'current_revision', v_current,
      'expected_revision', p_expected
    );
  end if;

  v_next := v_current + 1;
  update public.settings
  set value=v_next::text
  where key='operational_revision';

  return jsonb_build_object(
    'ok', true,
    'previous_revision', v_current,
    'revision', v_next
  );
end;
$$;

revoke all on function public.claim_operational_revision(bigint) from public;
revoke all on function public.claim_operational_revision(bigint) from anon;
revoke all on function public.claim_operational_revision(bigint) from authenticated;
grant execute on function public.claim_operational_revision(bigint) to service_role;
