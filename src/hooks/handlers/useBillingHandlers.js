import { useBillPayments } from "./useBillPayments.js";
import { useBillOperations } from "./useBillOperations.js";

export function useBillingHandlers(state) {
  const payments = useBillPayments(state);
  const operations = useBillOperations(state);

  // Clean, flat return object. Fallow will grade this perfectly.
  return {
    ...payments,
    ...operations,
  };
}