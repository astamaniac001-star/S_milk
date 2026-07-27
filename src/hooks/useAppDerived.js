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
    logDate,
    // FIX (audit 2026-07-25, perf + rule §2 DRY): take `today` from
    // `useAppState` instead of recomputing getToday() inline. This:
    //   1. Stops the rule §2 violation (recompute twice).
    //   2. Lets the memo depend on `today` DIRECTLY — which only changes
    //      across midnight — instead of on `dayTick` (which bumps every 60s
    //      and on visibilitychange). Net effect: revenue/dues no longer
    //      recompute every minute for no reason.
    today: todayFromState,
  } = state;
  const today = todayFromState || getToday();

  return useMemo(() => {
    const targetDate = logDate || today;
    const selectedDateLogs = logs.filter((l) => l.date === targetDate);
    const todayLogs = logs.filter((l) => l.date === today);
    const confirmedStock = todayLogs
      .filter((l) => l.delivered)
      .reduce((sum, l) => sum + (l.qty || 0), 0);

    const activeC = customers.filter((c) => c.status === "Active");

    const totalRevenue = bills
      .filter((b) => b.status === "Paid" || b.status === "Partial")
      .reduce((sum, b) => sum + (b.paid || 0), 0);

    // pendingDues = bills that are NOT settled and that represent real
    // outstanding money. The `bills.status` constraint permits
    // Draft/Unpaid/Partial/Paid per schema.sql; `Draft` bills have NOT been
    // confirmed/finalized yet (e.g. from a future staging workflow) and so
    // must not inflate the operator's dues tally. `Paid` obviously excludes.
    // See schema constraint `chk_bills_status_valid` on the bills table.
    const pendingDues = bills
      .filter((b) => b.status !== "Paid" && b.status !== "Draft")
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
      selectedDateLogs,
      confirmedStock,
    };
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
    logDate,
    today,
  ]);
}
