import { useEffect } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { AppShell } from "./components/AppShell.jsx";
import { AppPage } from "./components/AppPage.jsx";
import { AppModals } from "./components/AppModals.jsx";
import Login from "./components/login.jsx";
import { useAuth } from "./hooks/useAuth.js";
import { useAppState } from "./hooks/useAppState.js";
import { useAppHandlers } from "./hooks/useAppHandlers.js";
import { Toast } from "./components/ui.jsx";

// NEW: Import the API and date utilities needed for auto-rollover
import { callApi } from "./lib/api.js";
import { getToday } from "./lib/utils.js";

// NEW: Custom hook to handle automatic monthly rollover
function useAutoMonthRollover(isAuthenticated) {
  useEffect(() => {
    if (!isAuthenticated) return;

    const currentMonth = getToday().substring(0, 7); // "YYYY-MM"
    const lastRollover = localStorage.getItem("last_rollover_month");

    // Only run if we haven't rolled over for this month yet
    if (lastRollover !== currentMonth) {
      console.warn(
        `[Auto-Rollover] Detected new month: ${currentMonth}. Triggering...`,
      );

      callApi("rolloverMonth", { targetMonth: currentMonth })
        .then((res) => {
          console.warn(
            `[Auto-Rollover] Success: ${res.data.billsGenerated} bills generated, ${res.data.renewed} subscriptions extended.`,
          );
          // Mark as done so it doesn't run again this month
          localStorage.setItem("last_rollover_month", currentMonth);
        })
        .catch((err) => {
          console.error("[Auto-Rollover] Failed:", err);
          // Intentionally DO NOT update localStorage on failure.
          // This ensures it will safely retry the next time the app is opened.
        });
    }
  }, [isAuthenticated]);
}

export default function App() {
  const auth = useAuth();

  // NEW: Trigger the auto-rollover check as soon as auth is established
  useAutoMonthRollover(auth.isAuthenticated);

  const state = useAppState(auth);
  const handlers = useAppHandlers(state);
  const ctx = { ...state, ...handlers, auth };

  if (!auth.isAuthenticated) {
    return (
      <Login onLogin={auth.login} error={auth.error} loading={auth.loading} />
    );
  }

  return (
    <ErrorBoundary>
      <AppShell
        tab={state.tab}
        today={state.today}
        onTabChange={state.setTab}
        onLogout={auth.logout}
        loadErrors={state.loadErrors}
        onRefresh={state.refresh}
      >
        <AppPage tab={state.tab} state={state} handlers={handlers} />
        <AppModals ctx={ctx} />
      </AppShell>
      {state.toast && (
        <Toast
          msg={state.toast.msg}
          type={state.toast.type}
          onClose={() => state.setToast(null)}
        />
      )}
    </ErrorBoundary>
  );
}
