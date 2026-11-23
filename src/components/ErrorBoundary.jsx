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
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          background: "#f8fafc",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: 420,
            background: "#fff",
            borderRadius: 16,
            padding: 24,
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 8 }}>⚠️</div>
          <h2 style={{ margin: "0 0 8px", color: "#991b1b", fontSize: 18 }}>
            Something went wrong
          </h2>
          <p
            style={{
              color: "#6b7280",
              fontSize: 13,
              margin: "0 0 16px",
              lineHeight: 1.5,
            }}
          >
            The app hit an unexpected error. Your data is safe — reloading
            usually fixes this. If it keeps happening, sign out and back in.
          </p>

          <div
            style={{
              background: "#fef2f2",
              border: "0.5px solid #fecaca",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 11,
              color: "#7f1d1d",
              fontFamily: "monospace",
              textAlign: "left",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: 120,
              overflowY: "auto",
              marginBottom: 16,
            }}
          >
            {String(error?.message || error || "Unknown error")}
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
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
