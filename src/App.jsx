import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { AppShell } from "./components/AppShell.jsx";
import { AppPage } from "./components/AppPage.jsx";
import { AppModals } from "./components/AppModals.jsx";
import Login from "./components/login.jsx";
import { useAuth } from "./hooks/useAuth.js";
import { useAppState } from "./hooks/useAppState.js";
import { useAppHandlers } from "./hooks/useAppHandlers.js";
import { Toast } from "./components/ui.jsx";

// FIX (audit 2026-07-25, hygiene): removed the commented-out `useAutoMonthRollover`
// block. It was disabled pending `rolloverMonth` being made atomic (delivered
// in the 20260724120000 migration). When the operator is ready to enable
// automatic month rollover on login, add a NEW hook — the previous block
// referenced `useEffect`/`callApi`/`getToday` imports that were not actually
// present. Keeping the dead code only confused future readers; safe to drop
// because it was inside a comment block.

export default function App() {
  const auth = useAuth();
  const state = useAppState(auth);
  const handlers = useAppHandlers(state);
  const ctx = { ...state, ...handlers, auth };

  if (!auth.isAuthenticated) {
    // FIX (audit 2026-07-27): the previous layout returned <Login /> outside
    // the ErrorBoundary, so a render-time error on the login screen would
    // crash to a white page instead of recovering. AGENTS.md §10 says the
    // ErrorBoundary catches any render error below <App/>. <Login/> is below
    // <App/>, so it must be wrapped too. No other behaviour changes.
    return (
      <ErrorBoundary>
        <Login onLogin={auth.login} error={auth.error} loading={auth.loading} />
      </ErrorBoundary>
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
