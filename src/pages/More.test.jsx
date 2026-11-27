import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Mock the UI primitives + icon so the test is a focused unit test of the
// Diagnostics card's live-probe rendering (audit §3.9 wiring).
vi.mock("../components/ui.jsx", () => ({
  Card: ({ children }) => <div data-testid="card">{children}</div>,
  CardHeader: ({ title, action }) => (
    <div data-testid="card-header">
      <span>{title}</span>
      {action}
    </div>
  ),
  Btn: ({ children, onClick }) => (
    <button onClick={onClick} data-testid="btn">
      {children}
    </button>
  ),
  Section: () => null,
  Empty: ({ msg }) => <div data-testid="empty">{msg}</div>,
  Badge: ({ label }) => <div data-testid="badge">{label}</div>,
}));
// 2026-11 redesign: More.jsx now imports several lucide icons for card
// headers. Spread the real module (icons render as inline SVGs, harmless in
// jsdom) and keep the one stub the suite historically relied on.
vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ShieldCheck: () => <svg data-testid="shield" />,
  };
});

import More from "./More.jsx";

const baseProps = {
  adjustments: [],
  creditNotes: [],
  pauses: [],
  customers: [],
  bills: [],
  billMonth: "2026-11",
  onOpenModal: vi.fn(),
  onApplyAdj: vi.fn(),
  onApplyCn: vi.fn(),
  onRunDiag: vi.fn(),
  onHealthCheck: vi.fn(),
};

// Scope queries to the Diagnostics card. Other cards render "V17"/"Production"
// too via the static HEALTH list, so we must isolate the live probe rows.
function diagCard() {
  const title = screen.getByText("Diagnostics");
  return within(title.closest('[data-testid="card"]'));
}

describe("More page — Diagnostics live rendering (audit §3.9)", () => {
  it("shows the placeholder before diagnostics are run", () => {
    render(<More {...baseProps} diagRan={false} diagResults={null} />);
    expect(
      screen.getByText(/Tap Run to check connectivity/),
    ).toBeInTheDocument();
    // The old static "Not yet implemented" placeholder + audit footnote are gone.
    expect(screen.queryByText(/Not yet implemented/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Static reference list/)).not.toBeInTheDocument();
  });

  it("renders live per-item probe values after Run", () => {
    const diagResults = {
      ok: true,
      error: null,
      mode: "Production",
      probes: {
        "Schema version": { ok: true, value: "V17" },
        "API version": { ok: true, value: "17" },
        Migration: { ok: true, value: "Supabase CLI" },
        Mode: { ok: true, value: "Production" },
        "MilkTypes seeded": { ok: true, value: "7 total", detail: "2 in use" },
        "MilkBrands seeded": { ok: true, value: "2 active / 5 total" },
      },
    };
    render(<More {...baseProps} diagRan={true} diagResults={diagResults} />);

    const { getByText, queryByText } = diagCard();
    // Labels (icon + label share one span, so match by substring on spans).
    expect(
      getByText(/Schema version/, { selector: "span" }),
    ).toBeInTheDocument();
    expect(getByText(/API version/, { selector: "span" })).toBeInTheDocument();
    expect(getByText(/Migration/, { selector: "span" })).toBeInTheDocument();
    expect(
      getByText(/MilkTypes seeded/, { selector: "span" }),
    ).toBeInTheDocument();
    expect(
      getByText(/MilkBrands seeded/, { selector: "span" }),
    ).toBeInTheDocument();
    // Values (value spans carry the exact value string).
    expect(getByText("V17")).toBeInTheDocument();
    expect(getByText("17")).toBeInTheDocument();
    expect(getByText("Supabase CLI")).toBeInTheDocument();
    expect(getByText(/7 total/, { selector: "span" })).toBeInTheDocument();
    expect(getByText(/2 in use/, { selector: "span" })).toBeInTheDocument();
    expect(getByText("2 active / 5 total")).toBeInTheDocument();
    expect(
      queryByText(/Tap Run to check connectivity/),
    ).not.toBeInTheDocument();
  });

  it("renders ❌ + an offline error banner for unhealthy probes", () => {
    const diagResults = {
      ok: false,
      error: "permission denied for table settings",
      mode: "Production",
      probes: {
        "Schema version": { ok: false, value: "offline" },
        "MilkBrands seeded": { ok: false, value: "offline" },
        Mode: { ok: true, value: "Production" },
      },
    };
    render(<More {...baseProps} diagRan={true} diagResults={diagResults} />);

    const { getByText, getAllByText } = diagCard();
    expect(
      getByText(/Schema version/, { selector: "span" }),
    ).toBeInTheDocument();
    expect(
      getByText(/MilkBrands seeded/, { selector: "span" }),
    ).toBeInTheDocument();
    expect(getAllByText("offline").length).toBe(2);
    expect(getByText("Production")).toBeInTheDocument();
    // The connectivity error text is surfaced under the probe list.
    expect(
      screen.getByText(/permission denied for table settings/),
    ).toBeInTheDocument();
  });
});

describe("More page — Credit Notes card (2026-11-21, AI-L H1 regression)", () => {
  it("lists credit notes with the issued amount and Applied/Pending badge", () => {
    render(
      <More
        {...baseProps}
        creditNotes={[
          {
            id: "CN1",
            customerId: "C1",
            billId: null,
            amount: 120,
            reason: "Spoiled delivery",
            applied: false,
            date: "2026-11-05",
            version: 1,
          },
          {
            id: "CN2",
            customerId: "C2",
            amount: 40,
            reason: "Goodwill",
            applied: true,
            date: "2026-11-06",
            version: 2,
          },
        ]}
        customers={[
          { id: "C1", name: "Ramesh", status: "Active" },
          { id: "C2", name: "Suresh", status: "Active" },
        ]}
        bills={[{ id: "B1", custId: "C1", month: "2026-11", amount: 500 }]}
      />,
    );

    expect(screen.getByText("Credit Notes")).toBeInTheDocument();
    expect(screen.getByText(/Spoiled delivery/)).toBeInTheDocument();
    expect(screen.getByText(/Goodwill/)).toBeInTheDocument();
    expect(
      screen.getAllByTestId("badge").some((b) => b.textContent === "Applied"),
    ).toBe(true);
  });

  it("resolves the viewed month's bill for a note without a stored billId and applies with (id, billId, version)", () => {
    const onApplyCn = vi.fn();
    const onOpenModal = vi.fn();
    render(
      <More
        {...baseProps}
        onApplyCn={onApplyCn}
        onOpenModal={onOpenModal}
        creditNotes={[
          {
            id: "CN1",
            customerId: "C1",
            billId: null,
            amount: 120,
            reason: "Spoiled delivery",
            applied: false,
            date: "2026-11-05",
            version: 3,
          },
        ]}
        customers={[{ id: "C1", name: "Ramesh", status: "Active" }]}
        bills={[{ id: "B1", custId: "C1", month: "2026-11", amount: 500 }]}
      />,
    );

    window.confirm = vi.fn(() => true);
    const cnCard = within(
      screen.getByText("Credit Notes").closest('[data-testid="card"]'),
    );
    const apply = cnCard.getByRole("button", { name: "Apply" });
    apply.click();
    expect(onApplyCn).toHaveBeenCalledWith("CN1", "B1", 3);

    // The + Add action opens the same modal Billing uses.
    const add = cnCard.getByRole("button", { name: "+ Add" });
    add.click();
    expect(onOpenModal).toHaveBeenCalledWith("addCreditNote");
  });

  it("shows the no-bill hint instead of Apply when no target bill can be resolved", () => {
    render(
      <More
        {...baseProps}
        creditNotes={[
          {
            id: "CN1",
            customerId: "C1",
            billId: null,
            amount: 120,
            reason: "Spoiled delivery",
            applied: false,
            date: "2026-11-05",
            version: 3,
          },
        ]}
        customers={[{ id: "C1", name: "Ramesh", status: "Active" }]}
        bills={[]}
      />,
    );
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
    expect(screen.getByText(/generate bills first/i)).toBeInTheDocument();
  });
});
