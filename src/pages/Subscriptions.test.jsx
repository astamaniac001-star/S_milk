import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Subscriptions from "./Subscriptions.jsx";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const CUSTOMERS = [
  { id: "C1", name: "Ramesh", status: "Active" },
  { id: "C2", name: "Suresh", status: "Active" },
];

const SUBS = [
  {
    id: "S1",
    customerId: "C1",
    milkType: "Full Cream",
    qty: 1,
    deliveryDays: [1, 2, 3],
    isActive: true,
    version: 2,
  },
  {
    id: "S2",
    customerId: "C2",
    milkType: "Toned",
    qty: 2,
    deliveryDays: [0, 6],
    isActive: false,
    version: 1,
  },
];

function setup(overrides = {}) {
  const props = {
    subscriptions: SUBS,
    customers: CUSTOMERS,
    search: "",
    onSearchChange: vi.fn(),
    filter: "All",
    onFilterChange: vi.fn(),
    onOpenModal: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<Subscriptions {...props} />) };
}

describe("Subscriptions page", () => {
  it("lists each subscription with its customer, milk type, qty and days", () => {
    setup();

    expect(screen.getByText("Ramesh")).toBeTruthy();
    expect(screen.getByText("Suresh")).toBeTruthy();
    expect(screen.getByText(/Full Cream · 1L\/day/)).toBeTruthy();
    expect(screen.getByText(/Toned · 2L\/day/)).toBeTruthy();
    expect(screen.getByText("Mon, Tue, Wed")).toBeTruthy();
  });

  it("shows the active count and total", () => {
    setup();
    expect(screen.getByText(/2 subscription\(s\) · 1 active/)).toBeTruthy();
  });

  it("'+ Add' opens the addSubscription modal with the visible defaults", () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole("button", { name: "+ Add" }));
    expect(props.onOpenModal).toHaveBeenCalledWith("addSubscription", {
      brandId: "",
      milkType: "Full Cream",
      qty: 1,
      deliveryDays: [1, 2, 3, 4, 5],
      isActive: true,
    });
  });

  it("'Edit' opens editSubscription with the full subscription (id + version)", () => {
    const { props } = setup();
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    expect(props.onOpenModal).toHaveBeenCalledWith("editSubscription", SUBS[0]);
  });

  it("'History' opens subscriptionHistory with the subscription", () => {
    const { props } = setup();
    fireEvent.click(screen.getAllByRole("button", { name: "History" })[0]);
    expect(props.onOpenModal).toHaveBeenCalledWith(
      "subscriptionHistory",
      SUBS[0],
    );
  });

  it("Delete asks for confirmation and only then calls onDelete", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { props } = setup();

    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);

    expect(confirmSpy).toHaveBeenCalled();
    expect(props.onDelete).not.toHaveBeenCalled();
  });

  it("Delete calls onDelete with the full subscription when confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { props } = setup();

    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);

    expect(props.onDelete).toHaveBeenCalledWith(SUBS[0]);
  });

  it("filters to active subscriptions only", () => {
    setup({ filter: "Active" });
    expect(screen.getByText("Ramesh")).toBeTruthy();
    expect(screen.queryByText("Suresh")).toBeNull();
  });

  it("filters to paused (inactive) subscriptions only", () => {
    setup({ filter: "Paused" });
    expect(screen.queryByText("Ramesh")).toBeNull();
    expect(screen.getByText("Suresh")).toBeTruthy();
  });

  it("search filters by customer name", () => {
    setup({ search: "ramesh" });
    expect(screen.getByText("Ramesh")).toBeTruthy();
    expect(screen.queryByText("Suresh")).toBeNull();
  });

  it("search filters by milk type", () => {
    setup({ search: "toned" });
    expect(screen.queryByText("Ramesh")).toBeNull();
    expect(screen.getByText("Suresh")).toBeTruthy();
  });

  it("shows the empty state when there are no subscriptions at all", () => {
    setup({ subscriptions: [] });
    expect(screen.getByText(/No subscriptions yet/)).toBeTruthy();
  });
});
