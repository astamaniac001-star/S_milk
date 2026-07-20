// scripts/db-baseline.js
import process from 'node:process';
/* eslint-disable no-console */
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

// 1. Ensure migrations directory exists
const migrationsDir = path.join('supabase', 'migrations');
if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
}

// 2. Generate strict YYYYMMDDHHMMSS timestamp
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const baseTs = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

// 3. Add 1 second for the data file to prevent Supabase timestamp collision
let dataSeconds = Number(baseTs.slice(12, 14)) + 1;
const dataTs = dataSeconds < 60
    ? baseTs.slice(0, 12) + pad(dataSeconds)
    : `${Number(baseTs) + 1}`;

const schemaFile = path.join(migrationsDir, `${baseTs}_initial_schema.sql`);
const dataFile = path.join(migrationsDir, `${dataTs}_seed_data.sql`);

console.log(`📁 Generating baseline migrations...\n`);

try {
    // 4. Dump Schema
    console.log('⏳ Dumping schema (tables, RLS, functions)...');
    execSync(`supabase db dump -f "${schemaFile}"`, { stdio: 'inherit' });
    console.log('✅ Schema dumped.\n');

    // 5. Dump Data
    console.log('⏳ Dumping data (settings, PIN hash)...');
    execSync(`supabase db dump --data-only -f "${dataFile}"`, { stdio: 'inherit' });
    console.log('✅ Data dumped.\n');

    // 6. Mark as Applied (The "Trust Me" Ledger Checkmark)
    console.log('🔒 Marking migrations as "already applied" in Supabase...');
    execSync(`supabase migration repair ${baseTs} --status applied`, { stdio: 'inherit' });
    execSync(`supabase migration repair ${dataTs} --status applied`, { stdio: 'inherit' });

    console.log('\n🎉 SUCCESS! Baseline established.');
    console.log('👉 Next step: Run `npm run db:sync` to generate the AI snapshot files.');

} catch {
    console.error('\n❌ Failed to generate baseline. Ensure you are logged in and linked.');
    process.exit(1);
}