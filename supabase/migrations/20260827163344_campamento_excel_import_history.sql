CREATE TABLE IF NOT EXISTS public.import_history (
  id BIGSERIAL PRIMARY KEY,
  imported_at TEXT NOT NULL,
  filename TEXT NOT NULL,
  worker_count INTEGER NOT NULL DEFAULT 0,
  bed_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'OK',
  notes TEXT
);
REVOKE ALL ON TABLE public.import_history FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.import_history_id_seq FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_import_history_time ON public.import_history(id DESC);;
