// e2e/vitest/_client.mjs
//
// Shared helpers for throwaway e2e scratch scripts that need a live Supabase
// client authenticated as the operator. Used by _cleanup.mjs and _state.mjs.
// This file is itself ignored from fallow analysis (see .fallowignore).

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const DEFAULT_OPERATOR_EMAIL = "astamaniac001@gmail.com";

export function getEnv() {
  try {
    const text = readFileSync(".env", "utf8").split(/\r?\n/).reduce((a, l) => {
      const line = l.trim();
      if (!line || line.startsWith("#")) return a;
      const i = line.indexOf("=");
      if (i < 0) return a;
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      a[k] = v;
      return a;
    }, {});
    return { ...text, ...process.env };
  } catch {
    return { ...process.env };
  }
}

function getSupabaseClient(env) {
  return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}

export async function getOperatorClient() {
  const env = getEnv();
  const s = getSupabaseClient(env);
  const { error: authErr } = await s.auth.signInWithPassword({
    email: env.E2E_OPERATOR_EMAIL || DEFAULT_OPERATOR_EMAIL,
    password: env.E2E_OPERATOR_PIN,
  });
  if (authErr) {
    console.log("auth error:", authErr.message);
    process.exit(1);
  }
  return s;
}
