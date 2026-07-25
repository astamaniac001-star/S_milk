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
