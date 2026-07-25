import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SubscriptionHistoryModal } from "./SubscriptionHistoryModal.jsx";

// Audit fix: the modal must not hang on "Loading timeline..." forever when
// the fetch rejects. The previous version omitted .catch entirely.

describe("SubscriptionHistoryModal — fetch error handling (audit 2026-07-24)", () => {
  it("renders 'No changes recorded yet.' instead of 'Loading...' when the handler resolves empty", async () => {
    const handlers = {
      fetchSubscriptionHistory: vi.fn().mockResolvedValue([]),
    };
    render(
      <SubscriptionHistoryModal
        data={{ id: "sub-1", customerId: "c-1" }}
        handlers={handlers}
        customers={[{ id: "c-1", name: "Ramesh" }]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/Loading timeline/i)).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText(/No changes recorded yet/i)).toBeTruthy();
    });
    expect(handlers.fetchSubscriptionHistory).toHaveBeenCalledWith("sub-1");
  });

  it("does NOT hang on Loading forever when the handler rejects", async () => {
    const handlers = {
      fetchSubscriptionHistory: vi.fn().mockRejectedValue(new Error("rpc down")),
    };
    render(
      <SubscriptionHistoryModal
        data={{ id: "sub-2", customerId: "c-2" }}
        handlers={handlers}
        customers={[{ id: "c-2", name: "Sita" }]}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => {
      // After rejection the modal must clear loading and show the empty state
      // (rather than hanging on "Loading timeline..." forever).
      expect(screen.getByText(/No changes recorded yet/i)).toBeTruthy();
      expect(screen.queryByText(/Loading timeline/i)).toBeNull();
    });
  });

  it("renders the history timeline when the handler resolves with entries", async () => {
    const handlers = {
      fetchSubscriptionHistory: vi.fn().mockResolvedValue([
        {
          id: "h1",
          action: "CREATED",
          details: "Full Cream · 2L",
          timestamp: new Date("2026-07-24T10:00:00Z").toISOString(),
        },
      ]),
    };
    render(
      <SubscriptionHistoryModal
        data={{ id: "sub-3", customerId: "c-3" }}
        handlers={handlers}
        customers={[{ id: "c-3", name: "Mohan" }]}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("CREATED")).toBeTruthy();
      expect(screen.getByText(/Full Cream · 2L/)).toBeTruthy();
    });
  });
});
