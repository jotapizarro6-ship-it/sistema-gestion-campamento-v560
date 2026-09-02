INSERT INTO public.workers(rut,nombre,turno,modulo,habitacion,cama,empresa,especialidad,categoria,sexo,updated_at) VALUES
('18354026-2','Juan Antonio Pizarro Perez','Bisemanal 8x6','OP01 PISO 1','101','A','HLC Ingeniería y Construcción Chile','Administracion','Coordinador de Campamento','Masculino','2026-08-27 14:21:23'),
('10998147-8','Sergio Fabian Basaes Perez','Bisemanal 8x6','OP01 PISO 1','101','B','HLC Ingeniería y Construcción Chile','Obras Civiles','Chofer Bus Nivel A','Masculino','2026-08-27 14:21:23'),
('12026009-K','Elías Isaías Contreras Barrera','Bisemanal 8x6','OP01 PISO 1','101','C','HLC Ingeniería y Construcción Chile','Civil','Maestro Primera OOCC','Masculino','2026-08-27 14:21:23'),
('12217868-4','Ronny Osvaldo Rubilar Castellon','Bisemanal 8x6','OP01 PISO 1','102','A','HLC Ingeniería y Construcción Chile','Prevención de Riesgos','Jefe Departamento ES&H Nivel A','Masculino','2026-08-27 14:21:23'),
('12218905-8','Oscar Isidro Villa Vásquez','Bisemanal 8x6','OP01 PISO 1','102','B','HLC Ingeniería y Construcción Chile','Terreno','Ing. Residente Nivel A','Masculino','2026-08-27 14:21:23'),
('12424175-8','William Ismael Pasten Seura','Bisemanal 8x6','OP01 PISO 1','102','C','HLC Ingeniería y Construcción Chile','Terreno','Operador equipos pesado OOCC','Masculino','2026-08-27 14:21:23'),
('12425023-4','CRISTHIAN EDMUNDO ALEGRIA BURROWS','Ordinaria  5x2','OP01 PISO 1','103','A','HLC Ingeniería y Construcción Chile','Proyecto','Operador equipos pesado OOCC','Masculino','2026-08-27 14:21:23'),
('12588327-3','Alejandro Alberto Henriquez Rojas','Bisemanal 8x6','OP01 PISO 1','103','B','HLC Ingeniería y Construcción Chile','Mecanica','Maestro Primera OOCC','Masculino','2026-08-27 14:21:23'),
('12619844-2','ROBERTO BUGUEÑO VALENZUELA','Ordinaria  5x2','OP01 PISO 1','103','C','HLC Ingeniería y Construcción Chile','Proyecto','Operador equipos pesado OOCC','Masculino','2026-08-27 14:21:23'),
('12801578-7','Neiser Jhon Cortes Gallardo','Bisemanal 8x6','OP01 PISO 1','104','A','HLC Ingeniería y Construcción Chile','Civil','Maestro Primera OOCC','Masculino','2026-08-27 14:21:23'),
('13044225-0','Osvaldo Rene Sepúlveda Delgado','Bisemanal 8x6','OP01 PISO 1','104','B','HLC Ingeniería y Construcción Chile','Terreno','Chofer Camioneta y Minibuses','Masculino','2026-08-27 14:21:23'),
('13090135-2','Claudio Francisco Moreno Balut','Bisemanal 8x6','OP01 PISO 1','104','C','HLC Ingeniería y Construcción Chile','Prevención de Riesgos','Asistente de Prevención de Riesgos','Masculino','2026-08-27 14:21:23')
ON CONFLICT (rut) DO UPDATE SET nombre=EXCLUDED.nombre,turno=EXCLUDED.turno,modulo=EXCLUDED.modulo,habitacion=EXCLUDED.habitacion,cama=EXCLUDED.cama,empresa=EXCLUDED.empresa,especialidad=EXCLUDED.especialidad,categoria=EXCLUDED.categoria,sexo=EXCLUDED.sexo,updated_at=EXCLUDED.updated_at;
INSERT INTO public.bed_inventory(module,room,bed,room_type,camp,updated_at)
SELECT 'OP01 PISO 1', LPAD(n::text,3,'0'), b, '', 'FENIX GOLD', '27-08-2026 10:21:23'
FROM generate_series(101,128) AS n CROSS JOIN (VALUES ('A'),('B'),('C')) AS beds(b)
ON CONFLICT (module,room,bed) DO UPDATE SET room_type=EXCLUDED.room_type,camp=EXCLUDED.camp,updated_at=EXCLUDED.updated_at;
INSERT INTO public.settings(key,value) VALUES
('last_update','27-08-2026 10:21'),
('source_file','ASIGNACION HABITACIONES 26-08-2026.xlsx'),
('import_version','5.0')
ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value;;
