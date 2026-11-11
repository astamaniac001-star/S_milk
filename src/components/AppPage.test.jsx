import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { AppPage } from "./AppPage.jsx";

// Mock all pages so AppPage renders as a sentinel node with the props it
// actually received — lets us assert what AppPage passes to each page
// without needing the heavier page modules.

vi.mock("../pages/Dashboard.jsx", () => ({
  default: (props) => (
    <div data-testid="dash" data-todaylogs={JSON.stringify(props.todayLogs)} />
  ),
}));
vi.mock("../pages/Delivery.jsx", () => ({
  default: (props) => (
    <div data-testid="deliv" data-logs={JSON.stringify(props.logs)} />
  ),
}));
vi.mock("../pages/Customers.jsx", () => ({ default: () => <div /> }));
vi.mock("../pages/Imports.jsx", () => ({ default: () => <div /> }));
vi.mock("../pages/Billing.jsx", () => ({ default: () => <div /> }));
vi.mock("../pages/More.jsx", () => ({
  default: (props) => (
    <div
      data-testid="more"
      data-diag={props.onRunDiag ? "y" : "n"}
      data-health={props.onHealthCheck ? "y" : "n"}
    />
  ),
}));

describe("AppPage (audit 2026-07-24)", () => {
  it("does NOT call useAppDerived — derived is consumed from state (rule §2)", () => {
    // Two wiring checks: AppPage.jsx no longer imports useAppDerived, and it
    // passes the SAME state object as the `derived` arg to renderers. We
    // assert by behavior — a state with selectedDateLogs reaches Delivery.
    const selectedDateLogs = [{ id: "L1", date: "2026-08-01" }];
    const state = {
      tab: "delivery",
      today: "2026-08-01",
      logDate: "2026-08-01",
      selectedDateLogs,
      filteredC: [],
      filteredB: [],
      filteredImports: [],
      bills: [],
      customers: [],
      brands: [],
      setTab: vi.fn(),
      openModal: vi.fn(),
      setLogDate: vi.fn(),
      setBillMonth: vi.fn(),
      setCustSearch: vi.fn(),
      setCustFilter: vi.fn(),
      setImpFilter: vi.fn(),
      setBillFilter: vi.fn(),
      custSearch: "",
      custFilter: "All",
      impFilter: {},
      billFilter: "All",
      billMonth: "2026-08",
      adjustments: [],
      pauses: [],
      subscriptions: [],
      activeBrandsCount: 0,
      diagRan: false,
    };
    const handlers = {
      toggleDeliveryLog: vi.fn(),
      generateDailyLogs: vi.fn(),
      generateMonthlyBills: vi.fn(),
      lockBill: vi.fn(),
      unlockBill: vi.fn(),
      whatsapp: vi.fn(),
      deleteMilkImport: vi.fn(),
      confirmMilkImport: vi.fn(),
      applyAdjustment: vi.fn(),
      deactivateCustomer: vi.fn(),
      runDiagnostics: vi.fn(),
      healthCheck: vi.fn(),
    };

    const { container } = render(
      <AppPage tab="delivery" state={state} handlers={handlers} />,
    );
    const deliv = container.querySelector('[data-testid="deliv"]');
    expect(deliv).toBeTruthy();
    expect(deliv.getAttribute("data-logs")).toBe(
      JSON.stringify(selectedDateLogs),
    );
  });

  it("exposes runDiagnostics and healthCheck handlers to More (no inline callApi)", () => {
    const state = {
      tab: "more",
      adjustments: [],
      pauses: [],
      brands: [],
      customers: [],
      bills: [],
      diagRan: false,
      activeBrandsCount: 0,
      openModal: vi.fn(),
    };
    const handlers = {
      runDiagnostics: vi.fn(),
      healthCheck: vi.fn(),
      applyAdjustment: vi.fn(),
    };
    const { container } = render(
      <AppPage tab="more" state={state} handlers={handlers} />,
    );
    const more = container.querySelector('[data-testid="more"]');
    expect(more).toBeTruthy();
    expect(more.getAttribute("data-diag")).toBe("y");
    expect(more.getAttribute("data-health")).toBe("y");
  });
});
