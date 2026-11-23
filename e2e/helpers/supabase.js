// e2e/helpers/supabase.js
//
// E2E-only Supabase client factory. Reads env from .env (file format) so the
// tests do NOT depend on Vite's import.meta.env (Vite only injects that into
// bundled app code, not test files). Falls back to the committed project's
// known values when unset — keeps parity with src/lib/supabaseClient.js.
//
// This file is imported only by tests under ./e2e/. It does NOT live under
// src/ and does NOT modify app behavior (per the user's isolation rule).

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { operatorEmail } from "../_operator.mjs";

function readDotEnv() {
  try {
    const text = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    const out = {};
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
    return out;
  } catch {
    return {};
  }
}

const env = { ...readDotEnv(), ...process.env };

export const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY =
  env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "e2e helpers: SUPABASE_URL / SUPABASE_ANON_KEY missing. Set them in " +
      ".env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) or as env vars.",
  );
}

// Per AGENTS.md the confirmed operator account is the Supabase Auth user that
// owns the data. Login is a 6-digit PIN used as that account's password.
// FIX (2026-11-21 audit — AI-S M7): the email is no longer hardcoded here —
// it resolves through e2e/_operator.mjs (AGENTS §9: one canonical source).
export const OPERATOR_EMAIL = operatorEmail(env.E2E_OPERATOR_EMAIL);
export const OPERATOR_PIN = env.E2E_OPERATOR_PIN || "";

if (!OPERATOR_PIN) {
  // Don't throw eagerly — some tests don't need login (e.g. db-connection).
  // The login helper will throw with a clear message when actually used.
  console.warn(
    "[e2e] E2E_OPERATOR_PIN not set — login-requiring tests will be skipped. " +
      "Set it in .env (E2E_OPERATOR_PIN=....) to enable those tests.",
  );
}

// FIX (2026-11-22): this host's connection to Supabase drops requests
// intermittently ("fetch failed") — observed in live runs and during the
// audits. Sign-in is retried with a short backoff so one dropped fetch
// doesn't fail an otherwise-green suite. The PIN is never logged.
async function signInWithRetry(client, { attempts = 3 } = {}) {
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    const { error } = await client.auth.signInWithPassword({
      email: OPERATOR_EMAIL,
      password: OPERATOR_PIN,
    });
    if (!error) return;
    lastError = error;
    // Auth rejections (wrong PIN) are definitive — retrying cannot help.
    const isNetwork =
      /fetch failed|failed to fetch|network/i.test(error.message || "") ||
      error.name === "AuthRetryableFetchError";
    if (!isNetwork) break;
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
  }
  throw new Error(`Operator login failed: ${lastError?.message || "unknown"}`);
}

// Build a Supabase client. Pass `withSession: true` to also run
// signInWithPassword so the client carries an authenticated session — needed
// to exercise the operator-only RLS policies (schema.sql:941+ all four verbs
// gate on `is_operator()`).
export async function makeSupabase({ withSession = false } = {}) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (withSession) {
    if (!OPERATOR_PIN) {
      throw new Error(
        "makeSupabase({withSession:true}): E2E_OPERATOR_PIN is not set.",
      );
    }
    await signInWithRetry(supabase);
  }
  return supabase;
}

// Marker used by all e2e-created rows so the cleanup sweep can delete only
// test data — never the operator's real customers/bills.
export const E2E_MARKER = "__e2e__";
export const e2eName = (label) => `${E2E_MARKER} ${label} ${Date.now()}`;
