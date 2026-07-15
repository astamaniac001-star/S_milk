// ── ErrorBoundary.jsx ─────────────────────────────────────────────────────────
// Catches any uncaught render error anywhere in the tree below and shows a
// recovery screen instead of a blank white page. The whole point is to make
// a single broken component obvious + recoverable without losing the app shell.
//
// Behavior:
//   - Logs full error info to console (browser console — the only place a
//     PWA has without a backend collector).
//   - Shows a "Reload" button which clears hash + reloads the page.
//   - If the user clicks "Sign out & reload", clears the token from BOTH
//     storages (useAuth now uses sessionStorage; legacy tokens may still
//     sit in localStorage from older builds — flush them on sign-out).
//
// Place it as the OUTERMOST component around <App/> in main.jsx so all
// child renders are protected.

import { Component } from "react";
import { Btn } from "./ui.jsx";

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

  handleSignOut = () => {
    try {
      // Flush both stores — current build uses sessionStorage, but legacy
      // tokens from before the migration may still live in localStorage.
      // (sessionSecret was removed in the 2026-07-15 audit; it was never
      // generated server-side and never validated, just dead bookkeeping.)
      sessionStorage.removeItem("token");
      localStorage.removeItem("token");
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
