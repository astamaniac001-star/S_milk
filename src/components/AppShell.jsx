import { useState, useEffect, useRef } from "react";
import {
  Home,
  Users,
  Repeat,
  Truck,
  Milk,
  Receipt,
  MoreHorizontal,
  LogOut,
  CalendarDays,
  Moon,
  Sun,
  WifiOff,
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
      aria-current={isActive ? "page" : undefined}
    >
      <Icon size={20} strokeWidth={isActive ? 2.5 : 2} aria-hidden="true" />
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

// Redesign (2026-11): with no stored preference, follow the system theme.
// Once the operator toggles explicitly, their choice is stored and wins.
function systemPrefersDark() {
  try {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  } catch {
    return false;
  }
}

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
  const [darkMode, setDarkMode] = useState(() => {
    const stored = safeStorage.get("darkMode");
    return stored === null ? systemPrefersDark() : stored === "true";
  });
  // Only persist once the operator makes an explicit choice; the system
  // fallback must keep tracking the OS setting across visits.
  const prefTouched = useRef(safeStorage.get("darkMode") !== null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    if (prefTouched.current) {
      safeStorage.set("darkMode", darkMode);
    }
    // Keep the browser/PWA chrome in step with the in-app theme.
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute("content", darkMode ? "#111311" : "#f4f4f0");
    }
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

  const toggleTheme = () => {
    prefTouched.current = true;
    setDarkMode((d) => !d);
  };

  return (
    <div className="app-shell">
      {loadErrors.length > 0 && (
        <div className="load-banner" role="alert">
          <span>Failed to load: {loadErrors.join(", ")}</span>
          <button onClick={onRefresh}>Retry</button>
        </div>
      )}

      <div className="app-frame">
        {/*
          Single nav element, two layouts (CSS-driven):
          mobile → flat bottom bar · ≥1024px → fixed left rail.
          The `.bottom-nav` marker class is kept for existing e2e checks.
        */}
        <nav className="bottom-nav" aria-label="Primary">
          <div className="rail-brand" aria-hidden="true">
            <span className="brand-mark">
              <Milk size={16} strokeWidth={2.2} />
            </span>
            <span className="brand-word">S Milk</span>
          </div>
          <div className="rail-section" aria-hidden="true">
            Workspace
          </div>
          <div className="rail-tabs">
            {TABS.map((t) => (
              <TabButton
                key={t.id}
                tab={t}
                active={tab}
                onSelect={onTabChange}
              />
            ))}
          </div>
        </nav>

        <div className="app-column">
          <header className="app-header">
            <div>
              <h1>Milk Delivery Admin</h1>
              <h2>{TAB_TITLES[tab]}</h2>
            </div>
            <div className="header-actions">
              <span className="date-chip" title="Today's date">
                <CalendarDays size={13} aria-hidden="true" />
                <span>{today}</span>
              </span>
              <button
                onClick={toggleTheme}
                className="icon-btn square"
                title="Toggle Dark Mode"
                aria-label="Toggle dark mode"
              >
                {darkMode ? <Sun size={15} /> : <Moon size={15} />}
              </button>
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="icon-btn"
                  title="Sign out"
                  aria-label="Sign out"
                >
                  <LogOut size={14} aria-hidden="true" />
                  <span className="signout-label">Sign out</span>
                </button>
              )}
            </div>
          </header>

          {!isOnline && (
            <div className="offline-banner" role="status">
              <WifiOff size={13} aria-hidden="true" /> You are offline. Data may
              be stale.
            </div>
          )}

          <main className="app-content">{children}</main>

          {footer}
        </div>
      </div>
    </div>
  );
}
