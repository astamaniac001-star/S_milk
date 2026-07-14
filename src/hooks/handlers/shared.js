import { useCallback } from "react";
import { callApi } from "../../lib/api.js";

export function useHelpers(state) {
  const { toast$, closeModal, form = {} } = state;

  const showToast = useCallback((msg, type) => {
    console.log(`🍞 TOAST: [${type}] ${msg}`);
    toast$(msg, type);
  }, [toast$]);

  const executeApiAction = useCallback(
    async (action, payload, successMsg, getList, setList, mapFromApi, resKey) => {
      console.log(`🔥 EXECUTE API: action="${action}", getList="${getList}", resKey="${resKey}"`);
      try {
        // 1. Perform the action (add, update, etc.)
        const actionRes = await callApi(action, payload);
        console.log("✅ ACTION RESULT:", actionRes);

        showToast(successMsg, "success");
        if (closeModal) closeModal();

        // 2. Fetch the updated list
        const res = await callApi(getList, {});
        console.log("📦 RAW LIST RESPONSE (res):", res);
        console.log("🔑 LOOKING FOR KEY:", resKey, "→ VALUE:", res ? res[resKey] : "res is undefined/null");

        // 3. Map and set the list
        const rawData = res ? (res[resKey] || []) : [];
        console.log("🔄 RAW DATA TO MAP:", rawData);

        const mappedData = rawData.map(mapFromApi);
        console.log("✨ MAPPED DATA:", mappedData);

        setList(mappedData);
      } catch (e) {
        console.error("❌ EXECUTE API ERROR:", e);
        showToast(e.message || "Unknown error", "error");
      }
    },
    [showToast, closeModal],
  );

  const handleFormAction = useCallback(
    async (action, formArg, successMsg, mapToApi, getList, setList, mapFromApi, resKey) => {
      console.log("📝 HANDLE FORM ACTION:", action, formArg);
      const f = formArg || form;
      const payload = mapToApi(f);
      console.log("📦 MAPPED PAYLOAD:", payload);
      return executeApiAction(action, payload, successMsg, getList, setList, mapFromApi, resKey);
    },
    [form, executeApiAction],
  );

  const handleIdAction = useCallback(
    async (action, idKey, id, successMsg, getList, setList, mapFromApi, resKey, fallbackErrMsg) => {
      console.log("🆔 HANDLE ID ACTION:", action, idKey, id);
      try {
        await callApi(action, { [idKey]: id });
        showToast(successMsg, "success");
        const res = await callApi(getList, {});
        console.log("📦 RAW LIST RESPONSE (res):", res);
        setList((res ? (res[resKey] || []) : []).map(mapFromApi));
      } catch (err) {
        console.error("❌ ID ACTION ERROR:", err);
        showToast(fallbackErrMsg || err.message, "error");
      }
    },
    [showToast],
  );

  const saveWithValidation = useCallback(
    async (formArg, validateFn, handlers, entityName) => {
      console.log("💾 SAVE WITH VALIDATION:", formArg, "Entity:", entityName);
      const f = formArg || form;

      if (!f || Object.keys(f).length === 0) {
        console.warn("⚠️ Form is empty! Aborting save.");
        return;
      }

      const validationError = validateFn(f);
      console.log("🔍 VALIDATION RESULT:", validationError);

      if (validationError) {
        showToast(validationError, "error");
        return;
      }

      console.log("🚀 CALLING HANDLER:", f.id ? `update${entityName}` : `add${entityName}`);
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
    handleIdAction,
    saveWithValidation,
  };
}