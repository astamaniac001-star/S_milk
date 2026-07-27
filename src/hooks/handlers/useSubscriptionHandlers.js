import { useCallback } from "react";
import { mapSubscriptionFromApi, callApi } from "../../lib/api.js";
import { useHelpers } from "./shared.js";

export function useSubscriptionHandlers(state) {
  const { setSubscriptions, closeModal } = state;
  const { showToast } = useHelpers(state);

  const saveSubscription = useCallback(
    async (data) => {
      try {
        const payload = { ...data };
        if (data.id) {
          payload.expectedVersion = data.version;
        }
        // FIX (audit 2026-07-25, dead code): drop the idempotencyKey generation.
        // `saveSubscription` in lib/api/subscriptions.js has no idempotency-key
        // field on writes, and the `subscriptions` table has no such column,
        // so a generated key was being silently discarded by both the API
        // wrapper and the database. Rule §14 idempotency requirements apply to
        // financial mutations (payments, bill generation); subscription writes
        // are not in that category today. If idempotency is added later, the
        // column and mapper must agree FIRST, and the key must come from
        // generateKey() (UUIDv4) — not from `Math.random()`.
        await callApi("saveSubscription", payload);
        showToast("Subscription saved", "success");
        if (closeModal) closeModal();

        const res = await callApi("getSubscriptions", {});
        setSubscriptions((res.subscriptions || []).map(mapSubscriptionFromApi));
      } catch (err) {
        showToast(err.message || "Failed to save subscription", "error");
      }
    },
    [setSubscriptions, showToast, closeModal],
  );

  const fetchSubscriptionHistory = useCallback(
    async (subscriptionId) => {
      try {
        const res = await callApi("getSubscriptionHistory", { subscriptionId });
        return res.history || [];
      } catch (err) {
        showToast(err.message || "Failed to load history", "error");
        return [];
      }
    },
    [showToast],
  );

  return { saveSubscription, fetchSubscriptionHistory };
}
