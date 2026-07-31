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
vi.mock("lucide-react", () => ({ ShieldCheck: () => <svg data-testid="shield" /> }));

import More from "./More.jsx";

const baseProps = {
  adjustments: [],
  pauses: [],
  customers: [],
  bills: [],
  onOpenModal: vi.fn(),
  onApplyAdj: vi.fn(),
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
    expect(
      screen.queryByText(/Static reference list/),
    ).not.toBeInTheDocument();
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
    expect(getByText(/Schema version/, { selector: "span" })).toBeInTheDocument();
    expect(getByText(/API version/, { selector: "span" })).toBeInTheDocument();
    expect(getByText(/Migration/, { selector: "span" })).toBeInTheDocument();
    expect(getByText(/MilkTypes seeded/, { selector: "span" })).toBeInTheDocument();
    expect(getByText(/MilkBrands seeded/, { selector: "span" })).toBeInTheDocument();
    // Values (value spans carry the exact value string).
    expect(getByText("V17")).toBeInTheDocument();
    expect(getByText("17")).toBeInTheDocument();
    expect(getByText("Supabase CLI")).toBeInTheDocument();
    expect(getByText(/7 total/, { selector: "span" })).toBeInTheDocument();
    expect(getByText(/2 in use/, { selector: "span" })).toBeInTheDocument();
    expect(getByText("2 active / 5 total")).toBeInTheDocument();
    expect(queryByText(/Tap Run to check connectivity/)).not.toBeInTheDocument();
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
    expect(getByText(/Schema version/, { selector: "span" })).toBeInTheDocument();
    expect(getByText(/MilkBrands seeded/, { selector: "span" })).toBeInTheDocument();
    expect(getAllByText("offline").length).toBe(2);
    expect(getByText("Production")).toBeInTheDocument();
    // The connectivity error text is surfaced under the probe list.
    expect(
      screen.getByText(/permission denied for table settings/),
    ).toBeInTheDocument();
  });
});
