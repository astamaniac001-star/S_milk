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
