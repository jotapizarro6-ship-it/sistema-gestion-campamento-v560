CREATE OR REPLACE FUNCTION public.replace_current_assignment(
  p_workers jsonb,
  p_beds jsonb,
  p_filename text,
  p_imported_at text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workers integer;
  v_beds integer;
  v_reservation_conflicts integer;
BEGIN
  IF p_workers IS NULL OR jsonb_typeof(p_workers) <> 'array' OR jsonb_array_length(p_workers) = 0 THEN
    RAISE EXCEPTION 'La planilla no contiene trabajadores válidos.';
  END IF;
  IF p_beds IS NULL OR jsonb_typeof(p_beds) <> 'array' OR jsonb_array_length(p_beds) = 0 THEN
    RAISE EXCEPTION 'La planilla no contiene inventario de camas válido.';
  END IF;

  CREATE TEMP TABLE tmp_workers ON COMMIT DROP AS
  SELECT * FROM jsonb_to_recordset(p_workers) AS x(
    rut text,nombre text,turno text,modulo text,habitacion text,cama text,
    empresa text,especialidad text,categoria text,sexo text,updated_at text
  );
  CREATE TEMP TABLE tmp_beds ON COMMIT DROP AS
  SELECT * FROM jsonb_to_recordset(p_beds) AS x(
    module text,room text,bed text,room_type text,camp text,updated_at text
  );

  DELETE FROM public.workers;
  INSERT INTO public.workers(rut,nombre,turno,modulo,habitacion,cama,empresa,especialidad,categoria,sexo,updated_at)
  SELECT rut,nombre,turno,modulo,habitacion,cama,empresa,especialidad,categoria,sexo,updated_at
  FROM tmp_workers
  WHERE coalesce(trim(rut),'') <> '';

  DELETE FROM public.bed_inventory;
  INSERT INTO public.bed_inventory(module,room,bed,room_type,camp,updated_at)
  SELECT module,room,bed,room_type,camp,updated_at
  FROM tmp_beds
  WHERE coalesce(trim(module),'') <> '' AND coalesce(trim(room),'') <> '' AND coalesce(trim(bed),'') <> '';

  SELECT count(*) INTO v_workers FROM public.workers;
  SELECT count(*) INTO v_beds FROM public.bed_inventory;
  IF v_workers = 0 OR v_beds = 0 THEN
    RAISE EXCEPTION 'La validación final dejó la dotación o el inventario vacío.';
  END IF;

  INSERT INTO public.settings(key,value) VALUES ('last_update',p_imported_at)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value;
  INSERT INTO public.settings(key,value) VALUES ('source_file',p_filename)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value;
  INSERT INTO public.settings(key,value) VALUES ('import_version','cloud-5.6.1')
    ON CONFLICT(key) DO UPDATE SET value=excluded.value;

  SELECT count(*) INTO v_reservation_conflicts
  FROM public.reservations r
  WHERE r.status IN ('PENDIENTE','CONFIRMADA')
    AND coalesce(trim(r.module),'') <> '' AND coalesce(trim(r.room),'') <> '' AND coalesce(trim(r.bed),'') <> ''
    AND NOT EXISTS (
      SELECT 1 FROM public.bed_inventory b
      WHERE upper(trim(b.module))=upper(trim(r.module))
        AND upper(trim(b.room))=upper(trim(r.room))
        AND upper(trim(b.bed))=upper(trim(r.bed))
    );

  INSERT INTO public.import_history(imported_at,filename,worker_count,bed_count,status,notes)
  VALUES (p_imported_at,p_filename,v_workers,v_beds,'OK',
    CASE WHEN v_reservation_conflicts>0 THEN v_reservation_conflicts||' reserva(s) activa(s) apuntan a camas que no aparecen en el nuevo inventario.' ELSE NULL END);

  RETURN jsonb_build_object('workers',v_workers,'beds',v_beds,'reservation_conflicts',v_reservation_conflicts);
END;
$$;
REVOKE ALL ON FUNCTION public.replace_current_assignment(jsonb,jsonb,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_current_assignment(jsonb,jsonb,text,text) TO service_role;;
