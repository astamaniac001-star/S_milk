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
  const { customers, setBills, billMonth } = state;
  const { showToast } = useHelpers(state);

  const generateMonthlyBills = useCallback(
    async (month) => {
      try {
        const activeCustomers = customers.filter((c) => c.status === "Active");

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
        if (failedCount > 0) {
          showToast(
            `Generated bills, but ${failedCount} failed. Check logs.`,
            "warning",
          );
        } else {
          showToast("All monthly bills generated successfully!", "success");
        }

        // FIX (audit 2026-07-27): scope the refetch to billMonth so we don't
        // overwrite state.bills with every bill ever. `getBills` filters
        // server-side when `month` is provided (lib/api/billing.js:17). The
        // post-store handler does NOT re-map because `getBills` already
        // returns UI shape via `mapBillFromApi` (rule §4 — single mapping).
        const res = await callApi("getBills", { month: billMonth });
        setBills(res.bills || []);
      } catch (e) {
        showToast(e.message, "error");
      }
    },
    [customers, setBills, showToast, billMonth],
  );

  const lockBill = useCallback(
    async (billId) => {
      try {
        // 1. Find the bill in state to get its current version
        const billToLock = state.bills?.find((b) => b.id === billId);
        if (!billToLock) {
          showToast("Bill not found in state", "error");
          return;
        }

        // 2. Call the API, explicitly passing the version
        await callApi("lockBill", {
          billId: billToLock.id,
          version: billToLock.version,
        });

        showToast("Bill locked", "success");

        // 3. Refresh the bills list (api.js already maps this, so we just set it).
        // FIX (audit 2026-07-27): scope to billMonth — see generateMonthlyBills.
        const res = await callApi("getBills", { month: billMonth });
        setBills(res.bills || []);
      } catch (err) {
        showToast(err.message || "Failed to lock bill", "error");
      }
    },
    [state.bills, setBills, showToast, billMonth],
  );

  const unlockBill = useCallback(
    async (billId) => {
      try {
        // 1. Find the bill in state to get its current version
        const billToUnlock = state.bills?.find((b) => b.id === billId);
        if (!billToUnlock) {
          showToast("Bill not found in state", "error");
          return;
        }

        // 2. Call the API, explicitly passing the version
        await callApi("unlockBill", {
          billId: billToUnlock.id,
          version: billToUnlock.version,
        });

        showToast("Bill unlocked", "success");

        // 3. Refresh the bills list
        // FIX (audit 2026-07-27): scope to billMonth — see generateMonthlyBills.
        const res = await callApi("getBills", { month: billMonth });
        setBills(res.bills || []);
      } catch (err) {
        showToast(err.message || "Failed to unlock bill", "error");
      }
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
      if (!intlPhone) {
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
        showToast("Popup blocked — allow popups to share via WhatsApp", "error");
      }
    },
    [showToast],
  );

  return { generateMonthlyBills, lockBill, unlockBill, whatsapp };
}
