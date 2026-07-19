-- ============================================================================
-- 04_security_functions.sql
-- Secure RPCs for PIN verification, payments, and data erasure.
-- ============================================================================

-- 1. Enable cryptographic functions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Migrate existing plaintext PIN to a secure hash (Run once)
DO $$
DECLARE
  v_row settings%ROWTYPE;
  v_salt text;
  v_hash text;
BEGIN
  SELECT * INTO v_row FROM settings WHERE key = 'PIN' FOR UPDATE;
  IF v_row.value IS NOT NULL AND v_row.pin_hash IS NULL THEN
    v_salt := encode(gen_random_bytes(16), 'hex');
    v_hash := crypt(v_row.value, v_salt);
    UPDATE settings
       SET pin_hash = v_hash,
           pin_salt = v_salt,
           value    = NULL -- Clear the plaintext PIN
     WHERE key = 'PIN';
  END IF;
END$$;

-- 3. Secure PIN Verification (with brute-force lockout)
CREATE OR REPLACE FUNCTION public.verify_pin(p_pin text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row settings%ROWTYPE;
  v_failed int;
  v_locked timestamptz;
  v_token text;
BEGIN
  SELECT * INTO v_row FROM settings WHERE key = 'PIN';
  
  -- Fallback: If plaintext exists but hash doesn't, hash it now
  IF v_row.pin_hash IS NULL AND v_row.value IS NOT NULL THEN
    v_row.pin_salt := encode(gen_random_bytes(16), 'hex');
    v_row.pin_hash := crypt(v_row.value, v_row.pin_salt);
    UPDATE settings SET pin_hash = v_row.pin_hash, pin_salt = v_row.pin_salt, value = NULL WHERE key = 'PIN';
  END IF;

  IF v_row.pin_hash IS NULL THEN
    RAISE EXCEPTION 'PIN not configured' USING ERRCODE = '28000';
  END IF;
  
  IF v_row.locked_until IS NOT NULL AND v_row.locked_until > now() THEN
    RAISE EXCEPTION 'PIN locked until %', v_row.locked_until USING ERRCODE = '28000';
  END IF;

  IF crypt(p_pin, v_row.pin_hash) = v_row.pin_hash THEN
    UPDATE settings SET failed_attempts = 0, locked_until = NULL WHERE key = 'PIN';
    v_token := encode(gen_random_bytes(24), 'hex');
    RETURN json_build_object('success', true, 'token', v_token);
  ELSE
    v_failed := COALESCE(v_row.failed_attempts, 0) + 1;
    IF v_failed >= 10 THEN v_locked := now() + interval '1 hour';
    ELSIF v_failed >= 5 THEN v_locked := now() + interval '5 minutes';
    ELSE v_locked := NULL; END IF;
    
    UPDATE settings SET failed_attempts = v_failed, locked_until = v_locked WHERE key = 'PIN';
    RAISE EXCEPTION 'Invalid PIN' USING ERRCODE = '28000';
  END IF;
END;
$$;
-- CRITICAL: Grant permission to the frontend (anon role) to call this function
GRANT EXECUTE ON FUNCTION public.verify_pin(text) TO anon, authenticated;

-- 4. Secure PIN Rotation
CREATE OR REPLACE FUNCTION public.rotate_pin(p_current text, p_new text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row settings%ROWTYPE;
  v_salt text;
  v_hash text;
BEGIN
  SELECT * INTO v_row FROM settings WHERE key = 'PIN';
  IF v_row.pin_hash IS NULL OR crypt(p_current, v_row.pin_hash) <> v_row.pin_hash THEN
    RAISE EXCEPTION 'Current PIN is incorrect' USING ERRCODE = '28000';
  END IF;
  IF length(p_new) < 6 THEN
    RAISE EXCEPTION 'New PIN must be at least 6 digits' USING ERRCODE = '22023';
  END IF;
  
  v_salt := encode(gen_random_bytes(16), 'hex');
  v_hash := crypt(p_new, v_salt);
  UPDATE settings SET pin_hash = v_hash, pin_salt = v_salt, failed_attempts = 0, locked_until = NULL WHERE key = 'PIN';
  RETURN json_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.rotate_pin(text, text) TO anon, authenticated;

-- 5. Atomic Payment Recording (Prevents race conditions)
CREATE OR REPLACE FUNCTION public.record_payment(
  p_bill_id uuid,
  p_amount numeric,
  p_mode text DEFAULT 'Cash',
  p_date date DEFAULT current_date,
  p_note text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill bills%ROWTYPE;
  v_new_paid numeric;
  v_status text;
BEGIN
  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bill not found' USING ERRCODE = 'P0002'; END IF;
  IF v_bill.locked THEN RAISE EXCEPTION 'Bill is locked' USING ERRCODE = 'P0001'; END IF;
  IF p_amount > (v_bill.amount - v_bill.amount_paid) + 0.01 THEN
    RAISE EXCEPTION 'Payment exceeds pending amount' USING ERRCODE = 'P0001';
  END IF;

  v_new_paid := v_bill.amount_paid + p_amount;
  v_status := CASE WHEN v_new_paid >= v_bill.amount THEN 'Paid' WHEN v_new_paid > 0 THEN 'Partial' ELSE 'Unpaid' END;

  UPDATE bills SET amount_paid = v_new_paid, status = v_status WHERE id = p_bill_id;
  RETURN json_build_object('billId', p_bill_id, 'amountPaid', v_new_paid, 'status', v_status);
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_payment(uuid, numeric, text, date, text) TO anon, authenticated;

-- 6. Safe Data Erasure
CREATE OR REPLACE FUNCTION public.erase_all_data(p_confirm text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE tables text[] := ARRAY['daily_logs','adjustments','credit_notes','bills','pause_periods','subscriptions','milk_imports','milk_brands','customers','payments']; t text;
BEGIN
  IF p_confirm <> 'ERASE' THEN RAISE EXCEPTION 'confirmation required' USING ERRCODE = '22023'; END IF;
  FOREACH t IN ARRAY tables LOOP EXECUTE format('DELETE FROM %I', t); END LOOP;
  RETURN json_build_object('erased', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.erase_all_data(text) TO anon, authenticated;