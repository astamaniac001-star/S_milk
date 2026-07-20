import { useState } from "react";
import { Btn } from "./ui.jsx";

export default function Login({ onLogin, error, loading }) {
  const [pin, setPin] = useState("");
  const [localError, setLocalError] = useState("");

  const handleChange = (e) => {
    const v = e.target.value.replace(/\D/g, "").slice(0, 6);
    setPin(v);
    if (localError) setLocalError("");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (pin.length !== 6) {
      setLocalError("PIN must be exactly 6 digits");
      return;
    }
    onLogin(pin);
  };

  const displayError = error || localError;

  return (
    <div className="login-container">
      <div className="login-card">
        <form
          onSubmit={handleSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            textAlign: "left",
          }}
        >
          <h2>Milk Delivery Admin</h2>
          <p>Enter your 6-digit PIN to continue.</p>

          <div className="field">
            <label className="field-label" htmlFor="pin-input">
              PIN
            </label>
            <input
              id="pin-input"
              type="password" /* FIX M15: Hide digits from shoulder surfers */
              inputMode="numeric"
              autoComplete="current-password" /* FIX M15: Correct semantic autocomplete */
              maxLength={6}
              value={pin}
              onChange={handleChange}
              className="input"
              style={{
                textAlign: "center",
                fontSize: 24,
                letterSpacing: 8,
                fontWeight: 600,
              }}
              aria-invalid={!!displayError}
              aria-describedby={displayError ? "pin-error" : undefined}
              autoFocus
            />
          </div>

          <Btn type="submit" full disabled={loading || pin.length < 6} style={{ marginTop: 8 }}>
            {loading ? "Verifying…" : "Login"}
          </Btn>

          {displayError && (
            <div
              id="pin-error"
              role="alert" /* FIX M7: Announce errors to screen readers */
              style={{
                background: "var(--danger-bg, #fef2f2)", /* FIX M8: Dark mode support */
                color: "var(--danger-text, #dc2626)",
                padding: 12,
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
                textAlign: "center",
                border: "1px solid var(--danger-text, #fecaca)",
              }}
            >
              {displayError}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}