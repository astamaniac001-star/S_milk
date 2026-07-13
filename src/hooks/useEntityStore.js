import { useState, useEffect, useCallback } from "react";
import {
  callApi,
  mapCustomerFromApi,
  mapBillFromApi,
  mapImportFromApi,
  mapLogFromApi,
  mapAdjustmentFromApi,
  mapPauseFromApi,
  mapBrandFromApi,
  mapSubscriptionFromApi,
  mapCreditNoteFromApi,
} from "../lib/api.js";
import { getToday } from "../lib/utils.js";

export function useEntityStore(token) {
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

  useEffect(() => {
    if (!token) return;
    const fetchData = async () => {
      const [custs, bils, imps, lgs, adjs, paus, brnds, subs, cns] =
        await Promise.all([
          safeFetch("getCustomers", {}, "customers"),
          safeFetch("getBills", {}, "bills"),
          safeFetch("getMilkImports", {}, "imports"),
          safeFetch("getDailyLogs", { date: getToday() }, "logs"),
          safeFetch("getAdjustments", {}, "adjustments"),
          safeFetch("getPauses", {}, "pauses"),
          safeFetch("getBrands", {}, "brands"),
          safeFetch("getSubscriptions", {}, "subscriptions"),
          safeFetch("getCreditNotes", {}, "creditNotes"),
        ]);
      if (custs !== null) setCustomers(custs.map(mapCustomerFromApi));
      if (bils !== null) setBills(bils.map(mapBillFromApi));
      if (imps !== null) setImports(imps.map(mapImportFromApi));
      if (lgs !== null) setLogs(lgs.map(mapLogFromApi));
      if (adjs !== null) setAdjustments(adjs.map(mapAdjustmentFromApi));
      if (paus !== null) setPauses(paus.map(mapPauseFromApi));
      if (brnds !== null) setBrands(brnds.map(mapBrandFromApi));
      if (subs !== null) setSubscriptions(subs.map(mapSubscriptionFromApi));
      if (cns !== null) setCreditNotes(cns.map(mapCreditNoteFromApi));
    };
    fetchData();
  }, [token, safeFetch, refreshKey]);

  const fetchLogs = useCallback(async (date) => {
    try {
      const res = await callApi("getDailyLogs", { date });
      setLogs((res && res.logs ? res.logs : []).map(mapLogFromApi));
    } catch (err) {
      console.error("Failed to fetch logs for date:", date, err);
    }
  }, []);

  return {
    customers, setCustomers,
    imports, setImports,
    bills, setBills,
    logs, setLogs,
    adjustments, setAdjustments,
    pauses, setPauses,
    brands, setBrands,
    subscriptions, setSubscriptions,
    fetchLogs,
    creditNotes, setCreditNotes,
    loadErrors,
    refresh,
  };
}

export function useFilterState() {
  const [custSearch, setCustSearch] = useState("");
  const [custFilter, setCustFilter] = useState("All");
  const [impFilter, setImpFilter] = useState({ month: "", brand: "", status: "" });
  const [billFilter, setBillFilter] = useState("All");
  const [diagRan, setDiagRan] = useState(false);

  return {
    custSearch, setCustSearch,
    custFilter, setCustFilter,
    impFilter, setImpFilter,
    billFilter, setBillFilter,
    diagRan, setDiagRan,
  };
}