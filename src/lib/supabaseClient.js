import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let _configError = null;
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase environment variables. Check .env file.");
  _configError = new Error(
    "App configuration error: Missing database credentials.",
  );
}

// FIX (audit #2): throwing synchronously at module-eval time happens BEFORE
// React mounts, so <ErrorBoundary/> cannot catch it — the operator gets a
// White Screen of Death with no UI. Lazily construct the client instead.
// Consumers must null-check `supabase`; useAuth surfaces `_configError` as
// the auth error, which the login UI renders via role="alert".
export const configError = _configError;
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
        },
      })
    : null;
