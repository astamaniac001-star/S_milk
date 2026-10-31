import { useCallback, useRef } from "react";
import {
  mapAdjustmentFromApi,
  mapCreditNoteFromApi,
  mapPaymentToApi,
  callApi,
} from "../../lib/api.js";
import { getToday, generateKey } from "../../lib/utils.js";
import { useHelpers } from "./shared.js";

export function useBillPayments(state) {
  const {
    setBills,
    setAdjustments,
    setCreditNotes,
    bills,
    billMonth,
    form = {},
    modal = {},
    closeModal,
    refresh,
  } = state;
  const { showToast } = useHelpers(state);

  // Per-attempt idempotency key (AGENTS §14). Scoped to a (billId, amount)
  // attempt: reused on a retry of the SAME submit (network blip recovery, so
  // the `payments_idempotency_key` UNIQUE guard dedupes a successful-but-
  // unacked RPC instead of double-charging), and re-minted when the operator
  // switches to a different bill or amount. Without the scoping, a key left
  // over from a failed attempt on bill A would be replayed for bill B — the
  // RPC would return idempotent success WITHOUT applying any payment, while
  // the UI showed "₹X recorded".
  const paymentIdemRef = useRef(null); // { key, billId, amount }
  // Ref-only helpers — stable identities via useCallback so recordPayment's
  // dependency array stays honest.
  const mintPaymentKey = useCallback((billId, amount) => {
    paymentIdemRef.current = {
      key: generateKey(),
      billId,
      amount: Number(amount),
    };
    return paymentIdemRef.current.key;
  }, []);
  const resolvePaymentKey = useCallback(
    (billId, amount) => {
      const cur = paymentIdemRef.current;
      if (cur && cur.billId === billId && cur.amount === Number(amount)) {
        return cur.key; // retry of the same submit — keep the key
      }
      return mintPaymentKey(billId, amount);
    },
    [mintPaymentKey],
  );

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

      // Mint/reuse the key scoped to this (billId, amount) attempt.
      const idempotencyKey = resolvePaymentKey(billId, amount);

      try {
        const payload = mapPaymentToApi(billId, amount, {
          mode,
          date,
          note,
          idempotencyKey,
        });

        const res = await callApi("recordPayment", payload);
        showToast(`₹${amount} recorded`, "success");
        paymentIdemRef.current = null; // consume key — next submit mints a new one
        if (closeModal) closeModal();

        // Locally patch the bill (P1.3). Previously this issued a redundant
        // full-month `getBills` refetch that, on failure, produced both a
        // success and an error toast for one user action. The RPC already
        // returned the updated bill — apply it in-place.
        const updated = res && res.bill;
        if (updated) {
          setBills((prev) =>
            prev.map((b) => (b.id === updated.id ? updated : b)),
          );
        }
      } catch (e) {
        showToast(e.message, "error");
      }
    },
    [setBills, form, modal, closeModal, showToast, resolvePaymentKey],
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

      // Resolve the customer's bill for the viewed month so the adjustment
      // row carries a bill_id. Without this, `adjustments.bill_id` stays
      // NULL and the Apply button in More.jsx is permanently inert
      // (`if (!a.billId) return;`). The AdjustmentModal has no bill picker,
      // so the viewed month's bill is the canonical target.
      const bill = bills.find(
        (b) => b.custId === customerId && b.month === billMonth,
      );
      if (!bill) {
        showToast(
          `No ${billMonth} bill found for this customer — generate bills first, then add the adjustment.`,
          "error",
        );
        return;
      }

      try {
        const payload = {
          customerId,
          billId: bill.id,
          amount: Number(amount),
          reason,
          date,
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
    [bills, billMonth, setAdjustments, form, modal, closeModal, showToast],
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
          callApi("getBills", { month: billMonth }),
        ]);

        setAdjustments((adjRes.adjustments || []).map(mapAdjustmentFromApi));
        setBills(billRes.bills || []); // Cleaned up extra parentheses
      } catch (err) {
        showToast(err.message || "Failed to apply adjustment", "error");
      }
    },
    [showToast, setAdjustments, setBills, billMonth],
  );

  const applyCreditNote = useCallback(
    async (creditNoteId, billId, version) => {
      try {
        await callApi("applyCreditNote", { creditNoteId, billId, version });
        showToast("Credit note applied", "success");
        const [cnRes, billRes] = await Promise.all([
          callApi("getCreditNotes", {}),
          callApi("getBills", { month: billMonth }),
        ]);
        // Refresh BOTH sides: the note (applied flag/version) and the bill
        // (amount_paid/status). Previously the fetched credit notes were
        // discarded, so the list kept showing a stale unapplied note.
        setCreditNotes((cnRes.creditNotes || []).map(mapCreditNoteFromApi));
        setBills(billRes.bills || []);
      } catch (err) {
        showToast(err.message || "Failed to apply credit note", "error");
      }
    },
    [showToast, setCreditNotes, setBills, billMonth],
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

  return { recordPayment, saveAdjustment, applyAdjustment, addCreditNote, applyCreditNote };
}
