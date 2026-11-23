import { useMemo, useCallback, useRef } from "react";
import { callApi } from "../../lib/api.js";
import { getToday, generateKey } from "../../lib/utils.js";
import { useHelpers } from "./shared.js";

export function useDeliveryHandlers(state) {
  const { logDate, today, closeModal, fetchLogs, refreshTodayLogs } = state;
  const { showToast } = useHelpers(state);

  const deliveryHandlers = useMemo(
    () => ({
      // FIX (2026-11-21 audit): refetches go through the store's fetchLogs —
      // it scopes `logs` to the viewed date AND keeps the Dashboard's
      // dedicated todayLogs snapshot in sync when the viewed date IS today.
      toggleDeliveryLog: async (logId, delivered) => {
        try {
          const date = logDate || getToday();
          await callApi("updateLogEntry", { logId, delivered, date });
          // fetchLogs swallows refetch failures into the loadErrors banner
          // (audit F15) — the mutation toast stays the single feedback.
          if (fetchLogs) await fetchLogs(date);
          showToast("Log updated", "success");
        } catch (e) {
          showToast(e.message, "error");
        }
      },
      bulkUpsertLogs: async (logsToUpsert) => {
        try {
          const date = logDate || getToday();
          await callApi("bulkUpsertLogs", { logs: logsToUpsert });
          if (fetchLogs) await fetchLogs(date);
          showToast("Logs saved", "success");
        } catch (e) {
          showToast(e.message, "error");
        }
      },
    }),
    [showToast, logDate, fetchLogs],
  );

  // Per-attempt idempotency key for the ACCUMULATING ad-hoc write (rule §14,
  // 2026-11-21 audit AI-S M4). Scoped to the submit's identity: reused when
  // the operator retries the SAME submit (network blip recovery — the RPC
  // recognizes the key and returns the already-accumulated row instead of
  // double-counting), re-minted for a different submit.
  const adHocIdemRef = useRef(null); // { key, customerId, date, product, brandId, qty }
  const resolveAdHocKey = useCallback((payload) => {
    const cur = adHocIdemRef.current;
    const matches =
      cur &&
      cur.customerId === payload.customerId &&
      cur.date === payload.date &&
      cur.product === payload.product &&
      cur.brandId === payload.brandId &&
      cur.qty === Number(payload.qty);
    if (matches) return cur.key;
    const key = generateKey();
    adHocIdemRef.current = { key, ...payload };
    return key;
  }, []);

  const addAdHocLog = useCallback(
    async (data) => {
      try {
        // FIX (2026-11-21 audit): resolve the date ONCE. The old code built
        // the payload with `data.date || getToday()` but refetched raw
        // `data.date` — and refetched the AD-HOC's date into `logs`, which
        // must stay scoped to the VIEWED date (logDate), blanking the
        // Delivery page after an extra for another day.
        const date = data.date || getToday();
        // 🗺️ MAP 'custId' from the form to 'customerId' expected by the API.
        // brandId is optional (null → unbranded row, legacy pricing path).
        const payload = {
          customerId: data.custId || data.customerId,
          date,
          qty: data.qty,
          reason: data.reason,
          product: data.product,
          brandId: data.brandId || null,
        };
        const clientKey = resolveAdHocKey(payload);

        await callApi("addAdHocLog", { ...payload, clientKey });
        // Definitive response — consume the key so the NEXT submit mints a
        // fresh one (a deliberate second "2L extra" must accumulate).
        adHocIdemRef.current = null;
        // Refetch the VIEWED date (state.logs contract), and refresh the
        // Dashboard snapshot separately when the extra landed on today
        // while another date is being viewed.
        const viewedDate = logDate || date;
        if (fetchLogs) await fetchLogs(viewedDate);
        if (date === today && viewedDate !== today && refreshTodayLogs) {
          await refreshTodayLogs();
        }
        showToast("Extra delivery added", "success");
        if (closeModal) closeModal();
      } catch (err) {
        // Key deliberately NOT consumed on failure: a retry of this same
        // submit reuses it (idempotent recovery), a different submit mints
        // a new one.
        showToast(err.message || "Failed to add extra delivery", "error");
      }
    },
    [
      showToast,
      closeModal,
      fetchLogs,
      refreshTodayLogs,
      logDate,
      today,
      resolveAdHocKey,
    ],
  );

  const generateDailyLogs = useCallback(
    async (date) => {
      try {
        const summary = await callApi("generateDailyLogsForDate", {
          date,
        });

        const skipped =
          (summary.skippedExisting || 0) +
          (summary.skippedPaused || 0) +
          (summary.skippedWrongDay || 0) +
          (summary.skippedInactiveCust || 0);

        // Refetch BEFORE the toast (single-toast rule §3): fetchLogs also
        // refreshes todayLogs when the generated date is today.
        if (fetchLogs) {
          await fetchLogs(date);
        }

        showToast(
          `Generated ${summary.created} logs. Skipped ${skipped}.`,
          summary.created > 0 ? "success" : "info",
        );
      } catch (err) {
        showToast(err.message || "Failed to generate logs", "error");
      }
    },
    [showToast, fetchLogs],
  );

  return { ...deliveryHandlers, addAdHocLog, generateDailyLogs };
}
