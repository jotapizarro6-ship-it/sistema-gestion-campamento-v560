alter table public.workers add column if not exists residencia text;

create or replace function public.replace_current_assignment(p_workers jsonb, p_beds jsonb, p_filename text, p_imported_at text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_workers integer;
  v_beds integer;
  v_reservation_conflicts integer;
begin
  if p_workers is null or jsonb_typeof(p_workers) <> 'array' or jsonb_array_length(p_workers) = 0 then
    raise exception 'La planilla no contiene trabajadores válidos.';
  end if;
  if p_beds is null or jsonb_typeof(p_beds) <> 'array' or jsonb_array_length(p_beds) = 0 then
    raise exception 'La planilla no contiene inventario de camas válido.';
  end if;

  create temp table tmp_workers on commit drop as
  select * from jsonb_to_recordset(p_workers) as x(
    rut text,nombre text,turno text,modulo text,habitacion text,cama text,
    empresa text,especialidad text,categoria text,sexo text,residencia text,updated_at text
  );
  create temp table tmp_beds on commit drop as
  select * from jsonb_to_recordset(p_beds) as x(
    module text,room text,bed text,room_type text,camp text,updated_at text
  );

  delete from public.workers where true;
  insert into public.workers(rut,nombre,turno,modulo,habitacion,cama,empresa,especialidad,categoria,sexo,residencia,updated_at)
  select rut,nombre,turno,modulo,habitacion,cama,empresa,especialidad,categoria,sexo,residencia,updated_at
  from tmp_workers
  where coalesce(trim(rut),'') <> '';

  delete from public.bed_inventory where true;
  insert into public.bed_inventory(module,room,bed,room_type,camp,updated_at)
  select module,room,bed,room_type,camp,updated_at
  from tmp_beds
  where coalesce(trim(module),'') <> '' and coalesce(trim(room),'') <> '' and coalesce(trim(bed),'') <> '';

  select count(*) into v_workers from public.workers;
  select count(*) into v_beds from public.bed_inventory;
  if v_workers = 0 or v_beds = 0 then
    raise exception 'La validación final dejó la dotación o el inventario vacío.';
  end if;

  insert into public.settings(key,value) values ('last_update',p_imported_at)
    on conflict(key) do update set value=excluded.value;
  insert into public.settings(key,value) values ('source_file',p_filename)
    on conflict(key) do update set value=excluded.value;
  insert into public.settings(key,value) values ('import_version','cloud-5.6.1')
    on conflict(key) do update set value=excluded.value;

  select count(*) into v_reservation_conflicts
  from public.reservations r
  where r.status in ('PENDIENTE','CONFIRMADA')
    and coalesce(trim(r.module),'') <> '' and coalesce(trim(r.room),'') <> '' and coalesce(trim(r.bed),'') <> ''
    and not exists (
      select 1 from public.bed_inventory b
      where upper(trim(b.module))=upper(trim(r.module))
        and upper(trim(b.room))=upper(trim(r.room))
        and upper(trim(b.bed))=upper(trim(r.bed))
    );

  insert into public.import_history(imported_at,filename,worker_count,bed_count,status,notes)
  values (p_imported_at,p_filename,v_workers,v_beds,'OK',
    case when v_reservation_conflicts>0 then v_reservation_conflicts||' reserva(s) activa(s) apuntan a camas que no aparecen en el nuevo inventario.' else null end);

  return jsonb_build_object('workers',v_workers,'beds',v_beds,'reservation_conflicts',v_reservation_conflicts);
end;
$function$;;
