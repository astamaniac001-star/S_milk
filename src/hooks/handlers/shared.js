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
      try {
        // 1. Perform the action (add, update, etc.)
        const actionRes = await callApi(action, payload);
        if (import.meta.env.DEV) console.warn("✅ ACTION RESULT:", actionRes);

        showToast(successMsg, "success");
        if (closeModal) closeModal();

        // 2. Fetch the updated list
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
        if (import.meta.env.DEV) console.error("❌ EXECUTE API ERROR:", e);
        showToast(e.message || "Unknown error", "error");
      }
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

  const handleIdAction = useCallback(
    async (
      action,
      idKey,
      id,
      successMsg,
      getList,
      setList,
      mapFromApi,
      resKey,
      fallbackErrMsg,
    ) => {
      if (import.meta.env.DEV)
        console.warn("🆔 HANDLE ID ACTION:", action, idKey, id);
      try {
        await callApi(action, { [idKey]: id });
        showToast(successMsg, "success");
        const res = await callApi(getList, {});
        if (import.meta.env.DEV)
          console.warn("📦 RAW LIST RESPONSE (res):", res);
        setList((res ? res[resKey] || [] : []).map(mapFromApi));
      } catch (err) {
        if (import.meta.env.DEV) console.error("❌ ID ACTION ERROR:", err);
        showToast(fallbackErrMsg || err.message, "error");
      }
    },
    [showToast],
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
        return;
      }

      const validationError = validateFn(f);
      if (import.meta.env.DEV)
        console.warn("🔍 VALIDATION RESULT:", validationError);

      if (validationError) {
        showToast(validationError, "error");
        return;
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
    handleIdAction,
    saveWithValidation,
  };
}
