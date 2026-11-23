import { useCallback } from "react";
import { callApi } from "../../lib/api.js";
import { useHelpers } from "./shared.js";

export function useBillOperations(state) {
  // FIX (audit 2026-07-27, rule §2/§4): pull `billMonth` from state so that
  // post-mutation refetches stay scoped to the month the operator is
  // viewing. The previous code called `callApi("getBills", {})` which has no
  // month filter — `getBills` (lib/api/billing.js:15-21) then returns every
  // bill ever and `setBills` overwrites state.bills with all of them. That
  // silently broke the month filter invariant on the Billing page (the KPI
  // tiles at Billing.jsx:203-225 sum over `state.bills` directly), leaking
  // other months' totals into the current view until the operator manually
  // re-picked the month.
  const { customers, subscriptions, setBills, billMonth } = state;
  const { showToast } = useHelpers(state);

  const generateMonthlyBills = useCallback(
    async (month) => {
      try {
        // Subscription-centric model: a customer is billable only when they
        // have at least one ACTIVE subscription. Billing every Active
        // customer would create ₹0 bills for customers who never receive
        // milk. This mirrors `rollover_month_rpc`, which seeds bills from
        // active subscriptions, and `generate_month_bill_rpc`, which prices
        // the delivered logs of those subscriptions.
        const billableCustomerIds = new Set(
          (subscriptions || [])
            .filter((s) => s.isActive)
            .map((s) => s.customerId),
        );
        const activeCustomers = customers.filter(
          (c) => c.status === "Active" && billableCustomerIds.has(c.id),
        );

        // FIX (audit 2026-07-25, dead code): drop the dead dynamic-rate
        // lookup. The previous handler computed `rate = sub?.ratePerLiter ||
        // c.ratePerLiter || 32` and passed `ratePerLiter` to the RPC, but
        // `generateMonthBill` in lib/api/billing.js only destructures
        // `{ customerId, month }` and the backend `generate_month_bill_rpc`
        // re-derives the rate from `milk_brands`. The lookup was pure cargo
        // — it consumed `subscriptions` unnecessarily and the value was
        // silently discarded. The RPC is the single source of truth.
        const results = await Promise.allSettled(
          activeCustomers.map((c) =>
            callApi("generateMonthBill", {
              customerId: c.id,
              month,
            }),
          ),
        );

        const failedCount = results.filter(
          (r) => r.status === "rejected",
        ).length;

        // FIX (2026-11-21 audit): refetch the VIEWED month only when the
        // generated month IS the viewed month. The old code always refetched
        // `billMonth`, so generating for another month silently left the
        // KPIs stale — and a blind refetch of the wrong scope is exactly the
        // month-scoping trap rule §14/§4 warn about (state.bills must stay
        // scoped to billMonth).
        let refreshFailed = false;
        if (month === billMonth) {
          try {
            const res = await callApi("getBills", { month: billMonth });
            setBills(res.bills || []);
          } catch {
            refreshFailed = true;
          }
        }

        // Single toast per outcome (rule §3): per-bill failures win over a
        // stale-list warning; a plain success only when both are clean.
        if (failedCount > 0) {
          showToast(
            `Generated bills, but ${failedCount} failed. Check logs.`,
            "warning",
          );
        } else if (refreshFailed) {
          showToast(
            "Bills generated — but the list refresh failed. Use Retry.",
            "warning",
          );
        } else {
          showToast("All monthly bills generated successfully!", "success");
        }
      } catch (e) {
        showToast(e.message, "error");
      }
    },
    [customers, subscriptions, setBills, showToast, billMonth],
  );

  const lockBill = useCallback(
    async (billId) => {
      // 1. Find the bill in state to get its current version
      const billToLock = state.bills?.find((b) => b.id === billId);
      if (!billToLock) {
        showToast("Bill not found in state", "error");
        return;
      }

      // 2. Mutate with the version, THEN refetch, THEN toast (single-toast
      // rule §3 — a failed refetch must not show a green-then-red pair).
      try {
        await callApi("lockBill", {
          billId: billToLock.id,
          version: billToLock.version,
        });
      } catch (err) {
        showToast(err.message || "Failed to lock bill", "error");
        return;
      }
      try {
        // Scope to billMonth — see generateMonthlyBills (rule §4: getBills
        // already returns UI shape; no re-mapping here).
        const res = await callApi("getBills", { month: billMonth });
        setBills(res.bills || []);
      } catch {
        showToast(
          "Bill locked — but the list refresh failed. Use Retry.",
          "warning",
        );
        return;
      }
      showToast("Bill locked", "success");
    },
    [state.bills, setBills, showToast, billMonth],
  );

  const unlockBill = useCallback(
    async (billId) => {
      // 1. Find the bill in state to get its current version
      const billToUnlock = state.bills?.find((b) => b.id === billId);
      if (!billToUnlock) {
        showToast("Bill not found in state", "error");
        return;
      }

      // 2. Mutate → refetch → toast (see lockBill).
      try {
        await callApi("unlockBill", {
          billId: billToUnlock.id,
          version: billToUnlock.version,
        });
      } catch (err) {
        showToast(err.message || "Failed to unlock bill", "error");
        return;
      }
      try {
        // Scope to billMonth — see generateMonthlyBills.
        const res = await callApi("getBills", { month: billMonth });
        setBills(res.bills || []);
      } catch {
        showToast(
          "Bill unlocked — but the list refresh failed. Use Retry.",
          "warning",
        );
        return;
      }
      showToast("Bill unlocked", "success");
    },
    [state.bills, setBills, showToast, billMonth],
  );

  const whatsapp = useCallback(
    async (phone, billId) => {
      if (!phone) {
        showToast("No phone number on file", "error");
        return;
      }
      const digits = String(phone).replace(/\D/g, "");
      const intlPhone = digits.length === 10 ? "91" + digits : digits;
      if (!/^\d{10,15}$/.test(intlPhone)) {
        showToast("Invalid phone number", "error");
        return;
      }

      let text = `Pending milk bill — Bill ${billId}`;
      if (billId) {
        try {
          const data = await callApi("getBillText", { billId });
          if (data?.text) text = data.text;
        } catch {
          // keep the fallback text
        }
      } else {
        // FIX (audit 2026-07-27, rule §3 "at most one clear feedback per
        // action"): the previous code showed the info toast AND fell through
        // to open WhatsApp with `Bill undefined` in the text, giving the
        // operator two contradictory feedbacks (an "info" toast saying "no
        // pending bill" + a popup opening WhatsApp with a meaningless
        // "Pending milk bill — Bill undefined" message). Return early so
        // the only feedback is the info toast.
        showToast("No pending bill to share for this customer", "info");
        return;
      }

      const url = `https://wa.me/${intlPhone}?text=${encodeURIComponent(text)}`;
      // cspell:disable-next-line
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win) {
        showToast(
          "Popup blocked — allow popups to share via WhatsApp",
          "error",
        );
      }
    },
    [showToast],
  );

  return { generateMonthlyBills, lockBill, unlockBill, whatsapp };
}
