import { useState } from "react";
import { Modal, Btn, Field, IS } from "../ui.jsx";
import { useBusy } from "../../hooks/useBusy.js";
import { callApi } from "../../lib/api.js";

export function ChangePinModal({ onClose, showToast }) {
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

    try {
      await callApi("rotatePIN", { currentPin, newPin });
      showToast(
        "PIN updated successfully! Use it next time you log in.",
        "success",
      );
      onClose();
    } catch (e) {
      showToast(e.message, "error");
    }
  });

  const handleChange = (setter) => (e) =>
    setter(e.target.value.replace(/\D/g, "").slice(0, 6));

  return (
    <Modal title="Change Operator PIN" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Field label="Current PIN">
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={currentPin}
            onChange={handleChange(setCurrentPin)}
            style={IS()}
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
            style={IS()}
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
            style={IS()}
            placeholder="Re-enter new PIN"
          />
        </Field>

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
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
        </div>
      </div>
    </Modal>
  );
}
