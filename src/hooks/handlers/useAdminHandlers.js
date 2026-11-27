import { useMemo, useCallback } from "react";
import {
  mapPauseFromApi,
  mapBrandFromApi,
  mapBrandToApi,
  callApi,
} from "../../lib/api.js";
import { getToday } from "../../lib/utils.js";
import {
  resolveBrandName,
  findDuplicateBrand,
  normalizeBrandRates,
  validateBrandName,
  validateBrandRates,
} from "../../lib/validation.js";
import { useHelpers } from "./shared.js";
import { useBusy } from "../useBusy.js";

export function useAdminHandlers(state) {
  const {
    setPauses,
    setBrands,
    brands = [],
    form = {},
    modal = {},
    closeModal,
    setDiagRan,
    setDiagResults,
  } = state;
  const { showToast, executeApiAction } = useHelpers(state);

  const adminHandlers = useMemo(
    () => ({
      // FIX (audit 2026-07-25): removed `addBrand` from this useMemo. It only
      // sent `{ brandName, idempotencyKey }` (missing supplier/phone/rate/
      // defaultMilkType), so any code path that called `handlers.addBrand`
      // directly would create brands with null supplier fields. The real
      // save path is `saveBrand` below (wired to BrandModal's onSave via
      // AppModals.jsx) — `addBrand` was NEVER wired to the UI but its
      // presence in the spread made it look like a viable alternative path.
      // Same pattern for `addPause`: still here because MealModal directly
      // invokes adminHandlers.addPause via ctx-savePause (see below).
      addPause: async (customerId, startDate, endDate, reason) => {
        const payload = {
          customerId,
          startDate,
          endDate,
          reason,
        };
        return executeApiAction(
          "addPausePeriod",
          payload,
          "Pause added",
          "getPauses",
          setPauses,
          mapPauseFromApi,
          "pauses",
        );
      },
    }),
    [executeApiAction, setPauses],
  );

  const savePause = useCallback(
    async (formArg) => {
      const f = formArg || form;
      if (!f) return;
      // FIX (2026-11-21 audit — AI-L M3): validate before insert. A NULL
      // customer_id created an orphan pause the generator silently ignored,
      // and an inverted range (end < start) was stored as-is — the DB has
      // no CHECK for either.
      const customerId = f.custId || modal.data?.custId;
      if (!customerId) {
        showToast("Select a customer for the pause period", "error");
        return;
      }
      const startDate = f.startDate || getToday();
      if (f.endDate && String(f.endDate) < String(startDate)) {
        showToast("End date must be on or after the start date", "error");
        return;
      }
      return adminHandlers.addPause(customerId, startDate, f.endDate, f.reason);
    },
    [adminHandlers, form, modal, showToast],
  );

  const saveBrand = useCallback(
    async (formArg) => {
      const f = formArg || form;
      if (!f) return;
      const brandName = resolveBrandName(f, modal.data);
      const nameError = validateBrandName(brandName);
      if (nameError) {
        showToast(nameError, "error");
        return;
      }
      // Audit 2026-11-09 (F13): duplicate-name guard — see
      // lib/validation/brand.js#findDuplicateBrand for the rationale.
      const editId = f.id ?? modal.data?.id;
      const duplicate = findDuplicateBrand(brands, brandName, editId);
      if (duplicate) {
        showToast(`A brand named "${duplicate.name}" already exists`, "error");
        return;
      }
      // Rates: canonical shape + every pricing guard live in
      // lib/validation/brand.js so they are unit-testable without React.
      const rates = normalizeBrandRates(f);
      const ratesError = validateBrandRates(rates);
      if (ratesError) {
        showToast(ratesError, "error");
        return;
      }
      try {
        await callApi(
          "saveBrand",
          mapBrandToApi({
            id: f.id ?? modal.data?.id,
            name: String(brandName).trim(),
            supplier: f.supplier ?? modal.data?.supplier,
            phone: f.phone ?? modal.data?.phone,
            status: f.status ?? modal.data?.status,
            rates,
          }),
        );
        showToast("Brand saved", "success");
        if (closeModal) closeModal();
        const res = await callApi("getBrands", {});
        setBrands((res.brands || []).map(mapBrandFromApi));
      } catch (err) {
        showToast(err.message || "Failed to save brand", "error");
      }
    },
    [setBrands, showToast, closeModal, form, modal, brands],
  );

  // FIX (audit 2026-07-24): moved here from AppPage.jsx so the re-entrancy
  // guard (busyRef) actually fires. The inline version in AppPage bypassed
  // useBusy and could double-fire on rapid taps. Each handler tracks its own
  // busy flag so toggling diagnostics does not disable health-check (or vice versa).
  const [, runDiagnostics] = useBusy(async () => {
    try {
      const res = await callApi("runDiagnostics");
      if (typeof setDiagRan === "function") setDiagRan(true);
      // Persist the live per-item probe results so the More page can render
      // verified values instead of a static reference list (audit §3.9).
      if (typeof setDiagResults === "function") setDiagResults(res);
      showToast("Diagnostics executed successfully", "success");
    } catch (err) {
      showToast(err?.message || "Diagnostics failed", "error");
    }
  }, [showToast, setDiagRan, setDiagResults]);

  // FIX (AI-m audit M-4, 2026-08-01): healthCheck now returns the live
  // response so the SystemHealthCard can re-render with fresh probe data
  // instead of staying on a stale static list. Callers should still toast
  // on success/failure via their own feedback; this handler returns the
  // raw payload.
  const [, healthCheck] = useBusy(async () => {
    try {
      const result = await callApi("healthCheck");
      // FIX (2026-11-21 audit — AI-S L2): the hardcoded "V17" drifted from
      // reality and contradicted the payload contract. State the fact, not
      // a version label.
      showToast("Health check passed", "success");
      return result;
    } catch (err) {
      showToast(err?.message || "Health check failed", "error");
      return null;
    }
  }, [showToast]);

  // FIX (audit 2026-07-24): move PIN rotation out of ChangePinModal so the
  // component does not import callApi directly (rule §1 — components go through
  // handlers). The modal will call this handler instead. busyRef guards
  // re-entrant rapid taps on the "Update PIN" button.
  const [, rotatePin] = useBusy(
    async ({ currentPin, newPin }) => {
      try {
        await callApi("rotatePIN", { currentPin, newPin });
        showToast(
          "PIN updated successfully! Use it next time you log in.",
          "success",
        );
        if (closeModal) closeModal();
        return true;
      } catch (err) {
        showToast(err?.message || "Failed to update PIN", "error");
        return false;
      }
    },
    [showToast, closeModal],
  );

  return {
    ...adminHandlers,
    savePause,
    saveBrand,
    runDiagnostics,
    healthCheck,
    rotatePin,
  };
}
