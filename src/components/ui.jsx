import React, { useId, useEffect, useRef } from "react";
import { X } from "lucide-react";

// FIX M8: Updated to use CSS variables with hex fallbacks for Dark Mode support
const SC = {
  Active: {
    bg: "var(--success-bg, #dcfce7)",
    tx: "var(--success-text, #166534)",
  },
  Paused: {
    bg: "var(--warning-bg, #fef9c3)",
    tx: "var(--warning-text, #854d0e)",
  },
  Inactive: { bg: "var(--bg-card, #f3f4f6)", tx: "var(--text-muted, #374151)" },
  Paid: {
    bg: "var(--success-bg, #dcfce7)",
    tx: "var(--success-text, #166534)",
  },
  Unpaid: {
    bg: "var(--danger-bg, #fee2e2)",
    tx: "var(--danger-text, #991b1b)",
  },
  Partial: {
    bg: "var(--warning-bg, #fef9c3)",
    tx: "var(--warning-text, #854d0e)",
  },
  Draft: { bg: "var(--bg-card, #f3f4f6)", tx: "var(--text-muted, #374151)" },
  Confirmed: { bg: "var(--info-bg, #dbeafe)", tx: "var(--info-text, #1e40af)" },
  Reconciled: {
    bg: "var(--info-bg, #e0e7ff)",
    tx: "var(--info-text, #3730a3)",
  },
  Delivered: {
    bg: "var(--success-bg, #dcfce7)",
    tx: "var(--success-text, #166534)",
  },
  Skipped: {
    bg: "var(--danger-bg, #fee2e2)",
    tx: "var(--danger-text, #991b1b)",
  },
  Applied: { bg: "var(--info-bg, #dbeafe)", tx: "var(--info-text, #1e40af)" },
  Pending: {
    bg: "var(--warning-bg, #fef9c3)",
    tx: "var(--warning-text, #854d0e)",
  },
};

export function Badge({ label }) {
  const c = SC[label] || {
    bg: "var(--bg-card, #f3f4f6)",
    tx: "var(--text-muted, #374151)",
  };
  return (
    <span className="badge" style={{ background: c.bg, color: c.tx }}>
      {label}
    </span>
  );
}

// FIX M7: Added ARIA roles for screen reader announcements
export function Toast({ msg, type, onClose }) {
  const role = type === "error" ? "alert" : "status";
  const ariaLive = type === "error" ? "assertive" : "polite";

  const bg =
    type === "success"
      ? "var(--success-text, #166534)"
      : type === "error"
        ? "var(--danger-text, #991b1b)"
        : type === "warning"
          ? "var(--warning-text, #854d0e)"
          : "var(--info-text, #1e40af)";

  return (
    <div
      className="toast"
      role={role}
      aria-live={ariaLive}
      style={{ background: bg, color: "white" }}
    >
      {msg}
      <button
        className="close-btn"
        onClick={onClose}
        aria-label="Close notification"
        style={{
          color: "white",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          marginLeft: 8,
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}

// FIX M6: Added ARIA dialog roles, title association, and auto-focus
export function Modal({ title, onClose, children, wide }) {
  const titleId = useId();
  const overlayRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    overlayRef.current?.focus(); // Trap focus intent on the overlay
    const handleEsc = (e) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  return (
    <div
      className="modal-overlay"
      ref={overlayRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        className={`modal-content ${wide ? "wide" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id={titleId}>{title}</h3>
          <button
            className="close-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Btn({
  onClick,
  children,
  variant = "primary",
  small,
  full,
  disabled,
  style,
  type = "button",
  ...rest
}) {
  return (
    <button
      type={type}
      className={`btn btn-${variant} ${small ? "btn-sm" : "btn-md"} ${full ? "btn-full" : ""}`}
      onClick={onClick}
      disabled={disabled}
      style={style}
      // Pass-through for aria-label etc. (brand rate rows label their
      // remove/add controls for a11y + tests).
      {...rest}
    >
      {children}
    </button>
  );
}

const LABELABLE_TAGS = new Set(["input", "select", "textarea", "button"]);

// FIX M6: Automatic label-to-input association and error ARIA injection
export function Field({ label, children, className, error, required }) {
  const id = useId();

  const isSingleElement = React.isValidElement(children);
  const targetId = (isSingleElement && children.props.id) || id;
  const isLabelable =
    isSingleElement &&
    (typeof children.type === "string"
      ? LABELABLE_TAGS.has(children.type)
      : !!children.props.id);

  let enhancedChildren = children;
  if (isSingleElement) {
    const patchProps = {
      "aria-invalid": !!error,
      "aria-describedby": error ? `${targetId}-error` : undefined,
      "aria-required": required,
    };
    if (isLabelable) {
      patchProps.id = targetId;
    }
    enhancedChildren = React.cloneElement(children, patchProps);
  }

  return (
    <div className={`field ${className || ""}`}>
      {label && (
        <label
          htmlFor={isLabelable ? targetId : undefined}
          className="field-label"
        >
          {label}{" "}
          {required && (
            <span
              aria-hidden="true"
              style={{ color: "var(--danger-text, #dc2626)" }}
            >
              *
            </span>
          )}
        </label>
      )}
      {enhancedChildren}
      {error && (
        <div
          id={`${targetId}-error`}
          role="alert"
          style={{
            color: "var(--danger-text, #dc2626)",
            fontSize: 12,
            marginTop: 4,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

export function Card({ children, style }) {
  return (
    <div className="card" style={style}>
      {children}
    </div>
  );
}

export function CardHeader({ title, action, children }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 16,
      }}
    >
      {title && (
        <h3
          style={{
            fontSize: 16,
            fontWeight: 600,
            margin: 0,
            color: "var(--text-main)",
          }}
        >
          {title}
        </h3>
      )}
      {action || children}
    </div>
  );
}

export function Empty({ msg, message }) {
  return (
    <div
      style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}
    >
      {msg || message}
    </div>
  );
}

export function Section({ title, action, children }) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <h3
          style={{ fontSize: 16, fontWeight: 600, color: "var(--text-main)" }}
        >
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

export function StatGrid({ items, stats, action }) {
  const data = items || stats || [];
  return (
    <div style={{ position: "relative", marginBottom: action ? 8 : 0 }}>
      {/* FIX M10: Render the action prop if provided */}
      {action && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: 12,
          }}
        >
          {action}
        </div>
      )}

      <div className="stat-grid">
        {data.map((i, idx) => (
          <div
            key={idx}
            className="stat-tile"
            style={{ background: i.bg, color: i.tx }}
          >
            <div className="stat-label">
              {i.icon} {i.label}
            </div>
            <div
              className="stat-value"
              style={{ color: i.tx || "var(--text-main)" }}
            >
              {i.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Active brand <option>s. Default value is the brand NAME (imports persist
// brand_name text); pass valueKey="id" for brand-aware forms that store the
// FK (subscriptions, ad-hoc logs).
export function ActiveBrandOptions({ brands, valueKey = "name" }) {
  return brands
    .filter((b) => b.status === "Active")
    .map((b) => (
      <option key={b.id} value={b[valueKey]}>
        {b.name}
      </option>
    ));
}

export function ActiveCustomerOptions({ customers }) {
  return customers
    .filter((c) => c.status === "Active")
    .map((c) => (
      <option key={c.id} value={c.id}>
        {c.name}
      </option>
    ));
}

// FIX M8: Backward-compatible inline style for inputs, now Dark Mode aware
export const IS = (extra = {}) => ({
  width: "100%",
  padding: "10px 14px",
  background: "var(--bg-main, #ffffff)",
  border: "1px solid var(--border-color, #e2e8f0)",
  borderRadius: 8,
  fontSize: 14,
  color: "var(--text-muted, #94a3b8)",
  transition: "all 0.2s ease",
  outline: "none",
  ...extra,
});
