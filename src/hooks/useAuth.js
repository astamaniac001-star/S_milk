// src/hooks/useAuth.js
import { useState, useEffect } from "react";
import { supabase, configError } from "../lib/supabaseClient";
import { OPERATOR_EMAIL } from "../lib/constants.js";

export function useAuth() {
  const [session, setSession] = useState(null);
  // No client means nothing to load — surface configError immediately.
  const [loading, setLoading] = useState(!!supabase);
  const [error, setError] = useState(configError ? configError.message : null);

  const logout = async () => {
    setSession(null);
    sessionStorage.removeItem("token");
    localStorage.removeItem("token");
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch {
        // Ignore sign-out errors if session was already invalid/revoked
      }
    }
  };

  // 1. Initial Session Check & Auth State Listener
  useEffect(() => {
    if (!supabase) return; // Missing env — configError already surfaced via state.
    const checkSession = async () => {
      try {
        // Validate the persisted JWT against the server. `getSession()` only
        // reads the token from localStorage without verifying it, so an
        // expired/revoked session would still render the dashboard then 401
        // on every API call. `getUser()` makes a network round-trip and
        // rejects an invalid token. We then re-read the (now-confirmed)
        // session to obtain a fresh access_token for callApi().
        const {
          data: { user: _user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError) throw userError;
        void _user; // presence of a valid user is the gate; we read the token from getSession below.
        const { data: sessionData, error: sessionError } =
          await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        setSession(sessionData?.session ?? null);
      } catch (err) {
        if (err?.name === "AuthSessionMissingError") {
          // Expected on first load / cold start — there is no persisted
          // session. Silently treat as unauthenticated.
        } else {
          console.error("Failed to get initial session:", err);
        }
        setSession(null);
      } finally {
        setLoading(false); // ✅ GUARANTEED to run, preventing infinite loading
      }
    };

    checkSession();

    // 2. Listen for Supabase auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 3. Listen for the custom auth:expired event dispatched by api.js
  useEffect(() => {
    let loggingOut = false;
    const handleAuthExpired = async () => {
      if (loggingOut) return;
      loggingOut = true;
      console.warn("Auth expired event received, logging out...");
      try {
        await logout();
      } finally {
        loggingOut = false;
      }
    };

    window.addEventListener("auth:expired", handleAuthExpired);

    return () => {
      window.removeEventListener("auth:expired", handleAuthExpired);
    };
  }, []);

  const login = async (pin) => {
    setLoading(true);
    setError(null);
    try {
      const cleanPin = String(pin || "").replace(/\D/g, "");
      if (cleanPin.length !== 6) {
        throw new Error("PIN must be exactly 6 digits.");
      }

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: OPERATOR_EMAIL,
        password: cleanPin,
      });
      if (authError) throw new Error(authError.message || "Invalid PIN");
      // Session will be set by onAuthStateChange listener above
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      // Must run on success too — onAuthStateChange sets the session but
      // never touches `loading`, so without this the app hangs on a spinner
      // after a correct PIN.
      setLoading(false);
    }
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
