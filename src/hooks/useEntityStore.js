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

export function useEntityStore(token, logDate, billMonth) {
  const [customers, setCustomers] = useState([]);
  const [imports, setImports] = useState([]);
  const [bills, setBills] = useState([]);
  const [logs, setLogs] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [pauses, setPauses] = useState([]);
  const [brands, setBrands] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [loadErrors, setLoadErrors] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [creditNotes, setCreditNotes] = useState([]);

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
      const [custs, imps, adjs, paus, brnds, subs, cns] =
        await Promise.all([
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
    fetchData();
    return () => { cancelled = true; };
  }, [token, safeFetch, refreshKey]);

  // Separate effect for date-dependent entities — fires only on logDate /
  // billMonth change (and on first sign-in via the `token` dep). `getDailyLogs`
  // and `getBills` are the ONLY expensive-per-date reads.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const fetchData = async () => {
      const [bils, lgs] = await Promise.all([
        safeFetch("getBills", { month: billMonth }, "bills"),
        safeFetch("getDailyLogs", { date: logDate || getToday() }, "logs"),
      ]);
      if (cancelled) return;
      if (bils !== null) setBills(bils);
      if (lgs !== null) setLogs(lgs.map(mapLogFromApi));
    };
    fetchData();
    return () => { cancelled = true; };
  }, [token, safeFetch, refreshKey, logDate, billMonth]);

  const fetchLogs = useCallback(async (date) => {
    try {
      const res = await callApi("getDailyLogs", { date });
      setLogs((res && res.logs ? res.logs : []).map(mapLogFromApi));
    } catch (err) {
      console.error("Failed to fetch logs for date:", date, err);
    }
  }, []);

  return {
    customers,
    setCustomers,
    imports,
    setImports,
    bills,
    setBills,
    logs,
    setLogs,
    adjustments,
    setAdjustments,
    pauses,
    setPauses,
    brands,
    setBrands,
    subscriptions,
    setSubscriptions,
    fetchLogs,
    creditNotes,
    setCreditNotes,
    loadErrors,
    refresh,
  };
}

export function useFilterState() {
  const [custSearch, setCustSearch] = useState("");
  const [custFilter, setCustFilter] = useState("All");
  const [impFilter, setImpFilter] = useState({
    month: "",
    brand: "",
    status: "",
  });
  const [billFilter, setBillFilter] = useState("All");
  const [diagRan, setDiagRan] = useState(false);
  const [diagResults, setDiagResults] = useState(null);

  return {
    custSearch,
    setCustSearch,
    custFilter,
    setCustFilter,
    impFilter,
    setImpFilter,
    billFilter,
    setBillFilter,
    diagRan,
    setDiagRan,
    diagResults,
    setDiagResults,
  };
}
