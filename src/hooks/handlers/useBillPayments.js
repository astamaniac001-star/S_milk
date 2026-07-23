import { useCallback } from "react";
import {
  mapAdjustmentFromApi,
  mapPaymentToApi,
  callApi,
} from "../../lib/api.js";
import { getToday } from "../../lib/utils.js";
import { useHelpers } from "./shared.js";

export function useBillPayments(state) {
  const {
    setBills,
    setAdjustments,
    form = {},
    modal = {},
    closeModal,
    refresh,
  } = state;
  const { showToast } = useHelpers(state);

  const recordPayment = useCallback(
    async (billIdArg, amountArg) => {
      const billId = billIdArg || modal.data?.id || modal.data?.billId;
      const billData = modal.data || {};

      // FIX H8: Resolve defaults exactly as the UI displays them
      const pending = (billData.amount || 0) - (billData.paid || 0);
      const amount =
        amountArg !== undefined ? amountArg : (form.payAmt ?? pending);
      const mode = form.payMode ?? "Cash";
      const date = form.payDate ?? getToday();
      const note = form.payNote ?? "";

      if (!amount || Number(amount) <= 0) {
        showToast("Enter valid amount", "error");
        return;
      }

      try {
        const payload = mapPaymentToApi(billId, amount, {
          mode,
          date,
          note,
        });

        await callApi("recordPayment", payload);
        showToast(`₹${amount} recorded`, "success");

        if (closeModal) closeModal();
        const res = await callApi("getBills", {});
        setBills(res.bills || []);
      } catch (e) {
        showToast(e.message, "error");
      }
    },
    [setBills, form, modal, closeModal, showToast],
  );

  const saveAdjustment = useCallback(
    async (billIdArg, amountArg, reasonArg) => {
      // FIX H8: Apply fallbacks for adjustment form as well
      const amount = amountArg !== undefined ? amountArg : form.amount;
      const reason = reasonArg !== undefined ? reasonArg : form.reason;
      const customerId = form.custId || modal.data?.custId;
      const date = form.date || getToday();

      if (!customerId) {
        showToast("Customer ID is missing", "error");
        return;
      }
      if (!amount || Number(amount) === 0) {
        showToast("Enter valid amount", "error");
        return;
      }

      try {
        const payload = {
          customerId,
          amount: Number(amount),
          reason,
          date,
          idempotencyKey: Date.now().toString(),
        };
        await callApi("addAdjustment", payload);
        showToast("Added", "success");
        if (closeModal) closeModal();
        const res = await callApi("getAdjustments", {});
        setAdjustments((res.adjustments || []).map(mapAdjustmentFromApi));
      } catch (e) {
        showToast(e.message, "error");
      }
    },
    [setAdjustments, form, modal, closeModal, showToast],
  );

  const applyAdjustment = useCallback(
    async (adjustmentId, billId, version) => {
      // ✅ FIX 1: Add version to parameters
      try {
        // ✅ FIX 2: Pass version to the API call
        await callApi("applyAdjustment", { adjustmentId, billId, version });
        showToast("Adjustment applied", "success");

        const [adjRes, billRes] = await Promise.all([
          callApi("getAdjustments", {}),
          callApi("getBills", {}),
        ]);

        setAdjustments((adjRes.adjustments || []).map(mapAdjustmentFromApi));
        setBills(billRes.bills || []); // Cleaned up extra parentheses
      } catch (err) {
        showToast(err.message || "Failed to apply adjustment", "error");
      }
    },
    [showToast, setAdjustments, setBills],
  );

  const addCreditNote = useCallback(
    async (data) => {
      if (!data.custId && !data.customerId) {
        showToast("Please select a customer for the credit note", "error");
        return;
      }
      if (!data.amount || Number(data.amount) <= 0) {
        showToast("Please enter a valid amount", "error");
        return;
      }
      if (!data.reason || !data.reason.trim()) {
        showToast("Please enter a reason", "error");
        return;
      }

      try {
        await callApi("addCreditNote", data);
        showToast("Credit note issued", "success");
        if (closeModal) closeModal();
        if (refresh) refresh();
      } catch (err) {
        showToast(err.message || "Failed to issue credit note", "error");
      }
    },
    [showToast, closeModal, refresh],
  );

  return { recordPayment, saveAdjustment, applyAdjustment, addCreditNote };
}
