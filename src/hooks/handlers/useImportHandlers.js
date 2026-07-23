import { useMemo, useCallback } from "react";
import { mapImportToApi, mapImportFromApi, callApi } from "../../lib/api.js";
import { validateImportForm } from "../../lib/validation.js";
import { useHelpers } from "./shared.js";

export function useImportHandlers(state) {
  const { setImports } = state;
  const { handleFormAction, saveWithValidation, showToast } = useHelpers(state);

  const importHandlers = useMemo(
    () => ({
      addMilkImport: async (formArg) =>
        handleFormAction(
          "addMilkImport",
          formArg,
          "Import added",
          mapImportToApi,
          "getMilkImports",
          setImports,
          mapImportFromApi,
          "imports",
        ),
      updateMilkImport: async (formArg) =>
        handleFormAction(
          "updateMilkImport",
          formArg,
          "Import updated",
          mapImportToApi,
          "getMilkImports",
          setImports,
          mapImportFromApi,
          "imports",
        ),
    }),
    [setImports, handleFormAction],
  );

  const saveImport = useCallback(
    (formArg) =>
      saveWithValidation(
        formArg,
        validateImportForm,
        importHandlers,
        "MilkImport",
      ),
    [saveWithValidation, importHandlers],
  );

  // src/hooks/handlers/useImportHandlers.js

  const handleImportAction = useCallback(
    async (action, importId, successMsg, fallbackErrMsg) => {
      try {
        const imp = state.imports?.find((i) => i.id === importId);
        const payload = { importId };

        // Attach version if it exists (crucial for OCC)
        if (imp && imp.version !== undefined) {
          payload.version = imp.version;
        }

        // ✅ FIX: Call the API ONLY ONCE with the versioned payload
        await callApi(action, payload);

        showToast(successMsg, "success");

        // Refetch the updated list
        const res = await callApi("getMilkImports", {});
        setImports((res.imports || []).map(mapImportFromApi));
      } catch (err) {
        showToast(err.message || fallbackErrMsg, "error");
      }
    },
    [state.imports, showToast, setImports],
  );

  const confirmMilkImport = useCallback(
    async (importId) =>
      handleImportAction(
        "confirmMilkImport",
        importId,
        "Import confirmed",
        "Failed to confirm import",
      ),
    [handleImportAction],
  );

  const deleteMilkImport = useCallback(
    async (importId) =>
      handleImportAction(
        "deleteMilkImport",
        importId,
        "Import deleted",
        "Failed to delete import",
      ),
    [handleImportAction],
  );

  return { ...importHandlers, saveImport, confirmMilkImport, deleteMilkImport };
}
