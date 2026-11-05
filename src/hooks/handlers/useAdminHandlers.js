import { useMemo, useCallback } from "react";
import {
  mapPauseFromApi,
  mapBrandFromApi,
  mapBrandToApi,
  callApi,
} from "../../lib/api.js";
import { getToday } from "../../lib/utils.js";
import { useHelpers } from "./shared.js";
import { useBusy } from "../useBusy.js";

export function useAdminHandlers(state) {
  const {
    setPauses,
    setBrands,
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
      return adminHandlers.addPause(
        f.custId || modal.data?.custId,
        f.startDate || getToday(),
        f.endDate,
        f.reason,
      );
    },
    [adminHandlers, form, modal],
  );

  const saveBrand = useCallback(
    async (formArg) => {
      const f = formArg || form;
      if (!f) return;
      const brandName =
        f.name ||
        f.brandName ||
        modal.data?.name ||
        modal.data?.brandName ||
        "";
      if (!brandName || !String(brandName).trim()) {
        showToast("Brand name is required", "error");
        return;
      }
      // Rates: BrandModal sends a rates array ({milkType, rate} rows). A
      // legacy single {defaultType, rate} form shape is mapped into one row
      // so both contracts land on save_brand_rpc's replace-all semantics.
      const rates =
        Array.isArray(f.rates) && f.rates.length > 0
          ? f.rates
          : [
              {
                milkType: f.defaultType || "Full Cream",
                rate: f.rate !== undefined && f.rate !== "" ? Number(f.rate) : 0,
              },
            ];
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
    [setBrands, showToast, closeModal, form, modal],
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
      showToast("Health check passed — V17", "success");
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
  const [, rotatePin] = useBusy(async ({ currentPin, newPin }) => {
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
  }, [showToast, closeModal]);

  return {
    ...adminHandlers,
    savePause,
    saveBrand,
    runDiagnostics,
    healthCheck,
    rotatePin,
  };
}
