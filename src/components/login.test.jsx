import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Login from "./login";

// The login screen holds the Lighthouse accessibility bar (1.0/1.0/1.0), so
// these tests pin the landmark, the label association, and the ARIA error
// wiring rather than just the happy path.
describe("Login", () => {
  it("renders a main landmark with associated labels", () => {
    render(<Login onLogin={vi.fn()} />);
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Milk Delivery Admin" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Sign in" }),
    ).toBeInTheDocument();
    // <label for> → <input id> association, not just visual adjacency.
    const input = screen.getByLabelText("PIN");
    expect(input).toHaveAttribute("id", "pin-input");
    expect(input.tagName).toBe("INPUT");
  });

  it("strips non-digits and caps the PIN at 6 characters", async () => {
    const user = userEvent.setup();
    render(<Login onLogin={vi.fn()} />);
    const input = screen.getByLabelText("PIN");
    await user.type(input, "12ab34cd5678");
    expect(input).toHaveValue("123456");
  });

  it("keeps login disabled until the PIN is 6 digits", async () => {
    const user = userEvent.setup();
    render(<Login onLogin={vi.fn()} />);
    const btn = screen.getByRole("button", { name: "Login" });
    expect(btn).toBeDisabled();
    await user.type(screen.getByLabelText("PIN"), "12345");
    expect(btn).toBeDisabled();
    await user.type(screen.getByLabelText("PIN"), "6");
    expect(btn).toBeEnabled();
  });

  it("shows a local error and does not call onLogin for a short PIN", () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    render(<Login onLogin={onLogin} />);

    // The submit button is disabled below 6 digits, so drive the form's
    // submit event directly to reach the handler's validation branch.
    const form = screen.getByRole("button", { name: "Login" }).closest("form");
    fireEvent.submit(form);

    const error = screen.getByRole("alert");
    expect(error).toHaveTextContent("PIN must be exactly 6 digits");
    expect(onLogin).not.toHaveBeenCalled();
    // noUnusedVars-free: user is only needed for the typing test below
    expect(user).toBeDefined();
  });

  it("calls onLogin with the 6-digit PIN", async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    render(<Login onLogin={onLogin} />);
    await user.type(screen.getByLabelText("PIN"), "112233");
    await user.click(screen.getByRole("button", { name: "Login" }));
    expect(onLogin).toHaveBeenCalledWith("112233");
  });

  it("surfaces the auth error with alert semantics and describes the input", async () => {
    const onLogin = vi.fn();
    render(<Login onLogin={onLogin} error="Invalid PIN" />);
    const error = screen.getByRole("alert");
    expect(error).toHaveTextContent("Invalid PIN");
    expect(error).toHaveAttribute("id", "pin-error");
    expect(screen.getByLabelText("PIN")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("PIN")).toHaveAttribute(
      "aria-describedby",
      "pin-error",
    );
  });

  it("shows the verifying label and stays disabled while loading", () => {
    render(<Login onLogin={vi.fn()} loading />);
    const btn = screen.getByRole("button", { name: "Verifying…" });
    expect(btn).toBeDisabled();
  });

  it("clears the local error as soon as the operator types again", async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    render(<Login onLogin={onLogin} />);
    const form = screen.getByRole("button", { name: "Login" }).closest("form");
    fireEvent.submit(form);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await user.type(screen.getByLabelText("PIN"), "4");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not leak the PIN into the DOM as plain text input", () => {
    render(<Login onLogin={vi.fn()} />);
    expect(screen.getByLabelText("PIN")).toHaveAttribute("type", "password");
  });
});
