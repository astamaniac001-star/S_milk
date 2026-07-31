import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAdminHandlers } from "./useAdminHandlers";

// Mock callApi so the handler tests are unit-level (no Supabase).
vi.mock("../../lib/api", () => ({
  callApi: vi.fn(),
  mapPauseFromApi: vi.fn((x) => x),
  mapBrandFromApi: vi.fn((x) => x),
}));

import { callApi } from "../../lib/api";

function baseState(overrides = {}) {
  return {
    setPauses: vi.fn(),
    setBrands: vi.fn(),
    setAdjustments: vi.fn(),
    setBills: vi.fn(),
    setDiagRan: vi.fn(),
    setDiagResults: vi.fn(),
    closeModal: vi.fn(),
    toast$: vi.fn(),
    form: {},
    modal: {},
    ...overrides,
  };
}

describe("useAdminHandlers — diagnostics + health + rotatePin (audit 2026-07-24)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runDiagnostics calls callApi('runDiagnostics'), flips diagRan, toasts success", async () => {
    callApi.mockResolvedValue({ status: "OK" });
    const s = baseState();
    const { result } = renderHook(() => useAdminHandlers(s));
    await act(async () => {
      await result.current.runDiagnostics();
    });
    expect(callApi).toHaveBeenCalledWith("runDiagnostics");
    expect(s.setDiagRan).toHaveBeenCalledWith(true);
    expect(s.toast$).toHaveBeenCalledWith(
      "Diagnostics executed successfully",
      "success",
    );
  });

  it("runDiagnostics persists the live probe results into state (audit §3.9)", async () => {
    const live = {
      ok: true,
      mode: "Production",
      probes: {
        "Schema version": { ok: true, value: "V17" },
        "MilkBrands seeded": { ok: true, value: "2 active / 2 total" },
      },
    };
    callApi.mockResolvedValue(live);
    const s = baseState();
    const { result } = renderHook(() => useAdminHandlers(s));
    await act(async () => {
      await result.current.runDiagnostics();
    });
    expect(s.setDiagResults).toHaveBeenCalledWith(live);
  });

  it("runDiagnostics swallows re-entrant taps (busy guard)", async () => {
    let resolve;
    callApi.mockImplementation(
      () => new Promise((r) => { resolve = r; }),
    );
    const s = baseState();
    const { result } = renderHook(() => useAdminHandlers(s));
    // First call in flight, second should be a no-op
    const first = act(async () => { await result.current.runDiagnostics(); });
    await act(async () => { await result.current.runDiagnostics(); });
    // Only the first call should have hit callApi; the second is swallowed
    expect(callApi).toHaveBeenCalledTimes(1);
    resolve();
    await first;
  });

  it("runDiagnostics surfaces API failure as an error toast (no throw to caller)", async () => {
    callApi.mockRejectedValue(new Error("DB down"));
    const s = baseState();
    const { result } = renderHook(() => useAdminHandlers(s));
    await act(async () => {
      await result.current.runDiagnostics();
    });
    expect(s.toast$).toHaveBeenCalledWith("DB down", "error");
    // setDiagRan must NOT fire on failure — the action didn't run
    expect(s.setDiagRan).not.toHaveBeenCalled();
    // Live results must not be written on failure — the card stays in the
    // placeholder state rather than showing a stale/partial result set.
    expect(s.setDiagResults).not.toHaveBeenCalled();
  });

  it("healthCheck toasts 'Health check passed — V17' on success", async () => {
    callApi.mockResolvedValue({ status: "Healthy" });
    const s = baseState();
    const { result } = renderHook(() => useAdminHandlers(s));
    await act(async () => {
      await result.current.healthCheck();
    });
    expect(callApi).toHaveBeenCalledWith("healthCheck");
    expect(s.toast$).toHaveBeenCalledWith("Health check passed — V17", "success");
  });

  it("healthCheck toasts the error message on failure", async () => {
    callApi.mockRejectedValue(new Error("settings unreachable"));
    const s = baseState();
    const { result } = renderHook(() => useAdminHandlers(s));
    await act(async () => {
      await result.current.healthCheck();
    });
    expect(s.toast$).toHaveBeenCalledWith("settings unreachable", "error");
  });

  it("rotatePin returns true, toasts success, closes modal on success", async () => {
    callApi.mockResolvedValue({ success: true });
    const s = baseState();
    const { result } = renderHook(() => useAdminHandlers(s));
    let ok;
    await act(async () => {
      ok = await result.current.rotatePin({ currentPin: "111111", newPin: "222222" });
    });
    expect(callApi).toHaveBeenCalledWith("rotatePIN", {
      currentPin: "111111",
      newPin: "222222",
    });
    expect(ok).toBe(true);
    expect(s.toast$).toHaveBeenCalledWith(
      "PIN updated successfully! Use it next time you log in.",
      "success",
    );
    expect(s.closeModal).toHaveBeenCalled();
  });

  it("rotatePin returns false + error toast on failure (no modal close)", async () => {
    callApi.mockRejectedValue(new Error("Current PIN is incorrect."));
    const s = baseState();
    const { result } = renderHook(() => useAdminHandlers(s));
    let ok;
    await act(async () => {
      ok = await result.current.rotatePin({ currentPin: "wrong", newPin: "222222" });
    });
    expect(ok).toBe(false);
    expect(s.toast$).toHaveBeenCalledWith("Current PIN is incorrect.", "error");
    expect(s.closeModal).not.toHaveBeenCalled();
  });

  it("rotatePin swallows re-entrant rapid taps", async () => {
    let resolve;
    callApi.mockImplementation(() => new Promise((r) => { resolve = r; }));
    const s = baseState();
    const { result } = renderHook(() => useAdminHandlers(s));
    const first = act(async () => { await result.current.rotatePin({ currentPin: "x", newPin: "y" }); });
    await act(async () => { await result.current.rotatePin({ currentPin: "x", newPin: "y" }); });
    expect(callApi).toHaveBeenCalledTimes(1);
    resolve({ success: true });
    await first;
  });
});
