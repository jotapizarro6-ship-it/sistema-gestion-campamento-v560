DROP POLICY IF EXISTS import_history_deny_public ON public.import_history;
CREATE POLICY import_history_deny_public ON public.import_history
FOR ALL TO anon, authenticated
USING (false)
WITH CHECK (false);;
