import { MILK_TYPES, PAY_MODES } from "../lib/constants.js";
import {
  CustomerModal,
  ImportModal,
  PaymentModal,
  BillDetailModal,
  AdjustmentModal,
  PauseModal,
  BrandModal,
  SubscriptionModal,
  SubscriptionHistoryModal,
  AdHocLogModal,
  CreditNoteModal,
} from "./forms.jsx";
import { ChangePinModal } from "./modals/ChangePinModal.jsx";

function renderCustomerModal(ctx, isEdit) {
  return (
    <CustomerModal
      form={ctx.form}
      data={ctx.modal.data}
      onChange={ctx.setF}
      onSave={ctx.saveCustomer}
      isEdit={isEdit}
      onClose={ctx.closeModal}
    />
  );
}

function renderImportModal(ctx) {
  return (
    <ImportModal
      form={ctx.form}
      data={ctx.modal.data}
      onChange={ctx.setF}
      onSave={ctx.saveImport}
      onClose={ctx.closeModal}
      today={ctx.today}
      brands={ctx.brands}
      milkTypes={MILK_TYPES}
    />
  );
}

function renderPaymentModal(ctx) {
  return (
    <PaymentModal
      form={ctx.form}
      data={ctx.modal.data}
      onChange={ctx.setF}
      onSave={ctx.recordPayment}
      onClose={ctx.closeModal}
      today={ctx.today}
      payModes={PAY_MODES}
      customers={ctx.customers}
    />
  );
}

function renderAdjustmentModal(ctx) {
  return (
    <AdjustmentModal
      form={ctx.form}
      data={ctx.modal.data}
      onChange={ctx.setF}
      onSave={ctx.saveAdjustment}
      onClose={ctx.closeModal}
      today={ctx.today}
      customers={ctx.customers}
    />
  );
}

function renderPauseModal(ctx) {
  return (
    <PauseModal
      form={ctx.form}
      data={ctx.modal.data}
      onChange={ctx.setF}
      onSave={ctx.savePause}
      onClose={ctx.closeModal}
      today={ctx.today}
      customers={ctx.customers}
    />
  );
}

function renderBrandModal(ctx) {
  return (
    <BrandModal
      form={ctx.form}
      data={ctx.modal.data}
      onChange={ctx.setF}
      onSave={ctx.saveBrand}
      onClose={ctx.closeModal}
      milkTypes={MILK_TYPES}
    />
  );
}

function renderSubscriptionModal(ctx) {
  return (
    <SubscriptionModal
      form={ctx.form}
      data={ctx.modal.data}
      onChange={ctx.setF}
      // Merge form data with ID/Version for Optimistic Concurrency Control if
      // editing. The entity is spread first so a sparse form can't erase the
      // edit target (rule §16) — explicit form fields win.
      onSave={() => {
        const d = ctx.modal.data || {};
        ctx.saveSubscription({
          ...d,
          ...ctx.form,
          id: d.id,
          version: d.version,
        });
      }}
      onClose={ctx.closeModal}
      customers={ctx.customers || []}
      brands={ctx.brands || []}
      milkTypes={MILK_TYPES}
    />
  );
}

const MODAL_RENDERERS = {
  addCustomer: (ctx) => renderCustomerModal(ctx, false),
  editCustomer: (ctx) => renderCustomerModal(ctx, true),
  addImport: renderImportModal,
  payment: renderPaymentModal,
  changePin: (ctx) => (
    <ChangePinModal
      onClose={ctx.closeModal}
      showToast={ctx.toast$}
      onRotatePin={ctx.rotatePin}
    />
  ),
  billDetail: (ctx) => (
    <BillDetailModal
      data={ctx.modal.data}
      onClose={ctx.closeModal}
      customers={ctx.customers}
    />
  ),
  addAdj: renderAdjustmentModal,
  addPause: renderPauseModal,
  addBrand: renderBrandModal,
  // editBrand shares BrandModal — data carries the brand entity incl. rates;
  // save_brand_rpc upserts rates (replace-all) for the existing brand id.
  editBrand: renderBrandModal,
  addAdHoc: (ctx) => (
    <AdHocLogModal
      form={ctx.form}
      onChange={ctx.setF}
      onSave={() => ctx.addAdHocLog(ctx.form)}
      onClose={ctx.closeModal}
      today={ctx.today}
      customers={ctx.customers}
      brands={ctx.brands || []}
    />
  ),
  addCreditNote: (ctx) => (
    <CreditNoteModal
      form={ctx.form}
      onChange={ctx.setF}
      onSave={() => ctx.addCreditNote(ctx.form)}
      onClose={ctx.closeModal}
      customers={ctx.customers}
    />
  ),
  subscriptionHistory: (ctx) => (
    <SubscriptionHistoryModal
      data={ctx.modal.data}
      onClose={ctx.closeModal}
      handlers={ctx}
      customers={ctx.customers || []}
    />
  ),
  // addSubscription / editSubscription share renderSubscriptionModal above.
  // The former subscriptionsList modal is now the Subscriptions tab page.
  addSubscription: renderSubscriptionModal,
  editSubscription: renderSubscriptionModal,
};

export function AppModals({ ctx }) {
  if (!ctx || !ctx.modal) return null;
  const render = MODAL_RENDERERS[ctx.modal.type];
  return render ? render(ctx) : null;
}
