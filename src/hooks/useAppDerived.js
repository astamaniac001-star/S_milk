import { useMemo } from "react";
import { filterCustomers, filterImports, filterBills } from "../lib/filters.js";
import { getToday } from "../lib/utils.js";

export function useAppDerived(state) {
  const {
    customers = [],
    imports = [],
    bills = [],
    brands = [],
    logs = [],
    custSearch,
    custFilter,
    impFilter,
    billFilter,
    // dayTick: forces the memo to re-run across midnight so `todayLogs`
    // matches the new today. Passed in by useAppState.
    dayTick = 0,
  } = state;

  return useMemo(() => {
    const today = getToday();
    const todayLogs = logs.filter((l) => l.date === today);
    const confirmedStock = todayLogs
      .filter((l) => l.delivered)
      .reduce((sum, l) => sum + (l.qty || 0), 0);

    const activeC = customers.filter((c) => c.status === "Active");

    const totalRevenue = bills
      .filter((b) => b.status === "Paid" || b.status === "Partial")
      .reduce((sum, b) => sum + (b.paid || 0), 0);

    const pendingDues = bills
      .filter((b) => b.status !== "Paid")
      .reduce((sum, b) => sum + (b.amount - (b.paid || 0)), 0);

    const filteredC = filterCustomers(customers, custSearch, custFilter);

    const filteredImports = filterImports(imports, impFilter);
    const filteredB = filterBills(bills, billFilter);

    const activeBrandsCount = brands.filter(
      (b) => b.status === "Active",
    ).length;

    return {
      activeC,
      totalRevenue,
      pendingDues,
      filteredC,
      filteredImports,
      filteredB,
      activeBrandsCount,
      todayLogs,
      confirmedStock,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    customers,
    imports,
    bills,
    brands,
    logs,
    custSearch,
    custFilter,
    impFilter,
    billFilter,
    dayTick, // Intentional: forces memo invalidation on midnight rollover
  ]);
}
