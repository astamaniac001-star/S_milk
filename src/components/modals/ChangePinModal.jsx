import { useState } from "react";
import { Modal, Btn, Field } from "../ui.jsx";
import { useBusy } from "../../hooks/useBusy.js";

// FIX (audit 2026-07-24): no longer imports `callApi` directly (rule §1).
// The rotatePin handler in useAdminHandlers wraps the API call + toast +
// close + re-entrancy guard; this component just feeds it the typed PINs.
export function ChangePinModal({ onClose, showToast, onRotatePin }) {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, handleSubmit] = useBusy(async () => {
    if (newPin.length !== 6)
      return showToast("New PIN must be exactly 6 digits", "error");
    if (newPin !== confirmPin)
      return showToast("New PINs do not match", "error");
    if (currentPin === newPin)
      return showToast("New PIN must be different from current PIN", "error");

    // onRotatePin returns true on success; the handler closes the modal and
    // toasts. We only call it — no direct callApi, no direct toast here on
    // success (handler owns the success UX).
    const ok = await (onRotatePin
      ? onRotatePin({ currentPin, newPin })
      : Promise.resolve(false));
    if (!ok && !onRotatePin) {
      showToast("PIN rotation is not available", "error");
    }
  });

  const handleChange = (setter) => (e) =>
    setter(e.target.value.replace(/\D/g, "").slice(0, 6));

  return (
    <Modal
      title="Change Operator PIN"
      onClose={onClose}
      footer={
        <>
          <Btn
            onClick={handleSubmit}
            disabled={
              busy ||
              currentPin.length < 6 ||
              newPin.length < 6 ||
              confirmPin.length < 6
            }
          >
            {busy ? "Updating..." : "Update PIN"}
          </Btn>
          <Btn variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
        </>
      }
    >
      <Field label="Current PIN">
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={currentPin}
          onChange={handleChange(setCurrentPin)}
          className="input"
          placeholder="Enter 6-digit PIN"
        />
      </Field>

      <Field label="New PIN">
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={newPin}
          onChange={handleChange(setNewPin)}
          className="input"
          placeholder="Enter new 6-digit PIN"
        />
      </Field>

      <Field label="Confirm New PIN">
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={confirmPin}
          onChange={handleChange(setConfirmPin)}
          className="input"
          placeholder="Re-enter new 6-digit PIN"
        />
      </Field>
    </Modal>
  );
}
