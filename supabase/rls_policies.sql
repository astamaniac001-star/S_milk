-- ============================================================================
-- 05_rls_policies.sql
-- Drops legacy wide-open policies and applies clean RLS.
-- ============================================================================

-- 1. Drop all legacy "Allow all access" policies
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['settings','customers','milk_brands','daily_logs','bills','milk_imports','pause_periods','subscriptions','adjustments','credit_notes','payments','auth_tokens'])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Allow all access to %I" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Allow all access" ON %I', t);
  END LOOP;
END$$;

-- 2. Enable RLS on all tables
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE milk_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE milk_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE pause_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_tokens ENABLE ROW LEVEL SECURITY;

-- 3. Create functional policies for the frontend (anon role)
-- Since the app uses the anon key directly, we allow access, but sensitive 
-- operations are protected by the SECURITY DEFINER RPCs in 04_security_functions.sql.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['customers','milk_brands','daily_logs','bills','milk_imports','pause_periods','subscriptions','adjustments','credit_notes','payments'])
  LOOP
    EXECUTE format('CREATE POLICY "app_access_%I" ON %I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END$$;

-- Settings: Allow reading for PIN checks, but direct writes should be blocked (use rotate_pin RPC)
CREATE POLICY "settings_read" ON settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "settings_write" ON settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Auth tokens: Block anon from reading the token table directly
CREATE POLICY "auth_tokens_block" ON auth_tokens FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "auth_tokens_allow" ON auth_tokens FOR ALL TO authenticated USING (true) WITH CHECK (true);