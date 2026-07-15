// src/hooks/useAuth.js
import { useState, useEffect, useCallback } from "react";
import { callApi } from "../lib/api.js";

// SECURITY: tokens live in sessionStorage (not localStorage) so a stolen
// session is bounded to a single tab + its reloads. localStorage would
// persist across tabs and across site close, giving any XSS payload a much
// longer window to exfiltrate the token.
//
// Trade-off: opening the app in a second tab requires re-auth. That's the
// intended security posture for an internal admin tool.
//
// NOTE: a previous build also kept a `sessionSecret` here. It was never
// generated server-side, never validated, and never read by any code path —
// just bookkeeping noise. Removed in the 2026-07-15 audit.
const STORE = sessionStorage;
const TOKEN_KEY = "token";

export function useAuth() {
  const [token, setToken] = useState(STORE.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const login = async (pin) => {
    setLoading(true);
    setError(null);
    try {
      const data = await callApi("verifyPIN", { pin });

      // 🛡️ Defensive guard: prevent writing "undefined" to storage if backend misbehaves
      if (data.token) STORE.setItem(TOKEN_KEY, data.token);

      setToken(data.token ?? null);
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  // Wrap in useCallback so the event listener doesn't constantly re-bind
  const logout = useCallback(() => {
    STORE.removeItem(TOKEN_KEY);

    // Clear localStorage too, just in case legacy tokens exist from older versions
    localStorage.removeItem(TOKEN_KEY);

    setToken(null);
  }, []);

  // 🚀 Listen for graceful session expiry dispatched by src/lib/api.js
  useEffect(() => {
    const handleAuthExpired = () => {
      console.warn("Session expired or unauthorized. Logging out gracefully.");
      logout();
    };

    window.addEventListener("auth:expired", handleAuthExpired);

    return () => {
      window.removeEventListener("auth:expired", handleAuthExpired);
    };
  }, [logout]);

  return {
    token,
    login,
    logout,
    loading,
    error,
    isAuthenticated: !!token,
  };
}
