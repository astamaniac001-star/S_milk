import { useState, useEffect, useCallback } from "react";
import {
  callApi,
  mapCustomerFromApi,
  mapImportFromApi,
  mapLogFromApi,
  mapAdjustmentFromApi,
  mapPauseFromApi,
  mapBrandFromApi,
  mapSubscriptionFromApi,
  mapCreditNoteFromApi,
} from "../lib/api.js";
import { getToday } from "../lib/utils.js";

// `importDay` (2026-11-10): the day selected in the Imports page "By day"
// view, or null in month/range modes. Passed in from useAppState (which owns
// impFilter) so this store's date-dependent fetch group owns the network
// read — pages never call callApi directly (rule §1).
//
// `today` (2026-11-21 audit): the IST day from useDayTick, passed in so the
// store can keep a DEDICATED todayLogs snapshot for the Dashboard. `logs`
// is contractually scoped to the VIEWED date (logDate) — deriving
// todayLogs from it showed zeros on the Dashboard whenever the operator
// viewed a historical date (and mutations could not refresh it, since the
// setter was never exposed).
export function useEntityStore(
  token,
  logDate,
  billMonth,
  importDay = null,
  today = null,
) {
  const [customers, setCustomers] = useState([]);
  const [imports, setImports] = useState([]);
  const [bills, setBills] = useState([]);
  const [logs, setLogs] = useState([]);
  const [todayLogs, setTodayLogs] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [pauses, setPauses] = useState([]);
  const [brands, setBrands] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [loadErrors, setLoadErrors] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [creditNotes, setCreditNotes] = useState([]);
  const [dailyInventory, setDailyInventory] = useState(null);
  // Redesign (2026-11): hydration flags so pages can show skeletons instead
  // of a false "no data" empty state during the first fetch. Split per fetch
  // group; `loading` is true until BOTH first groups have settled. Manual
  // refreshes do NOT re-raise the flag (no skeleton flash on Retry), and
  // date changes don't either (existing rows stay on screen). The flags start
  // true for the initial mount; the fetch effects clear them when they settle.
  const [coreLoading, setCoreLoading] = useState(true);
  const [dateLoading, setDateLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoadErrors([]);
    setRefreshKey((k) => k + 1);
  }, []);

  const safeFetch = useCallback(async (action, payload, fallbackKey) => {
    try {
      const res = await callApi(action, payload);
      // 🔥 FIX: Safely access the key to prevent crashes if res is null
      return (res && res[fallbackKey]) || [];
    } catch (err) {
      console.warn(`[useEntityStore] ${action} failed:`, err.message);
      setLoadErrors((prev) =>
        prev.includes(action) ? prev : [...prev, action],
      );
      return null;
    }
  }, []);

  // FIX (audit 2026-07-25, perf): the previous single effect ran on every
  // `logDate` and `billMonth` change, refetching ALL entities including
  // customers/brands/subscriptions/pauses/credit_notes/adjustments/imports
  // which do NOT depend on either. Split into two effects:
  //   1. Date-independent entities — fetched once on login + on refresh().
  //   2. Date-dependent entities   — `getDailyLogs` (logDate) + `getBills`
  //      (billMonth) — refetched on each date/month change.
  // This drops 7 redundant network calls per date pick.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const fetchData = async () => {
      const [custs, imps, adjs, paus, brnds, subs, cns] = await Promise.all([
        safeFetch("getCustomers", {}, "customers"),
        safeFetch("getMilkImports", {}, "imports"),
        safeFetch("getAdjustments", {}, "adjustments"),
        safeFetch("getPauses", {}, "pauses"),
        safeFetch("getBrands", {}, "brands"),
        safeFetch("getSubscriptions", {}, "subscriptions"),
        safeFetch("getCreditNotes", {}, "creditNotes"),
      ]);
      if (cancelled) return;
      if (custs !== null) setCustomers(custs.map(mapCustomerFromApi));
      if (imps !== null) setImports(imps.map(mapImportFromApi));
      if (adjs !== null) setAdjustments(adjs.map(mapAdjustmentFromApi));
      if (paus !== null) setPauses(paus.map(mapPauseFromApi));
      if (brnds !== null) setBrands(brnds.map(mapBrandFromApi));
      if (subs !== null) setSubscriptions(subs.map(mapSubscriptionFromApi));
      if (cns !== null) setCreditNotes(cns.map(mapCreditNoteFromApi));
    };
    fetchData().finally(() => {
      if (!cancelled) setCoreLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [token, safeFetch, refreshKey]);

  // Separate effect for date-dependent entities — fires only on logDate /
  // billMonth / today change (and on first sign-in via the `token` dep).
  // `getDailyLogs` and `getBills` are the ONLY expensive-per-date reads.
  // When the viewed date is NOT today, a second scoped read keeps the
  // todayLogs snapshot for the Dashboard fresh (retryable via the banner's
  // Retry, like every fetch in this store).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const viewedDate = logDate || today || getToday();
    const fetchData = async () => {
      const [bils, lgs, tdy] = await Promise.all([
        safeFetch("getBills", { month: billMonth }, "bills"),
        safeFetch("getDailyLogs", { date: viewedDate }, "logs"),
        today && viewedDate !== today
          ? safeFetch("getDailyLogs", { date: today }, "logs")
          : Promise.resolve(null),
      ]);
      if (cancelled) return;
      if (bils !== null) setBills(bils);
      if (lgs !== null) {
        const mapped = lgs.map(mapLogFromApi);
        setLogs(mapped);
        // Same fetch feeds both snapshots when the operator is viewing today.
        if (today && viewedDate === today) setTodayLogs(mapped);
      }
      if (tdy !== null) setTodayLogs(tdy.map(mapLogFromApi));
    };
    fetchData().finally(() => {
      if (!cancelled) setDateLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [token, safeFetch, refreshKey, logDate, billMonth, today]);

  // Imports page "By day" stock card (2026-11-10): daily inventory
  // (Imported/Delivered/Remaining/Shortage) via the previously-unwired
  // getDailyInventory action. Fetched only while a day is selected. The
  // payload carries its own `date`, so the view renders it only when it
  // matches the currently-selected day — no reset-on-null effect needed and
  // no stale-data flash when the operator re-enters Day mode (the old
  // payload's date won't match the new day, so the card shows "loading"
  // until the fresh fetch lands). Failure surfaces in the loadErrors banner
  // (error layer §10.1, same as fetchLogs) and retries via the banner's
  // Retry (refreshKey). A dedicated try/catch instead of safeFetch because
  // getDailyInventory returns a flat summary object, not a keyed list for
  // the `|| []` fallback.
  useEffect(() => {
    if (!token || !importDay) return;
    let cancelled = false;
    const fetchData = async () => {
      try {
        const res = await callApi("getDailyInventory", { date: importDay });
        if (!cancelled) setDailyInventory(res || null);
      } catch (err) {
        console.error("[useEntityStore] getDailyInventory failed:", err);
        if (!cancelled) {
          setDailyInventory(null);
          setLoadErrors((prev) =>
            prev.includes("getDailyInventory")
              ? prev
              : [...prev, "getDailyInventory"],
          );
        }
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [token, importDay, refreshKey]);

  const fetchLogs = useCallback(
    async (date) => {
      try {
        const res = await callApi("getDailyLogs", { date });
        const mapped = ((res && res.logs) || []).map(mapLogFromApi);
        setLogs(mapped);
        // Keep the Dashboard snapshot in sync: any successful fetch for
        // today's date updates todayLogs too (delivery toggles, bulk saves,
        // ad-hoc and generation all funnel through here).
        if (date && date === today) setTodayLogs(mapped);
      } catch (err) {
        console.error("Failed to fetch logs for date:", date, err);
        // Audit 2026-11-09 (F15): this refetch runs after ad-hoc/generate
        // mutations OUTSIDE safeFetch, so a failure was invisible. Surface it
        // in the loadErrors banner (error layer §10.1) so the operator gets a
        // visible Retry affordance instead of silently stale logs. The
        // mutation itself already showed its success toast — no second toast
        // here (one clear feedback per action, rule §3).
        setLoadErrors((prev) =>
          prev.includes("getDailyLogs") ? prev : [...prev, "getDailyLogs"],
        );
      }
    },
    [today],
  );

  // Dashboard-only refresh: fetch today's logs into todayLogs WITHOUT
  // touching `logs` (which must stay scoped to the viewed date). Used after
  // mutations that targeted a different date than the one being viewed.
  const refreshTodayLogs = useCallback(async () => {
    if (!today) return;
    try {
      const res = await callApi("getDailyLogs", { date: today });
      setTodayLogs(((res && res.logs) || []).map(mapLogFromApi));
    } catch (err) {
      console.error("Failed to fetch today's logs:", err);
      setLoadErrors((prev) =>
        prev.includes("getDailyLogs") ? prev : [...prev, "getDailyLogs"],
      );
    }
  }, [today]);

  return {
    customers,
    setCustomers,
    imports,
    setImports,
    bills,
    setBills,
    logs,
    setLogs,
    todayLogs,
    setTodayLogs,
    adjustments,
    setAdjustments,
    pauses,
    setPauses,
    brands,
    setBrands,
    subscriptions,
    setSubscriptions,
    fetchLogs,
    refreshTodayLogs,
    dailyInventory,
    creditNotes,
    setCreditNotes,
    loadErrors,
    refresh,
    // Initial hydration (both first fetch groups settled at least once).
    loading: coreLoading || dateLoading,
    coreLoading,
    dateLoading,
  };
}

export function useFilterState() {
  const [custSearch, setCustSearch] = useState("");
  const [custFilter, setCustFilter] = useState("All");
  const [subSearch, setSubSearch] = useState("");
  const [subFilter, setSubFilter] = useState("All");
  const [impFilter, setImpFilter] = useState({
    mode: "month", // "month" | "day" | "range" — Imports page view mode
    month: "",
    brand: "",
    status: "",
    day: "", // "By day" view: exact date
    from: "", // "By date range" view: inclusive bounds (default window set
    to: "", //  on mode switch = first of previous month → today)
  });
  const [billFilter, setBillFilter] = useState("All");
  const [billSearch, setBillSearch] = useState("");
  const [billSort, setBillSort] = useState("newest");
  const [diagRan, setDiagRan] = useState(false);
  const [diagResults, setDiagResults] = useState(null);

  return {
    custSearch,
    setCustSearch,
    custFilter,
    setCustFilter,
    subSearch,
    setSubSearch,
    subFilter,
    setSubFilter,
    impFilter,
    setImpFilter,
    billFilter,
    setBillFilter,
    billSearch,
    setBillSearch,
    billSort,
    setBillSort,
    diagRan,
    setDiagRan,
    diagResults,
    setDiagResults,
  };
}
