-- Fix: record_ad_hoc_log_rpc failed to accumulate onto brandless (NULL
-- brand_id) daily_logs rows — it inserted a duplicate row instead.
--
-- Root cause: plpgsql `v_existing IS NOT NULL` on a record uses PostgreSQL's
-- ROW-WISE comparison semantics: `row IS NOT NULL` is only TRUE when EVERY
-- field is non-null. A daily_logs row matched by the lock has brand_id NULL
-- (and possibly a NULL note), so the guard was false even though
-- `SELECT * INTO v_existing` had actually found the row (v_existing.id was
-- populated — verified by direct SQL debugging). Branded rows happened to
-- have all fields non-null, which is why brand-aware accumulation worked.
-- This is also a latent bug in the pre-brand version for any row with a
-- NULL field.
--
-- Fix: use plpgsql's implicit FOUND (TRUE when SELECT INTO assigned a row)
-- — the canonical existence check for SELECT INTO.
--
-- Same signature: CREATE OR REPLACE (grants persist; no overload created).

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

  -- FOUND is TRUE iff the SELECT INTO assigned a row. Do NOT use
  -- `v_existing IS NOT NULL` — row-wise IS NOT NULL is false when ANY field
  -- is NULL (brand_id/note are nullable), which silently diverted every
  -- brandless extra delivery onto a duplicate row.
  IF FOUND THEN
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
