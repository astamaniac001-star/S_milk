import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrandModal } from "./BrandModal.jsx";

// Audit fix (AI-C §2.3): BrandModal calls its prop as `onChange("name")` —
// a curried `(field) => (event) => {...}`. Passing a flat `vi.fn()` makes
// `onChange("name")` return undefined, leaving fields without a handler and
// emitting a React warning on every run. Use a curried mock.
const curriedOnChange = () => vi.fn();

describe("BrandModal — default milk type (audit 2026-07-24, rule §16)", () => {
  it("renders the Default Milk Type dropdown with 'Full Cream' selected even when form is empty", () => {
    render(
      <BrandModal
        form={{}}
        onChange={curriedOnChange()}
        onSave={vi.fn()}
        onClose={vi.fn()}
        milkTypes={["Full Cream", "Toned", "Skimmed"]}
      />,
    );
    const select = screen.getByLabelText(/Default Milk Type/i);
    expect(select.value).toBe("Full Cream");
  });

  it("prefers the form's existing defaultType over 'Full Cream' when present", () => {
    render(
      <BrandModal
        form={{ defaultType: "Toned" }}
        onChange={curriedOnChange()}
        onSave={vi.fn()}
        onClose={vi.fn()}
        milkTypes={["Full Cream", "Toned", "Skimmed"]}
      />,
    );
    expect(screen.getByLabelText(/Default Milk Type/i).value).toBe("Toned");
  });

  it("has at least one Toned option served from the supplied milkTypes list", () => {
    render(
      <BrandModal
        form={{}}
        onChange={curriedOnChange()}
        onSave={vi.fn()}
        onClose={vi.fn()}
        milkTypes={["Full Cream", "Toned"]}
      />,
    );
    const select = screen.getByLabelText(/Default Milk Type/i);
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toContain("Toned");
    // Default state is Full Cream, not "" (rule §16 violation case)
    expect(select.value).toBe("Full Cream");
  });
});
