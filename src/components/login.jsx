import { useState } from "react";
import { Milk } from "lucide-react";
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
    <main className="login-container">
      <div className="login-shell">
        <section className="login-intro">
          <div className="login-wordmark">
            <span className="login-mark" aria-hidden="true">
              <Milk size={17} strokeWidth={2} />
            </span>
            S Milk
          </div>

          <div>
            <h1>Milk Delivery Admin</h1>
            <p className="login-lede">
              Delivery log, subscriptions, imports and monthly bills for a
              single milk route.
            </p>
          </div>

          <div className="login-meta" aria-hidden="true">
            <span>Operator access</span>
            <span>One device</span>
          </div>
        </section>

        <section className="login-panel" aria-labelledby="login-title">
          <h2 id="login-title">Sign in</h2>
          <p className="login-panel-sub">Enter your 6-digit PIN to continue.</p>

          <form onSubmit={handleSubmit}>
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
                  fontSize: 22,
                  letterSpacing: 8,
                  fontWeight: 500,
                  fontFamily: "var(--font-mono)",
                }}
                aria-invalid={!!displayError}
                aria-describedby={displayError ? "pin-error" : undefined}
                autoFocus
              />
            </div>

            <Btn
              type="submit"
              full
              disabled={loading || pin.length < 6}
              style={{ marginTop: 4 }}
            >
              {loading ? "Verifying…" : "Login"}
            </Btn>

            {displayError && (
              <div
                id="pin-error"
                role="alert" /* FIX M7: Announce errors to screen readers */
                className="login-error"
              >
                {displayError}
              </div>
            )}
          </form>
        </section>
      </div>
    </main>
  );
}
