import { useMemo, useCallback } from "react";
import { mapImportToApi, mapImportFromApi, callApi } from "../../lib/api.js";
import { validateImportForm } from "../../lib/validation.js";
import { getToday } from "../../lib/utils.js";
import { useHelpers } from "./shared.js";

export function useImportHandlers(state) {
  const { setImports, form = {} } = state;
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
    (formArg) => {
      const f = formArg || form;
      if (!f.date) {
        return saveWithValidation(
          { ...f, date: getToday() },
          validateImportForm,
          importHandlers,
          "MilkImport",
        );
      }
      return saveWithValidation(
        f,
        validateImportForm,
        importHandlers,
        "MilkImport",
      );
    },
    [saveWithValidation, importHandlers, form],
  );

  // src/hooks/handlers/useImportHandlers.js

  const handleImportAction = useCallback(
    async (action, importId, successMsg, fallbackErrMsg) => {
      // Mutation first (single-toast rule §3 — the old code toasted success
      // before the refetch, so a failed read produced a green-then-red pair).
      let imp = state.imports?.find((i) => i.id === importId);

      // If the import isn't in the in-memory list (race: list refresh
      // hasn't landed yet), try one refetch before bailing. Without the
      // version, confirm/delete RPCs throw "version is required for OCC"
      // and the row silently stays in its prior state.
      if (!imp) {
        try {
          const res = await callApi("getMilkImports", {});
          const fresh = (res.imports || []).map(mapImportFromApi);
          setImports(fresh);
          imp = fresh.find((i) => i.id === importId);
        } catch (err) {
          showToast(err.message || fallbackErrMsg, "error");
          return;
        }
      }

      const payload = { importId };

      // Attach version if it exists (crucial for OCC)
      if (imp && imp.version !== undefined) {
        payload.version = imp.version;
      }

      // ✅ Call the API ONLY ONCE with the versioned payload
      try {
        await callApi(action, payload);
      } catch (err) {
        showToast(err.message || fallbackErrMsg, "error");
        return;
      }
      try {
        const res = await callApi("getMilkImports", {});
        setImports((res.imports || []).map(mapImportFromApi));
      } catch {
        showToast(
          "Import updated — but the list refresh failed. Use Retry.",
          "warning",
        );
        return;
      }
      showToast(successMsg, "success");
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
    async (id, version) => {
      try {
        await callApi("deleteMilkImport", { importId: id, version });
      } catch (err) {
        showToast(err.message || "Failed to delete import", "error");
        return;
      }
      try {
        const res = await callApi("getMilkImports", {});
        setImports((res.imports || []).map(mapImportFromApi));
      } catch {
        showToast(
          "Import deleted — but the list refresh failed. Use Retry.",
          "warning",
        );
        return;
      }
      showToast("Import deleted", "success");
    },
    [showToast, setImports],
  );

  return { ...importHandlers, saveImport, confirmMilkImport, deleteMilkImport };
}
