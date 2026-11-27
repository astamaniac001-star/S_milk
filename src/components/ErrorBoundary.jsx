// ── ErrorBoundary.jsx ─────────────────────────────────────────────────────────
// Catches any uncaught render error anywhere in the tree below and shows a
// recovery screen instead of a blank white page. The whole point is to make
// a single broken component obvious + recoverable without losing the app shell.
//
// Behavior:
//   - Logs full error info to console (browser console — the only place a
//     PWA has without a backend collector).
//   - Shows a "Reload" button which clears hash + reloads the page.
//   - If the user clicks "Sign out & reload", performs a REAL Supabase
//     sign-out (best-effort) and flushes the legacy token from BOTH
//     storages plus any `sb-*` session keys, so the reload actually
//     lands on the login screen.
//
// Place it as the OUTERMOST component around <App/> in main.jsx so all
// child renders are protected.

import { Component } from "react";
import { AlertTriangle } from "lucide-react";
import { Btn } from "./ui.jsx";
import { supabase } from "../lib/supabaseClient.js";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    console.error(
      "[ErrorBoundary] Uncaught render error:",
      error,
      "\nComponent stack:",
      info?.componentStack || "",
    );
  }

  handleReload = () => {
    // sessionStorage token (if any) is preserved by default reload. We only
    // clear the hash so users land on the same dashboard tab they were on.
    window.location.hash = "";
    window.location.reload();
  };

  // FIX (2026-11-21 audit — AI-D P1-4): "Sign out & reload" previously only
  // removed the legacy `token` keys. The LIVE Supabase session persists
  // under `sb-<ref>-auth-token` in localStorage, so useAuth's getUser()
  // restored the session after reload and the operator stayed signed in —
  // on a shared device that is a real security defect, not cosmetics.
  handleSignOut = async () => {
    // Best-effort REAL sign-out (revokes the refresh token server-side).
    try {
      if (supabase) await supabase.auth.signOut();
    } catch {
      /* ignore — session may already be invalid; local flush still runs */
    }
    try {
      // Flush the legacy token from both storages (current build uses
      // sessionStorage; older builds left tokens in localStorage).
      sessionStorage.removeItem("token");
      localStorage.removeItem("token");
      // Belt & braces: any Supabase storage keys left behind (offline sign-
      // out failure, storage listener races) are flushed too.
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("sb-")) localStorage.removeItem(key);
      }
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  // fallow-ignore-next-line complexity
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="error-page">
        <div className="error-card">
          <div className="error-icon">
            <AlertTriangle size={22} aria-hidden="true" />
          </div>
          <h2>Something went wrong</h2>
          <p>
            The app hit an unexpected error. Your data is safe — reloading
            usually fixes this. If it keeps happening, sign out and back in.
          </p>

          <div className="error-detail">
            {String(error?.message || error || "Unknown error")}
          </div>

          <div className="error-actions">
            <Btn onClick={this.handleReload}>Reload</Btn>
            <Btn variant="secondary" onClick={this.handleSignOut}>
              Sign out & reload
            </Btn>
          </div>
        </div>
      </div>
    );
  }
}
