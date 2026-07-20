
-- 1. Drop custom auth RPCs
DROP FUNCTION IF EXISTS verify_pin(text);
DROP FUNCTION IF EXISTS rotate_pin(text, text);

-- 2. Clean up the settings table (remove custom auth columns)
ALTER TABLE settings 
  DROP COLUMN IF EXISTS pin_hash,
  DROP COLUMN IF EXISTS pin_salt,
  DROP COLUMN IF EXISTS failed_attempts,
  DROP COLUMN IF EXISTS locked_until;

-- 3. Drop the legacy auth_tokens table if it exists
DROP TABLE IF EXISTS auth_tokens;

-- 4. Ensure RLS strictly denies anon and only allows authenticated
DROP POLICY IF EXISTS "anon_all_settings" ON settings;
DROP POLICY IF EXISTS "auth_all_settings" ON settings;

CREATE POLICY "Only authenticated operator can access settings"
ON settings FOR ALL
TO authenticated
USING (true) WITH CHECK (true);

-- 5. Revoke any lingering anon execution rights
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;