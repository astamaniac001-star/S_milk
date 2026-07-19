import { useCallback } from "react";
import { mapBillFromApi, callApi } from "../../lib/api.js";
import { useHelpers } from "./shared.js";

export function useBillOperations(state) {
  // FIX (AI-3): Destructure `subscriptions` from state so we can look up the correct rate
  const { customers, subscriptions, setBills } = state;
  const { showToast, handleIdAction } = useHelpers(state);

  const generateMonthlyBills = useCallback(
    async (month) => {
      try {
        const activeCustomers = customers.filter((c) => c.status === "Active");

        const results = await Promise.allSettled(
          activeCustomers.map((c) => {
            // FIX (AI-3): Look up the active subscription for this customer to get the correct rate.
            // Fallback to the customer's direct rate, then to 32 if truly unknown.
            const sub = subscriptions?.find(
              (s) => s.customerId === c.id && s.isActive !== false,
            );
            const rate = sub?.ratePerLiter || c.ratePerLiter || 32;

            return callApi("generateMonthBill", {
              customerId: c.id,
              month,
              ratePerLiter: rate, // Pass the dynamic rate to the backend
            });
          }),
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

        const res = await callApi("getBills", {});
        setBills((res.bills || []).map(mapBillFromApi));
      } catch (e) {
        showToast(e.message, "error");
      }
    },
    [customers, subscriptions, setBills, showToast],
  ); // Added `subscriptions` to dependencies

  const lockBill = useCallback(
    (billId) =>
      handleIdAction(
        "lockBill",
        "billId",
        billId,
        "Bill locked",
        "getBills",
        setBills,
        mapBillFromApi,
        "bills",
      ),
    [handleIdAction, setBills],
  );

  const unlockBill = useCallback(
    (billId) =>
      handleIdAction(
        "unlockBill",
        "billId",
        billId,
        "Bill unlocked",
        "getBills",
        setBills,
        mapBillFromApi,
        "bills",
      ),
    [handleIdAction, setBills],
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
      }

      const url = `https://wa.me/${intlPhone}?text=${encodeURIComponent(text)}`;
      // cspell:disable-next-line
      window.open(url, "_blank", "noopener,noreferrer");
    },
    [showToast],
  );

  return { generateMonthlyBills, lockBill, unlockBill, whatsapp };
}
