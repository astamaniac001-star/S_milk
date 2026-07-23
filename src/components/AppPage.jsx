import { useAppDerived } from "../hooks/useAppDerived.js";
import Dashboard from "../pages/Dashboard.jsx";
import Customers from "../pages/Customers.jsx";
import Delivery from "../pages/Delivery.jsx";
import Imports from "../pages/Imports.jsx";
import Billing from "../pages/Billing.jsx";
import More from "../pages/More.jsx";
import { callApi } from "../lib/api.js";

function renderDashboard(state, handlers, derived) {
  return (
    <Dashboard
      today={state.today}
      activeC={state.activeC || []}
      totalRevenue={state.totalRevenue || 0}
      pendingDues={state.pendingDues || 0}
      confirmedStock={state.confirmedStock || 0}
      todayLogs={derived?.todayLogs || state.todayLogs || []}
      bills={state.bills || []}
      customers={state.customers || []}
      onSetTab={state.setTab}
      onOpenModal={state.openModal}
      onGenerateBill={() => handlers.generateMonthlyBills(state.billMonth || state.today.substring(0, 7))}
    />
  );
}

function renderCustomers(state, handlers, _derived) {
  return (
    <Customers
      filtered={state.filteredC || []}
      total={(state.filteredC || []).length}
      bills={state.bills || []}
      search={state.custSearch || ""}
      onSearchChange={state.setCustSearch}
      filter={state.custFilter || "All"}
      onFilterChange={state.setCustFilter}
      onOpenModal={state.openModal}
      onWhatsapp={handlers.whatsapp}
      onDeactivate={handlers.deactivateCustomer}
    />
  );
}

function renderDelivery(state, handlers, derived) {
  return (
    <Delivery
      logDate={state.logDate}
      onLogDateChange={state.setLogDate}
      logs={derived?.selectedDateLogs || []}
      onToggleLog={handlers.toggleDeliveryLog}
      generateDailyLogs={handlers.generateDailyLogs}
      onOpenModal={state.openModal}
      customers={state.customers || []}
    />
  );
}

function renderImports(state, handlers, _derived) {
  return (
    <Imports
      filtered={state.filteredImports || []}
      brands={state.brands || []}
      impFilter={state.impFilter || {}}
      onImpFilterChange={state.setImpFilter}
      onOpenModal={state.openModal}
      onConfirm={handlers.confirmMilkImport}
      onDelete={handlers.deleteMilkImport}
    />
  );
}

function renderBilling(state, handlers, _derived) {
  return (
    <Billing
      bills={state.bills || []}
      filtered={state.filteredB || []}
      billFilter={state.billFilter || "All"}
      billMonth={state.billMonth}
      pendingDues={state.pendingDues || 0}
      customers={state.customers || []}
      onBillFilterChange={state.setBillFilter}
      onBillMonthChange={state.setBillMonth}
      onOpenModal={state.openModal}
      onLock={handlers.lockBill}
      onUnlock={handlers.unlockBill}
      onWhatsapp={handlers.whatsapp}
      onGenerateBill={() =>
        handlers.generateMonthlyBills(
          state.billMonth || state.today.substring(0, 7),
        )
      }
    />
  );
}

function renderMore(state, handlers, _derived) {
  return (
    <More
      adjustments={state.adjustments || []}
      pauses={state.pauses || []}
      brands={state.brands || []}
      customers={state.customers || []}
      bills={state.bills || []}
      diagRan={state.diagRan}
      activeBrandsCount={state.activeBrandsCount || 0}
      onOpenModal={state.openModal}
      onApplyAdj={(adjId, billId, version) =>
        handlers.applyAdjustment(adjId, billId, version)
      }
      onRunDiag={async () => {
        try {
          await callApi("runDiagnostics");
          state.setDiagRan(true);
          state.toast$("Diagnostics executed successfully", "success");
        } catch (err) {
          state.toast$(err?.message || "Diagnostics failed", "error");
        }
      }}
      onHealthCheck={async () => {
        try {
          await callApi("healthCheck");
          state.toast$("Health check passed — V17", "success");
        } catch (err) {
          state.toast$(err?.message || "Health check failed", "error");
        }
      }}
    />
  );
}

const PAGE_RENDERERS = {
  dashboard: renderDashboard,
  customers: renderCustomers,
  delivery: renderDelivery,
  imports: renderImports,
  billing: renderBilling,
  more: renderMore,
};

export function AppPage({ tab, state, handlers }) {
  const derived = useAppDerived(state);
  const render = PAGE_RENDERERS[tab] || PAGE_RENDERERS.dashboard;
  return render(state, handlers, derived);
}