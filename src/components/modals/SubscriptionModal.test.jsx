import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SubscriptionModal } from "./SubscriptionModal.jsx";

// The audit fix: `deliveryDays` and `isActive` must go through the same curried
// event contract (`setF(k)(e)` reading `e.target.value`) as text inputs — not
// the direct-value contract (`onChange(k, value)`) they previously used.

function makeSetF() {
  const calls = [];
  const setF = (k) => (e) => {
    calls.push({ key: k, value: e?.target?.value });
  };
  return { setF, calls };
}

describe("SubscriptionModal — single onChange contract (audit 2026-07-24)", () => {
  it("toggleDay pushes a synthetic event with the new array via onChange('deliveryDays')(e)", () => {
    const { setF, calls } = makeSetF();
    render(
      <SubscriptionModal
        form={{ deliveryDays: [0, 1] }}
        customers={[]}
        milkTypes={["Full Cream", "Toned"]}
        onChange={setF}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const dayButtons = screen.getAllByRole("button");
    // DAYS_OF_WEEK has 7 buttons: Sun..Sat. Find 'Mon' (currently selected) and
    // 'Tue' (currently not selected) to test both add and remove paths.
    const mon = dayButtons.find((b) => b.textContent === "Mon");

    // Clicking Mon (currently selected) removes it.
    fireEvent.click(mon);
    expect(calls).toContainEqual({ key: "deliveryDays", value: [0] });

    // Click Tue (not selected) adds it.
    const tue = dayButtons.find((b) => b.textContent === "Tue");
    fireEvent.click(tue);
    expect(calls).toContainEqual({ key: "deliveryDays", value: [0, 1, 2] });

    // All calls used the curried event contract (one call per click)
    expect(calls.every((c) => typeof c.key === "string")).toBe(true);
    expect(calls.every((c) => Array.isArray(c.value))).toBe(true);
  });

  it("toggling the 'Active' checkbox pushes the boolean via the curried event contract", () => {
    const { setF, calls } = makeSetF();
    render(
      <SubscriptionModal
        form={{ isActive: true, deliveryDays: [0] }}
        customers={[]}
        milkTypes={["Full Cream"]}
        onChange={setF}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const checkbox = screen.getByLabelText(/Active/i);
    fireEvent.click(checkbox);
    expect(calls).toContainEqual({ key: "isActive", value: false });
  });
});

describe("SubscriptionModal — brand field (brand-aware subscriptions)", () => {
  const brands = [
    { id: "B1", name: "Amul", status: "Active" },
    { id: "B2", name: "Local", status: "Active" },
    { id: "B3", name: "Dead Co", status: "Inactive" },
  ];

  function setup(props = {}) {
    const { setF, calls } = makeSetF();
    render(
      <SubscriptionModal
        form={{ deliveryDays: [1] }}
        customers={[{ id: "C1", name: "Ramesh", status: "Active" }]}
        brands={brands}
        milkTypes={["Full Cream", "Toned"]}
        onChange={setF}
        onSave={vi.fn()}
        onClose={vi.fn()}
        {...props}
      />,
    );
    return { calls };
  }

  it("renders the Brand select with only Active brands as options", () => {
    setup();
    const brandSelect = screen.getByLabelText(/Brand/i);
    const values = Array.from(brandSelect.options).map((o) => o.value);
    expect(values).toEqual(["", "B1", "B2"]);
    // Required field starts empty (no silent brand default)
    expect(brandSelect.value).toBe("");
  });

  it("prefills the brand from the edit target and writes selection via the curried contract", () => {
    const { calls } = setup({
      form: {},
      data: { id: "S1", customerId: "C1", brandId: "B1", milkType: "Toned" },
    });
    const brandSelect = screen.getByLabelText(/Brand/i);
    expect(brandSelect.value).toBe("B1");

    fireEvent.change(brandSelect, { target: { value: "B2" } });
    expect(calls).toContainEqual({ key: "brandId", value: "B2" });
  });

  it("exposes each delivery day as a toggle button with aria-pressed", () => {
    setup({ form: { deliveryDays: [1, 3] } });
    const mon = screen.getByRole("button", { name: "Mon" });
    const tue = screen.getByRole("button", { name: "Tue" });
    // aria-pressed reflects the current selection so the state is readable
    // from the DOM (the e2e suite relies on it to pick only unselected days).
    expect(mon.getAttribute("aria-pressed")).toBe("true");
    expect(tue.getAttribute("aria-pressed")).toBe("false");
  });
});
