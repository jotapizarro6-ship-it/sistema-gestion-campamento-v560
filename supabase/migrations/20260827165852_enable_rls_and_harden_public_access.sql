ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_capacity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bed_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bed_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stored_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.workers, public.settings, public.consultation_log,
  public.daily_capacity, public.bed_inventory, public.bed_blocks, public.reservations,
  public.movements, public.daily_snapshots, public.stored_files, public.import_history
FROM anon, authenticated;

GRANT ALL PRIVILEGES ON TABLE public.workers, public.settings, public.consultation_log,
  public.daily_capacity, public.bed_inventory, public.bed_blocks, public.reservations,
  public.movements, public.daily_snapshots, public.stored_files, public.import_history
TO service_role;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT sequence_schema, sequence_name
    FROM information_schema.sequences
    WHERE sequence_schema='public'
      AND sequence_name IN ('workers_id_seq','consultation_log_id_seq','bed_blocks_id_seq',
                            'reservations_id_seq','movements_id_seq','import_history_id_seq')
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %I.%I FROM anon, authenticated', r.sequence_schema, r.sequence_name);
    EXECUTE format('GRANT ALL PRIVILEGES ON SEQUENCE %I.%I TO service_role', r.sequence_schema, r.sequence_name);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.replace_current_assignment(jsonb,jsonb,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_current_assignment(jsonb,jsonb,text,text) TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;;
