


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."apply_adjustment_rpc"("p_adjustment_id" "uuid", "p_bill_id" "uuid", "p_version" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_adj record;
  v_bill record;
  v_new_amount numeric;
BEGIN
  -- Operator-only — explicit guard (matches sibling RPCs).
  IF NOT public.is_operator() THEN
    RAISE EXCEPTION 'Unauthorized: only the operator may apply adjustments';
  END IF;

  -- Fetch and lock the adjustment
  SELECT * INTO v_adj FROM adjustments WHERE id = p_adjustment_id FOR UPDATE;
  IF v_adj IS NULL THEN RAISE EXCEPTION 'Adjustment not found'; END IF;

  -- Check version for Optimistic Concurrency Control (OCC)
  IF v_adj.version != p_version THEN
    RAISE EXCEPTION 'CONFLICT: Adjustment was modified by another process.';
  END IF;

  -- Check if already applied
  IF v_adj.applied = true THEN
    RAISE EXCEPTION 'Adjustment has already been applied.';
  END IF;

  -- Fetch and lock the bill
  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id FOR UPDATE;
  IF v_bill IS NULL THEN RAISE EXCEPTION 'Bill not found'; END IF;
  IF v_bill.locked = true THEN
    RAISE EXCEPTION 'Cannot apply adjustment to a locked bill.';
  END IF;

  -- AI-m audit H-3 (2026-08-01): adjustment and bill must belong to the
  -- same customer. Without this guard, a misclick could apply a credit
  -- owed to one customer to another customer's bill.
  IF v_adj.customer_id IS DISTINCT FROM v_bill.customer_id THEN
    RAISE EXCEPTION 'Adjustment and bill belong to different customers';
  END IF;

  -- Calculate new amount (Assumes v_adj.amount is a positive discount.
  -- The adjustments.amount CHECK constraint blocks 0 only — sign is the
  -- caller's responsibility per AGENTS.md §14.)
  v_new_amount := v_bill.amount - v_adj.amount;

  -- CRITICAL: Prevent violating the chk_bills_paid_lte_amount constraint
  IF v_new_amount < v_bill.amount_paid THEN
    RAISE EXCEPTION 'Adjustment would make total bill amount (%) less than amount already paid (%). Please issue a credit note instead.', v_new_amount, v_bill.amount_paid;
  END IF;

  -- Apply the adjustment and recompute status atomically
  UPDATE bills
  SET amount = v_new_amount,
      status = CASE
        WHEN v_new_amount <= v_bill.amount_paid THEN 'Paid'
        WHEN v_bill.amount_paid > 0 THEN 'Partial'
        ELSE 'Unpaid'
      END,
      version = v_bill.version + 1,
      updated_at = now()
  WHERE id = p_bill_id;

  -- Mark adjustment as applied and update its version/timestamp
  UPDATE adjustments
  SET applied = true,
      version = version + 1,
      updated_at = now()
  WHERE id = p_adjustment_id;

  RETURN jsonb_build_object('success', true, 'new_amount', v_new_amount);
END;
$$;


ALTER FUNCTION "public"."apply_adjustment_rpc"("p_adjustment_id" "uuid", "p_bill_id" "uuid", "p_version" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_credit_note_rpc"("p_credit_note_id" "uuid", "p_bill_id" "uuid", "p_version" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_cn record;
  v_bill record;
  v_new_paid numeric;
  v_status text;
BEGIN
  -- Operator-only — explicit guard (matches sibling RPCs).
  IF NOT public.is_operator() THEN
    RAISE EXCEPTION 'Unauthorized: only the operator may apply credit notes';
  END IF;

  -- 1. Fetch and lock the credit note
  SELECT * INTO v_cn FROM credit_notes WHERE id = p_credit_note_id FOR UPDATE;
  IF v_cn IS NULL THEN RAISE EXCEPTION 'Credit note not found'; END IF;

  -- 2. Check version for Optimistic Concurrency Control (OCC)
  IF v_cn.version != p_version THEN
    RAISE EXCEPTION 'CONFLICT: Credit note was modified by another process.';
  END IF;

  -- 3. Check if already applied
  IF v_cn.applied = true THEN
    RAISE EXCEPTION 'Credit note has already been applied.';
  END IF;

  -- FIX: validate the amount up front (AGENTS §14 — enforce invariants in
  -- SQL, not just the constraint). Zero/negative notes are never valid.
  IF v_cn.amount IS NULL OR v_cn.amount <= 0 THEN
    RAISE EXCEPTION 'Credit note amount must be positive';
  END IF;

  -- 4. Fetch and lock the bill
  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id FOR UPDATE;
  IF v_bill IS NULL THEN RAISE EXCEPTION 'Bill not found'; END IF;
  IF v_bill.locked = true THEN
    RAISE EXCEPTION 'Cannot apply a credit note to a locked bill.';
  END IF;

  -- AI-m audit H-3 (2026-08-01): same cross-customer guard as
  -- apply_adjustment_rpc above.
  IF v_cn.customer_id IS DISTINCT FROM v_bill.customer_id THEN
    RAISE EXCEPTION 'Credit note and bill belong to different customers';
  END IF;

  -- FIX: bound the applied amount so chk_bills_paid_lte_amount can never
  -- abort the transaction with a raw constraint error.
  IF v_bill.amount_paid + v_cn.amount > v_bill.amount THEN
    RAISE EXCEPTION 'Credit note (%) exceeds the pending balance (%) on this bill. Issue a smaller note or apply it to the next cycle.', v_cn.amount, v_bill.amount - v_bill.amount_paid;
  END IF;

  -- 5. Calculate new paid amount and status
  v_new_paid := v_bill.amount_paid + v_cn.amount;
  v_status := CASE
    WHEN v_new_paid >= v_bill.amount THEN 'Paid'
    WHEN v_new_paid > 0 THEN 'Partial'
    ELSE 'Unpaid'
  END;

  -- 6. Update the bill atomically
  UPDATE bills
  SET amount_paid = v_new_paid,
      status = v_status,
      version = version + 1,
      updated_at = now()
  WHERE id = p_bill_id;

  -- 7. Mark credit note as applied and update its version
  UPDATE credit_notes
  SET applied = true,
      applied_to_bill_id = p_bill_id,
      version = version + 1,
      updated_at = now()
  WHERE id = p_credit_note_id;

  RETURN jsonb_build_object('success', true, 'newPaid', v_new_paid, 'status', v_status);
END;
$$;


ALTER FUNCTION "public"."apply_credit_note_rpc"("p_credit_note_id" "uuid", "p_bill_id" "uuid", "p_version" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_milk_import_rpc"("p_import_id" "uuid", "p_expected_version" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_imp record;
  v_rows int;
  v_status text;
BEGIN
  IF NOT public.is_operator() THEN
    RAISE EXCEPTION 'Unauthorized: only the operator may confirm imports';
  END IF;

  -- Lock + version check in one step.
  SELECT * INTO v_imp
    FROM milk_imports
    WHERE id = p_import_id
    FOR UPDATE;

  IF v_imp IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: import % does not exist', p_import_id;
  END IF;

  IF v_imp.version <> p_expected_version THEN
    RAISE EXCEPTION 'CONFLICT: import was modified by another process';
  END IF;

  IF v_imp.status = 'Confirmed' THEN
    -- Idempotent success — no work to do but signal the caller.
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'status', 'Confirmed',
      'newVersion', v_imp.version
    );
  END IF;

  -- OCC update + verify exactly one row was affected (rule 5).
  UPDATE milk_imports
    SET status = 'Confirmed',
        version = version + 1,
        updated_at = now()
    WHERE id = p_import_id AND version = p_expected_version;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'CONFLICT: import was modified by another process';
  END IF;

  SELECT status, version INTO v_status, v_rows
    FROM milk_imports WHERE id = p_import_id;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'status', v_status,
    'newVersion', v_rows
  );
END;
$$;


ALTER FUNCTION "public"."confirm_milk_import_rpc"("p_import_id" "uuid", "p_expected_version" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_milk_import_rpc"("p_import_id" "uuid", "p_expected_version" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_rows int;
BEGIN
  IF NOT public.is_operator() THEN
    RAISE EXCEPTION 'Unauthorized: only the operator may delete imports';
  END IF;

  DELETE FROM milk_imports
    WHERE id = p_import_id AND version = p_expected_version;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    -- Either the row doesn't exist at all, or the version was stale.
    -- Distinguish them by existence so the UI can give the right message.
    PERFORM 1 FROM milk_imports WHERE id = p_import_id;
    IF FOUND THEN
      RAISE EXCEPTION 'CONFLICT: import was modified by another process';
    ELSE
      RAISE EXCEPTION 'NOT_FOUND: import % does not exist', p_import_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'deleted', v_rows);
END;
$$;


ALTER FUNCTION "public"."delete_milk_import_rpc"("p_import_id" "uuid", "p_expected_version" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_month_bill_rpc"("p_customer_id" "uuid", "p_month" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_amount numeric := 0;
  v_existing_bill record;
  v_line record;
  v_rate numeric;
  v_missing text := '';
  v_month_start date;
  v_month_end date;
BEGIN
  -- Operator-only — explicit guard (matches sibling RPCs; AGENTS §13).
  IF NOT public.is_operator() THEN
    RAISE EXCEPTION 'Unauthorized: only the operator may generate bills';
  END IF;

  -- Strict YYYY-MM with a real month (01..12).
  IF p_month IS NULL OR p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Invalid month format (expected YYYY-MM between 01 and 12): %', p_month;
  END IF;

  v_month_start := (p_month || '-01')::date;
  v_month_end := (v_month_start + INTERVAL '1 month')::date;

  -- Per-product pricing: a customer may hold several subscriptions with
  -- different milk types; each product is priced at its own active brand
  -- rate (replaces the single customers.product rate lookup).
  FOR v_line IN
    SELECT product, SUM(qty) AS qty
    FROM daily_logs
    WHERE customer_id = p_customer_id
      AND date >= v_month_start
      AND date < v_month_end
      AND delivered = true
    GROUP BY product
    ORDER BY product
  LOOP
    SELECT rate_per_liter INTO v_rate
    FROM milk_brands
    WHERE default_milk_type = v_line.product AND status = 'Active'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_rate IS NULL THEN
      v_missing := v_missing || (CASE WHEN v_missing = '' THEN '' ELSE ', ' END) || v_line.product;
    ELSE
      v_amount := v_amount + (v_line.qty * v_rate);
    END IF;
  END LOOP;

  -- FAIL LOUDLY if any delivered product has no active rate (prevents silent
  -- ₹0 / wrong-rate bills). Zero delivered logs => zero-amount bill, no rate
  -- needed.
  IF v_missing <> '' THEN
    RAISE EXCEPTION 'No active rate found for milk type(s): %', v_missing;
  END IF;

  SELECT * INTO v_existing_bill FROM bills WHERE customer_id = p_customer_id AND month = p_month FOR UPDATE;

  IF v_existing_bill IS NOT NULL THEN
    IF v_existing_bill.locked = true THEN
      RAISE EXCEPTION 'Cannot regenerate a locked bill.';
    END IF;
    UPDATE bills SET
        amount = v_amount,
        status = CASE
          WHEN v_existing_bill.amount_paid >= v_amount THEN 'Paid'
          WHEN v_existing_bill.amount_paid > 0 THEN 'Partial'
          ELSE 'Unpaid'
        END,
        version = version + 1,
        updated_at = now()
    WHERE id = v_existing_bill.id;
  ELSE
    INSERT INTO bills (id, customer_id, month, amount, amount_paid, status, locked, version)
    VALUES (gen_random_uuid(), p_customer_id, p_month, v_amount, 0, 'Unpaid', false, 1);
  END IF;

  RETURN jsonb_build_object('success', true, 'amount', v_amount);
END;
$_$;


ALTER FUNCTION "public"."generate_month_bill_rpc"("p_customer_id" "uuid", "p_month" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_operator"() RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.operators WHERE user_id = auth.uid()
  );
END;
$$;


ALTER FUNCTION "public"."is_operator"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_ad_hoc_log_rpc"("p_customer_id" "uuid", "p_date" "date", "p_qty" numeric, "p_product" "text", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_existing record;
  v_note text := COALESCE(p_reason, '');
  v_display_note text;
  v_qty numeric := COALESCE(p_qty, 0);
  v_product text := COALESCE(NULLIF(p_product, ''), 'Full Cream');
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'BAD_REQUEST: customer_id is required';
  END IF;
  IF p_date IS NULL THEN
    RAISE EXCEPTION 'BAD_REQUEST: date is required';
  END IF;
  IF v_qty <= 0 THEN
    RAISE EXCEPTION 'BAD_REQUEST: qty must be > 0';
  END IF;

  IF NOT public.is_operator() THEN
    RAISE EXCEPTION 'Unauthorized: only the operator may record ad-hoc logs';
  END IF;

  -- Human-readable note. Existing tests/UX expect "Extra: <reason>" or
  -- "Extra delivery" — keep that contract here so the UI shows identical text
  -- whether the log is created or accumulated.
  v_display_note := CASE
    WHEN v_note = '' THEN 'Extra delivery'
    ELSE 'Extra: ' || v_note
  END;

  -- Lock the existing row for THIS (customer, date, product). Multi-product
  -- days now have one row per product; an extra delivery accumulates onto its
  -- own product's row instead of conflating with a different milk type.
  SELECT * INTO v_existing
    FROM daily_logs
    WHERE customer_id = p_customer_id AND date = p_date AND product = v_product
    FOR UPDATE;

  IF v_existing IS NOT NULL THEN
    UPDATE daily_logs
      SET qty = COALESCE(v_existing.qty, 0) + v_qty,
          delivered = true,
          note = CASE
            WHEN v_existing.note IS NULL OR v_existing.note = '' THEN v_display_note
            ELSE v_existing.note || ' | ' || v_display_note
          END,
          updated_at = now()
      WHERE id = v_existing.id
      RETURNING id, qty INTO v_existing.id, v_existing.qty;

    RETURN jsonb_build_object(
      'logId', v_existing.id,
      'qty', v_existing.qty,
      'created', false
    );
  END IF;

  -- No existing row for this product. INSERT; the unique
  -- (customer_id, date, product) constraint may raise unique_violation on a
  -- concurrent insert — let that propagate so the caller can retry.
  BEGIN
    INSERT INTO daily_logs (id, customer_id, date, product, qty, delivered, note)
      VALUES (gen_random_uuid(), p_customer_id, p_date, v_product, v_qty, true, v_display_note)
      RETURNING id, qty INTO v_existing.id, v_existing.qty;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'CONFLICT: ad-hoc log race, please retry';
  END;

  RETURN jsonb_build_object(
    'logId', v_existing.id,
    'qty', v_existing.qty,
    'created', true
  );
END;
$$;


ALTER FUNCTION "public"."record_ad_hoc_log_rpc"("p_customer_id" "uuid", "p_date" "date", "p_qty" numeric, "p_product" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_payment_rpc"("p_bill_id" "uuid", "p_amount" numeric, "p_mode" "text", "p_date" "date", "p_note" "text", "p_idempotency_key" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_bill record;
  v_existing_payment record;
  v_pending numeric;
  v_customer_id uuid;
BEGIN
  -- Operator-only — explicit guard (matches sibling RPCs; AGENTS §13).
  IF NOT public.is_operator() THEN
    RAISE EXCEPTION 'Unauthorized: only the operator may record payments';
  END IF;

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
    RAISE EXCEPTION 'Payment exceeds pending amount (%). Overpayment is not supported — record the exact pending amount and issue the excess as a credit note for the next cycle.', v_pending;
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


ALTER FUNCTION "public"."record_payment_rpc"("p_bill_id" "uuid", "p_amount" numeric, "p_mode" "text", "p_date" "date", "p_note" "text", "p_idempotency_key" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rollover_month_rpc"("p_month" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_generated int := 0;
  v_skipped_existing int := 0;
  v_active_subs int := 0;
  v_sub record;
BEGIN
  IF p_month IS NULL OR p_month !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'Invalid month format (expected YYYY-MM): %', p_month;
  END IF;

  -- Authorize the caller. Supabase exposes auth.uid(); is_operator() is the
  -- existing authoritative check against the documented operator UUID.
  IF NOT public.is_operator() THEN
    RAISE EXCEPTION 'Unauthorized: only the operator may trigger rollover';
  END IF;

  -- Lock the active subscription set so concurrent calls cannot both insert.
  FOR v_sub IN
    SELECT s.customer_id
    FROM subscriptions s
    WHERE s.is_active = true
    ORDER BY s.customer_id
    FOR UPDATE OF s
  LOOP
    v_active_subs := v_active_subs + 1;

    -- INSERT ... ON CONFLICT is the atomic equivalent of the old
    -- "select-then-insert" client loop. The unique (customer_id, month) index
    -- on bills backs the DO NOTHING; partial-failure retries are safe.
    INSERT INTO bills (id, customer_id, month, amount, amount_paid, status, locked, version)
    VALUES (gen_random_uuid(), v_sub.customer_id, p_month, 0, 0, 'Unpaid', false, 1)
    ON CONFLICT (customer_id, month) DO NOTHING
    RETURNING 1 INTO v_generated;

    -- If RETURNING yielded nothing the row already existed — count as skipped.
    IF NOT FOUND THEN
      v_skipped_existing := v_skipped_existing + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'billsGenerated', v_generated,
    'skippedExisting', v_skipped_existing,
    'activeSubscriptions', v_active_subs
  );
END;
$_$;


ALTER FUNCTION "public"."rollover_month_rpc"("p_month" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."adjustments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid",
    "bill_id" "uuid",
    "amount" numeric DEFAULT 0,
    "reason" "text",
    "applied" boolean DEFAULT false,
    "date" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "version" integer DEFAULT 1,
    CONSTRAINT "chk_adjustments_amount_nonzero" CHECK (("amount" <> (0)::numeric))
);

ALTER TABLE ONLY "public"."adjustments" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."adjustments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bills" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid",
    "month" "text" NOT NULL,
    "amount" numeric DEFAULT 0,
    "amount_paid" numeric DEFAULT 0,
    "status" "text" DEFAULT 'Unpaid'::"text",
    "locked" boolean DEFAULT false,
    "version" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "chk_bills_amount_positive" CHECK ((("amount" >= (0)::numeric) AND ("amount_paid" >= (0)::numeric))),
    CONSTRAINT "chk_bills_paid_lte_amount" CHECK (("amount_paid" <= "amount")),
    CONSTRAINT "chk_bills_status_valid" CHECK (("status" = ANY (ARRAY['Unpaid'::"text", 'Partial'::"text", 'Paid'::"text", 'Draft'::"text"])))
);

ALTER TABLE ONLY "public"."bills" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."bills" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credit_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid",
    "bill_id" "uuid",
    "applied_to_bill_id" "uuid",
    "amount" numeric DEFAULT 0,
    "reason" "text",
    "applied" boolean DEFAULT false,
    "date" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "version" integer DEFAULT 1
);

ALTER TABLE ONLY "public"."credit_notes" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."credit_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "delivery_address" "text",
    "status" "text" DEFAULT 'Active'::"text",
    "product" "text" DEFAULT 'Full Cream'::"text",
    "daily_qty" numeric DEFAULT 1,
    "delivery_days" "jsonb" DEFAULT '[0, 1, 2, 3, 4, 5, 6]'::"jsonb",
    "balance" numeric DEFAULT 0,
    "version" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."customers" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid",
    "date" "date" NOT NULL,
    "product" "text" DEFAULT 'Full Cream'::"text" NOT NULL,
    "qty" numeric DEFAULT 0,
    "delivered" boolean DEFAULT false,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."daily_logs" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."milk_brands" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_name" "text" NOT NULL,
    "supplier_name" "text",
    "supplier_phone" "text",
    "default_milk_type" "text",
    "rate_per_liter" numeric DEFAULT 0,
    "status" "text" DEFAULT 'Active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."milk_brands" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."milk_brands" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."milk_imports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "uuid",
    "brand_name" "text",
    "milk_type" "text",
    "quantity" numeric DEFAULT 0,
    "rate_per_liter" numeric DEFAULT 0,
    "total_cost" numeric DEFAULT 0,
    "invoice_number" "text",
    "supplier_name" "text",
    "date" "date" NOT NULL,
    "status" "text" DEFAULT 'Draft'::"text",
    "version" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."milk_imports" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."milk_imports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."operators" (
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."operators" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pause_periods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid",
    "start_date" "date" NOT NULL,
    "end_date" "date",
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."pause_periods" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."pause_periods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bill_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "amount" numeric NOT NULL,
    "payment_mode" "text" DEFAULT 'Cash'::"text",
    "payment_date" "date" NOT NULL,
    "note" "text",
    "idempotency_key" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "chk_payments_amount_positive" CHECK (("amount" > (0)::numeric))
);

ALTER TABLE ONLY "public"."payments" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."settings" (
    "key" "text" NOT NULL,
    "value" "text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."settings" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid",
    "milk_type" "text" DEFAULT 'Full Cream'::"text",
    "qty" numeric DEFAULT 1,
    "delivery_days" "jsonb" DEFAULT '[0, 1, 2, 3, 4, 5, 6]'::"jsonb",
    "is_active" boolean DEFAULT true,
    "version" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."subscriptions" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."adjustments"
    ADD CONSTRAINT "adjustments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bills"
    ADD CONSTRAINT "bills_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."credit_notes"
    ADD CONSTRAINT "chk_credit_notes_amount_positive" CHECK (("amount" > (0)::numeric)) NOT VALID;



ALTER TABLE ONLY "public"."credit_notes"
    ADD CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_logs"
    ADD CONSTRAINT "daily_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."milk_brands"
    ADD CONSTRAINT "milk_brands_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."milk_imports"
    ADD CONSTRAINT "milk_imports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operators"
    ADD CONSTRAINT "operators_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."pause_periods"
    ADD CONSTRAINT "pause_periods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_idempotency_key_key" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_logs"
    ADD CONSTRAINT "unique_customer_date_product" UNIQUE ("customer_id", "date", "product");



ALTER TABLE ONLY "public"."bills"
    ADD CONSTRAINT "unique_customer_month" UNIQUE ("customer_id", "month");



CREATE INDEX "idx_adjustments_bill_id" ON "public"."adjustments" USING "btree" ("bill_id");



CREATE INDEX "idx_adjustments_customer_id" ON "public"."adjustments" USING "btree" ("customer_id");



CREATE INDEX "idx_bills_customer_month" ON "public"."bills" USING "btree" ("customer_id", "month");



CREATE INDEX "idx_bills_month" ON "public"."bills" USING "btree" ("month");



CREATE INDEX "idx_credit_notes_applied_to_bill_id" ON "public"."credit_notes" USING "btree" ("applied_to_bill_id");



CREATE INDEX "idx_credit_notes_bill_id" ON "public"."credit_notes" USING "btree" ("bill_id");



CREATE INDEX "idx_credit_notes_customer_id" ON "public"."credit_notes" USING "btree" ("customer_id");



CREATE INDEX "idx_daily_logs_customer_date" ON "public"."daily_logs" USING "btree" ("customer_id", "date");



CREATE INDEX "idx_daily_logs_date" ON "public"."daily_logs" USING "btree" ("date");



CREATE INDEX "idx_milk_imports_brand_id" ON "public"."milk_imports" USING "btree" ("brand_id");



CREATE INDEX "idx_milk_imports_date" ON "public"."milk_imports" USING "btree" ("date");



CREATE INDEX "idx_pause_periods_customer_id" ON "public"."pause_periods" USING "btree" ("customer_id");



CREATE INDEX "idx_payments_bill_id" ON "public"."payments" USING "btree" ("bill_id");



CREATE INDEX "idx_payments_customer_id" ON "public"."payments" USING "btree" ("customer_id");



CREATE INDEX "idx_subscriptions_customer" ON "public"."subscriptions" USING "btree" ("customer_id");



CREATE UNIQUE INDEX "uniq_sub_customer_type_active" ON "public"."subscriptions" USING "btree" ("customer_id", "milk_type") WHERE "is_active";



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."adjustments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."bills" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."credit_notes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."daily_logs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."adjustments"
    ADD CONSTRAINT "adjustments_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."adjustments"
    ADD CONSTRAINT "adjustments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bills"
    ADD CONSTRAINT "bills_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_notes"
    ADD CONSTRAINT "credit_notes_applied_to_bill_id_fkey" FOREIGN KEY ("applied_to_bill_id") REFERENCES "public"."bills"("id");



ALTER TABLE ONLY "public"."credit_notes"
    ADD CONSTRAINT "credit_notes_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."credit_notes"
    ADD CONSTRAINT "credit_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_logs"
    ADD CONSTRAINT "daily_logs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."milk_imports"
    ADD CONSTRAINT "milk_imports_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "public"."milk_brands"("id");



ALTER TABLE ONLY "public"."operators"
    ADD CONSTRAINT "operators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pause_periods"
    ADD CONSTRAINT "pause_periods_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE "public"."adjustments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bills" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."credit_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."milk_brands" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."milk_imports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."operators" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "operators_service_role_only" ON "public"."operators" USING (false) WITH CHECK (false);



ALTER TABLE "public"."pause_periods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "strict_auth_only_delete" ON "public"."adjustments" FOR DELETE USING ("public"."is_operator"());



CREATE POLICY "strict_auth_only_delete" ON "public"."bills" FOR DELETE USING ("public"."is_operator"());



CREATE POLICY "strict_auth_only_delete" ON "public"."credit_notes" FOR DELETE USING ("public"."is_operator"());



CREATE POLICY "strict_auth_only_delete" ON "public"."customers" FOR DELETE USING ("public"."is_operator"());



CREATE POLICY "strict_auth_only_delete" ON "public"."daily_logs" FOR DELETE USING ("public"."is_operator"());



CREATE POLICY "strict_auth_only_delete" ON "public"."milk_brands" FOR DELETE USING ("public"."is_operator"());



CREATE POLICY "strict_auth_only_delete" ON "public"."milk_imports" FOR DELETE USING ("public"."is_operator"());



CREATE POLICY "strict_auth_only_delete" ON "public"."pause_periods" FOR DELETE USING ("public"."is_operator"());



CREATE POLICY "strict_auth_only_delete" ON "public"."payments" FOR DELETE USING ("public"."is_operator"());



CREATE POLICY "strict_auth_only_delete" ON "public"."settings" FOR DELETE USING ("public"."is_operator"());



CREATE POLICY "strict_auth_only_delete" ON "public"."subscriptions" FOR DELETE USING ("public"."is_operator"());



CREATE POLICY "strict_auth_only_insert" ON "public"."adjustments" FOR INSERT WITH CHECK ("public"."is_operator"());



CREATE POLICY "strict_auth_only_insert" ON "public"."bills" FOR INSERT WITH CHECK ("public"."is_operator"());



CREATE POLICY "strict_auth_only_insert" ON "public"."credit_notes" FOR INSERT WITH CHECK ("public"."is_operator"());



CREATE POLICY "strict_auth_only_insert" ON "public"."customers" FOR INSERT WITH CHECK ("public"."is_operator"());



CREATE POLICY "strict_auth_only_insert" ON "public"."daily_logs" FOR INSERT WITH CHECK ("public"."is_operator"());



CREATE POLICY "strict_auth_only_insert" ON "public"."milk_brands" FOR INSERT WITH CHECK ("public"."is_operator"());



CREATE POLICY "strict_auth_only_insert" ON "public"."milk_imports" FOR INSERT WITH CHECK ("public"."is_operator"());



CREATE POLICY "strict_auth_only_insert" ON "public"."pause_periods" FOR INSERT WITH CHECK ("public"."is_operator"());



CREATE POLICY "strict_auth_only_insert" ON "public"."payments" FOR INSERT WITH CHECK ("public"."is_operator"());



CREATE POLICY "strict_auth_only_insert" ON "public"."settings" FOR INSERT WITH CHECK ("public"."is_operator"());



CREATE POLICY "strict_auth_only_insert" ON "public"."subscriptions" FOR INSERT WITH CHECK ("public"."is_operator"());



CREATE POLICY "strict_auth_only_select" ON "public"."adjustments" FOR SELECT USING ("public"."is_operator"());



CREATE POLICY "strict_auth_only_select" ON "public"."bills" FOR SELECT USING ("public"."is_operator"());



CREATE POLICY "strict_auth_only_select" ON "public"."credit_notes" FOR SELECT USING ("public"."is_operator"());



CREATE POLICY "strict_auth_only_select" ON "public"."customers" FOR SELECT USING ("public"."is_operator"());



CREATE POLICY "strict_auth_only_select" ON "public"."daily_logs" FOR SELECT USING ("public"."is_operator"());



CREATE POLICY "strict_auth_only_select" ON "public"."milk_brands" FOR SELECT USING ("public"."is_operator"());



CREATE POLICY "strict_auth_only_select" ON "public"."milk_imports" FOR SELECT USING ("public"."is_operator"());



CREATE POLICY "strict_auth_only_select" ON "public"."pause_periods" FOR SELECT USING ("public"."is_operator"());



CREATE POLICY "strict_auth_only_select" ON "public"."payments" FOR SELECT USING ("public"."is_operator"());



CREATE POLICY "strict_auth_only_select" ON "public"."settings" FOR SELECT USING ("public"."is_operator"());



CREATE POLICY "strict_auth_only_select" ON "public"."subscriptions" FOR SELECT USING ("public"."is_operator"());



CREATE POLICY "strict_auth_only_update" ON "public"."adjustments" FOR UPDATE USING ("public"."is_operator"()) WITH CHECK ("public"."is_operator"());



CREATE POLICY "strict_auth_only_update" ON "public"."bills" FOR UPDATE USING ("public"."is_operator"()) WITH CHECK ("public"."is_operator"());



CREATE POLICY "strict_auth_only_update" ON "public"."credit_notes" FOR UPDATE USING ("public"."is_operator"()) WITH CHECK ("public"."is_operator"());



CREATE POLICY "strict_auth_only_update" ON "public"."customers" FOR UPDATE USING ("public"."is_operator"()) WITH CHECK ("public"."is_operator"());



CREATE POLICY "strict_auth_only_update" ON "public"."daily_logs" FOR UPDATE USING ("public"."is_operator"()) WITH CHECK ("public"."is_operator"());



CREATE POLICY "strict_auth_only_update" ON "public"."milk_brands" FOR UPDATE USING ("public"."is_operator"()) WITH CHECK ("public"."is_operator"());



CREATE POLICY "strict_auth_only_update" ON "public"."milk_imports" FOR UPDATE USING ("public"."is_operator"()) WITH CHECK ("public"."is_operator"());



CREATE POLICY "strict_auth_only_update" ON "public"."pause_periods" FOR UPDATE USING ("public"."is_operator"()) WITH CHECK ("public"."is_operator"());



CREATE POLICY "strict_auth_only_update" ON "public"."payments" FOR UPDATE USING ("public"."is_operator"()) WITH CHECK ("public"."is_operator"());



CREATE POLICY "strict_auth_only_update" ON "public"."settings" FOR UPDATE USING ("public"."is_operator"()) WITH CHECK ("public"."is_operator"());



CREATE POLICY "strict_auth_only_update" ON "public"."subscriptions" FOR UPDATE USING ("public"."is_operator"()) WITH CHECK ("public"."is_operator"());



ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_adjustment_rpc"("p_adjustment_id" "uuid", "p_bill_id" "uuid", "p_version" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_adjustment_rpc"("p_adjustment_id" "uuid", "p_bill_id" "uuid", "p_version" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_adjustment_rpc"("p_adjustment_id" "uuid", "p_bill_id" "uuid", "p_version" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_credit_note_rpc"("p_credit_note_id" "uuid", "p_bill_id" "uuid", "p_version" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_credit_note_rpc"("p_credit_note_id" "uuid", "p_bill_id" "uuid", "p_version" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_credit_note_rpc"("p_credit_note_id" "uuid", "p_bill_id" "uuid", "p_version" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirm_milk_import_rpc"("p_import_id" "uuid", "p_expected_version" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_milk_import_rpc"("p_import_id" "uuid", "p_expected_version" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_milk_import_rpc"("p_import_id" "uuid", "p_expected_version" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_milk_import_rpc"("p_import_id" "uuid", "p_expected_version" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_milk_import_rpc"("p_import_id" "uuid", "p_expected_version" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_milk_import_rpc"("p_import_id" "uuid", "p_expected_version" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."generate_month_bill_rpc"("p_customer_id" "uuid", "p_month" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_month_bill_rpc"("p_customer_id" "uuid", "p_month" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_month_bill_rpc"("p_customer_id" "uuid", "p_month" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_operator"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_operator"() TO "service_role";
GRANT ALL ON FUNCTION "public"."is_operator"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."record_ad_hoc_log_rpc"("p_customer_id" "uuid", "p_date" "date", "p_qty" numeric, "p_product" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_ad_hoc_log_rpc"("p_customer_id" "uuid", "p_date" "date", "p_qty" numeric, "p_product" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_ad_hoc_log_rpc"("p_customer_id" "uuid", "p_date" "date", "p_qty" numeric, "p_product" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_payment_rpc"("p_bill_id" "uuid", "p_amount" numeric, "p_mode" "text", "p_date" "date", "p_note" "text", "p_idempotency_key" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_payment_rpc"("p_bill_id" "uuid", "p_amount" numeric, "p_mode" "text", "p_date" "date", "p_note" "text", "p_idempotency_key" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_payment_rpc"("p_bill_id" "uuid", "p_amount" numeric, "p_mode" "text", "p_date" "date", "p_note" "text", "p_idempotency_key" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rollover_month_rpc"("p_month" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rollover_month_rpc"("p_month" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rollover_month_rpc"("p_month" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON TABLE "public"."adjustments" TO "authenticated";
GRANT ALL ON TABLE "public"."adjustments" TO "service_role";



GRANT ALL ON TABLE "public"."bills" TO "authenticated";
GRANT ALL ON TABLE "public"."bills" TO "service_role";



GRANT ALL ON TABLE "public"."credit_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."credit_notes" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."daily_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_logs" TO "service_role";



GRANT ALL ON TABLE "public"."milk_brands" TO "authenticated";
GRANT ALL ON TABLE "public"."milk_brands" TO "service_role";



GRANT ALL ON TABLE "public"."milk_imports" TO "authenticated";
GRANT ALL ON TABLE "public"."milk_imports" TO "service_role";



GRANT ALL ON TABLE "public"."operators" TO "service_role";



GRANT ALL ON TABLE "public"."pause_periods" TO "authenticated";
GRANT ALL ON TABLE "public"."pause_periods" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."settings" TO "authenticated";
GRANT ALL ON TABLE "public"."settings" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







