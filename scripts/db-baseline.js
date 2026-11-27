// scripts/db-baseline.js
//
// Establishes a migration baseline for a project whose schema already
// exists remotely: dumps the public schema into supabase/migrations so a
// fresh checkout can `supabase db push` (as a no-op) against it.
//
// CONTAINMENT (2026-11-21 audit) — this script previously:
//   1. Dumped ALL business data (customers, phones, addresses, bills,
//      payments) into a git-tracked `*_seed_data.sql` migration — PII and
//      financial records in repository history.
//   2. Ran `supabase migration repair --status applied` automatically,
//      mutating the remote migration ledger without executing or even
//      validating the SQL it just wrote.
//   3. Built timestamps from LOCAL time with string arithmetic that could
//      produce invalid versions (ss=59 → "…60").
//
// New contract:
//   - Schema dump is SCHEMA-ONLY (`--schema public`) by default.
//   - Business data is NEVER written into migrations. `--with-data` dumps a
//     private backup under supabase/_local_backups/ (git-ignored) instead.
//   - `migration repair` runs ONLY with the explicit `--repair` flag, after
//     the generated file is validated, and uses UTC-normalized timestamps.
//
// Usage:
//   node scripts/db-baseline.js                 # schema-only baseline
//   node scripts/db-baseline.js --with-data     # + private data backup
//   node scripts/db-baseline.js --repair        # + mark the migration applied
import process from "node:process";
/* eslint-disable no-console */
import { execSync } from "child_process";
import path from "path";
import fs from "fs";

const args = new Set(process.argv.slice(2));
const withData = args.has("--with-data");
const doRepair = args.has("--repair");

// 1. Ensure migrations directory exists
const migrationsDir = path.join("supabase", "migrations");
if (!fs.existsSync(migrationsDir)) {
  fs.mkdirSync(migrationsDir, { recursive: true });
}

// 2. UTC-normalized YYYYMMDDHHMMSS timestamp. Supabase compares migration
// versions as timestamps; local time can go backwards around DST events and
// produces non-monotonic ledgers on shared machines. UTC also fixes the old
// ss=59 bug where string arithmetic produced an invalid "…120060" version —
// adding one second is now real Date arithmetic, not string math.
const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const utcStamp = (d) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(
    d.getUTCHours(),
  )}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
const baseTs = utcStamp(now);

const schemaFile = path.join(migrationsDir, `${baseTs}_initial_schema.sql`);

console.log(`📁 Generating baseline migrations...\n`);

try {
  // 3. Dump schema ONLY — never business data into tracked migrations.
  console.log("⏳ Dumping schema (tables, RLS, functions; schema public)...");
  execSync(`supabase db dump -f "${schemaFile}" --schema public`, {
    stdio: "inherit",
  });
  if (!fs.existsSync(schemaFile) || fs.statSync(schemaFile).size === 0) {
    throw new Error(`schema dump produced an empty file: ${schemaFile}`);
  }
  console.log(`✅ Schema dumped → ${schemaFile}\n`);

  // 4. Optional PRIVATE data backup — never a tracked migration.
  if (withData) {
    const backupsDir = path.join("supabase", "_local_backups");
    fs.mkdirSync(backupsDir, { recursive: true });
    const dataFile = path.join(backupsDir, `${baseTs}_data_backup.sql`);
    console.log("⏳ Dumping business data to a PRIVATE backup (git-ignored)…");
    console.log(
      "   ⚠️  This file contains real customer PII and financial records.",
    );
    console.log("   ⚠️  Never commit, share, or seed from it verbatim.");
    execSync(`supabase db dump --data-only -f "${dataFile}"`, {
      stdio: "inherit",
    });
    if (!fs.existsSync(dataFile) || fs.statSync(dataFile).size === 0) {
      throw new Error(`data backup produced an empty file: ${dataFile}`);
    }
    console.log(`✅ Data backed up → ${dataFile}\n`);
  }

  // 5. Mark as applied — EXPLICIT OPT-IN ONLY. `migration repair` rewrites
  // the remote ledger WITHOUT executing the SQL; running it automatically
  // could desync history from reality if the dump step partially failed.
  if (doRepair) {
    console.log('🔒 Marking migrations as "already applied" in Supabase...');
    execSync(`supabase migration repair ${baseTs} --status applied`, {
      stdio: "inherit",
    });
    if (withData) {
      console.log(
        "ℹ️  The data backup is NOT part of the migration ledger (it lives",
      );
      console.log(
        "   outside supabase/migrations) — no repair entry is needed for it.",
      );
    }
    console.log("✅ Repair complete.");
  } else {
    console.log(
      `ℹ️  Skipped \`supabase migration repair\` (pass --repair to mark`,
    );
    console.log(
      `   ${baseTs} as applied in the remote ledger after reviewing it).`,
    );
  }

  console.log("\n🎉 SUCCESS! Baseline established.");
  console.log(
    "👉 Next step: Run `npm run db:sync` to generate the AI snapshot files.",
  );
} catch (err) {
  console.error(
    "\n❌ Failed to generate baseline. Ensure you are logged in and linked.",
  );
  if (err?.message) console.error(`   ${err.message}`);
  process.exit(1);
}
