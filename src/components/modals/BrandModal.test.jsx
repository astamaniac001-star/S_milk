import { describe, it, expect, vi } from "vitest";
import { useCallback, useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrandModal } from "./BrandModal.jsx";

// Brand-modal contract tests. BrandModal manages a rates editor (one rate per
// milk type) written back through the curried-event contract
// onChange("rates")({ target: { value: rows } }).

// Mirrors useAppState's real setF so controlled rows state updates on change
// (the component is parent-controlled — a flat vi.fn() can't drive it).
function Harness({ initialForm = {}, ...props }) {
  const [form, setForm] = useState(initialForm);
  const setF = useCallback(
    (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value })),
    [],
  );
  return <BrandModal {...props} form={form} onChange={setF} />;
}

function renderModal(props = {}) {
  return render(
    <Harness
      onSave={vi.fn()}
      onClose={vi.fn()}
      milkTypes={["Full Cream", "Toned", "Skimmed"]}
      {...props}
    />,
  );
}

describe("BrandModal — brand + per-type rates editor", () => {
  it("starts the add flow with a single Full Cream rate row", () => {
    renderModal();
    expect(screen.getByLabelText(/^Type 1$/).value).toBe("Full Cream");
    expect(screen.getByLabelText(/^Rate 1$/).value).toBe("");
  });

  it("prefers the form's edited rates over the data defaults", () => {
    renderModal({
      initialForm: { rates: [{ milkType: "Toned", rate: "55" }] },
    });
    expect(screen.getByLabelText(/^Type 1$/).value).toBe("Toned");
    expect(screen.getByLabelText(/^Rate 1$/).value).toBe("55");
  });

  it("falls back to the edit target's rates when the form is empty", () => {
    renderModal({
      initialForm: {},
      data: {
        id: "B1",
        name: "Amul",
        rates: [
          { milkType: "Full Cream", rate: 60 },
          { milkType: "Toned", rate: 55 },
        ],
      },
    });
    expect(screen.getByLabelText(/Brand Name/i).value).toBe("Amul");
    expect(screen.getByLabelText(/^Type 1$/).value).toBe("Full Cream");
    // number inputs render values as strings
    expect(screen.getByLabelText(/^Rate 1$/).value).toBe("60");
    expect(screen.getByLabelText(/^Type 2$/).value).toBe("Toned");
    expect(screen.getByLabelText(/^Rate 2$/).value).toBe("55");
  });

  it("writes the rates rows back through the curried-event contract", () => {
    // curried contract: onChange(key) returns the event handler. Implement it
    // so the returned handler is itself a spy we can assert on.
    const innerHandlers = [];
    const onChange = vi.fn((key) => {
      const inner = vi.fn();
      innerHandlers.push({ key, inner });
      return inner;
    });
    render(
      <BrandModal
        form={{}}
        data={{}}
        onChange={onChange}
        onSave={vi.fn()}
        onClose={vi.fn()}
        milkTypes={["Full Cream", "Toned"]}
      />,
    );
    fireEvent.change(screen.getByLabelText(/^Type 1$/), {
      target: { value: "Toned" },
    });
    expect(onChange).toHaveBeenCalledWith("rates");
    // onChange(k) is evaluated at render for every field; the rates write is
    // the LAST "rates" call (from updateRow → setRows).
    const ratesInner = innerHandlers.filter((h) => h.key === "rates").at(-1).inner;
    expect(ratesInner).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { value: [{ milkType: "Toned", rate: "" }] },
      }),
    );
  });

  it("adds and removes rate rows (never below one)", () => {
    renderModal();
    fireEvent.click(screen.getByText("+ Add type rate"));
    expect(screen.getByLabelText(/^Type 2$/)).toBeTruthy();

    // Pick a type for row 2 and set its rate through the real contract.
    fireEvent.change(screen.getByLabelText(/^Type 2$/), {
      target: { value: "Skimmed" },
    });
    expect(screen.getByLabelText(/^Type 2$/).value).toBe("Skimmed");

    // Removing row 2 leaves row 1.
    fireEvent.click(screen.getByLabelText(/^Remove rate 2$/));
    expect(screen.queryByLabelText(/^Type 2$/)).toBeNull();
    // The last remaining row cannot be removed.
    expect(screen.getByLabelText(/^Remove rate 1$/).disabled).toBe(true);
  });

  it("titles the modal for edit vs add", () => {
    const { unmount } = renderModal();
    expect(screen.getByText("Add Milk Brand")).toBeTruthy();
    unmount();
    renderModal({ data: { id: "B1", name: "Amul", rates: [] } });
    expect(screen.getByText("Edit Brand")).toBeTruthy();
  });
});
