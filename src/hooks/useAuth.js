// src/hooks/useAuth.js
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const logout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    sessionStorage.removeItem("token");
    localStorage.removeItem("token");
  };

  // 1. Initial Session Check & Auth State Listener
  useEffect(() => {
    const checkSession = async () => {
      try {
        // ✅ FIX: Wrapped in try/catch/finally to prevent infinite loading on rejection
        const { data: { session: s }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        setSession(s);
      } catch (err) {
        console.error("Failed to get initial session:", err);
        setSession(null); // Clear session on error
      } finally {
        setLoading(false); // ✅ GUARANTEED to run, preventing infinite loading
      }
    };

    checkSession();

    // 2. Listen for Supabase auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (_event === 'SIGNED_OUT') {
        window.dispatchEvent(new CustomEvent("auth:expired"));
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 3. Listen for the custom auth:expired event dispatched by api.js
  // ✅ FIX: Moved to its own useEffect (was incorrectly nested inside the one above)
  useEffect(() => {
    const handleAuthExpired = () => {
      console.warn("Auth expired event received, logging out...");
      logout(); // ✅ FIX: Actually call the logout function to clear state and redirect
    };

    window.addEventListener('auth:expired', handleAuthExpired);

    return () => {
      window.removeEventListener('auth:expired', handleAuthExpired);
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
        email: 'operator@milk.local',
        password: cleanPin,
      });
      if (authError) throw new Error(authError.message || 'Invalid PIN');
      // Session will be set by onAuthStateChange listener above
    } catch (err) {
      setError(err.message || "Login failed");
      setLoading(false); // ✅ FIX: Ensure loading is false on login error
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