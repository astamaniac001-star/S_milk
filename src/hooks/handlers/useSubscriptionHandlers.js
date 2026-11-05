import { useCallback } from "react";
import {
  mapSubscriptionFromApi,
  mapSubscriptionToApi,
  callApi,
} from "../../lib/api.js";
import { validateSubscriptionForm } from "../../lib/validation.js";
import { useHelpers } from "./shared.js";

export function useSubscriptionHandlers(state) {
  const { setSubscriptions, closeModal } = state;
  const { showToast } = useHelpers(state);

  const saveSubscription = useCallback(
    async (data) => {
      try {
        // Client-side gate before the mapper: brand + milk type + qty + days
        // are all required (brand-aware subscriptions). The DB still enforces
        // uniqueness and qty > 0 — validation is evidence, not the boundary.
        const validationError = validateSubscriptionForm(data);
        if (validationError) {
          showToast(validationError, "error");
          return;
        }
        // Rule §4: the mapper owns the UI→DB shape contract (defaults for
        // milkType/isActive, qty numeric coercion, id→expectedVersion for OCC).
        const payload = mapSubscriptionToApi(data);
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

  const deleteSubscription = useCallback(
    async (subscription) => {
      if (!subscription?.id) {
        showToast("Subscription id is required", "error");
        return;
      }
      if (subscription.version === undefined) {
        showToast("Subscription version is required", "error");
        return;
      }
      try {
        await callApi("deleteSubscription", {
          subscriptionId: subscription.id,
          version: subscription.version,
        });
        showToast("Subscription deleted", "success");
        const res = await callApi("getSubscriptions", {});
        setSubscriptions(
          (res.subscriptions || []).map(mapSubscriptionFromApi),
        );
      } catch (err) {
        showToast(err.message || "Failed to delete subscription", "error");
      }
    },
    [setSubscriptions, showToast],
  );

  return {
    saveSubscription,
    fetchSubscriptionHistory,
    deleteSubscription,
  };
}
