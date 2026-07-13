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
const STORE = sessionStorage;
const TOKEN_KEY = "token";
const SECRET_KEY = "sessionSecret";

export function useAuth() {
  const [token, setToken] = useState(STORE.getItem(TOKEN_KEY));
  const [sessionSecret, setSessionSecret] = useState(STORE.getItem(SECRET_KEY));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const login = async (pin) => {
    setLoading(true);
    setError(null);
    try {
      const data = await callApi("verifyPIN", { pin });
      
      // 🛡️ Defensive guard: prevent writing "undefined" to storage if backend misbehaves
      if (data.token) STORE.setItem(TOKEN_KEY, data.token);
      if (data.sessionSecret) STORE.setItem(SECRET_KEY, data.sessionSecret);
      
      setToken(data.token ?? null);
      setSessionSecret(data.sessionSecret ?? null);
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  // Wrap in useCallback so the event listener doesn't constantly re-bind
  const logout = useCallback(() => {
    STORE.removeItem(TOKEN_KEY);
    STORE.removeItem(SECRET_KEY);
    
    // Clear localStorage too, just in case legacy tokens exist from older versions
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SECRET_KEY);
    
    setToken(null);
    setSessionSecret(null);
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
    sessionSecret,
    login,
    logout,
    loading,
    error,
    isAuthenticated: !!token,
  };
}