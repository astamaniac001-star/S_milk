// src/hooks/useAuth.js
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

// MIGRATION: Replaced the fake sessionStorage-based token with real Supabase
// Auth (signInWithPassword). The operator's Supabase user must be pre-created
// via Dashboard → Authentication → Users with email `operator@milk.local` and
// the 6-digit PIN as the password.
//
// The hook now returns `session` (the full Supabase session object) instead of
// a plain `token` string. Downstream code that used `auth.token` as a truthy
// gate (e.g. useEntityStore) should use `auth.session` or `auth.isAuthenticated`.

export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Hydrate from existing Supabase session (persisted in localStorage by
    // @supabase/supabase-js — this replaces the old sessionStorage approach).
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (_event === 'SIGNED_OUT') {
        window.dispatchEvent(new CustomEvent("auth:expired"));
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (pin) => {
    setLoading(true);
    setError(null);
    try {
      // Enforce 6-digit PIN (same validation the old hook had)
      const cleanPin = String(pin || "").replace(/\D/g, "");
      if (cleanPin.length !== 6) {
        throw new Error("PIN must be exactly 6 digits.");
      }

      // Map the PIN to the Supabase Auth password for the operator account
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: 'operator@milk.local',
        password: cleanPin,
      });
      if (authError) throw new Error(authError.message || 'Invalid PIN');
      // Session will be set by onAuthStateChange listener above
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setSession(null);

    // Clean up any legacy sessionStorage tokens from the old auth system
    sessionStorage.removeItem("token");
    localStorage.removeItem("token");
  };

  return {
    session,
    token: session?.access_token ?? null,
    login,
    logout,
    loading,
    error,
    isAuthenticated: !!session,
  };
}
