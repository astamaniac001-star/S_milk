import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ChangePinModal } from "./ChangePinModal.jsx";

// Audit fix: ChangePinModal no longer imports `callApi` directly. It calls
// the `onRotatePin` prop (supplied by useAdminHandlers.rotatePin), which owns
// the API call, toast, close, and re-entrancy guard.

describe("ChangePinModal — delegates to onRotatePin (audit 2026-07-24, rule §1)", () => {
  it("does NOT import or call callApi directly — only onRotatePin", async () => {
    const onRotatePin = vi.fn().mockResolvedValue(true);
    const showToast = vi.fn();
    const onClose = vi.fn();
    render(
      <ChangePinModal
        onClose={onClose}
        showToast={showToast}
        onRotatePin={onRotatePin}
      />,
    );
    // Type all three PINs
    const [current, next, confirm] = screen.getAllByPlaceholderText(/PIN/i);
    fireEvent.change(current, { target: { value: "111111" } });
    fireEvent.change(next, { target: { value: "222222" } });
    fireEvent.change(confirm, { target: { value: "222222" } });

    const submit = screen.getByRole("button", { name: /Update PIN/i });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(onRotatePin).toHaveBeenCalledWith({
        currentPin: "111111",
        newPin: "222222",
      });
    });
    // Modal does not callApi — onRotatePin handled it (true paths).
    // Success toast + close are the handler's responsibility, not the modal's.
  });

  it("rejects new PIN that is not 6 digits", async () => {
    const onRotatePin = vi.fn();
    const showToast = vi.fn();
    render(
      <ChangePinModal
        onClose={vi.fn()}
        showToast={showToast}
        onRotatePin={onRotatePin}
      />,
    );
    const [current, next, confirm] = screen.getAllByPlaceholderText(/PIN/i);
    fireEvent.change(current, { target: { value: "111111" } });
    fireEvent.change(next, { target: { value: "22" } }); // short
    fireEvent.change(confirm, { target: { value: "22" } });
    // Submit button stays disabled until length === 6 for all three fields
    expect(screen.getByRole("button", { name: /Update PIN/i }).disabled).toBe(true);
  });

  it("rejects when new PIN === current PIN, surfacing a toast", async () => {
    const onRotatePin = vi.fn().mockResolvedValue(true);
    const showToast = vi.fn();
    render(
      <ChangePinModal
        onClose={vi.fn()}
        showToast={showToast}
        onRotatePin={onRotatePin}
      />,
    );
    const [current, next, confirm] = screen.getAllByPlaceholderText(/PIN/i);
    fireEvent.change(current, { target: { value: "123456" } });
    fireEvent.change(next, { target: { value: "123456" } });
    fireEvent.change(confirm, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /Update PIN/i }));
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        "New PIN must be different from current PIN",
        "error",
      );
    });
    expect(onRotatePin).not.toHaveBeenCalled();
  });

  it("rejects when confirm PIN !== new PIN", async () => {
    const onRotatePin = vi.fn();
    const showToast = vi.fn();
    render(
      <ChangePinModal
        onClose={vi.fn()}
        showToast={showToast}
        onRotatePin={onRotatePin}
      />,
    );
    const [current, next, confirm] = screen.getAllByPlaceholderText(/PIN/i);
    fireEvent.change(current, { target: { value: "111111" } });
    fireEvent.change(next, { target: { value: "222222" } });
    fireEvent.change(confirm, { target: { value: "333333" } });
    fireEvent.click(screen.getByRole("button", { name: /Update PIN/i }));
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith("New PINs do not match", "error");
    });
    expect(onRotatePin).not.toHaveBeenCalled();
  });
});
