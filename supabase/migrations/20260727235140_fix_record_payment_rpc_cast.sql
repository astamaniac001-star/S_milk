-- Migration 20260727235140_fix_record_payment_rpc_cast.sql
--
-- BUG: `record_payment_rpc` declared `p_idempotency_key UUID` but the
-- `payments.idempotency_key` column is `text` (verified in schema.sql:689
-- and database.types.ts:417). The function body did:
--
--   SELECT id INTO v_existing_payment
--     FROM payments WHERE idempotency_key = p_idempotency_key;            -- ❌ text = uuid
--   INSERT INTO payments (..., idempotency_key, ...)                       -- ❌ uuid-into-text column
--     VALUES (..., p_idempotency_key, ...);
--
-- PostgreSQL refuses to implicitly cast between text and uuid, so every
-- call to record_payment_rpc raised:
--
--   ERROR:  operator does not exist: text = uuid
--   SQL state 42883
--   Hint: You might need to add explicit type casts.
--
-- Verified live on 2026-07-28 by calling the function from supabase-js with
-- both a real UUID and NULL — same error in both cases. The frontend passes
-- a real UUID (`mapPaymentToApi` → `generateKey()` → crypto.randomUUID())
-- so the issue is purely the function body's missing casts.
--
-- FIX: cast `p_idempotency_key` to `::text` wherever it touches the text
-- column. Keep the parameter declared as `uuid` (so supabase-js still
-- type-checks callers and PostgREST serializes it as a UUID in error
-- messages). The text column is unchanged to avoid a table rewrite; the
-- unique constraint `payments_idempotency_key_key` continues to enforce
-- idempotency at the row level.
--
-- Per AGENTS.md §15 the full current signature is reproduced verbatim in
-- `CREATE OR REPLACE` so the function is REPLACED (not overloaded) —
-- confirm by checking `database.types.ts` after `npm run db:sync`: only one
-- `record_payment_rpc` entry must remain. Function body is otherwise
-- byte-identical to the deployed definition (schema.sql:394-436).
--
-- Per AGENTS.md §14: this RPC is the only money-mutation path for payments;
-- the row lock on bills (FOR UPDATE at the top of step 2), the locked-bill
-- check, the overpayment check, the atomic bill status transition (CASE),
-- and the version bump are all preserved unchanged.

CREATE OR REPLACE FUNCTION public.record_payment_rpc(
  p_bill_id uuid,
  p_amount numeric,
  p_mode text,
  p_date date,
  p_note text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_bill record;
  v_existing_payment record;
  v_pending numeric;
  v_customer_id uuid;
BEGIN
  -- 1. Idempotency check.
  --    payments.idempotency_key is text; cast the uuid param to text so
  --    Postgres can resolve `text = text` (was: `text = uuid` → 42883).
  SELECT id INTO v_existing_payment
    FROM payments
   WHERE idempotency_key = p_idempotency_key::text;
  IF v_existing_payment IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true);
  END IF;

  -- 2. Lock and validate bill.
  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id FOR UPDATE;
  IF v_bill IS NULL THEN RAISE EXCEPTION 'Bill not found'; END IF;
  IF v_bill.locked = true THEN RAISE EXCEPTION 'This bill is locked.'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  v_pending := v_bill.amount - v_bill.amount_paid;
  IF p_amount > v_pending + 0.01 THEN
    RAISE EXCEPTION 'Payment exceeds pending amount (%). Use a credit note for advance payment.', v_pending;
  END IF;

  v_customer_id := v_bill.customer_id;

  -- 3. Insert payment. Cast the uuid param to ::text for the text column.
  INSERT INTO payments
       (id, bill_id, customer_id, amount, payment_mode, payment_date, note, idempotency_key, created_at)
  VALUES
       (gen_random_uuid(), p_bill_id, v_customer_id, p_amount, p_mode, p_date, p_note, p_idempotency_key::text, now());

  -- 4. Update bill atomically.
  UPDATE bills
     SET amount_paid = amount_paid + p_amount,
         status = CASE WHEN (amount_paid + p_amount) >= amount THEN 'Paid' ELSE 'Partial' END,
         version = version + 1,
         updated_at = now()
   WHERE id = p_bill_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

ALTER FUNCTION public.record_payment_rpc(uuid, numeric, text, date, text, uuid) OWNER TO postgres;
