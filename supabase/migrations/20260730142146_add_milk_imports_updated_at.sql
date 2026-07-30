-- Migration: add_milk_imports_updated_at
-- The confirm_milk_import_rpc and delete_milk_import_rpc both update
-- `updated_at = now()` on the `milk_imports` row to bump the OCC version
-- consistently with other versioned tables. But milk_imports was missing
-- the `updated_at` column (only `created_at` existed), so every confirm
-- RPC failed with `column "updated_at" of relation "milk_imports" does
-- not exist`, leaving the row stuck in `Draft` state.
--
-- Add the missing column with a sensible default so existing rows backfill
-- to their `created_at` value, and new confirm/delete operations can write.

ALTER TABLE "public"."milk_imports"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT "now"();

-- Backfill updated_at from created_at so older rows have a non-null value.
-- New rows (and every confirm/delete bump) will get `now()` via DEFAULT.
UPDATE "public"."milk_imports"
  SET "updated_at" = COALESCE("created_at", "now"())
  WHERE "updated_at" IS NULL;
