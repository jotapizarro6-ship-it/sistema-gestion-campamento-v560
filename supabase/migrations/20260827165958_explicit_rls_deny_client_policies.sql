DROP POLICY IF EXISTS deny_client_direct_access ON public.workers;
CREATE POLICY deny_client_direct_access ON public.workers FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS deny_client_direct_access ON public.settings;
CREATE POLICY deny_client_direct_access ON public.settings FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS deny_client_direct_access ON public.consultation_log;
CREATE POLICY deny_client_direct_access ON public.consultation_log FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS deny_client_direct_access ON public.daily_capacity;
CREATE POLICY deny_client_direct_access ON public.daily_capacity FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS deny_client_direct_access ON public.bed_inventory;
CREATE POLICY deny_client_direct_access ON public.bed_inventory FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS deny_client_direct_access ON public.bed_blocks;
CREATE POLICY deny_client_direct_access ON public.bed_blocks FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS deny_client_direct_access ON public.reservations;
CREATE POLICY deny_client_direct_access ON public.reservations FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS deny_client_direct_access ON public.movements;
CREATE POLICY deny_client_direct_access ON public.movements FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS deny_client_direct_access ON public.daily_snapshots;
CREATE POLICY deny_client_direct_access ON public.daily_snapshots FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS deny_client_direct_access ON public.stored_files;
CREATE POLICY deny_client_direct_access ON public.stored_files FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);;
