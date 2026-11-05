-- NULL-safe uniqueness for brandless (legacy) daily_logs rows.
--
-- The plain UNIQUE constraint (customer_id, date, brand_id, product) treats
-- NULL brand_id values as distinct, so two brandless rows for the same
-- (customer, date, product) could coexist and would be counted twice by
-- generate_month_bill_rpc (silent double-billing).
--
-- The plain constraint stays because PostgREST's onConflict inference needs
-- plain columns; this expression index adds the missing NULL coverage, so a
-- duplicate brandless row is rejected by the database instead of being
-- silently inserted.
--
-- Live data was checked before creating the index: 0 duplicate brandless
-- (customer_id, date, product) keys.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_daily_logs_cust_date_brand_product_nullsafe
  ON daily_logs (
    customer_id,
    date,
    COALESCE(brand_id, '00000000-0000-0000-0000-000000000000'::uuid),
    product
  );
