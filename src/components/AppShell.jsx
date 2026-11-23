import { useState, useEffect } from "react";
import {
  Home,
  Users,
  Repeat,
  Truck,
  Milk,
  Receipt,
  MoreHorizontal,
  LogOut,
  Wifi,
  Moon,
  Sun,
} from "lucide-react";

const TABS = [
  { id: "dashboard", icon: Home, label: "Home" },
  { id: "customers", icon: Users, label: "Customers" },
  { id: "subscriptions", icon: Repeat, label: "Subs" },
  { id: "delivery", icon: Truck, label: "Delivery" },
  { id: "imports", icon: Milk, label: "Imports" },
  { id: "billing", icon: Receipt, label: "Billing" },
  { id: "more", icon: MoreHorizontal, label: "More" },
];

const TAB_TITLES = {
  dashboard: "Dashboard",
  customers: "Customers",
  subscriptions: "Subscriptions",
  delivery: "Daily Delivery",
  imports: "Milk Imports",
  billing: "Billing",
  more: "More",
};

function TabButton({ tab, active, onSelect }) {
  const isActive = tab.id === active;
  const Icon = tab.icon;
  return (
    <button
      className={`nav-item ${isActive ? "active" : ""}`}
      onClick={() => onSelect(tab.id)}
    >
      <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
      <span>{tab.label}</span>
    </button>
  );
}

// FIX (2026-11-21 audit — AI-D P2-5): storage can be unavailable (private
// mode, disabled site data, WebView restrictions). The old unguarded
// accessors crashed the shell into the ErrorBoundary; degrade gracefully
// instead (dark-mode just won't persist). Mirrors public/apply-dark-mode.js.
const safeStorage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore — persistence is best-effort */
    }
  },
};

export function AppShell({
  tab,
  today,
  onTabChange,
  onLogout,
  loadErrors = [],
  onRefresh,
  children,
  footer,
}) {
  const [darkMode, setDarkMode] = useState(
    () => safeStorage.get("darkMode") === "true",
  );
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    safeStorage.set("darkMode", darkMode);
  }, [darkMode]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <div
      style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}
    >
      {loadErrors.length > 0 && (
        <div
          style={{
            background: "#fef2f2",
            color: "#dc2626",
            padding: "12px 24px",
            fontSize: 13,
            fontWeight: 500,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>⚠ Failed to load: {loadErrors.join(", ")}</span>
          <button
            onClick={onRefresh}
            style={{
              background: "none",
              border: "none",
              color: "#dc2626",
              fontWeight: 600,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Retry
          </button>
        </div>
      )}

      <header className="app-header">
        <div>
          <h1>Milk Delivery Admin</h1>
          <h2>{TAB_TITLES[tab]}</h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 500,
              color: "var(--text-secondary)",
              background: "var(--bg-muted)",
              border: "1px solid var(--border-color)",
              borderRadius: 999,
              padding: "6px 12px",
            }}
            title="Today's date"
          >
            <Wifi size={13} color="var(--success-solid, #059669)" />
            <span>{today}</span>
          </div>
          <button
            onClick={() => setDarkMode(!darkMode)}
            style={{
              background: "none",
              border: "1px solid var(--border-color)",
              borderRadius: 999,
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: 10,
              display: "flex",
              alignItems: "center",
            }}
            title="Toggle Dark Mode"
            aria-label="Toggle dark mode"
          >
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          {onLogout && (
            <button
              onClick={onLogout}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "none",
                border: "1px solid var(--border-color)",
                borderRadius: 999,
                color: "var(--text-secondary)",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                padding: "0 14px",
              }}
              title="Sign out"
            >
              <LogOut size={14} /> Sign out
            </button>
          )}
        </div>
      </header>
      {!isOnline && (
        <div
          style={{
            background: "var(--warning-bg, #fef9c3)",
            color: "var(--warning-text, #854d0e)",
            padding: "8px 16px",
            textAlign: "center",
            fontSize: 13,
            fontWeight: 600,
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          📡 You are offline. Data may be stale.
        </div>
      )}
      <main
        style={{
          flex: 1,
          padding: "24px 20px",
          maxWidth: 1024,
          margin: "0 auto",
          width: "100%",
          paddingBottom: 128 /* clearance for the floating pill nav */,
        }}
      >
        {children}
      </main>

      {footer}

      <nav className="bottom-nav">
        {TABS.map((t) => (
          <TabButton key={t.id} tab={t} active={tab} onSelect={onTabChange} />
        ))}
      </nav>
    </div>
  );
}
