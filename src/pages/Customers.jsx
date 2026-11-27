// ── Customers.jsx ─────────────────────────────────────────────────────────────
// Customers tab: identity + contact management. Milk type, quantity, and
// delivery schedule live on the Subscriptions tab (multiple per customer);
// each card shows that customer's subscriptions read-only.

import { fmt, dayLabels } from "../lib/utils.js";
import { NEW_SUB_DEFAULTS } from "../lib/constants.js";
import {
  Card,
  Btn,
  Section,
  Empty,
  Badge,
  Toolbar,
  SearchInput,
  ChipRow,
  Skeleton,
} from "../components/ui.jsx";
import {
  Users,
  MapPin,
  Phone,
  Pencil,
  Plus,
  PauseCircle,
  MessageCircle,
  UserX,
  Milk,
} from "lucide-react";

const STATUS_FILTERS = ["All", "Active", "Paused", "Inactive"];

function CustomerSubLines({ subs, brands = [] }) {
  if (!subs || subs.length === 0) {
    return (
      <div className="row-sub" style={{ marginTop: 4 }}>
        No subscriptions
      </div>
    );
  }
  return (
    <div style={{ marginTop: 4 }}>
      {subs.map((s) => {
        const brand = (brands || []).find((b) => b.id === s.brandId)?.name;
        return (
          <div
            key={s.id}
            className="row-sub"
            style={{
              color: s.isActive
                ? "var(--text-secondary)"
                : "var(--text-muted)",
            }}
          >
            <Milk size={12} aria-hidden="true" />
            {brand ? `${brand} · ` : ""}
            {s.milkType} · {s.qty ?? 0}L · {dayLabels(s.deliveryDays)}
            {!s.isActive && " (paused)"}
          </div>
        );
      })}
    </div>
  );
}

export default function Customers({
  filtered,
  total,
  statusCounts,
  loading = false,
  bills,
  subsByCustomer = {},
  brands = [],
  search,
  onSearchChange,
  filter,
  onFilterChange,
  onOpenModal,
  onWhatsapp,
  onDeactivate,
}) {
  const showFilteredHint =
    total !== undefined && filtered.length !== total && filtered.length > 0;

  return (
    <div>
      <Section
        title="Customers"
        action={
          <Btn small onClick={() => onOpenModal("addCustomer")}>
            + Add
          </Btn>
        }
      />

      <Toolbar>
        <SearchInput
          id="customer-search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search…"
          label="Search customers"
        />
      </Toolbar>

      <div style={{ marginBottom: 10 }}>
        <ChipRow
          options={STATUS_FILTERS}
          value={filter}
          onChange={onFilterChange}
          counts={statusCounts}
          ariaLabel="Filter customers by status"
        />
      </div>

      <div className="row-sub" style={{ marginBottom: 10 }}>
        {total} customers
        {showFilteredHint ? ` · ${filtered.length} shown` : ""}
      </div>

      {loading && filtered.length === 0 ? (
        <div className="list" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <Skeleton w="42%" h={16} />
              <div style={{ height: 10 }} />
              <Skeleton w="72%" h={12} />
              <div style={{ height: 6 }} />
              <Skeleton w="58%" h={12} />
              <div style={{ height: 14 }} />
              <Skeleton w="90%" h={32} radius={8} />
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Empty
          msg="No customers found"
          icon={Users}
          hint={
            search || (filter && filter !== "All")
              ? "Try a different search or status filter."
              : "Add your first customer to get started."
          }
        />
      ) : (
        <div className="list">
          {filtered.map((c) => {
            const subs = subsByCustomer[c.id] || [];
            return (
              <Card key={c.id}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 10,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row-title">{c.name}</div>
                    <div className="row-sub">
                      <MapPin size={12} aria-hidden="true" /> {c.address}
                    </div>
                    <div className="row-sub">
                      <Phone size={12} aria-hidden="true" /> {c.phone}
                    </div>
                    <CustomerSubLines subs={subs} brands={brands} />
                    {c.balance < 0 && (
                      <div
                        className="tnum"
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--danger-text)",
                          marginTop: 4,
                        }}
                      >
                        Due: {fmt(Math.abs(c.balance))}
                      </div>
                    )}
                  </div>
                  <Badge label={c.status} />
                </div>

                <div
                  className="row-actions"
                  style={{ marginTop: 12, justifyContent: "flex-start" }}
                >
                  <Btn
                    small
                    variant="secondary"
                    onClick={() => onOpenModal("editCustomer", c)}
                  >
                    <Pencil size={13} aria-hidden="true" /> Edit
                  </Btn>
                  {c.status === "Active" && (
                    <Btn
                      small
                      variant="secondary"
                      onClick={() =>
                        onOpenModal("addSubscription", {
                          ...NEW_SUB_DEFAULTS,
                          customerId: c.id,
                        })
                      }
                    >
                      <Plus size={13} aria-hidden="true" /> + Sub
                    </Btn>
                  )}
                  {c.status === "Active" && (
                    <Btn
                      small
                      variant="secondary"
                      onClick={() => onOpenModal("addPause", { custId: c.id })}
                    >
                      <PauseCircle size={13} aria-hidden="true" /> Pause
                    </Btn>
                  )}
                  <Btn
                    small
                    variant="secondary"
                    onClick={() => {
                      const b = bills.find(
                        (x) => x.custId === c.id && x.status !== "Paid",
                      );
                      onWhatsapp(c.phone, b?.id);
                    }}
                  >
                    <MessageCircle size={13} aria-hidden="true" /> WhatsApp
                  </Btn>
                  <Btn
                    small
                    variant="danger"
                    onClick={() => onDeactivate(c)}
                    title={c.version ? `v${c.version}` : undefined}
                  >
                    <UserX size={13} aria-hidden="true" /> Deactivate
                  </Btn>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
