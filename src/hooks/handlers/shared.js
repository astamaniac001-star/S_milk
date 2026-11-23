import { useCallback } from "react";
import { callApi } from "../../lib/api.js";

export function useHelpers(state) {
  const { toast$, closeModal, form = {} } = state;

  const showToast = useCallback(
    (msg, type) => {
      if (import.meta.env.DEV) console.warn(`🍞 TOAST: [${type}] ${msg}`);
      toast$(msg, type);
    },
    [toast$],
  );

  const executeApiAction = useCallback(
    async (
      action,
      payload,
      successMsg,
      getList,
      setList,
      mapFromApi,
      resKey,
    ) => {
      if (import.meta.env.DEV)
        console.warn(
          `🔥 EXECUTE API: action="${action}", getList="${getList}", resKey="${resKey}"`,
        );
      // 1. Perform the mutation. A failure here is THE error for this action.
      try {
        const actionRes = await callApi(action, payload);
        if (import.meta.env.DEV) console.warn("✅ ACTION RESULT:", actionRes);
      } catch (e) {
        if (import.meta.env.DEV) console.error("❌ EXECUTE API ERROR:", e);
        showToast(e.message || "Unknown error", "error");
        return false;
      }

      // Guard: some callers (e.g. deactivateCustomer from the Customers
      // page) are not invoked from a modal. Closing is a no-op there but
      // must not throw if `closeModal` is ever undefined on `state`.
      if (closeModal) closeModal();

      // 2. Fetch the updated list — SEPARATELY from the mutation (FIX
      // 2026-11-21 audit, single-toast rule §3): the old code toasted
      // success BEFORE the refetch inside one try/catch, so a failed READ
      // after a successful WRITE produced a green-then-red double toast.
      // Now: mutation failure → one error toast; refetch failure → one
      // warning toast that says the save landed but the list is stale.
      try {
        const res = await callApi(getList, {});
        if (import.meta.env.DEV) {
          console.warn("📦 RAW LIST RESPONSE (res):", res);
          console.warn(
            "🔑 LOOKING FOR KEY:",
            resKey,
            "→ VALUE:",
            res ? res[resKey] : "res is undefined/null",
          );
        }

        // 3. Map and set the list
        const rawData = res ? res[resKey] || [] : [];
        if (import.meta.env.DEV) console.warn("🔄 RAW DATA TO MAP:", rawData);

        const mappedData = rawData.map(mapFromApi);
        if (import.meta.env.DEV) console.warn("✨ MAPPED DATA:", mappedData);

        setList(mappedData);
      } catch (e) {
        if (import.meta.env.DEV) console.error("❌ REFETCH ERROR:", e);
        showToast(
          "Saved — but the list refresh failed. Use Retry to reload it.",
          "warning",
        );
        // The MUTATION succeeded — report success so callers that manage
        // their own UI state (e.g. clearing form flags) don't roll back.
        return true;
      }

      showToast(successMsg, "success");
      return true; // success signal for callers that manage their own UI state
    },
    [showToast, closeModal],
  );

  const handleFormAction = useCallback(
    async (
      action,
      formArg,
      successMsg,
      mapToApi,
      getList,
      setList,
      mapFromApi,
      resKey,
    ) => {
      if (import.meta.env.DEV)
        console.warn("📝 HANDLE FORM ACTION:", action, formArg);
      const f = formArg || form;
      const payload = mapToApi(f);
      if (import.meta.env.DEV) console.warn("📦 MAPPED PAYLOAD:", payload);
      return executeApiAction(
        action,
        payload,
        successMsg,
        getList,
        setList,
        mapFromApi,
        resKey,
      );
    },
    [form, executeApiAction],
  );

  const saveWithValidation = useCallback(
    async (formArg, validateFn, handlers, entityName) => {
      if (import.meta.env.DEV)
        console.warn(
          "💾 SAVE WITH VALIDATION:",
          formArg,
          "Entity:",
          entityName,
        );
      const f = formArg || form;

      if (!f || Object.keys(f).length === 0) {
        if (import.meta.env.DEV)
          console.warn("⚠️ Form is empty! Aborting save.");
        return false;
      }

      const validationError = validateFn(f);
      if (import.meta.env.DEV)
        console.warn("🔍 VALIDATION RESULT:", validationError);

      if (validationError) {
        showToast(validationError, "error");
        return false;
      }

      if (import.meta.env.DEV)
        console.warn(
          "🚀 CALLING HANDLER:",
          f.id ? `update${entityName}` : `add${entityName}`,
        );
      if (f.id) {
        return handlers[`update${entityName}`](f);
      }
      return handlers[`add${entityName}`](f);
    },
    [form, showToast],
  );

  return {
    showToast,
    executeApiAction,
    handleFormAction,
    saveWithValidation,
  };
}
