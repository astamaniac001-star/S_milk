import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Customers from "./Customers.jsx";

// Regression tests for the Customers page — focused on the callback-shape
// audit findings from 2026-07-25.

beforeEach(() => vi.clearAllMocks());

function setup(overrides = {}) {
  const handlers = {
    onSearchChange: vi.fn(),
    onFilterChange: vi.fn(),
    onOpenModal: vi.fn(),
    onWhatsapp: vi.fn(),
    onDeactivate: vi.fn(),
    filtered: [],
    total: 0,
    bills: [],
    search: "",
    filter: "All",
    ...overrides,
  };
  return render(<Customers {...handlers} />);
}

describe("Customers.jsx — callback-shape contract (audit 2026-07-25)", () => {
  it("Deactivate passes the FULL customer entity (with id+version+name), NOT just c.id", () => {
    // The previous code passed `c.id` (a string) to onDeactivate, which the
    // handler then destructured as `customer.name/.id/.version`. That left the
    // confirm dialog showing "Deactivate undefined?" and the OCC RPC call
    // throwing on `if (!id) throw new Error('id is required')`. Always pass
    // the entity for handler hooks that expect the full record.
    const customers = [
      {
        id: "C1",
        name: "Ramesh",
        status: "Active",
        address: "Gate 1",
        phone: "9000000001",
        qty: 1,
        product: "Toned",
        deliveryDays: [0, 1, 2],
        balance: 0,
        version: 7,
      },
    ];
    const onDeactivate = vi.fn();
    setup({ filtered: customers, total: 1, onDeactivate });

    const btn = screen.getByRole("button", { name: "Deactivate" });
    fireEvent.click(btn);

    expect(onDeactivate).toHaveBeenCalledTimes(1);
    // Shape: must pass the entire customer object, not just the id string.
    const arg = onDeactivate.mock.calls[0][0];
    expect(arg).toMatchObject({
      id: "C1",
      name: "Ramesh",
      version: 7,
    });
    expect(typeof arg).toBe("object");
  });

  it("WhatsApp invocation passes (phone, billId) — not the customer object", () => {
    const customers = [
      {
        id: "C1",
        name: "Ramesh",
        status: "Active",
        address: "Gate 1",
        phone: "9000000001",
        qty: 1,
        product: "Toned",
        deliveryDays: [],
        balance: 0,
      },
    ];
    const bills = [
      { id: "B1", custId: "C1", status: "Unpaid" },
      { id: "B2", custId: "OTHER", status: "Unpaid" },
    ];
    const onWhatsapp = vi.fn();
    setup({ filtered: customers, total: 1, bills, onWhatsapp });

    const btn = screen.getByRole("button", { name: "WhatsApp" });
    fireEvent.click(btn);

    expect(onWhatsapp).toHaveBeenCalledWith("9000000001", "B1");
    expect(onWhatsapp).toHaveBeenCalledTimes(1);
  });

  it("WhatsApp forwards phone + undefined billId when the customer has no unpaid bill (handler toasts)", () => {
    const customers = [
      {
        id: "C1",
        name: "Ramesh",
        status: "Active",
        phone: "9000000001",
        address: "",
        qty: 1,
        product: "",
        deliveryDays: [],
        balance: 0,
      },
    ];
    // Customer has only a Paid bill — no unpaid one.
    const bills = [{ id: "B1", custId: "C1", status: "Paid" }];
    const onWhatsapp = vi.fn();
    setup({ filtered: customers, total: 1, bills, onWhatsapp });

    fireEvent.click(screen.getByRole("button", { name: "WhatsApp" }));
    expect(onWhatsapp).toHaveBeenCalledWith("9000000001", undefined);
    expect(onWhatsapp).toHaveBeenCalledTimes(1);
  });

  it("Edit passes the customer entity to openModal('editCustomer', c)", () => {
    const customers = [
      {
        id: "C1",
        name: "Ramesh",
        status: "Active",
        phone: "9",
        address: "a",
        qty: 1,
        product: "p",
        deliveryDays: [],
        balance: 0,
        version: 1,
      },
    ];
    const onOpenModal = vi.fn();
    setup({ filtered: customers, total: 1, onOpenModal });

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onOpenModal).toHaveBeenCalledWith("editCustomer", customers[0]);
  });

  it("Pause passes {custId: c.id} to openModal('addPause', {custId})", () => {
    const customers = [
      {
        id: "C1",
        name: "Ramesh",
        status: "Active",
        phone: "9",
        address: "a",
        qty: 1,
        product: "p",
        deliveryDays: [],
        balance: 0,
      },
    ];
    const onOpenModal = vi.fn();
    setup({ filtered: customers, total: 1, onOpenModal });

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(onOpenModal).toHaveBeenCalledWith("addPause", { custId: "C1" });
  });

  it("'+ Sub' opens addSubscription prefilled with the customer id", () => {
    const customers = [
      {
        id: "C1",
        name: "Ramesh",
        status: "Active",
        phone: "9",
        address: "a",
        balance: 0,
        version: 1,
      },
    ];
    const onOpenModal = vi.fn();
    setup({ filtered: customers, total: 1, onOpenModal });

    fireEvent.click(screen.getByRole("button", { name: "+ Sub" }));
    expect(onOpenModal).toHaveBeenCalledWith("addSubscription", {
      brandId: "",
      customerId: "C1",
      milkType: "Full Cream",
      qty: 1,
      deliveryDays: [1, 2, 3, 4, 5],
      isActive: true,
    });
  });

  it("does not offer '+ Sub' for an inactive (deactivated) customer", () => {
    const customers = [
      {
        id: "C1",
        name: "Ramesh",
        status: "Inactive",
        phone: "9",
        address: "a",
        balance: 0,
      },
    ];
    setup({ filtered: customers, total: 1 });

    expect(screen.queryByRole("button", { name: "+ Sub" })).toBeNull();
  });

  it("renders the customer's subscriptions (milk type, qty, days)", () => {
    const customers = [
      {
        id: "C1",
        name: "Ramesh",
        status: "Active",
        phone: "9",
        address: "a",
        balance: 0,
      },
    ];
    const subsByCustomer = {
      C1: [
        {
          id: "S1",
          customerId: "C1",
          milkType: "Full Cream",
          qty: 1,
          deliveryDays: [1, 2],
          isActive: true,
          version: 1,
        },
        {
          id: "S2",
          customerId: "C1",
          milkType: "Toned",
          qty: 2,
          deliveryDays: [0],
          isActive: false,
          version: 1,
        },
      ],
    };
    setup({ filtered: customers, total: 1, subsByCustomer });

    expect(screen.getByText(/Full Cream · 1L · Mon, Tue/)).toBeTruthy();
    expect(screen.getByText(/Toned · 2L · Sun \(paused\)/)).toBeTruthy();
  });

  it("shows 'No subscriptions' when a customer has none", () => {
    const customers = [
      {
        id: "C1",
        name: "Ramesh",
        status: "Active",
        phone: "9",
        address: "a",
        balance: 0,
      },
    ];
    setup({ filtered: customers, total: 1, subsByCustomer: {} });

    expect(screen.getByText("No subscriptions")).toBeTruthy();
  });
});
