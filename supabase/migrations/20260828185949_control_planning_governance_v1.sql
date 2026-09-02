create table if not exists public.operational_actions (
  id bigint generated always as identity primary key,
  title text not null,
  detail text not null default '',
  category text not null default 'OPERACIONAL',
  severity text not null default 'ATENCION' check (severity in ('INFO','ATENCION','CRITICO')),
  status text not null default 'PENDIENTE' check (status in ('PENDIENTE','EN_GESTION','RESUELTO','CANCELADO')),
  owner_name text not null default '',
  due_date date,
  related_date date,
  source_type text not null default 'MANUAL',
  source_key text,
  resolution_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists operational_actions_status_idx on public.operational_actions(status, due_date);
create index if not exists operational_actions_source_idx on public.operational_actions(source_type, source_key);

create table if not exists public.master_plan_events (
  id bigint generated always as identity primary key,
  title text not null,
  category text not null default 'HITO',
  start_date date not null,
  end_date date,
  impact_type text not null default 'INFORMATIVO' check (impact_type in ('INFORMATIVO','SUBIDA','BAJADA','CAPACIDAD_MAS','CAPACIDAD_MENOS')),
  impact_value integer not null default 0 check (impact_value >= 0),
  owner_name text not null default '',
  status text not null default 'PLANIFICADO' check (status in ('PLANIFICADO','EN_CURSO','COMPLETADO','CANCELADO')),
  dependency_id bigint references public.master_plan_events(id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists master_plan_events_dates_idx on public.master_plan_events(start_date, end_date);
create index if not exists master_plan_events_status_idx on public.master_plan_events(status);

create table if not exists public.what_if_scenarios (
  id bigint generated always as identity primary key,
  name text not null,
  base_date date not null,
  days integer not null default 30 check (days between 1 and 31),
  assumptions jsonb not null default '[]'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  created_by_profile text not null default 'ADMINISTRADOR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists what_if_scenarios_created_idx on public.what_if_scenarios(created_at desc);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  profile text not null default 'ADMINISTRADOR',
  action text not null,
  entity_type text not null default '',
  entity_id text not null default '',
  endpoint text not null default '',
  result text not null default 'OK',
  details jsonb not null default '{}'::jsonb
);
create index if not exists audit_log_occurred_idx on public.audit_log(occurred_at desc);
create index if not exists audit_log_action_idx on public.audit_log(action, entity_type);

alter table public.operational_actions enable row level security;
alter table public.master_plan_events enable row level security;
alter table public.what_if_scenarios enable row level security;
alter table public.audit_log enable row level security;

revoke all on public.operational_actions from anon, authenticated;
revoke all on public.master_plan_events from anon, authenticated;
revoke all on public.what_if_scenarios from anon, authenticated;
revoke all on public.audit_log from anon, authenticated;

grant all on public.operational_actions to service_role;
grant all on public.master_plan_events to service_role;
grant all on public.what_if_scenarios to service_role;
grant all on public.audit_log to service_role;
grant usage, select on all sequences in schema public to service_role;

comment on table public.operational_actions is 'Acciones operacionales gestionables desde Centro de Control';
comment on table public.master_plan_events is 'Hitos y eventos del Plan Maestro Operacional';
comment on table public.what_if_scenarios is 'Escenarios de simulación de capacidad que no modifican la base operacional';
comment on table public.audit_log is 'Trazabilidad de acciones administrativas y de planificación';;
