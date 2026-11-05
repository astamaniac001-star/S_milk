-- Brand-aware subscriptions (2026-11-02)
--
-- Business model: a subscription is (customer, brand, milk_type, qty, days).
-- Every brand carries its own price per milk type, and a customer may hold
-- several active subscriptions — same type from different brands included.
--
-- 1. brand_rates table — per-brand, per-milk-type selling rate.
-- 2. subscriptions.brand_id + daily_logs.brand_id, with best-effort backfills
--    (the backfilled brand matches what the legacy billing heuristic assumed).
-- 3. Uniqueness: one active sub per (customer, brand, milk_type); daily log
--    identity becomes (customer, date, brand, product).
-- 4. generate_month_bill_rpc — brand-aware pricing via brand_rates; legacy
--    default_milk_type heuristic kept only for unbranded (NULL brand) rows.
-- 5. record_ad_hoc_log_rpc — new signature with p_brand_id (old signature
--    dropped per AGENTS §15 to avoid an overload).
-- 6. save_brand_rpc — atomic brand + rates save (insert or edit) so a brand
--    can never end up half-written relative to its rates.

-- ─────────────────────────── 1. brand_rates ───────────────────────────

CREATE TABLE IF NOT EXISTS "public"."brand_rates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "uuid" NOT NULL,
    "milk_type" "text" NOT NULL,
    "rate_per_liter" numeric NOT NULL DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "brand_rates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "brand_rates_brand_id_fkey" FOREIGN KEY ("brand_id")
        REFERENCES "public"."milk_brands"("id") ON DELETE CASCADE,
    CONSTRAINT "brand_rates_brand_type_unique" UNIQUE ("brand_id", "milk_type"),
    CONSTRAINT "chk_brand_rates_rate_nonneg" CHECK (("rate_per_liter" >= (0)::numeric))
);

ALTER TABLE "public"."brand_rates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."brand_rates" FORCE ROW LEVEL SECURITY;

CREATE POLICY "strict_auth_only_select" ON "public"."brand_rates"
    FOR SELECT USING ("public"."is_operator"());
CREATE POLICY "strict_auth_only_insert" ON "public"."brand_rates"
    FOR INSERT WITH CHECK ("public"."is_operator"());
CREATE POLICY "strict_auth_only_update" ON "public"."brand_rates"
    FOR UPDATE USING ("public"."is_operator"()) WITH CHECK ("public"."is_operator"());
CREATE POLICY "strict_auth_only_delete" ON "public"."brand_rates"
    FOR DELETE USING ("public"."is_operator"());

-- Defensive: DEFAULT PRIVILEGES for role postgres grant ALL on new tables to
-- anon (see AGENTS.md). Revoke before the explicit grants below.
REVOKE ALL ON TABLE "public"."brand_rates" FROM "anon";
GRANT ALL ON TABLE "public"."brand_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."brand_rates" TO "service_role";

-- Seed: one rate row per existing brand on its default type, preserving the
-- rate the legacy heuristic was using.
INSERT INTO "public"."brand_rates" ("brand_id", "milk_type", "rate_per_liter")
SELECT mb."id", mb."default_milk_type", COALESCE(mb."rate_per_liter", 0)
FROM "public"."milk_brands" mb
WHERE mb."default_milk_type" IS NOT NULL AND mb."default_milk_type" <> ''
ON CONFLICT ("brand_id", "milk_type") DO NOTHING;

-- ────────────────────── 2. subscriptions.brand_id ──────────────────────

ALTER TABLE "public"."subscriptions" ADD COLUMN IF NOT EXISTS "brand_id" "uuid";
ALTER TABLE "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_brand_id_fkey" FOREIGN KEY ("brand_id")
        REFERENCES "public"."milk_brands"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "idx_subscriptions_brand_id"
    ON "public"."subscriptions" USING "btree" ("brand_id");

-- Backfill: pick the most recent Active brand matching each sub's milk_type —
-- exactly the brand the legacy billing heuristic resolved for pricing.
UPDATE "public"."subscriptions" s
SET "brand_id" = b.id
FROM (
    SELECT DISTINCT ON ("default_milk_type") "id", "default_milk_type"
    FROM "public"."milk_brands"
    WHERE "default_milk_type" IS NOT NULL AND "default_milk_type" <> ''
      AND "status" = 'Active'
    ORDER BY "default_milk_type", "created_at" DESC
) b
WHERE b."default_milk_type" = s."milk_type" AND s."brand_id" IS NULL;

-- One active subscription per (customer, brand, milk_type). COALESCE keeps
-- the old guarantee even for brandless legacy rows. No upsert targets this
-- index, so an expression index is safe (plain inserts surface 23505).
DROP INDEX IF EXISTS "public"."uniq_sub_customer_type_active";
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_sub_customer_brand_type_active"
    ON "public"."subscriptions"
    USING "btree" ("customer_id", COALESCE("brand_id", '00000000-0000-0000-0000-000000000000'::uuid), "milk_type")
    WHERE "is_active";

-- ─────────────────────── 3. daily_logs.brand_id ───────────────────────

ALTER TABLE "public"."daily_logs" ADD COLUMN IF NOT EXISTS "brand_id" "uuid";
ALTER TABLE "public"."daily_logs"
    ADD CONSTRAINT "daily_logs_brand_id_fkey" FOREIGN KEY ("brand_id")
        REFERENCES "public"."milk_brands"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "idx_daily_logs_brand_id"
    ON "public"."daily_logs" USING "btree" ("brand_id");

-- Row identity gains the brand: two brands of the same milk type on the same
-- day must be two rows to bill correctly. Plain columns only — PostgREST
-- upsert onConflict must be able to infer this index.
ALTER TABLE "public"."daily_logs" DROP CONSTRAINT IF EXISTS "unique_customer_date_product";
ALTER TABLE "public"."daily_logs"
    ADD CONSTRAINT "unique_customer_date_brand_product"
    UNIQUE ("customer_id", "date", "brand_id", "product");

-- Best-effort backfill: resolve each historical log's brand from the
-- customer's subscription for that milk type (prefer active, then latest).
UPDATE "public"."daily_logs" dl
SET "brand_id" = s.brand_id
FROM (
    SELECT DISTINCT ON ("customer_id", "milk_type") "customer_id", "milk_type", "brand_id"
    FROM "public"."subscriptions"
    WHERE "brand_id" IS NOT NULL AND "milk_type" IS NOT NULL
    ORDER BY "customer_id", "milk_type", "is_active" DESC NULLS LAST, "updated_at" DESC NULLS LAST
) s
WHERE dl."customer_id" = s."customer_id"
  AND dl."product" = s."milk_type"
  AND dl."brand_id" IS NULL;

-- ───────────────── 4. generate_month_bill_rpc (brand-aware) ─────────────────

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
  v_brand_name text;
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

  -- Brand-aware pricing: each delivered (product, brand) pair is priced at
  -- that brand's rate for that milk type (brand_rates). Rows without a brand
  -- (legacy/unbranded) fall back to the legacy most-recent-Active-brand
  -- heuristic. A branded row with no rate fails loudly — silently pricing it
  -- with a different brand's rate is the exact bug this schema fixes.
  FOR v_line IN
    SELECT product, brand_id, SUM(qty) AS qty
    FROM daily_logs
    WHERE customer_id = p_customer_id
      AND date >= v_month_start
      AND date < v_month_end
      AND delivered = true
    GROUP BY product, brand_id
    ORDER BY product, brand_id
  LOOP
    v_rate := NULL;
    v_brand_name := NULL;

    IF v_line.brand_id IS NOT NULL THEN
      SELECT brand_name INTO v_brand_name
        FROM milk_brands WHERE id = v_line.brand_id;
      SELECT rate_per_liter INTO v_rate
        FROM brand_rates
        WHERE brand_id = v_line.brand_id AND milk_type = v_line.product;
    END IF;

    IF v_rate IS NULL AND v_line.brand_id IS NULL THEN
      SELECT rate_per_liter, brand_name INTO v_rate, v_brand_name
        FROM milk_brands
        WHERE default_milk_type = v_line.product AND status = 'Active'
        ORDER BY created_at DESC
        LIMIT 1;
    END IF;

    IF v_rate IS NULL THEN
      v_missing := v_missing
        || (CASE WHEN v_missing = '' THEN '' ELSE ', ' END)
        || v_line.product
        || COALESCE(' (brand: ' || v_brand_name || ')', '');
    ELSE
      v_amount := v_amount + (v_line.qty * v_rate);
    END IF;
  END LOOP;

  -- FAIL LOUDLY if any delivered (product, brand) has no rate (prevents
  -- silent ₹0 / wrong-rate bills). Zero delivered logs => zero-amount bill,
  -- no rate needed.
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
REVOKE ALL ON FUNCTION "public"."generate_month_bill_rpc"("p_customer_id" "uuid", "p_month" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_month_bill_rpc"("p_customer_id" "uuid", "p_month" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_month_bill_rpc"("p_customer_id" "uuid", "p_month" "text") TO "service_role";

-- ─────────── 5. record_ad_hoc_log_rpc (new signature with brand) ───────────

-- Drop the old 5-arg signature first — CREATE with a changed argument list
-- would otherwise create an overload (AGENTS §15).
DROP FUNCTION IF EXISTS "public"."record_ad_hoc_log_rpc"("p_customer_id" "uuid", "p_date" "date", "p_qty" numeric, "p_product" "text", "p_reason" "text");

CREATE OR REPLACE FUNCTION "public"."record_ad_hoc_log_rpc"("p_customer_id" "uuid", "p_date" "date", "p_qty" numeric, "p_product" "text", "p_brand_id" "uuid", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_existing record;
  v_note text := COALESCE(p_reason, '');
  v_display_note text;
  v_qty numeric := COALESCE(p_qty, 0);
  v_product text := COALESCE(NULLIF(p_product, ''), 'Full Cream');
  v_brand_id uuid := p_brand_id;
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

  -- Validate the brand when provided (fail loudly on an unknown brand_id).
  IF v_brand_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM milk_brands WHERE id = v_brand_id
  ) THEN
    RAISE EXCEPTION 'BAD_REQUEST: unknown brand';
  END IF;

  -- Human-readable note. Existing tests/UX expect "Extra: <reason>" or
  -- "Extra delivery" — keep that contract here so the UI shows identical text
  -- whether the log is created or accumulated.
  v_display_note := CASE
    WHEN v_note = '' THEN 'Extra delivery'
    ELSE 'Extra: ' || v_note
  END;

  -- Lock the existing row for THIS (customer, date, product, brand). Rows
  -- without a brand (NULL) only accumulate onto other NULL-brand rows —
  -- IS NOT DISTINCT FROM treats NULLs as equal for this lookup.
  SELECT * INTO v_existing
    FROM daily_logs
    WHERE customer_id = p_customer_id AND date = p_date AND product = v_product
      AND brand_id IS NOT DISTINCT FROM v_brand_id
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

  -- No existing row for this (product, brand). INSERT; the unique
  -- (customer_id, date, brand_id, product) constraint may raise
  -- unique_violation on a concurrent insert — let that propagate so the
  -- caller can retry.
  BEGIN
    INSERT INTO daily_logs (id, customer_id, date, product, brand_id, qty, delivered, note)
      VALUES (gen_random_uuid(), p_customer_id, p_date, v_product, v_brand_id, v_qty, true, v_display_note)
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
$_$;

ALTER FUNCTION "public"."record_ad_hoc_log_rpc"("p_customer_id" "uuid", "p_date" "date", "p_qty" numeric, "p_product" "text", "p_brand_id" "uuid", "p_reason" "text") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."record_ad_hoc_log_rpc"("p_customer_id" "uuid", "p_date" "date", "p_qty" numeric, "p_product" "text", "p_brand_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_ad_hoc_log_rpc"("p_customer_id" "uuid", "p_date" "date", "p_qty" numeric, "p_product" "text", "p_brand_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_ad_hoc_log_rpc"("p_customer_id" "uuid", "p_date" "date", "p_qty" numeric, "p_product" "text", "p_brand_id" "uuid", "p_reason" "text") TO "service_role";

-- ───────────────── 6. save_brand_rpc (atomic brand + rates) ─────────────────

CREATE OR REPLACE FUNCTION "public"."save_brand_rpc"("p_brand" "jsonb", "p_rates" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_brand_id uuid;
  v_name text;
  v_supplier text;
  v_phone text;
  v_status text;
  v_rate jsonb;
  v_type text;
  v_rate_val numeric;
  v_rate_count integer := 0;
  v_first_type text;
  v_first_rate numeric;
BEGIN
  IF NOT public.is_operator() THEN
    RAISE EXCEPTION 'Unauthorized: only the operator may save brands';
  END IF;

  v_name := NULLIF(TRIM(COALESCE(p_brand->>'brand_name', '')), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'BAD_REQUEST: brand_name is required';
  END IF;
  IF length(v_name) > 120 THEN
    RAISE EXCEPTION 'BAD_REQUEST: brand_name is too long';
  END IF;

  v_supplier := NULLIF(TRIM(COALESCE(p_brand->>'supplier_name', '')), '');
  v_phone := NULLIF(TRIM(COALESCE(p_brand->>'supplier_phone', '')), '');

  IF jsonb_typeof(p_rates) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'BAD_REQUEST: rates must be an array';
  END IF;
  IF jsonb_array_length(p_rates) = 0 THEN
    RAISE EXCEPTION 'BAD_REQUEST: at least one milk type rate is required';
  END IF;

  IF p_brand->>'id' IS NOT NULL AND p_brand->>'id' <> '' THEN
    -- Edit path: brand must exist; status is kept when not provided.
    v_brand_id := (p_brand->>'id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM milk_brands WHERE id = v_brand_id) THEN
      RAISE EXCEPTION 'Brand not found';
    END IF;
    v_status := COALESCE(
      NULLIF(TRIM(COALESCE(p_brand->>'status', '')), ''),
      (SELECT status FROM milk_brands WHERE id = v_brand_id),
      'Active'
    );
    UPDATE milk_brands
      SET brand_name = v_name,
          supplier_name = v_supplier,
          supplier_phone = v_phone,
          status = v_status
    WHERE id = v_brand_id;
  ELSE
    -- Insert path.
    v_status := COALESCE(NULLIF(TRIM(COALESCE(p_brand->>'status', '')), ''), 'Active');
    INSERT INTO milk_brands (id, brand_name, supplier_name, supplier_phone, status)
      VALUES (gen_random_uuid(), v_name, v_supplier, v_phone, v_status)
      RETURNING id INTO v_brand_id;
  END IF;

  -- Replace-all rate sync within the same transaction.
  DELETE FROM brand_rates WHERE brand_id = v_brand_id;

  FOR v_rate IN SELECT * FROM jsonb_array_elements(p_rates) LOOP
    v_type := NULLIF(TRIM(COALESCE(v_rate->>'milk_type', '')), '');
    v_rate_val := COALESCE(NULLIF(TRIM(COALESCE(v_rate->>'rate_per_liter', '')), ''), '0')::numeric;
    IF v_type IS NULL THEN
      RAISE EXCEPTION 'BAD_REQUEST: milk_type is required for every rate';
    END IF;
    IF v_rate_val < 0 THEN
      RAISE EXCEPTION 'BAD_REQUEST: rate cannot be negative';
    END IF;
    IF EXISTS (
      SELECT 1 FROM brand_rates WHERE brand_id = v_brand_id AND milk_type = v_type
    ) THEN
      RAISE EXCEPTION 'BAD_REQUEST: duplicate milk type: %', v_type;
    END IF;

    INSERT INTO brand_rates (brand_id, milk_type, rate_per_liter)
      VALUES (v_brand_id, v_type, v_rate_val);

    v_rate_count := v_rate_count + 1;
    IF v_first_type IS NULL THEN
      v_first_type := v_type;
      v_first_rate := v_rate_val;
    END IF;
  END LOOP;

  -- Keep the legacy milk_brands columns in sync with the first rate so the
  -- import prefill and the legacy pricing fallback keep working.
  UPDATE milk_brands
    SET default_milk_type = v_first_type,
        rate_per_liter = v_first_rate
  WHERE id = v_brand_id;

  RETURN jsonb_build_object('brandId', v_brand_id, 'rates', v_rate_count);
END;
$_$;

ALTER FUNCTION "public"."save_brand_rpc"("p_brand" "jsonb", "p_rates" "jsonb") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."save_brand_rpc"("p_brand" "jsonb", "p_rates" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_brand_rpc"("p_brand" "jsonb", "p_rates" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_brand_rpc"("p_brand" "jsonb", "p_rates" "jsonb") TO "service_role";
