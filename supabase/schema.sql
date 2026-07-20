


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



CREATE OR REPLACE FUNCTION "public"."apply_adjustment_rpc"("p_adjustment_id" "uuid", "p_bill_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_adj record; v_bill record;
BEGIN
  SELECT * INTO v_adj FROM adjustments WHERE id = p_adjustment_id FOR UPDATE;
  IF v_adj IS NULL OR v_adj.status = 'Applied' THEN RETURN jsonb_build_object('success', true, 'idempotent', true); END IF;

  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id FOR UPDATE;
  IF v_bill.customer_id != v_adj.customer_id THEN RAISE EXCEPTION 'Customer mismatch'; END IF;

  UPDATE bills SET amount = amount + v_adj.amount, version = version + 1 WHERE id = p_bill_id;
  UPDATE adjustments SET status = 'Applied', bill_id = p_bill_id WHERE id = p_adjustment_id;

  RETURN jsonb_build_object('success', true);
END; $$;


ALTER FUNCTION "public"."apply_adjustment_rpc"("p_adjustment_id" "uuid", "p_bill_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_adjustment_rpc"("p_adjustment_id" "uuid", "p_bill_id" "uuid", "p_version" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_adj record;
  v_bill record;
BEGIN
  -- 1. Fetch and lock the adjustment
  SELECT * INTO v_adj FROM adjustments WHERE id = p_adjustment_id FOR UPDATE;
  IF v_adj IS NULL THEN RAISE EXCEPTION 'Adjustment not found'; END IF;
  
  -- 2. Check version for Optimistic Concurrency Control (OCC)
  IF v_adj.version != p_version THEN RAISE EXCEPTION 'CONFLICT: Adjustment was modified by another process.'; END IF;
  
  -- 3. Check if already applied (using the correct boolean column)
  IF v_adj.applied = true THEN RAISE EXCEPTION 'Adjustment has already been applied.'; END IF;

  -- 4. Fetch and lock the bill
  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id FOR UPDATE;
  IF v_bill IS NULL THEN RAISE EXCEPTION 'Bill not found'; END IF;
  IF v_bill.locked = true THEN RAISE EXCEPTION 'Cannot apply adjustment to a locked bill.'; END IF;

  -- 5. Apply the adjustment (reduce bill amount)
  UPDATE bills
  SET amount = v_bill.amount - v_adj.amount,
      version = v_bill.version + 1,
      updated_at = now()
  WHERE id = p_bill_id;

  -- 6. Mark adjustment as applied and update its version/timestamp
  UPDATE adjustments
  SET applied = true,
      version = version + 1,
      updated_at = now()
  WHERE id = p_adjustment_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."apply_adjustment_rpc"("p_adjustment_id" "uuid", "p_bill_id" "uuid", "p_version" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_month_bill_rpc"("p_customer_id" "uuid", "p_month" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE 
  v_rate numeric; 
  v_total_qty numeric; 
  v_amount numeric; 
  v_existing_bill record;
  v_product text;
BEGIN
  -- Get customer's product to find the correct rate
  SELECT product INTO v_product FROM customers WHERE id = p_customer_id;
  
  -- Fetch rate from milk_brands based on the product (default_milk_type)
  SELECT rate_per_liter INTO v_rate FROM milk_brands WHERE default_milk_type = v_product LIMIT 1;
  IF v_rate IS NULL THEN v_rate := 0; END IF;

  SELECT COALESCE(SUM(qty), 0) INTO v_total_qty FROM daily_logs
  WHERE customer_id = p_customer_id AND to_char(date, 'YYYY-MM') = p_month AND delivered = true;

  v_amount := v_total_qty * v_rate;

  SELECT * INTO v_existing_bill FROM bills WHERE customer_id = p_customer_id AND month = p_month FOR UPDATE;

  IF v_existing_bill IS NOT NULL THEN
    IF v_existing_bill.locked = true THEN
      RAISE EXCEPTION 'Cannot regenerate a locked bill.';
    END IF;
    UPDATE bills SET amount = v_amount, version = version + 1, updated_at = now() WHERE id = v_existing_bill.id;
  ELSE
    INSERT INTO bills (id, customer_id, month, amount, amount_paid, status, locked, version)
    VALUES (gen_random_uuid(), p_customer_id, p_month, v_amount, 0, 'Unpaid', false, 1);
  END IF;

  RETURN jsonb_build_object('success', true, 'amount', v_amount);
END; $$;


ALTER FUNCTION "public"."generate_month_bill_rpc"("p_customer_id" "uuid", "p_month" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_operator"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  SELECT auth.uid() = '3947f8aa-c545-41e0-b773-b263749d99ae'::uuid;
$$;


ALTER FUNCTION "public"."is_operator"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_payment"("p_bill_id" "uuid", "p_amount" numeric, "p_mode" "text" DEFAULT 'Cash'::"text", "p_date" "date" DEFAULT CURRENT_DATE, "p_note" "text" DEFAULT NULL::"text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."record_payment"("p_bill_id" "uuid", "p_amount" numeric, "p_mode" "text", "p_date" "date", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_payment_rpc"("p_bill_id" "uuid", "p_amount" numeric, "p_mode" "text", "p_note" "text", "p_idempotency_key" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_bill record; v_existing_payment record; v_pending numeric;
BEGIN
  -- 1. Idempotency check
  SELECT id INTO v_existing_payment FROM payments WHERE idempotency_key = p_idempotency_key;
  IF v_existing_payment IS NOT NULL THEN 
    RETURN jsonb_build_object('success', true, 'idempotent', true); 
  END IF;

  -- 2. Lock and validate bill
  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id FOR UPDATE;
  IF v_bill IS NULL THEN RAISE EXCEPTION 'Bill not found'; END IF;
  IF v_bill.locked = true THEN RAISE EXCEPTION 'This bill is locked.'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  
  v_pending := v_bill.amount - v_bill.amount_paid;
  IF p_amount > v_pending + 0.01 THEN 
    RAISE EXCEPTION 'Payment exceeds pending amount (%). Use a credit note for advance payment.', v_pending; 
  END IF;

  -- 3. Insert payment and update bill atomically
  INSERT INTO payments (id, bill_id, amount, mode, note, idempotency_key, created_at)
  VALUES (gen_random_uuid(), p_bill_id, p_amount, p_mode, p_note, p_idempotency_key, now());

  UPDATE bills 
  SET amount_paid = amount_paid + p_amount,
      status = CASE WHEN (amount_paid + p_amount) >= amount THEN 'Paid' ELSE 'Partial' END,
      version = version + 1,
      updated_at = now()
  WHERE id = p_bill_id;

  RETURN jsonb_build_object('success', true);
END; $$;


ALTER FUNCTION "public"."record_payment_rpc"("p_bill_id" "uuid", "p_amount" numeric, "p_mode" "text", "p_note" "text", "p_idempotency_key" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_payment_rpc"("p_bill_id" "uuid", "p_amount" numeric, "p_mode" "text", "p_date" "date", "p_note" "text", "p_idempotency_key" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE 
  v_bill record; 
  v_existing_payment record; 
  v_pending numeric;
  v_customer_id uuid;
BEGIN
  -- 1. Idempotency check
  SELECT id INTO v_existing_payment FROM payments WHERE idempotency_key = p_idempotency_key;
  IF v_existing_payment IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true);
  END IF;

  -- 2. Lock and validate bill
  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id FOR UPDATE;
  IF v_bill IS NULL THEN RAISE EXCEPTION 'Bill not found'; END IF;
  IF v_bill.locked = true THEN RAISE EXCEPTION 'This bill is locked.'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  v_pending := v_bill.amount - v_bill.amount_paid;
  IF p_amount > v_pending + 0.01 THEN
    RAISE EXCEPTION 'Payment exceeds pending amount (%). Use a credit note for advance payment.', v_pending;
  END IF;

  v_customer_id := v_bill.customer_id;

  -- 3. Insert payment with CORRECT column names (payment_mode, payment_date, customer_id)
  INSERT INTO payments (id, bill_id, customer_id, amount, payment_mode, payment_date, note, idempotency_key, created_at)
  VALUES (gen_random_uuid(), p_bill_id, v_customer_id, p_amount, p_mode, p_date, p_note, p_idempotency_key, now());

  -- 4. Update bill atomically
  UPDATE bills
  SET amount_paid = amount_paid + p_amount,
      status = CASE WHEN (amount_paid + p_amount) >= amount THEN 'Paid' ELSE 'Partial' END,
      version = version + 1,
      updated_at = now()
  WHERE id = p_bill_id;

  RETURN jsonb_build_object('success', true);
END; $$;


ALTER FUNCTION "public"."record_payment_rpc"("p_bill_id" "uuid", "p_amount" numeric, "p_mode" "text", "p_date" "date", "p_note" "text", "p_idempotency_key" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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
    "updated_at" timestamp with time zone DEFAULT "now"()
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
    "product" "text",
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
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."milk_imports" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."milk_imports" OWNER TO "postgres";


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
    ADD CONSTRAINT "unique_customer_date" UNIQUE ("customer_id", "date");



ALTER TABLE ONLY "public"."bills"
    ADD CONSTRAINT "unique_customer_month" UNIQUE ("customer_id", "month");



CREATE INDEX "idx_bills_customer_month" ON "public"."bills" USING "btree" ("customer_id", "month");



CREATE INDEX "idx_daily_logs_customer_date" ON "public"."daily_logs" USING "btree" ("customer_id", "date");



CREATE INDEX "idx_payments_bill_id" ON "public"."payments" USING "btree" ("bill_id");



CREATE INDEX "idx_subscriptions_customer" ON "public"."subscriptions" USING "btree" ("customer_id");



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


ALTER TABLE "public"."pause_periods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "strict_auth_only_adjustments" ON "public"."adjustments" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "strict_auth_only_bills" ON "public"."bills" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "strict_auth_only_credit_notes" ON "public"."credit_notes" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "strict_auth_only_customers" ON "public"."customers" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "strict_auth_only_daily_logs" ON "public"."daily_logs" TO "authenticated" USING (true) WITH CHECK (true);



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



CREATE POLICY "strict_auth_only_milk_brands" ON "public"."milk_brands" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "strict_auth_only_milk_imports" ON "public"."milk_imports" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "strict_auth_only_pause_periods" ON "public"."pause_periods" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "strict_auth_only_payments" ON "public"."payments" TO "authenticated" USING (true) WITH CHECK (true);



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



CREATE POLICY "strict_auth_only_settings" ON "public"."settings" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "strict_auth_only_subscriptions" ON "public"."subscriptions" TO "authenticated" USING (true) WITH CHECK (true);



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



GRANT ALL ON FUNCTION "public"."apply_adjustment_rpc"("p_adjustment_id" "uuid", "p_bill_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_adjustment_rpc"("p_adjustment_id" "uuid", "p_bill_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_adjustment_rpc"("p_adjustment_id" "uuid", "p_bill_id" "uuid", "p_version" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."apply_adjustment_rpc"("p_adjustment_id" "uuid", "p_bill_id" "uuid", "p_version" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_adjustment_rpc"("p_adjustment_id" "uuid", "p_bill_id" "uuid", "p_version" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_month_bill_rpc"("p_customer_id" "uuid", "p_month" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_month_bill_rpc"("p_customer_id" "uuid", "p_month" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_operator"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_operator"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_operator"() TO "service_role";



GRANT ALL ON FUNCTION "public"."record_payment"("p_bill_id" "uuid", "p_amount" numeric, "p_mode" "text", "p_date" "date", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_payment"("p_bill_id" "uuid", "p_amount" numeric, "p_mode" "text", "p_date" "date", "p_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_payment_rpc"("p_bill_id" "uuid", "p_amount" numeric, "p_mode" "text", "p_note" "text", "p_idempotency_key" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_payment_rpc"("p_bill_id" "uuid", "p_amount" numeric, "p_mode" "text", "p_note" "text", "p_idempotency_key" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_payment_rpc"("p_bill_id" "uuid", "p_amount" numeric, "p_mode" "text", "p_date" "date", "p_note" "text", "p_idempotency_key" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."record_payment_rpc"("p_bill_id" "uuid", "p_amount" numeric, "p_mode" "text", "p_date" "date", "p_note" "text", "p_idempotency_key" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_payment_rpc"("p_bill_id" "uuid", "p_amount" numeric, "p_mode" "text", "p_date" "date", "p_note" "text", "p_idempotency_key" "uuid") TO "service_role";



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
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







