import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import Delivery from "./Delivery";

vi.mock("../hooks/useBusy.js", () => ({
  useBusy: (fn) => [false, fn],
}));

vi.mock("../components/ui.jsx", () => ({
  Card: ({ children }) => <div data-testid="card">{children}</div>,
  Field: ({ children, label }) => (
    <div>
      <label>{label}</label>
      {children}
    </div>
  ),
  IS: () => ({}),
  Empty: ({ message }) => <div data-testid="empty">{message}</div>,
  Btn: ({ children, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled} data-testid="btn">
      {children}
    </button>
  ),
}));

describe("Delivery Page", () => {
  const mockLogs = [
    { id: "log1", custId: "c1", qty: 2, delivered: false, product: "Cow" },
    { id: "log2", custId: "c2", qty: 1, delivered: true, product: "Buffalo" },
  ];

  const mockCustomers = [
    { id: "c1", name: "Ramesh" },
    { id: "c2", name: "Suresh" },
  ];

  const defaultProps = {
    logDate: "2026-07-04",
    onLogDateChange: vi.fn(),
    logs: mockLogs,
    onToggleLog: vi.fn(),
    fetchLogs: vi.fn(),
    generateDailyLogs: vi.fn(),
    onOpenModal: vi.fn(),
    customers: mockCustomers,
    imports: [],
    brands: [],
  };

  it("renders the logs and resolves customer names correctly (Tests F6 fix)", () => {
    render(<Delivery {...defaultProps} />);

    expect(screen.getByText("Ramesh")).toBeInTheDocument();
    expect(screen.getByText("Suresh")).toBeInTheDocument();
  });

  it("calls onToggleLog with the correct flipped delivered state when clicked (Tests F5 fix)", async () => {
    const user = userEvent.setup();
    render(<Delivery {...defaultProps} />);

    const toggleButton = screen.getByText("✗ Skip");
    await user.click(toggleButton);

    expect(defaultProps.onToggleLog).toHaveBeenCalledWith("log1", true);
  });

  it("calls generateDailyLogs when the generate button is clicked", async () => {
    const user = userEvent.setup();
    render(<Delivery {...defaultProps} />);

    const generateButton = screen.getByText("⚡ Generate Deliveries");
    await user.click(generateButton);

    expect(defaultProps.generateDailyLogs).toHaveBeenCalledWith("2026-07-04");
  });

  it("shows Scheduled view by default with both delivered and skipped logs", () => {
    render(<Delivery {...defaultProps} />);
    // Both buttons should be present on the Scheduled view (toggle-style)
    expect(screen.getAllByText("✗ Skip").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("✓ Done")).toBeInTheDocument();
  });

  it("Delivered tile filters the list to only delivered logs and renders them read-only", async () => {
    const user = userEvent.setup();
    render(<Delivery {...defaultProps} />);

    // Click the Delivered tile (label="Delivered")
    await user.click(screen.getByLabelText(/Delivered:/));
    // Suresh was delivered; Ramesh was skipped → only Suresh should show
    expect(screen.getByText("Suresh")).toBeInTheDocument();
    expect(screen.queryByText("Ramesh")).not.toBeInTheDocument();
    // Read-only view shows the ✓ Done indicator but no toggle buttons
    expect(screen.getByText("✓ Done")).toBeInTheDocument();
    expect(screen.queryByText("✗ Skip")).not.toBeInTheDocument();
  });

  it("Skipped tile filters to only skipped logs", async () => {
    const user = userEvent.setup();
    render(<Delivery {...defaultProps} />);

    await user.click(screen.getByLabelText(/Skipped:/));
    expect(screen.getByText("Ramesh")).toBeInTheDocument();
    expect(screen.queryByText("Suresh")).not.toBeInTheDocument();
    // Skipped view is read-only — shows ✗ Skip indicator
    expect(screen.getByText("✗ Skip")).toBeInTheDocument();
    // No ✓ Done in the skipped list
    expect(screen.queryByText("✓ Done")).not.toBeInTheDocument();
  });

  it("search bar filters the active list by customer name", async () => {
    const user = userEvent.setup();
    render(<Delivery {...defaultProps} />);

    const searchInput = screen.getByPlaceholderText(/Search by customer/i);
    await user.type(searchInput, "Ramesh");

    expect(screen.getByText("Ramesh")).toBeInTheDocument();
    expect(screen.queryByText("Suresh")).not.toBeInTheDocument();
  });

  it("Total tile renders the brand × milk type breakdown with imported and delivered totals", async () => {
    const user = userEvent.setup();
    const props = {
      ...defaultProps,
      logs: [{ id: "log2", custId: "c2", qty: 1, delivered: true, product: "Cow" }],
      imports: [
        {
          id: "i1",
          brand: "Amul",
          type: "Cow",
          qty: 5,
          date: "2026-07-04",
          status: "Confirmed",
        },
      ],
      brands: [{ id: "b1", name: "Amul", defaultMilkType: "Cow" }],
    };
    render(<Delivery {...props} />);

    await user.click(screen.getByLabelText(/Total:/));

    expect(screen.getByText("Brand × Milk Type — 2026-07-04")).toBeInTheDocument();
    expect(screen.getByText("Amul")).toBeInTheDocument();
    expect(screen.getByText("Cow")).toBeInTheDocument();
    // Imported 5L appears in body row + tfoot row → both occurrences
    expect(screen.getAllByText("5.0").length).toBe(2);
    expect(screen.getAllByText("1.0").length).toBe(2);
  });

  it("Total tile shows empty state when there are no imports and no delivered logs", async () => {
    const user = userEvent.setup();
    // All-skipped logs → nothing to aggregate in Total view
    const props = {
      ...defaultProps,
      logs: [{ id: "log1", custId: "c1", qty: 2, delivered: false, product: "Cow" }],
      imports: [],
    };
    render(<Delivery {...props} />);

    await user.click(screen.getByLabelText(/Total:/));
    expect(screen.getByTestId("empty")).toBeInTheDocument();
  });
});
