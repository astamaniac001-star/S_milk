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
      // Audit 2026-11-09 (F13): duplicate brand names make the name-based
      // import prefill ambiguous. save_brand_rpc deliberately has no
      // name-unique constraint (renames must not break existing name
      // references in milk_imports), so the guard lives here: block a new
      // duplicate and block renaming onto another brand's name, while an
      // edit that keeps its own name still passes.
      const editId = f.id ?? modal.data?.id;
      const duplicate = (brands || []).find(
        (b) =>
          String(b.name || "")
            .trim()
            .toLowerCase() === String(brandName).trim().toLowerCase() &&
          b.id !== editId,
      );
      if (duplicate) {
        showToast(`A brand named "${duplicate.name}" already exists`, "error");
        return;
      }
      // Rates: BrandModal sends a rates array ({milkType, rate} rows). A
      // legacy single {defaultType, rate} form shape is mapped into one row
      // so both contracts land on save_brand_rpc's replace-all semantics.
      // A brand with NO rate is rejected — saving a 0 rate would price that
      // brand's deliveries at ₹0 without the operator asking for it.
      const rawRates = Array.isArray(f.rates)
        ? f.rates
        : f.rate !== undefined && f.rate !== ""
          ? [
              {
                milkType: f.defaultType || "Full Cream",
                rate: Number(f.rate),
              },
            ]
          : [];
      const rates = rawRates.filter(
        (r) => String(r?.milkType ?? "").trim() !== "",
      );
      if (rates.length === 0) {
        showToast("Enter a rate for at least one milk type", "error");
        return;
      }
      // One rate per milk type per brand (brand_rates UNIQUE
      // (brand_id, milk_type)). The RPC rejects duplicates, but failing here
      // keeps the operator in the editor with an actionable message instead of
      // a server-side "duplicate milk type" error.
      const seenTypes = new Set();
      for (const r of rates) {
        const type = String(r.milkType).trim();
        if (seenTypes.has(type)) {
          showToast(`"${type}" already has a rate for this brand`, "error");
          return;
        }
        seenTypes.add(type);
        if (r.rate === "" || r.rate === undefined || r.rate === null) {
          showToast(`Enter a rate for "${type}"`, "error");
          return;
        }
        const rate = Number(r.rate);
        // ₹0 is rejected by decision (2026-11-21): free milk must be an
        // explicit pricing decision, not a forgotten rate — a zero rate
        // silently prices that brand's deliveries at ₹0 at billing time.
        if (!Number.isFinite(rate) || rate <= 0) {
          showToast(`Enter a rate greater than 0 for "${type}"`, "error");
          return;
        }
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
