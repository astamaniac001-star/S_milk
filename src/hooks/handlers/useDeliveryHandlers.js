import { useMemo, useCallback } from "react";
import { mapLogFromApi, callApi } from "../../lib/api.js";
import { getToday } from "../../lib/utils.js";
import { useHelpers } from "./shared.js";

export function useDeliveryHandlers(state) {
  const { setLogs, logDate, closeModal } = state;
  const { showToast } = useHelpers(state);

  const deliveryHandlers = useMemo(
    () => ({
      toggleDeliveryLog: async (logId, delivered) => {
        try {
          const payload = {
            logId,
            delivered,
            date: logDate || getToday(),
            idempotencyKey: Date.now().toString(),
          };
          await callApi("updateLogEntry", payload);
          showToast("Log updated", "success");
          const res = await callApi("getDailyLogs", {
            date: logDate || getToday(),
          });
          setLogs((res.logs || []).map(mapLogFromApi));
        } catch (e) {
          showToast(e.message, "error");
        }
      },
      bulkUpsertLogs: async (logsToUpsert) => {
        try {
          const payload = {
            logs: logsToUpsert,
            idempotencyKey: Date.now().toString(),
          };
          await callApi("bulkUpsertLogs", payload);
          const res = await callApi("getDailyLogs", {
            date: logDate || getToday(),
          });
          setLogs((res.logs || []).map(mapLogFromApi));
          showToast("Logs saved", "success");
        } catch (e) {
          showToast(e.message, "error");
        }
      },
    }),
    [setLogs, showToast, logDate],
  );

  const addAdHocLog = useCallback(
    async (data) => {
      try {
        // 🗺️ MAP 'custId' from the form to 'customerId' expected by the API
        const payload = {
          customerId: data.custId || data.customerId,
          date: data.date,
          qty: data.qty,
          reason: data.reason,
          product: data.product,
          idempotencyKey: `adhoc-${Date.now()}`,
        };

        await callApi("addAdHocLog", payload);
        showToast("Extra delivery added", "success");
        if (closeModal) closeModal();
        if (state.fetchLogs) await state.fetchLogs(data.date);
      } catch (err) {
        showToast(err.message || "Failed to add extra delivery", "error");
      }
    },
    [showToast, closeModal, state],
  );

  const generateDailyLogs = useCallback(
    async (date) => {
      try {
        const idempotencyKey = `gen-logs-${date}-${Date.now()}`;
        const summary = await callApi("generateDailyLogsForDate", {
          date,
          idempotencyKey,
        });

        const skipped =
          (summary.skippedExisting || 0) +
          (summary.skippedPaused || 0) +
          (summary.skippedWrongDay || 0) +
          (summary.skippedInactiveCust || 0);

        showToast(
          `Generated ${summary.created} logs. Skipped ${skipped}.`,
          summary.created > 0 ? "success" : "info",
        );

        if (state.fetchLogs) {
          await state.fetchLogs(date);
        }
      } catch (err) {
        showToast(err.message || "Failed to generate logs", "error");
      }
    },
    [showToast, state],
  );

  return { ...deliveryHandlers, addAdHocLog, generateDailyLogs };
}
