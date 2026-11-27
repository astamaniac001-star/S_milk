import React, { useId, useEffect, useRef } from "react";
import { X, Search } from "lucide-react";

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

// FIX M7: Added ARIA roles for screen reader announcements.
// Redesign (2026-11-26): quiet surface toast with a status rule on the left
// instead of a full-bleed saturated pill.
export function Toast({ msg, type, onClose }) {
  const role = type === "error" ? "alert" : "status";
  const ariaLive = type === "error" ? "assertive" : "polite";

  return (
    <div className={`toast toast-${type || "info"}`} role={role} aria-live={ariaLive}>
      {msg}
      <button
        className="close-btn"
        onClick={onClose}
        aria-label="Close notification"
      >
        <X size={15} />
      </button>
    </div>
  );
}

// Focus-trap selector: interactive elements only, skipping disabled/hidden.
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

// FIX M6: ARIA dialog roles, title association, and auto-focus.
// Redesign (2026-11-24): adds a real focus trap (Tab / Shift+Tab cycle),
// body scroll-lock while open, focus restore on close, and an optional
// sticky footer slot for modal actions.
export function Modal({ title, onClose, children, wide, footer }) {
  const titleId = useId();
  const overlayRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    overlayRef.current?.focus(); // Focus the dialog itself (a11y pattern)
    const handleKey = (e) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const overlay = overlayRef.current;
      if (!overlay) return;
      const focusables = Array.from(
        overlay.querySelectorAll(FOCUSABLE_SELECTOR),
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === overlay)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    const prevOverflow = document.body.style.overflow;
    const prevActive = document.activeElement;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = prevOverflow;
      if (prevActive && typeof prevActive.focus === "function") {
        prevActive.focus();
      }
    };
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
        {footer ? <div className="modal-footer">{footer}</div> : null}
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

export function CardHeader({ title, action, children, icon: Icon, subtitle }) {
  return (
    <div className="section-head">
      <div className="card-head-main">
        {Icon ? (
          <span className="card-head-icon" aria-hidden="true">
            <Icon size={15} />
          </span>
        ) : null}
        <div style={{ minWidth: 0 }}>
          {title && <h3 className="card-head-title">{title}</h3>}
          {subtitle && <div className="card-head-sub">{subtitle}</div>}
        </div>
      </div>
      {action || children}
    </div>
  );
}

// Redesign: optional icon/title/hint; msg/message behavior unchanged, so all
// existing empty-state strings render exactly as before.
export function Empty({ msg, message, icon: Icon, title, hint }) {
  return (
    <div className="empty-state">
      {Icon ? <Icon size={26} aria-hidden="true" /> : null}
      {title && <div className="empty-title">{title}</div>}
      <div>{msg || message}</div>
      {hint && <div className="empty-hint">{hint}</div>}
    </div>
  );
}

export function Section({ title, action, children }) {
  return (
    <div>
      <div className="section-head">
        <h3 className="card-head-title">{title}</h3>
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
            style={{ background: i.bg, color: i.tx, "--accent": i.accent }}
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
// FIX (2026-11-21 audit — AI-S H2): value color must be the PRIMARY text
// color (~15:1), not the muted placeholder tone (~2.8:1 — WCAG AA fail).
export const IS = (extra = {}) => ({
  width: "100%",
  padding: "10px 14px",
  background: "var(--bg-main, #ffffff)",
  border: "1px solid var(--border-color, #e2e8f0)",
  borderRadius: 8,
  fontSize: 14,
  color: "var(--text-primary, #18181b)",
  transition: "all 0.2s ease",
  outline: "none",
  ...extra,
});

/* ==========================================================================
   Redesign primitives (2026-11) — additive only; nothing above changed shape.
   ========================================================================== */

// Square/circular icon-only chrome button. Always label it for a11y.
export function IconButton({
  label,
  onClick,
  children,
  title,
  active,
  square = true,
  className = "",
  ...rest
}) {
  return (
    <button
      type="button"
      className={`icon-btn ${square ? "square" : ""} ${active ? "active" : ""} ${className}`}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : !!active}
      title={title || label}
      {...rest}
    >
      {children}
    </button>
  );
}

// Toolbar wrapper for a page's search + filter + primary action row.
export function Toolbar({ children, className = "" }) {
  return <div className={`page-toolbar ${className}`}>{children}</div>;
}

// Search field with leading icon. Pass `id` to keep legacy selectors
// (e.g. #customer-search) and `placeholder` for e2e text-matching.
export function SearchInput({
  id,
  value,
  onChange,
  placeholder = "Search…",
  label,
  autoFocus,
  style,
}) {
  return (
    <div className="search-box" style={style}>
      <Search size={15} aria-hidden="true" />
      <input
        id={id}
        type="search"
        className="input"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-label={label || placeholder}
        autoFocus={autoFocus}
      />
    </div>
  );
}

// Segmented filter chips. `options`: strings or { value, label };
// `counts`: { [value]: number } renders the small count suffix.
export function ChipRow({ options, value, onChange, counts, ariaLabel = "Filter" }) {
  return (
    <div className="chip-row" role="group" aria-label={ariaLabel}>
      {options.map((opt) => {
        const isObj = typeof opt !== "string";
        const val = isObj ? opt.value : opt;
        const label = isObj ? opt.label : opt;
        const active = value === val;
        const count = counts ? counts[val] : undefined;
        return (
          <button
            key={val}
            type="button"
            className={`chip ${active ? "active" : ""}`}
            aria-pressed={active}
            onClick={() => onChange(val)}
          >
            {label}
            {count !== undefined && count !== null && (
              <span className="chip-count">{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Loading placeholder block. Decorative — hidden from AT.
export function Skeleton({ w, h = 14, radius, style }) {
  return (
    <div
      className="skeleton"
      aria-hidden="true"
      style={{ width: w, height: h, borderRadius: radius, ...style }}
    />
  );
}

// SVG progress ring for part/whole stats (e.g. Today's delivery).
export function ProgressRing({
  value = 0,
  max = 0,
  size = 92,
  stroke = 8,
  label,
  children,
}) {
  const safeMax = Number(max) > 0 ? Number(max) : 0;
  const pct = safeMax > 0 ? Math.min(1, Number(value) / safeMax) : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label || `${value} of ${max}`}
      style={{ flexShrink: 0 }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--border-color, #e2e8f0)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--brand-500, #2c6a4a)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fontSize={size * 0.19}
        fontWeight="500"
        fill="var(--text-primary, #18181b)"
        fontFamily="var(--font-mono, monospace)"
      >
        {Math.round(pct * 100)}%
      </text>
      {children}
    </svg>
  );
}

// Tiny bar chart. `data`: [{ label, value }] — render only what callers
// pass; no invented metrics.
export function MiniBars({ data = [], height = 56, title }) {
  const max = Math.max(1, ...data.map((d) => Number(d.value) || 0));
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 6,
        height,
        width: "100%",
      }}
      role={title ? "img" : undefined}
      aria-label={title}
    >
      {data.map((d, i) => {
        const v = Number(d.value) || 0;
        return (
          <div
            key={`${d.label}-${i}`}
            title={`${d.label}: ${v}`}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              minWidth: 0,
              height: "100%",
              justifyContent: "flex-end",
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 26,
                height: Math.max(3, (v / max) * (height - 22)),
                borderRadius: 4,
                background: "var(--brand-500, #2c6a4a)",
                opacity: 0.85,
              }}
            />
            <span
              style={{
                fontSize: 10,
                color: "var(--text-muted, #6b7280)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "100%",
              }}
            >
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
