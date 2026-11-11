import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Imports from "./Imports.jsx";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const IMPORTS = [
  {
    id: "I1",
    date: "2026-11-03",
    brand: "Amul",
    type: "Full Cream",
    qty: 40,
    rate: 36,
    total: 1440,
    status: "Confirmed",
    version: 1,
  },
  {
    id: "I2",
    date: "2026-10-20",
    brand: "Mother Dairy",
    type: "Toned",
    qty: 25,
    rate: 33,
    total: 825,
    status: "Draft",
    version: 3,
  },
];

const BRANDS = [
  {
    id: "B1",
    name: "Amul",
    status: "Active",
    defaultMilkType: "Full Cream",
    rate: 60,
    supplier: "Local Agent",
  },
];

const LOGS = [
  {
    id: "L1",
    date: "2026-11-06",
    qty: 5,
    delivered: true,
    product: "Full Cream",
  },
];

function baseProps(overrides = {}) {
  return {
    filtered: IMPORTS,
    allImports: IMPORTS,
    brands: BRANDS,
    logs: LOGS,
    logDate: "2026-11-06",
    impFilter: { month: "", brand: "", status: "" },
    onImpFilterChange: vi.fn(),
    onOpenModal: vi.fn(),
    onConfirm: vi.fn(),
    onDelete: vi.fn(),
    onSaveImport: vi.fn(),
    today: "2026-11-06",
    ...overrides,
  };
}

describe("Imports page — month filter (previous imports date access)", () => {
  it("offers a month select built from the import data, newest first", () => {
    render(<Imports {...baseProps()} />);
    const monthSelect = screen.getByLabelText("Filter imports by month");
    const values = [...monthSelect.options].map((o) => o.value);
    expect(values).toEqual(["", "2026-11", "2026-10"]);
    const labels = [...monthSelect.options].map((o) => o.label);
    expect(labels).toEqual(["All months", "Nov 2026", "Oct 2026"]);
  });

  it("reports the picked month through onImpFilterChange", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<Imports {...props} />);
    await user.selectOptions(
      screen.getByLabelText("Filter imports by month"),
      "2026-10",
    );
    expect(props.onImpFilterChange).toHaveBeenCalledWith({
      month: "2026-10",
      brand: "",
      status: "",
    });
  });
});

describe("Imports page — breakdown modals", () => {
  it("opens the qty & cost breakdown when the stats are clicked", async () => {
    const user = userEvent.setup();
    render(<Imports {...baseProps()} />);
    await user.click(screen.getByText(/Total Qty & Cost/));
    expect(
      await screen.findByText("Qty & Cost by Brand / Type"),
    ).toBeInTheDocument();
  });

  it("opens the imported-vs-delivered breakdown for the delivery date", async () => {
    const user = userEvent.setup();
    render(<Imports {...baseProps()} />);
    await user.click(screen.getByText("Imported vs Delivered"));
    expect(
      await screen.findByText("Imported vs Delivered · 2026-11-06"),
    ).toBeInTheDocument();
  });
});

describe("Imports page — draft actions", () => {
  // brands: [] keeps the "Edit" button unique to the draft import card.
  it("confirms a draft through onConfirm (handler resolves the version)", async () => {
    const user = userEvent.setup();
    const props = baseProps({ brands: [] });
    render(<Imports {...props} />);
    await user.click(screen.getByText("Confirm"));
    expect(props.onConfirm).toHaveBeenCalledWith("I2");
  });

  it("deletes a draft with its version after confirmation", async () => {
    const user = userEvent.setup();
    const props = baseProps({ brands: [] });
    render(<Imports {...props} />);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(screen.getByText("Delete"));
    expect(props.onDelete).toHaveBeenCalledWith("I2", 3);
  });

  it("opens the edit modal for a draft", async () => {
    const user = userEvent.setup();
    const props = baseProps({ brands: [] });
    render(<Imports {...props} />);
    await user.click(screen.getByText("Edit"));
    expect(props.onOpenModal).toHaveBeenCalledWith("addImport", IMPORTS[1]);
  });
});

describe("Imports page — quick save from brand row", () => {
  function quickSaveProps(onSaveImport) {
    return baseProps({
      filtered: [],
      allImports: [],
      onSaveImport,
    });
  }

  async function openQuickSaveForm(onSaveImport) {
    const user = userEvent.setup();
    render(<Imports {...quickSaveProps(onSaveImport)} />);
    await user.click(screen.getByText("Add")); // open the brand quick-save form
    // qty and rate inputs both carry placeholder "0"; rate is prefilled to
    // brand.rate (60), so the qty field is the one with an empty value.
    const qty = screen
      .getAllByPlaceholderText("0")
      .find((el) => el.value === "");
    await user.type(qty, "10");
    return user;
  }

  it("sends the quick-save payload and closes the form on success", async () => {
    const onSaveImport = vi.fn().mockResolvedValue(true);
    const user = await openQuickSaveForm(onSaveImport);
    await user.click(screen.getByText("Save Draft"));

    await waitFor(() =>
      expect(onSaveImport).toHaveBeenCalledWith(
        expect.objectContaining({
          date: "2026-11-06",
          brand: "Amul",
          type: "Full Cream",
          qty: 10,
          rate: 60,
        }),
      ),
    );
    // Form collapses back into the brand row.
    expect(screen.queryByText("Save Draft")).not.toBeInTheDocument();
  });

  it("keeps the form open with entries intact when the save fails", async () => {
    const onSaveImport = vi.fn().mockResolvedValue(false);
    const user = await openQuickSaveForm(onSaveImport);
    await user.click(screen.getByText("Save Draft"));

    expect(onSaveImport).toHaveBeenCalledTimes(1);
    // Still open for correction…
    expect(screen.getByText("Save Draft")).toBeInTheDocument();
    // …and the typed qty was not lost.
    const qty = screen
      .getAllByPlaceholderText("0")
      .find((el) => el.value !== "");
    expect(qty.value).toBe("10");
  });
});

describe("Imports page — day & date-range views (2026-11-10)", () => {
  it("defaults to month mode: view select on 'month', month picker visible", () => {
    render(<Imports {...baseProps()} />);
    expect(screen.getByLabelText("Show imports by")).toHaveValue("month");
    expect(
      screen.getByLabelText("Filter imports by month"),
    ).toBeInTheDocument();
  });

  it("switching to Day reports the mode and pre-fills today", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<Imports {...props} />);
    await user.selectOptions(screen.getByLabelText("Show imports by"), "day");
    expect(props.onImpFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "day", day: "2026-11-06" }),
    );
  });

  it("renders the day picker and the stock card in Day mode", () => {
    render(
      <Imports
        {...baseProps({
          impFilter: {
            mode: "day",
            month: "",
            brand: "",
            status: "",
            day: "2026-11-03",
          },
          inventory: {
            date: "2026-11-03",
            totalImported: 40,
            totalDelivered: 25,
            remaining: 15,
            shortage: 0,
          },
          filtered: [IMPORTS[0]],
        })}
      />,
    );
    expect(screen.getByLabelText("Show imports for date")).toHaveValue(
      "2026-11-03",
    );
    expect(screen.getByText(/Stock for 2026-11-03/)).toBeInTheDocument();
    expect(screen.getByText(/Imported:/)).toBeInTheDocument();
    expect(screen.getByText(/Remaining:/)).toBeInTheDocument();
    // Confirmed-only note (operator decision: Draft ≠ stock).
    expect(screen.getByText(/Confirmed imports only/)).toBeInTheDocument();
    // No shortage line when remaining ≥ 0.
    expect(screen.queryByText(/Shortage:/)).not.toBeInTheDocument();
  });

  it("shows the shortage line when delivered exceeds confirmed imports", () => {
    render(
      <Imports
        {...baseProps({
          impFilter: {
            mode: "day",
            month: "",
            brand: "",
            status: "",
            day: "2026-11-03",
          },
          inventory: {
            date: "2026-11-03",
            totalImported: 20,
            totalDelivered: 35,
            remaining: 0,
            shortage: 15,
          },
          filtered: [],
        })}
      />,
    );
    expect(screen.getByText(/Shortage: 15 L/)).toBeInTheDocument();
  });

  it("Day mode with no date picked shows the pick-a-date hint", () => {
    render(
      <Imports
        {...baseProps({
          impFilter: { mode: "day", month: "", brand: "", status: "", day: "" },
          filtered: [],
        })}
      />,
    );
    expect(screen.getByText(/Pick a date/)).toBeInTheDocument();
  });

  it("Day mode with a date but no payload yet shows the loading hint", () => {
    render(
      <Imports
        {...baseProps({
          impFilter: {
            mode: "day",
            month: "",
            brand: "",
            status: "",
            day: "2026-11-03",
          },
          inventory: null,
          filtered: [],
        })}
      />,
    );
    expect(screen.getByText(/Loading stock/)).toBeInTheDocument();
  });

  it("switching to Date range pre-fills first-of-previous-month → today", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<Imports {...props} />);
    await user.selectOptions(screen.getByLabelText("Show imports by"), "range");
    expect(props.onImpFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "range",
        from: "2026-10-01",
        to: "2026-11-06",
      }),
    );
  });

  it("renders From/To pickers in Range mode", () => {
    render(
      <Imports
        {...baseProps({
          impFilter: {
            mode: "range",
            month: "",
            brand: "",
            status: "",
            from: "2026-10-01",
            to: "2026-11-06",
          },
          filtered: [],
        })}
      />,
    );
    expect(screen.getByLabelText("Show imports from date")).toHaveValue(
      "2026-10-01",
    );
    expect(screen.getByLabelText("Show imports to date")).toHaveValue(
      "2026-11-06",
    );
    // Month picker hidden outside Month mode.
    expect(
      screen.queryByLabelText("Filter imports by month"),
    ).not.toBeInTheDocument();
  });
});
